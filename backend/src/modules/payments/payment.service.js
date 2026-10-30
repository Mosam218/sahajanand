const mongoose = require('mongoose');
const { Payment, Order, User } = require('../../models');
const orderService = require('../orders/order.service');
const couponService = require('../coupons/coupon.service');
const razorpayService = require('../../integrations/razorpay/razorpay.service');
const config = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const { sendOrderConfirmation, sendAdminAlert } = require('../../utils/email');

/**
 * Verify Razorpay payment signature and finalize the order.
 *
 * @param {string} userId
 * @param {object} body - { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * @returns {Promise<object>} Order
 */
async function verifyPayment(userId, body) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  // Find the order
  const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  // Verify ownership
  if (order.user.toString() !== userId.toString()) {
    throw ApiError.forbidden('You can only verify your own payments');
  }

  // Verify signature
  const isValid = razorpayService.verifySignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  );

  if (!isValid) {
    // Mark payment as failed
    await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        status: 'failed',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      }
    );
    throw ApiError.badRequest('Payment verification failed. Invalid signature.');
  }

  // Update payment record
  const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
  if (payment) {
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    await payment.save();
  }

  // Finalize
  const finalizedOrder = await finalizePaidOrder(order, {
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });

  return finalizedOrder;
}

/**
 * A payment arrived for an order that is (or just became) cancelled: keep the
 * order cancelled and flag the money for a refund.
 */
async function flagRefundAfterCancel(orderId) {
  const order = await Order.findByIdAndUpdate(
    orderId,
    {
      $set: { paymentStatus: 'refund_pending', needsAttention: true },
      $push: {
        statusHistory: {
          status: 'cancelled',
          note: 'ATTENTION: Payment received after cancellation. Refund required.',
          at: new Date(),
        },
      },
    },
    { new: true }
  );
  sendAdminAlert(
    `Refund Required — ${order.orderNumber}`,
    `Order ${order.orderNumber} was paid after it had been cancelled. Amount: ₹${order.totalAmount}.`
  ).catch(() => {});
  return order;
}

/**
 * Finalize a paid order — shared by verify and webhook.
 * Idempotent and safe under concurrency: the move to "paid" is claimed
 * atomically in the database, so when the browser's verification and
 * Razorpay's webhook (or a repeated webhook) arrive together, only one of
 * them takes stock and confirms the order.
 *
 * @param {object} order - Order document (only its _id is trusted)
 * @param {object} paymentDetails - { razorpayPaymentId, razorpaySignature? }
 * @returns {Promise<object>} Updated order
 */
async function finalizePaidOrder(order, paymentDetails) {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: ['pending', 'failed'] } },
    { $set: { paymentStatus: 'paid' } },
    { new: true }
  );

  if (!claimed) {
    logger.info(`Order ${order.orderNumber} payment already processed — skipping`);
    return Order.findById(order._id);
  }

  await Payment.findOneAndUpdate(
    { razorpayOrderId: claimed.razorpayOrderId },
    {
      status: 'captured',
      razorpayPaymentId: paymentDetails.razorpayPaymentId,
      razorpaySignature: paymentDetails.razorpaySignature || '',
    }
  );

  // A cancelled order that gets paid afterwards must not be revived
  if (claimed.orderStatus === 'cancelled') {
    return flagRefundAfterCancel(claimed._id);
  }

  // Take the items out of stock (all or nothing)
  const shortItem = await orderService.deductStock(claimed);
  const stockTaken = !shortItem;

  let couponCounted = claimed.couponCounted;
  if (claimed.couponCode && !couponCounted) {
    await couponService.recordCouponUse(claimed.couponCode, claimed.user);
    couponCounted = true;
  }

  const set = { orderStatus: 'confirmed', stockDeducted: stockTaken, couponCounted };
  const history = [{ status: 'confirmed', note: 'Payment confirmed', at: new Date() }];

  if (shortItem) {
    // Insufficient stock but payment is received — flag for admin
    logger.warn(
      `Order ${claimed.orderNumber}: insufficient stock for "${shortItem}" — paid order needs attention`
    );
    set.needsAttention = true;
    set.internalNotes = `${claimed.internalNotes ? claimed.internalNotes + '\n' : ''}STOCK ISSUE: "${shortItem}" — insufficient stock when the payment arrived`;
    history.push({
      status: 'confirmed',
      note: 'ATTENTION: Some items have insufficient stock. Manual resolution required.',
      at: new Date(),
    });
    sendAdminAlert(
      `Stock Issue — ${claimed.orderNumber}`,
      `Paid order ${claimed.orderNumber} has a stock issue: "${shortItem}" — insufficient stock. Please resolve manually (fulfil or refund).`
    ).catch(() => {});
  }

  // Confirm, unless the order was cancelled while we were working
  const confirmed = await Order.findOneAndUpdate(
    { _id: claimed._id, orderStatus: { $ne: 'cancelled' } },
    { $set: set, $push: { statusHistory: { $each: history } } },
    { new: true }
  );

  if (!confirmed) {
    if (stockTaken) await orderService.returnItems(claimed.items);
    return flagRefundAfterCancel(claimed._id);
  }

  // Remove the purchased items from the cart (non-blocking)
  orderService.removeOrderedFromCart(confirmed).catch(() => {});

  // Send confirmation email (non-blocking)
  User.findById(confirmed.user)
    .then((user) => {
      if (user) {
        sendOrderConfirmation(confirmed, user.email).catch(() => {});
      }
    })
    .catch(() => {});

  logger.info(`Order ${confirmed.orderNumber} finalized as paid`);
  return confirmed;
}

/**
 * Handle frontend reporting a failed payment.
 * @param {string} userId
 * @param {object} body - { razorpay_order_id }
 */
async function handlePaymentFailed(userId, body) {
  const { razorpay_order_id } = body;

  const order = await Order.findOne({ razorpayOrderId: razorpay_order_id, user: userId });
  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  // A late "failed" report must never undo a payment that went through:
  // only a still-pending payment can become failed (checked in the database)
  const failed = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: 'pending' },
    { $set: { paymentStatus: 'failed' } },
    { new: true }
  );
  if (!failed) {
    return Order.findById(order._id);
  }

  await Payment.findOneAndUpdate(
    { razorpayOrderId: razorpay_order_id, status: 'created' },
    { status: 'failed' }
  );

  return failed;
}

/**
 * Retry payment for an unpaid online order.
 * @param {string} userId
 * @param {string} orderId
 * @returns {Promise<object>}
 */
async function retryPayment(userId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  if (order.paymentMethod !== 'razorpay') {
    throw ApiError.badRequest('Only online payment orders can be retried');
  }

  if (!['pending', 'failed'].includes(order.paymentStatus)) {
    throw ApiError.badRequest('This order is already paid');
  }

  if (order.orderStatus === 'cancelled') {
    throw ApiError.badRequest('This order has been cancelled');
  }

  // Create a new Razorpay order
  const amountInPaise = Math.round(order.totalAmount * 100);
  const rzpOrder = await razorpayService.createOrder({
    amount: amountInPaise,
    receipt: order.orderNumber,
    notes: { orderId: order._id.toString(), userId: userId.toString(), retry: true },
  });

  const reopened = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $in: ['pending', 'failed'] }, orderStatus: { $ne: 'cancelled' } },
    { $set: { razorpayOrderId: rzpOrder.id, paymentStatus: 'pending' } },
    { new: true }
  );
  if (!reopened) {
    throw ApiError.badRequest('This order has already been paid or cancelled');
  }

  // Create new Payment record
  await Payment.create({
    order: order._id,
    user: userId,
    razorpayOrderId: rzpOrder.id,
    amount: order.totalAmount,
    currency: 'INR',
    status: 'created',
  });

  return {
    order: reopened,
    razorpay: {
      orderId: rzpOrder.id,
      amount: amountInPaise,
      currency: 'INR',
      keyId: config.razorpay.keyId,
    },
  };
}

/**
 * Handle Razorpay webhook events.
 * Must be idempotent and always return quickly.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signature - X-Razorpay-Signature header
 * @returns {Promise<{status: string}>}
 */
async function handleWebhook(rawBody, signature) {
  // Verify signature
  const isValid = razorpayService.verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    throw ApiError.badRequest('Invalid webhook signature');
  }

  const payload = JSON.parse(rawBody.toString());
  const event = payload.event;
  const entity = payload.payload?.payment?.entity || payload.payload?.refund?.entity || {};

  logger.info(`Webhook received: ${event}`);

  const razorpayOrderId = entity.order_id;
  const razorpayPaymentId = entity.id;

  if (!razorpayOrderId) {
    // Some events don't have order_id, just acknowledge
    return { status: 'acknowledged' };
  }

  // Find order
  const order = await Order.findOne({ razorpayOrderId });
  if (!order) {
    logger.warn(`Webhook: order not found for razorpay order ${razorpayOrderId}`);
    return { status: 'order_not_found' };
  }

  // Idempotency check
  const payment = await Payment.findOne({ razorpayOrderId });
  if (payment) {
    const alreadyProcessed = payment.webhookEvents.some(
      (e) => e.event === event && payment.razorpayPaymentId === razorpayPaymentId
    );
    if (alreadyProcessed) {
      logger.info(`Webhook: event ${event} already processed for ${razorpayOrderId}`);
      return { status: 'already_processed' };
    }

    // Log this webhook event
    payment.webhookEvents.push({ event, receivedAt: new Date() });
    payment.rawResponse = entity;
    await payment.save();
  }

  switch (event) {
    case 'payment.captured':
    case 'order.paid': {
      await finalizePaidOrder(order, {
        razorpayPaymentId,
        razorpaySignature: '',
      });
      break;
    }

    case 'payment.failed': {
      // Ignore a failed attempt on an order that was paid by another attempt
      const failed = await Order.findOneAndUpdate(
        { _id: order._id, paymentStatus: 'pending' },
        { $set: { paymentStatus: 'failed' } }
      );
      if (!failed) break;
      if (payment) {
        payment.status = 'failed';
        await payment.save();
      }
      break;
    }

    case 'refund.processed': {
      const refundEntity = payload.payload?.refund?.entity || {};
      order.paymentStatus = 'refunded';
      order.statusHistory.push({
        status: 'refunded',
        note: `Refund processed: ${refundEntity.id || 'unknown'}`,
        at: new Date(),
      });
      await order.save();

      if (payment) {
        payment.status = 'refunded';
        payment.refundId = refundEntity.id || '';
        payment.refundAmount = (refundEntity.amount || 0) / 100;
        await payment.save();
      }
      break;
    }

    default:
      logger.info(`Webhook: unhandled event ${event}`);
  }

  return { status: 'processed' };
}

/**
 * Process a refund for an order (admin).
 * @param {string} orderId
 * @param {number} [amount] - Partial refund amount in rupees (0 = full)
 * @param {string} adminId
 * @returns {Promise<object>}
 */
async function processRefund(orderId, amount, adminId) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  if (order.paymentMethod !== 'razorpay') {
    throw ApiError.badRequest('Refunds are only available for online payments');
  }

  if (!['paid', 'refund_pending'].includes(order.paymentStatus)) {
    throw ApiError.badRequest('Order is not eligible for refund');
  }

  const payment = await Payment.findOne({ razorpayOrderId: order.razorpayOrderId, status: 'captured' });
  if (!payment || !payment.razorpayPaymentId) {
    throw ApiError.badRequest('No captured payment found for this order');
  }

  if (amount > order.totalAmount) {
    throw ApiError.badRequest('Refund amount cannot be more than the order total');
  }

  const refundAmountPaise = amount ? Math.round(amount * 100) : 0;
  const refund = await razorpayService.refundPayment(
    payment.razorpayPaymentId,
    refundAmountPaise
  );

  // Update records
  order.paymentStatus = 'refunded';
  if (order.orderStatus !== 'cancelled') {
    await orderService.restoreStock(order);
    order.orderStatus = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = 'Refunded by admin';
  }
  order.statusHistory.push({
    status: 'refunded',
    note: `Refund initiated by admin. Refund ID: ${refund.id}`,
    at: new Date(),
    by: adminId,
  });
  await order.save();

  payment.status = 'refunded';
  payment.refundId = refund.id;
  payment.refundAmount = (refund.amount || 0) / 100;
  await payment.save();

  return { order, refund };
}

module.exports = {
  verifyPayment,
  finalizePaidOrder,
  handlePaymentFailed,
  retryPayment,
  handleWebhook,
  processRefund,
};
