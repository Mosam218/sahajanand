const { User } = require('../../models');
const config = require('../../config/env');
const firebaseService = require('../../integrations/firebase/firebase.service');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const { ROLES } = require('../../utils/roles');

/**
 * The role an email address is entitled to from the environment allow-lists.
 * Only honoured for verified email addresses: otherwise anyone could register
 * an unclaimed admin address and be handed the admin panel.
 */
function entitledRole(email, emailVerified) {
  if (!emailVerified) return null;
  if (config.superAdminEmails.includes(email)) return ROLES.SUPER_ADMIN;
  if (config.adminEmails.includes(email)) return ROLES.ADMIN;
  return null;
}

/**
 * Verify Firebase token and upsert the user in MongoDB.
 *
 * @param {string} idToken - Firebase ID token
 * @param {{name?: string, phone?: string}} [profile] - details from the sign-up form
 * @returns {Promise<object>} User document
 */
async function loginWithFirebase(idToken, profile = {}) {
  const decodedToken = await firebaseService.verifyIdToken(idToken);

  const { uid, name, picture, email_verified, phone_number } = decodedToken;

  if (!decodedToken.email) {
    throw ApiError.badRequest('Your sign-in did not include an email address');
  }

  const email = decodedToken.email.toLowerCase();
  const emailVerified = email_verified || false;
  const role = entitledRole(email, emailVerified);

  let user = await User.findOne({ firebaseUid: uid });

  if (!user) {
    // The same email may already exist under another sign-in (for example
    // the Firebase account was deleted and created again).
    const sameEmail = await User.findOne({ email });
    if (sameEmail) {
      if (!emailVerified) {
        throw ApiError.conflict(
          'An account with this email already exists. Verify your email address to sign in to it.'
        );
      }
      sameEmail.firebaseUid = uid;
      user = sameEmail;
    }
  }

  if (!user) {
    user = await User.create({
      firebaseUid: uid,
      name: name || profile.name || email.split('@')[0],
      email,
      phone: profile.phone || phone_number || '',
      photoURL: picture || '',
      emailVerified,
      role: role || ROLES.USER,
      lastLoginAt: new Date(),
    });
    logger.info(`New user created: ${email} (role: ${user.role})`);
  } else {
    // Existing user: keep the profile they edited, refresh what Firebase owns
    user.emailVerified = emailVerified;
    user.lastLoginAt = new Date();
    if (picture) user.photoURL = picture;
    if (!user.phone && (profile.phone || phone_number)) {
      user.phone = profile.phone || phone_number;
    }

    // Promote from the allow-lists; never demote here (roles granted from the
    // admin panel are kept).
    if (role === ROLES.SUPER_ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      user.role = ROLES.SUPER_ADMIN;
    } else if (role === ROLES.ADMIN && user.role === ROLES.USER) {
      user.role = ROLES.ADMIN;
    }

    await user.save();
    logger.info(`User logged in: ${email}`);
  }

  if (user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN) {
    try {
      await firebaseService.setCustomUserClaims(uid, { role: user.role });
    } catch (_err) {
      // Non-fatal if setting custom claim fails (e.g. testing or limited permissions)
    }
  }

  return user;
}

/**
 * Get user profile by ID.
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getUserProfile(userId) {
  return User.findById(userId);
}

/**
 * Logout — optionally revoke Firebase refresh tokens.
 * @param {string} firebaseUid
 */
async function logout(firebaseUid) {
  await firebaseService.revokeRefreshTokens(firebaseUid);
}

module.exports = { loginWithFirebase, getUserProfile, logout };
