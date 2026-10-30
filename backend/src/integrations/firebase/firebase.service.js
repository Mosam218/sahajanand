const admin = require('../../config/firebase');
const logger = require('../../utils/logger');

/**
 * Verify a Firebase ID token from the client.
 * @param {string} idToken - The Firebase ID token from the client
 * @param {boolean} [checkRevoked=false] - Whether to check if token has been revoked
 * @returns {Promise<import('firebase-admin').auth.DecodedIdToken>}
 */
async function verifyIdToken(idToken, checkRevoked = false) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken, checkRevoked);
    return decodedToken;
  } catch (err) {
    logger.error(`Firebase token verification failed: ${err.message}`);
    throw err;
  }
}

/**
 * Fetch a user record from Firebase by UID.
 * @param {string} uid - Firebase UID
 * @returns {Promise<import('firebase-admin').auth.UserRecord>}
 */
async function getUser(uid) {
  try {
    return await admin.auth().getUser(uid);
  } catch (err) {
    logger.error(`Failed to fetch Firebase user for UID ${uid}: ${err.message}`);
    throw err;
  }
}

/**
 * Fetch a user record from Firebase by email.
 * @param {string} email - User email
 * @returns {Promise<import('firebase-admin').auth.UserRecord>}
 */
async function getUserByEmail(email) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (err) {
    logger.error(`Failed to fetch Firebase user for email ${email}: ${err.message}`);
    throw err;
  }
}

/**
 * Set custom user claims (e.g. role: 'admin') on a Firebase user.
 * @param {string} uid - Firebase UID
 * @param {object} claims - Custom claims object
 */
async function setCustomUserClaims(uid, claims) {
  try {
    await admin.auth().setCustomUserClaims(uid, claims);
    logger.info(`Updated custom claims for UID ${uid}: ${JSON.stringify(claims)}`);
  } catch (err) {
    logger.error(`Failed to set custom claims for UID ${uid}: ${err.message}`);
    throw err;
  }
}

/**
 * Create a custom Firebase JWT token for a given UID.
 * @param {string} uid - Target UID
 * @param {object} [additionalClaims] - Optional additional claims
 * @returns {Promise<string>}
 */
async function createCustomToken(uid, additionalClaims = {}) {
  try {
    return await admin.auth().createCustomToken(uid, additionalClaims);
  } catch (err) {
    logger.error(`Failed to generate custom token for UID ${uid}: ${err.message}`);
    throw err;
  }
}

/**
 * Revoke all refresh tokens for a user (forces re-authentication).
 * @param {string} uid - Firebase UID
 */
async function revokeRefreshTokens(uid) {
  try {
    await admin.auth().revokeRefreshTokens(uid);
    logger.info(`Revoked refresh tokens for Firebase UID: ${uid}`);
  } catch (err) {
    logger.error(`Failed to revoke tokens for UID ${uid}: ${err.message}`);
  }
}

/**
 * Delete a user from Firebase Auth.
 * @param {string} uid - Firebase UID
 */
async function deleteUser(uid) {
  try {
    await admin.auth().deleteUser(uid);
    logger.info(`Deleted Firebase user: ${uid}`);
  } catch (err) {
    logger.error(`Failed to delete Firebase user for UID ${uid}: ${err.message}`);
    throw err;
  }
}

module.exports = {
  verifyIdToken,
  getUser,
  getUserByEmail,
  setCustomUserClaims,
  createCustomToken,
  revokeRefreshTokens,
  deleteUser,
};
