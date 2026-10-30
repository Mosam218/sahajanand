const mongoose = require('mongoose');
const paymentService = require('./payment.service');
const razorpayService = require('../../integrations/razorpay/razorpay.service');
const firebaseService = require('../../integrations/firebase/firebase.service');
const config = require('../../config/env');
const { Order, Payment, User } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const logger = require('../../utils/logger');
const { toCustomerOrder } = require('../orders/order.service');

/**
 * POST /api/create-order or POST /api/payments/create-order
 * Standard Razorpay Order Creation
 * Request: { amount (paise), currency, receipt }
 * Return: { order_id, amount, currency }
 * Minimum amount: 100 paise
 */
const createOrder = asyncHandler(async (req, res) => {
  // Handle auth failures if Authorization header is provided
  if (req.headers.authorization) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Invalid authorization header format' });
      }
      const token = authHeader.split('Bearer ')[1]?.trim();
      if (!token) {
        return res.status(401).json({ success: false, message: 'No authorization token provided' });
      }
      const decoded = await firebaseService.verifyIdToken(token);
      if (mongoose.connection.readyState === 1) {
        const user = await User.findOne({ firebaseUid: decoded.uid });
        if (user && user.isActive) {
          req.user = user;
        }
      }
    } catch (_err) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired token' });
    }
  }

  const { amount, currency = 'INR', receipt, notes } = req.body || {};
  const numAmount = Number(amount);

  if (amount === undefined || amount === null || isNaN(numAmount) || numAmount < 100) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed: amount is required and must be at least 100 paise',
      errors: [{ field: 'amount', message: 'Amount must be a number >= 100 paise' }],
    });
  }

  try {
    const rcpt = receipt || `rcpt_${Date.now()}`;
    const rzpOrder = await razorpayService.createOrder({
      amount: Math.round(numAmount),
      currency: (currency || 'INR').toUpperCase(),
      receipt: rcpt,
      notes: notes || {},
    });

    return res.status(200).json({
      success: true,
      order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      receipt: rzpOrder.receipt,
      key_id: config.razorpay.keyId,
    });
  } catch (err) {
    logger.error(`Razorpay order creation failed: ${err.message || err}`);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create Razorpay order',
      error: err.error || err.message,
    });
  }
});

/**
 * POST /api/verify-payment or POST /api/payments/verify-payment
 * Standard Razorpay Signature Verification
 * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
 * Compare generated signature with razorpay_signature
 * Return success only if signatures match
 */
const verifyPaymentSignature = asyncHandler(async (req, res) => {
  const order_id = req.body.order_id || req.body.razorpay_order_id;
  const payment_id = req.body.payment_id || req.body.razorpay_payment_id;
  const signature = req.body.signature || req.body.razorpay_signature;

  // Missing fields validation
  if (!order_id || !payment_id || !signature) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: order_id, payment_id, and signature are required',
    });
  }

  // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
  const isValid = razorpayService.verifySignature(order_id, payment_id, signature);

  if (!isValid) {
    // Signature mismatch: return 400, do NOT mark as paid
    if (mongoose.connection.readyState === 1) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: order_id },
        {
          status: 'failed',
          razorpayPaymentId: payment_id,
          razorpaySignature: signature,
        }
      ).catch(() => {});
    }

    return res.status(400).json({
      success: false,
      message: 'Signature mismatch: Invalid payment signature',
    });
  }

  // If database is connected, check for matching order and finalize
  let customerOrder = null;
  if (mongoose.connection.readyState === 1) {
    const dbOrder = await Order.findOne({ razorpayOrderId: order_id });
    if (dbOrder) {
      const finalized = await paymentService.finalizePaidOrder(dbOrder, {
        razorpayPaymentId: payment_id,
        razorpaySignature: signature,
      });
      customerOrder = toCustomerOrder(finalized);
    } else {
      // Update standalone payment record if exists
      await Payment.findOneAndUpdate(
        { razorpayOrderId: order_id },
        {
          status: 'captured',
          razorpayPaymentId: payment_id,
          razorpaySignature: signature,
        }
      ).catch(() => {});
    }
  }

  return res.status(200).json({
    success: true,
    message: 'Payment verified successfully',
    order_id,
    payment_id,
    order: customerOrder,
  });
});

/**
 * POST /api/payments/verify
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const order = await paymentService.verifyPayment(req.user._id, req.body);
  return ApiResponse(res, 200, 'Payment verified successfully', { order: toCustomerOrder(order) });
});

/**
 * POST /api/payments/failed
 */
const handlePaymentFailed = asyncHandler(async (req, res) => {
  const order = await paymentService.handlePaymentFailed(req.user._id, req.body);
  return ApiResponse(res, 200, 'Payment failure recorded', { order: toCustomerOrder(order) });
});

/**
 * POST /api/payments/retry/:orderId
 */
const retryPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.retryPayment(req.user._id, req.params.orderId);
  return ApiResponse(res, 200, 'New payment order created', { ...result, order: toCustomerOrder(result.order) });
});

/**
 * POST /api/payments/webhook
 * Registered before express.json() with express.raw().
 */
const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!signature) {
    return res.status(400).json({ success: false, message: 'Missing signature' });
  }

  const result = await paymentService.handleWebhook(req.body, signature);
  return res.status(200).json({ success: true, ...result });
});

module.exports = {
  createOrder,
  verifyPaymentSignature,
  verifyPayment,
  handlePaymentFailed,
  retryPayment,
  webhook,
};
