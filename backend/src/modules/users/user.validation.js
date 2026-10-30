const { z } = require('zod');

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number')
    .optional()
    .or(z.literal('')),
  company: z.string().trim().max(150).optional(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-Z]{15}$/, 'GSTIN must be 15 letters and digits')
    .optional()
    .or(z.literal('')),
});

module.exports = { updateProfileSchema };
