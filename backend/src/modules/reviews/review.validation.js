const { z } = require('zod');

const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(150).optional().default(''),
  comment: z.string().trim().max(2000).optional().default(''),
});

const updateReviewSchema = z
  .object({
    rating: z.coerce.number().int().min(1).max(5),
    title: z.string().trim().max(150),
    comment: z.string().trim().max(2000),
  })
  .partial();

module.exports = { createReviewSchema, updateReviewSchema };
