const { z } = require('zod');

// Query strings arrive as text: 'false' must mean false
const queryBool = z.preprocess(
  (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined),
  z.boolean().optional()
);

const productQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(100).optional(),
  subcategory: z.string().trim().max(100).optional(),
  tempClass: z.string().trim().max(40).optional(),
  family: z.string().trim().max(100).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: queryBool,
  featured: queryBool,
  rating: z.coerce.number().min(0).max(5).optional(),
  sort: z
    .enum(['newest', 'price_asc', 'price_desc', 'popular', 'rating', 'discount', 'name', 'catalogue'])
    .optional()
    .default('catalogue'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(12),
});

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(12),
});

module.exports = { productQuerySchema, limitQuerySchema };
