const { Wishlist, Product } = require('../../models');
const ApiError = require('../../utils/ApiError');
const mongoose = require('mongoose');

/**
 * Get user's wishlist.
 */
async function getWishlist(userId) {
  let wishlist = await Wishlist.findOne({ user: userId }).populate({
    path: 'products',
    select: 'name slug price mrp images stock isActive discountPercent',
  });

  if (!wishlist) {
    return { products: [] };
  }

  // Filter out deleted/inactive products in response
  const products = wishlist.products.filter((p) => p && p.isActive);
  return { products };
}

/**
 * Add product to wishlist.
 */
async function addToWishlist(userId, productId) {
  if (!mongoose.isValidObjectId(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw ApiError.notFound('Product not found');
  }

  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    wishlist = new Wishlist({ user: userId, products: [] });
  }

  if (wishlist.products.some((p) => p.toString() === productId)) {
    throw ApiError.conflict('Product already in wishlist');
  }

  wishlist.products.push(productId);
  await wishlist.save();
  return getWishlist(userId);
}

/**
 * Remove product from wishlist.
 */
async function removeFromWishlist(userId, productId) {
  const wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    throw ApiError.notFound('Wishlist not found');
  }

  wishlist.products = wishlist.products.filter((p) => p.toString() !== productId);
  await wishlist.save();
  return getWishlist(userId);
}

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
