const { z } = require('zod');

const validateCouponSchema = z.object({
  code: z.string().trim().min(1, 'Enter a coupon code').max(30),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(10),
      })
    )
    .max(50)
    .optional(),
});

module.exports = { validateCouponSchema };
