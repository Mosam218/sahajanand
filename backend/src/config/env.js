const dotenv = require('dotenv');
const path = require('path');
const { z } = require('zod');

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const bool = (def) =>
  z
    .string()
    .default(def)
    .transform((v) => v === 'true');

const optional = z.string().optional().default('');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    CLIENT_URLS: z.string().min(1, 'CLIENT_URLS is required'),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

    // Firebase. The service account is required unless the Auth emulator is used
    // (local development / end-to-end tests only).
    FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
    FIREBASE_CLIENT_EMAIL: optional,
    FIREBASE_PRIVATE_KEY: optional,
    FIREBASE_AUTH_EMULATOR_HOST: optional,

    // Razorpay (optional: online payment is switched off when missing)
    RAZORPAY_KEY_ID: optional,
    RAZORPAY_KEY_SECRET: optional,
    RAZORPAY_WEBHOOK_SECRET: optional,

    // Cloudinary (optional: images are stored on local disk when missing)
    CLOUDINARY_CLOUD_NAME: optional,
    CLOUDINARY_API_KEY: optional,
    CLOUDINARY_API_SECRET: optional,
    // Public base URL of this API, used to build URLs for locally stored uploads
    PUBLIC_API_URL: optional,

    // Admin
    ADMIN_EMAILS: optional,
    SUPER_ADMIN_EMAILS: optional,

    // Business defaults. These seed the store settings, which the admin can
    // change afterwards from the admin panel.
    ENABLE_COD: bool('true'),
    FREE_DELIVERY_ABOVE: z.coerce.number().int().nonnegative().default(10000),
    DELIVERY_CHARGE: z.coerce.number().int().nonnegative().default(500),
    GST_INCLUSIVE: bool('true'),
    GST_PERCENT: z.coerce.number().min(0).max(100).default(18),

    // SMTP (optional)
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().optional().default(0),
    SMTP_USER: optional,
    SMTP_PASS: optional,
    EMAIL_FROM: optional,
    ADMIN_ALERT_EMAIL: optional,
  })
  .superRefine((env, ctx) => {
    const emulator = Boolean(env.FIREBASE_AUTH_EMULATOR_HOST);
    if (emulator && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['FIREBASE_AUTH_EMULATOR_HOST'],
        message: 'The Firebase Auth emulator must not be used in production',
      });
    }
    if (!emulator && env.NODE_ENV !== 'test') {
      for (const key of ['FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required` });
      }
    }
    const allOrNone = (keys, label) => {
      const set = keys.filter((k) => env[k]);
      if (set.length > 0 && set.length < keys.length) {
        ctx.addIssue({
          code: 'custom',
          path: [keys.find((k) => !env[k])],
          message: `${label} is partly configured: set all of ${keys.join(', ')} or none`,
        });
      }
    };
    allOrNone(['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'], 'Razorpay');
    allOrNone(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'], 'Cloudinary');
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues.map(
    (issue) => `  ✗ ${issue.path.join('.')}: ${issue.message}`
  );
  console.error('❌ Environment validation failed:\n' + errors.join('\n'));
  console.error('\nPlease check your .env file. See .env.example for reference.');
  process.exit(1);
}

const env = parsed.data;

const list = (v) => v.split(',').map((e) => e.trim()).filter(Boolean);
const emails = (v) => list(v).map((e) => e.toLowerCase());

/**
 * Frozen configuration object derived from environment variables.
 * All config access should go through this object.
 */
const config = Object.freeze({
  env: env.NODE_ENV,
  port: env.PORT,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  clientUrls: list(env.CLIENT_URLS),
  publicApiUrl: (env.PUBLIC_API_URL || `http://localhost:${env.PORT}`).replace(/\/$/, ''),

  mongo: {
    uri: env.MONGODB_URI,
  },

  firebase: {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    emulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST,
  },

  razorpay: {
    enabled: Boolean(env.RAZORPAY_KEY_ID),
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  },

  cloudinary: {
    enabled: Boolean(env.CLOUDINARY_CLOUD_NAME),
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  },

  adminEmails: emails(env.ADMIN_EMAILS),
  superAdminEmails: emails(env.SUPER_ADMIN_EMAILS),

  business: {
    enableCod: env.ENABLE_COD,
    freeDeliveryAbove: env.FREE_DELIVERY_ABOVE,
    deliveryCharge: env.DELIVERY_CHARGE,
    gstInclusive: env.GST_INCLUSIVE,
    gstPercent: env.GST_PERCENT,
  },

  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.EMAIL_FROM,
    adminAlert: env.ADMIN_ALERT_EMAIL,
  },
});

module.exports = config;
