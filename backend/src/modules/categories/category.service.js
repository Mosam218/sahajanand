const mongoose = require('mongoose');
const { Category, Product } = require('../../models');
const ApiError = require('../../utils/ApiError');
const cloudinaryService = require('../../integrations/cloudinary/cloudinary.service');

/**
 * Get all active categories with product counts.
 * @returns {Promise<Array>}
 */
async function getActiveCategories() {
  const categories = await Category.find({ isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  // Add product counts
  const counts = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);

  const countMap = {};
  counts.forEach((c) => {
    countMap[c._id.toString()] = c.count;
  });

  return categories.map((cat) => ({
    ...cat,
    productCount: countMap[cat._id.toString()] || 0,
  }));
}

/**
 * Get category by slug.
 * @param {string} slug
 * @returns {Promise<object>}
 */
async function getCategoryBySlug(slug) {
  const category = await Category.findOne({ slug, isActive: true }).lean();
  if (!category) {
    throw ApiError.notFound('Category not found');
  }
  return category;
}

/**
 * Get all categories (admin — includes inactive).
 * @returns {Promise<Array>}
 */
async function getAllCategories() {
  const [categories, counts] = await Promise.all([
    Category.find().sort({ sortOrder: 1, name: 1 }).lean(),
    Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories.map((cat) => ({ ...cat, productCount: countMap.get(String(cat._id)) || 0 }));
}

/**
 * Get category by ID (admin).
 * @param {string} id
 * @returns {Promise<object>}
 */
async function getCategoryById(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid category ID');
  }
  const category = await Category.findById(id);
  if (!category) {
    throw ApiError.notFound('Category not found');
  }
  return category;
}

/**
 * Create a new category.
 * @param {object} data
 * @param {object} [file] - Uploaded image file
 * @returns {Promise<object>}
 */
async function createCategory(data, file) {
  if (file) {
    const imageResult = await cloudinaryService.uploadImage(
      file.path,
      'sahajanand/categories'
    );
    data.image = imageResult;
  }

  const category = await Category.create(data);
  return category;
}

/**
 * Update a category.
 * @param {string} id
 * @param {object} data
 * @param {object} [file] - New image file
 * @returns {Promise<object>}
 */
async function updateCategory(id, data, file) {
  const category = await getCategoryById(id);

  if (file) {
    // Delete old image
    if (category.image && category.image.publicId) {
      await cloudinaryService.deleteImage(category.image.publicId);
    }
    const imageResult = await cloudinaryService.uploadImage(
      file.path,
      'sahajanand/categories'
    );
    data.image = imageResult;
  }

  Object.assign(category, data);
  await category.save();
  return category;
}

/**
 * Delete a category.
 * Cannot delete if products exist in this category.
 * @param {string} id
 */
async function deleteCategory(id) {
  const category = await getCategoryById(id);

  const productCount = await Product.countDocuments({ category: id });
  if (productCount > 0) {
    throw ApiError.conflict(
      `Cannot delete category "${category.name}" — it still has ${productCount} product(s). Move or delete them first.`
    );
  }

  // Delete Cloudinary image
  if (category.image && category.image.publicId) {
    await cloudinaryService.deleteImage(category.image.publicId);
  }

  await Category.findByIdAndDelete(id);
}

module.exports = {
  getActiveCategories,
  getCategoryBySlug,
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
