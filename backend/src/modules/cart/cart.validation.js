const { z } = require('zod');

const quantity = z.coerce.number().int().min(1, 'Quantity must be at least 1').max(10, 'Maximum 10 of one product per order');

const addItemSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  quantity: quantity.optional().default(1),
});

const updateItemSchema = z.object({
  quantity,
});

const mergeCartSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: quantity.optional().default(1) }))
    .max(50)
    .optional()
    .default([]),
});

module.exports = { addItemSchema, updateItemSchema, mergeCartSchema };
