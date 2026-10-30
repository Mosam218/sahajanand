const crypto = require('crypto');
const razorpayService = require('../src/integrations/razorpay/razorpay.service');
const config = require('../src/config/env');

console.log('Testing Razorpay Configuration & Signature Verification...');

// 1. Check config
console.log('Razorpay Key ID:', config.razorpay.keyId);
console.log('Razorpay Enabled:', config.razorpay.enabled);
if (config.razorpay.keyId !== 'rzp_test_TtzSX11azWSSfk') {
  console.error('FAIL: Key ID does not match expected');
  process.exit(1);
}
if (config.razorpay.keySecret !== 'kBo4JG3vxg13eM2aeZ5IdRkl') {
  console.error('FAIL: Key Secret does not match expected');
  process.exit(1);
}

// 2. Test HMAC SHA256 Signature generation & verification
const testOrderId = 'order_test_987654';
const testPaymentId = 'pay_test_123456';
const expectedSig = crypto
  .createHmac('sha256', config.razorpay.keySecret)
  .update(`${testOrderId}|${testPaymentId}`)
  .digest('hex');

const isValid = razorpayService.verifySignature(testOrderId, testPaymentId, expectedSig);
console.log('Valid signature verified:', isValid);
if (!isValid) {
  console.error('FAIL: Valid signature was rejected');
  process.exit(1);
}

const isInvalid = razorpayService.verifySignature(testOrderId, testPaymentId, 'invalid_signature_xyz');
console.log('Invalid signature correctly rejected:', !isInvalid);
if (isInvalid) {
  console.error('FAIL: Invalid signature was accepted');
  process.exit(1);
}

console.log('SUCCESS: All Razorpay unit tests passed successfully!');

