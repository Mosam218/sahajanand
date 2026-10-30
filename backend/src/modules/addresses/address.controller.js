const addressService = require('./address.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');

const getAddresses = asyncHandler(async (req, res) => {
  const addresses = await addressService.getAddresses(req.user._id);
  return ApiResponse(res, 200, 'Addresses fetched', { addresses });
});

const createAddress = asyncHandler(async (req, res) => {
  const address = await addressService.createAddress(req.user._id, req.body);
  return ApiResponse(res, 201, 'Address created', { address });
});

const updateAddress = asyncHandler(async (req, res) => {
  const address = await addressService.updateAddress(req.user._id, req.params.id, req.body);
  return ApiResponse(res, 200, 'Address updated', { address });
});

const deleteAddress = asyncHandler(async (req, res) => {
  await addressService.deleteAddress(req.user._id, req.params.id);
  return ApiResponse(res, 200, 'Address deleted');
});

const setDefault = asyncHandler(async (req, res) => {
  const address = await addressService.setDefault(req.user._id, req.params.id);
  return ApiResponse(res, 200, 'Default address set', { address });
});

module.exports = { getAddresses, createAddress, updateAddress, deleteAddress, setDefault };
