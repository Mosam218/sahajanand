const firebaseService = require('../integrations/firebase/firebase.service');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Middleware: Verify Firebase ID token (required).
 * Loads the user from MongoDB and attaches to req.user.
 */
const verifyToken = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('No token provided');
    }

    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
      throw ApiError.unauthorized('No token provided');
    }

    // Verify the Firebase ID token
    const decodedToken = await firebaseService.verifyIdToken(idToken);

    // Load user from DB
    const user = await User.findOne({ firebaseUid: decodedToken.uid });
    if (!user) {
      throw ApiError.unauthorized('User not found. Please login first.');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Your account has been deactivated. Contact support.');
    }

    req.user = user;
    next();
  } catch (err) {
    if (err instanceof ApiError) {
      return next(err);
    }

    // Firebase token errors
    if (
      err.code === 'auth/id-token-expired' ||
      err.code === 'auth/argument-error' ||
      err.code === 'auth/id-token-revoked' ||
      err.message?.includes('Firebase') ||
      err.message?.includes('token')
    ) {
      return next(ApiError.unauthorized('Invalid or expired token'));
    }

    next(err);
  }
};

/**
 * Middleware: Optional auth — attaches user if valid token, otherwise continues.
 */
const optionalAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
      return next();
    }

    const decodedToken = await firebaseService.verifyIdToken(idToken);
    const user = await User.findOne({ firebaseUid: decodedToken.uid });

    if (user && user.isActive) {
      req.user = user;
    }

    next();
  } catch (_err) {
    // Token is invalid but auth is optional, continue without user
    next();
  }
};

module.exports = { verifyToken, optionalAuth };
