const authService = require('./auth.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

/**
 * POST /api/auth/login
 * Verify Firebase ID token and upsert user.
 */
const login = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('No token provided');
  }

  const idToken = authHeader.split('Bearer ')[1];
  if (!idToken) {
    throw ApiError.unauthorized('No token provided');
  }

  let user;
  try {
    user = await authService.loginWithFirebase(idToken, req.body);
  } catch (err) {
    // Convert Firebase verification errors to 401
    if (err instanceof ApiError) throw err;
    throw ApiError.unauthorized('Invalid or expired token');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Your account has been deactivated. Contact support.');
  }

  return ApiResponse(res, 200, 'Login successful', { user });
});

/**
 * GET /api/auth/me
 * Get current user profile.
 */
const me = asyncHandler(async (req, res) => {
  const user = await authService.getUserProfile(req.user._id);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return ApiResponse(res, 200, 'User profile fetched', { user });
});

/**
 * POST /api/auth/logout
 * Revoke refresh tokens (optional). Frontend clears Firebase session.
 */
const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.firebaseUid);
  return ApiResponse(res, 200, 'Logged out successfully');
});

module.exports = { login, me, logout };
