const { User } = require('../../models');
const ApiError = require('../../utils/ApiError');

/**
 * Get user profile by ID.
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
}

/**
 * Update user profile (name, phone only).
 * @param {string} userId
 * @param {object} data - { name?, phone? }
 * @returns {Promise<object>}
 */
async function updateProfile(userId, data) {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (data.name !== undefined) user.name = data.name;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.company !== undefined) user.company = data.company;
  if (data.gstin !== undefined) user.gstin = data.gstin;

  await user.save();
  return user;
}

module.exports = { getProfile, updateProfile };
