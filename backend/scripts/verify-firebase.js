/**
 * Script: verify-firebase.js
 * Verifies backend Firebase Admin SDK credentials and setup.
 *
 * Usage:
 *   node scripts/verify-firebase.js
 */

const config = require('../src/config/env');
const admin = require('../src/config/firebase');

async function verifyFirebaseSetup() {
  console.log('\n===========================================');
  console.log('   Sahajanand Backend: Firebase Health Check');
  console.log('===========================================\n');

  console.log('1. Checking Environment Variables:');
  console.log(`   - FIREBASE_PROJECT_ID:   ${config.firebase.projectId || '❌ Missing'}`);
  console.log(`   - FIREBASE_CLIENT_EMAIL: ${config.firebase.clientEmail || '❌ Missing'}`);
  
  const rawKey = config.firebase.privateKey || '';
  const isPemFormat = rawKey.includes('-----BEGIN PRIVATE KEY-----') || rawKey.includes('-----BEGIN RSA PRIVATE KEY-----');
  const hasValidLength = rawKey.length > 200;

  console.log(`   - FIREBASE_PRIVATE_KEY:  ${isPemFormat && hasValidLength ? '✅ Valid PEM detected' : '⚠️ Potential issue detected'}`);

  if (!hasValidLength || rawKey.includes('AIzaSy')) {
    console.log('\n⚠️  NOTICE: Your FIREBASE_PRIVATE_KEY appears to contain an API key (starting with "AIzaSy") rather than a Service Account RSA private key.');
    console.log('   The Firebase Admin SDK requires the RSA private key from the downloaded Service Account JSON.');
    console.log('   How to get it:');
    console.log('   1. Go to Firebase Console -> Project Settings -> Service accounts.');
    console.log('   2. Click "Generate new private key".');
    console.log('   3. Copy the "private_key" value from the downloaded JSON file into your .env as FIREBASE_PRIVATE_KEY.\n');
  }

  const { getApps } = require('firebase-admin/app');
  console.log('\n2. Testing Firebase Admin SDK connection:');
  if (getApps().length === 0) {
    console.log('❌ Firebase Admin is not initialized. Please ensure valid credentials in .env.');
    process.exit(1);
  }

  try {
    // Attempt generating a custom token to verify crypto and key signing
    const testToken = await admin.auth().createCustomToken('health-check-user');
    console.log('✅ Firebase Admin SDK successfully signed a custom token!');
    console.log(`   Sample Token (truncated): ${testToken.substring(0, 35)}...`);
    console.log('\n🎉 Backend Firebase Admin integration is FULLY FUNCTIONAL!\n');
  } catch (err) {
    console.log(`❌ Firebase Admin SDK test failed: ${err.message}`);
    console.log('\nPlease verify your FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env.\n');
  }
}

verifyFirebaseSetup().catch((err) => {
  console.error('Fatal error during Firebase verification:', err);
  process.exit(1);
});
