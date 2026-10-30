const { z } = require('zod');

const addressSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(100),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  line1: z.string().trim().min(1, 'Address is required').max(200),
  line2: z.string().trim().max(200).optional().default(''),
  landmark: z.string().trim().max(100).optional().default(''),
  city: z.string().trim().min(1, 'City is required').max(50),
  state: z.string().trim().min(1, 'State is required').max(50),
  pincode: z.string().trim().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
  type: z.enum(['home', 'work', 'other']).optional().default('home'),
  isDefault: z.boolean().optional().default(false),
});

const updateAddressSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200),
  landmark: z.string().trim().max(100),
  city: z.string().trim().min(1).max(50),
  state: z.string().trim().min(1).max(50),
  pincode: z.string().trim().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
  type: z.enum(['home', 'work', 'other']),
  isDefault: z.boolean(),
}).partial();

const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
});

module.exports = { addressSchema, updateAddressSchema, idParamSchema };
