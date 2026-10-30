const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const config = require('./env');
const logger = require('../utils/logger');

if (getApps().length === 0) {
  try {
    let privateKey = config.firebase.privateKey;
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const hasValidKey =
      Boolean(privateKey) &&
      (privateKey.includes('-----BEGIN PRIVATE KEY-----') ||
        privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) &&
      !privateKey.includes('AIzaSy');

    if (config.firebase.emulatorHost) {
      initializeApp({ projectId: config.firebase.projectId });
      logger.info('Firebase Admin initialized with auth emulator');
    } else if (hasValidKey && config.firebase.clientEmail) {
      initializeApp({
        credential: cert({
          projectId: config.firebase.projectId,
          clientEmail: config.firebase.clientEmail,
          privateKey,
        }),
      });
      logger.info('Firebase Admin initialized with service account credentials');
    } else {
      // Initialize with projectId: verifies Google and Firebase ID tokens against Google public certs
      initializeApp({ projectId: config.firebase.projectId });
      logger.info(`Firebase Admin initialized with projectId: ${config.firebase.projectId} (ID token verification enabled)`);
    }
  } catch (err) {
    logger.error(`Firebase Admin initialization error: ${err.message}`);
    if (getApps().length === 0) {
      try {
        initializeApp({ projectId: config.firebase.projectId });
        logger.info('Firebase Admin recovered with projectId-only initialization');
      } catch (_recoveryErr) {
        if (config.isProduction) {
          throw err;
        }
      }
    }
  }
}

module.exports = { auth: () => getAuth() };