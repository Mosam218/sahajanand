const paymentService = require('./payment.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { toCustomerOrder } = require('../orders/order.service');

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

module.exports = { verifyPayment, handlePaymentFailed, retryPayment, webhook };
