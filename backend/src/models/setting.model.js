const mongoose = require('mongoose');

// Store settings. A single document (key: 'store') edited from the admin panel.
// Contact fields start empty: they must be filled in by the business and are
// simply not shown on the storefront until they are.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'store' },

    storeName: { type: String, trim: true, default: 'Sahajanand Electronics', maxlength: 100 },
    legalName: { type: String, trim: true, default: '', maxlength: 150 },
    announcement: { type: String, trim: true, default: '', maxlength: 200 },
    supportPhone: { type: String, trim: true, default: '', maxlength: 30 },
    supportPhoneAlt: { type: String, trim: true, default: '', maxlength: 30 },
    supportEmail: { type: String, trim: true, default: '', maxlength: 200 },
    whatsapp: { type: String, trim: true, default: '', maxlength: 30 },
    address: { type: String, trim: true, default: '', maxlength: 400 },
    serviceAreas: { type: [String], default: ['Gandhinagar', 'Ahmedabad'] },
    businessHours: { type: String, trim: true, default: '', maxlength: 200 },
    gstin: { type: String, trim: true, uppercase: true, default: '', maxlength: 15 },

    heroTitle: { type: String, trim: true, default: '', maxlength: 150 },
    heroLede: { type: String, trim: true, default: '', maxlength: 400 },

    // Pricing rules
    gstInclusive: { type: Boolean, default: true },
    gstPercent: { type: Number, default: 18, min: 0, max: 100 },
    deliveryCharge: { type: Number, default: 0, min: 0 },
    freeDeliveryAbove: { type: Number, default: 0, min: 0 },
    enableCod: { type: Boolean, default: true },

    // Policy pages. The text is written by the business in the admin panel;
    // a page is published only once its text has been entered.
    privacyPolicy: { type: String, trim: true, default: '', maxlength: 30000 },
    termsConditions: { type: String, trim: true, default: '', maxlength: 30000 },
    shippingPolicy: { type: String, trim: true, default: '', maxlength: 30000 },
    returnPolicy: { type: String, trim: true, default: '', maxlength: 30000 },

    lowStockThreshold: { type: Number, default: 3, min: 0 },
    maintenanceMode: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        delete ret._id;
        delete ret.key;
        return ret;
      },
    },
  }
);

const Setting = mongoose.model('Setting', settingSchema);

module.exports = Setting;
