/**
 * Script: verify-cloudinary.js
 * Verifies Cloudinary credentials, API connectivity, and upload/delete permissions.
 *
 * Usage:
 *   node scripts/verify-cloudinary.js
 */

const config = require('../src/config/env');
const cloudinary = require('../src/config/cloudinary');
const cloudinaryService = require('../src/integrations/cloudinary/cloudinary.service');

async function verifyCloudinary() {
  console.log('\n===========================================');
  console.log('   Sahajanand Backend: Cloudinary Check');
  console.log('===========================================\n');

  console.log('1. Checking Environment Variables:');
  console.log(`   - CLOUDINARY_CLOUD_NAME:  ${config.cloudinary.cloudName || '❌ Missing'}`);
  console.log(`   - CLOUDINARY_API_KEY:     ${config.cloudinary.apiKey || '❌ Missing'}`);
  console.log(`   - CLOUDINARY_API_SECRET:  ${config.cloudinary.apiSecret ? '****** (configured)' : '❌ Missing'}`);

  if (
    config.cloudinary.cloudName === 'test_cloud' ||
    config.cloudinary.apiKey === 'test_key' ||
    config.cloudinary.apiSecret === 'test_secret'
  ) {
    console.log('\n⚠️  NOTICE: Your .env file is currently using placeholder credentials (test_cloud, test_key).');
    console.log('   To connect your real Cloudinary account:');
    console.log('   1. Sign in to https://cloudinary.com/console');
    console.log('   2. Find your "Product Environment Credentials" on the dashboard:');
    console.log('      - Cloud Name');
    console.log('      - API Key');
    console.log('      - API Secret');
    console.log('   3. Put them into backend/.env under CLOUDINARY_*.\n');
  }

  console.log('\n2. Testing Cloudinary API Connectivity (Ping):');
  try {
    const pingResult = await cloudinaryService.ping();
    console.log(`✅ Cloudinary Ping successful! (Status: ${pingResult.status || 'OK'})`);
  } catch (err) {
    const msg = err.message || err.error?.message || err.error || JSON.stringify(err);
    console.log(`❌ Ping failed: ${msg}`);
    console.log('   Please check that your CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are correct.\n');
    return;
  }

  console.log('\n3. Testing Image Upload & Deletion permissions:');
  try {
    // 1x1 transparent PNG buffer
    const testBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const uploadResult = await cloudinaryService.uploadFromBuffer(testBuffer, 'sahajanand/tests');
    console.log('✅ Upload test passed!');
    console.log(`   - Public ID:  ${uploadResult.publicId}`);
    console.log(`   - Secure URL: ${uploadResult.url}`);

    // Clean up
    await cloudinary.uploader.destroy(uploadResult.publicId);
    console.log('✅ Delete cleanup test passed!');

    console.log('\n🎉 Cloudinary integration is 100% CONNECTED & WORKING!\n');
  } catch (err) {
    console.log(`❌ Upload/Delete test failed: ${err.message}`);
  }
}

verifyCloudinary().catch((err) => {
  console.error('Fatal error during Cloudinary verification:', err);
  process.exit(1);
});
