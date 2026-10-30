const { z } = require('zod');

const text = (max) => z.string().trim().max(max);

const updateSettingsSchema = z
  .object({
    storeName: text(100).min(1, 'Store name is required'),
    legalName: text(150),
    announcement: text(200),
    supportPhone: text(30),
    supportPhoneAlt: text(30),
    supportEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid email').max(200)]),
    whatsapp: text(30),
    address: text(400),
    serviceAreas: z.array(text(60).min(1)).max(20),
    businessHours: text(200),
    gstin: z.union([
      z.literal(''),
      z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, 'GSTIN must be 15 characters'),
    ]),
    heroTitle: text(150),
    heroLede: text(400),
    gstInclusive: z.boolean(),
    gstPercent: z.coerce.number().min(0).max(100),
    deliveryCharge: z.coerce.number().min(0),
    freeDeliveryAbove: z.coerce.number().min(0),
    enableCod: z.boolean(),
    privacyPolicy: text(30000),
    termsConditions: text(30000),
    shippingPolicy: text(30000),
    returnPolicy: text(30000),
    lowStockThreshold: z.coerce.number().int().min(0).max(1000),
    maintenanceMode: z.boolean(),
  })
  .partial()
  .strict();

module.exports = { updateSettingsSchema };
