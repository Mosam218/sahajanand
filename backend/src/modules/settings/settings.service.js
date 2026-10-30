const { Setting } = require('../../models');
const config = require('../../config/env');

const KEY = 'store';
const CACHE_MS = config.isTest ? 0 : 30 * 1000;

let cache = null;
let cachedAt = 0;

/**
 * Get the store settings document, creating it from the environment
 * defaults on first use.
 * @returns {Promise<object>} plain settings object
 */
async function getSettings() {
  if (cache && Date.now() - cachedAt < CACHE_MS) return cache;

  let doc = await Setting.findOne({ key: KEY });
  if (!doc) {
    try {
      doc = await Setting.create({
        key: KEY,
        gstInclusive: config.business.gstInclusive,
        gstPercent: config.business.gstPercent,
        deliveryCharge: config.business.deliveryCharge,
        freeDeliveryAbove: config.business.freeDeliveryAbove,
        enableCod: config.business.enableCod,
      });
    } catch (err) {
      // Two first requests raced: the other one created it
      if (err.code !== 11000) throw err;
      doc = await Setting.findOne({ key: KEY });
    }
  }

  cache = doc.toJSON();
  cachedAt = Date.now();
  return cache;
}

// URL key → settings field
const POLICIES = {
  privacy: 'privacyPolicy',
  terms: 'termsConditions',
  shipping: 'shippingPolicy',
  returns: 'returnPolicy',
};

const withPaymentMethods = (settings) => ({
  ...settings,
  paymentMethods: {
    cod: settings.enableCod,
    razorpay: config.razorpay.enabled,
  },
});

/**
 * Settings as the storefront sees them, plus which payment methods can
 * actually be used right now. Policy texts are fetched separately; here the
 * storefront only learns which policies have been published.
 */
async function getPublicSettings() {
  const settings = withPaymentMethods(await getSettings());
  const policies = {};
  for (const [key, field] of Object.entries(POLICIES)) {
    policies[key] = Boolean(settings[field]);
    delete settings[field];
  }
  return { ...settings, policies };
}

/** Everything, for the admin settings screen. */
async function getAdminSettings() {
  return withPaymentMethods(await getSettings());
}

/**
 * One published policy text.
 * @param {string} key - privacy | terms | shipping | returns
 * @returns {Promise<{key: string, content: string, updatedAt: Date}|null>}
 */
async function getPolicy(key) {
  const field = Object.prototype.hasOwnProperty.call(POLICIES, key) ? POLICIES[key] : null;
  if (!field) return null;
  const settings = await getSettings();
  if (!settings[field]) return null;
  return { key, content: settings[field], updatedAt: settings.updatedAt };
}

/**
 * Update store settings (super admin).
 * @param {object} data - validated partial settings
 */
async function updateSettings(data) {
  await getSettings();
  const doc = await Setting.findOne({ key: KEY });
  Object.assign(doc, data);
  await doc.save();
  cache = null;
  return getAdminSettings();
}

module.exports = { getSettings, getPublicSettings, getAdminSettings, getPolicy, updateSettings };
