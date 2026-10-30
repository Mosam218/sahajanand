const mongoose = require('mongoose');
const { Banner, Product } = require('../../models');
const ApiError = require('../../utils/ApiError');

const PRODUCT_FIELDS = 'name model slug images isActive category';

/**
 * Storefront: active slides whose product is still on sale.
 */
async function getActiveBanners() {
  const banners = await Banner.find({ isActive: true })
    .sort({ sortOrder: 1, createdAt: 1 })
    .populate({ path: 'product', select: PRODUCT_FIELDS, populate: { path: 'category', select: 'name slug' } })
    .lean();

  return banners.filter((b) => b.product && b.product.isActive);
}

/** Admin: every slide, including hidden ones. */
async function listBanners() {
  return Banner.find().sort({ sortOrder: 1, createdAt: 1 }).populate('product', PRODUCT_FIELDS).lean();
}

async function assertProduct(productId) {
  if (!mongoose.isValidObjectId(productId)) throw ApiError.badRequest('Invalid product ID');
  const exists = await Product.exists({ _id: productId });
  if (!exists) throw ApiError.badRequest('Product not found');
}

async function getBannerById(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid banner ID');
  const banner = await Banner.findById(id);
  if (!banner) throw ApiError.notFound('Banner not found');
  return banner;
}

async function createBanner(data) {
  await assertProduct(data.product);
  const banner = await Banner.create(data);
  return banner.populate('product', PRODUCT_FIELDS);
}

async function updateBanner(id, data) {
  const banner = await getBannerById(id);
  if (data.product) await assertProduct(data.product);
  Object.assign(banner, data);
  await banner.save();
  return banner.populate('product', PRODUCT_FIELDS);
}

async function deleteBanner(id) {
  const banner = await getBannerById(id);
  await Banner.findByIdAndDelete(banner._id);
}

module.exports = { getActiveBanners, listBanners, getBannerById, createBanner, updateBanner, deleteBanner };
