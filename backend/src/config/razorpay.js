const Razorpay = require('razorpay');
const config = require('./env');

// Online payment is optional: without keys the instance is null and the
// Razorpay payment method is reported as unavailable.
const razorpayInstance = config.razorpay.enabled
  ? new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    })
  : null;

module.exports = razorpayInstance;
