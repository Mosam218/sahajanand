const { Router } = require('express');
const paymentController = require('./payment.controller');
const { verifyToken } = require('../../middleware/auth.middleware');
const { paymentLimiter } = require('../../middleware/rateLimit.middleware');
const { validate } = require('../../middleware/validation.middleware');
const { verifyPaymentSchema, paymentFailedSchema } = require('./payment.validation');

const router = Router();

// Webhook is mounted separately in app.js with express.raw()
// Standard Razorpay routes
router.post('/create-order', paymentLimiter, paymentController.createOrder);
router.post('/verify-payment', paymentLimiter, paymentController.verifyPaymentSignature);

// These routes need auth
router.post(
  '/verify',
  verifyToken,
  paymentLimiter,
  validate({ body: verifyPaymentSchema }),
  paymentController.verifyPayment
);
router.post(
  '/failed',
  verifyToken,
  paymentLimiter,
  validate({ body: paymentFailedSchema }),
  paymentController.handlePaymentFailed
);
router.post('/retry/:orderId', verifyToken, paymentLimiter, paymentController.retryPayment);

module.exports = router;
