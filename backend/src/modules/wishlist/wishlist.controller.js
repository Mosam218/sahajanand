const wishlistService = require('./wishlist.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');

const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await wishlistService.getWishlist(req.user._id);
  return ApiResponse(res, 200, 'Wishlist fetched', wishlist);
});

const addToWishlist = asyncHandler(async (req, res) => {
  const wishlist = await wishlistService.addToWishlist(req.user._id, req.params.productId);
  return ApiResponse(res, 200, 'Added to wishlist', wishlist);
});

const removeFromWishlist = asyncHandler(async (req, res) => {
  const wishlist = await wishlistService.removeFromWishlist(req.user._id, req.params.productId);
  return ApiResponse(res, 200, 'Removed from wishlist', wishlist);
});

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
