const { z } = require('zod');

const id = z.string().trim().min(1).max(100);

const verifyPaymentSchema = z.object({
  razorpay_order_id: id,
  razorpay_payment_id: id,
  razorpay_signature: z.string().trim().min(1).max(200),
});

const paymentFailedSchema = z.object({
  razorpay_order_id: id,
});

module.exports = { verifyPaymentSchema, paymentFailedSchema };
