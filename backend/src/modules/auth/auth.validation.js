const { z } = require('zod');

// The Firebase ID token is in the Authorization header. The body may carry
// the name and mobile number entered on the sign-up form.
const loginSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number')
    .optional(),
});

module.exports = { loginSchema };
