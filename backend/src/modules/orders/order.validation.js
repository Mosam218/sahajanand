const { z } = require('zod');

const shippingAddressSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(100),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Valid 10-digit Indian mobile required'),
  line1: z.string().trim().min(1, 'Address line 1 is required').max(200),
  line2: z.string().trim().max(200).optional().default(''),
  landmark: z.string().trim().max(100).optional().default(''),
  city: z.string().trim().min(1, 'City is required').max(50),
  state: z.string().trim().min(1, 'State is required').max(50),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
});

const checkoutSchema = z.object({
  addressId: z.string().optional(),
  shippingAddress: shippingAddressSchema.optional(),
  couponCode: z.string().trim().max(30).optional(),
  paymentMethod: z.enum(['razorpay', 'cod']),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().min(1).max(10),
      })
    )
    .max(50)
    .optional(),
  notes: z.string().max(500).optional().default(''),
}).refine(
  (data) => data.addressId || data.shippingAddress,
  { message: 'Either addressId or shippingAddress is required', path: ['addressId'] }
);

const quoteSchema = z.object({
  couponCode: z.string().trim().max(30).optional(),
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

const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500).optional().default(''),
});

module.exports = { checkoutSchema, quoteSchema, cancelOrderSchema };
