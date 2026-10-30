const { z } = require('zod');
const { ENQUIRY_STATUSES } = require('../../models/enquiry.model');

const createEnquirySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  company: z.string().trim().max(150).optional().default(''),
  email: z.string().trim().email('Enter a valid email address').max(200),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v.replace(/\D/g, '').length >= 8, 'Enter a phone number with at least 8 digits'),
  city: z.string().trim().max(80).optional().default(''),
  product: z.string().trim().max(200).optional().default(''),
  quantity: z.coerce.number().int().min(1, 'Quantity must be 1 or more').max(100000).optional().default(1),
  message: z.string().trim().max(2000).optional().default(''),
});

const adminUpdateEnquirySchema = z
  .object({
    status: z.enum(ENQUIRY_STATUSES),
    notes: z.string().trim().max(2000),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

module.exports = { createEnquirySchema, adminUpdateEnquirySchema };
