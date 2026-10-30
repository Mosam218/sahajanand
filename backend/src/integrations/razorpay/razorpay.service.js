const crypto = require('crypto');
const razorpay = require('../../config/razorpay');
const config = require('../../config/env');
const logger = require('../../utils/logger');
const ApiError = require('../../utils/ApiError');

function assertConfigured() {
  if (!razorpay) {
    throw new ApiError(503, 'Online payment is not configured');
  }
}

/**
 * Create a Razorpay order.
 * @param {object} params
 * @param {number} params.amount - Amount in paise
 * @param {string} [params.currency='INR'] - Currency code
 * @param {string} params.receipt - Unique receipt/order number
 * @param {object} [params.notes] - Additional notes
 * @returns {Promise<object>} Razorpay order object
 */
async function createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
  assertConfigured();
  const order = await razorpay.orders.create({
    amount,
    currency,
    receipt,
    notes,
  });
  logger.info(`Razorpay order created: ${order.id}, amount: ${amount} paise`);
  return order;
}

/**
 * Verify Razorpay payment signature (HMAC SHA256).
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 *
 * @param {string} razorpayOrderId
 * @param {string} razorpayPaymentId
 * @param {string} razorpaySignature
 * @returns {boolean}
 */
function verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  if (!config.razorpay.enabled) return false;
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(body)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(razorpaySignature)
    );
  } catch {
    return false;
  }
}

/**
 * Verify Razorpay webhook signature.
 * @param {string|Buffer} rawBody - Raw request body
 * @param {string} signature - X-Razorpay-Signature header
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!config.razorpay.enabled) return false;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Initiate a refund on Razorpay.
 * @param {string} paymentId - Razorpay payment ID
 * @param {number} amount - Refund amount in paise (0 = full refund)
 * @returns {Promise<object>} Refund object
 */
async function refundPayment(paymentId, amount = 0) {
  assertConfigured();
  const refundData = {};
  if (amount > 0) {
    refundData.amount = amount;
  }
  const refund = await razorpay.payments.refund(paymentId, refundData);
  logger.info(`Razorpay refund initiated: ${refund.id} for payment ${paymentId}`);
  return refund;
}

module.exports = {
  createOrder,
  verifySignature,
  verifyWebhookSignature,
  refundPayment,
};
