const userService = require('./user.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * GET /api/users/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await userService.getProfile(req.user._id);
  return ApiResponse(res, 200, 'User profile fetched', { user });
});

/**
 * PUT /api/users/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user._id, req.body);
  return ApiResponse(res, 200, 'Profile updated successfully', { user });
});

module.exports = { getProfile, updateProfile };
