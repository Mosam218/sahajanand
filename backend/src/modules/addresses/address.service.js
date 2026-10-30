const { Address } = require('../../models');
const ApiError = require('../../utils/ApiError');

const MAX_ADDRESSES = 10;

/**
 * Get all addresses for a user.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getAddresses(userId) {
  return Address.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
}

/**
 * Create a new address.
 * @param {string} userId
 * @param {object} data
 * @returns {Promise<object>}
 */
async function createAddress(userId, data) {
  const count = await Address.countDocuments({ user: userId });
  if (count >= MAX_ADDRESSES) {
    throw ApiError.badRequest(`Maximum ${MAX_ADDRESSES} addresses allowed`);
  }

  // If this is the first address or isDefault is true, ensure only one default
  if (data.isDefault || count === 0) {
    await Address.updateMany({ user: userId }, { isDefault: false });
    data.isDefault = true;
  }

  data.user = userId;
  return Address.create(data);
}

/**
 * Update an address.
 * @param {string} userId
 * @param {string} addressId
 * @param {object} data
 * @returns {Promise<object>}
 */
async function updateAddress(userId, addressId, data) {
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw ApiError.notFound('Address not found');
  }

  if (data.isDefault === true) {
    await Address.updateMany({ user: userId, _id: { $ne: addressId } }, { isDefault: false });
  } else if (data.isDefault === false && address.isDefault) {
    // There is always one default address
    delete data.isDefault;
  }

  Object.assign(address, data);
  await address.save();
  return address;
}

/**
 * Delete an address.
 * @param {string} userId
 * @param {string} addressId
 */
async function deleteAddress(userId, addressId) {
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw ApiError.notFound('Address not found');
  }

  const wasDefault = address.isDefault;
  await Address.findByIdAndDelete(addressId);

  // If we deleted the default, make the first remaining one default
  if (wasDefault) {
    const first = await Address.findOne({ user: userId }).sort({ createdAt: -1 });
    if (first) {
      first.isDefault = true;
      await first.save();
    }
  }
}

/**
 * Set an address as default.
 * @param {string} userId
 * @param {string} addressId
 * @returns {Promise<object>}
 */
async function setDefault(userId, addressId) {
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw ApiError.notFound('Address not found');
  }

  await Address.updateMany({ user: userId }, { isDefault: false });
  address.isDefault = true;
  await address.save();
  return address;
}

module.exports = { getAddresses, createAddress, updateAddress, deleteAddress, setDefault };
