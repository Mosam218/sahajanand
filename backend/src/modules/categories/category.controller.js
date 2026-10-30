const categoryService = require('./category.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * GET /api/categories — active categories with product counts (public).
 */
const getCategories = asyncHandler(async (_req, res) => {
  const categories = await categoryService.getActiveCategories();
  return ApiResponse(res, 200, 'Categories fetched', { categories });
});

/**
 * GET /api/categories/:slug — single category by slug (public).
 */
const getCategoryBySlug = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryBySlug(req.params.slug);
  return ApiResponse(res, 200, 'Category fetched', { category });
});

module.exports = { getCategories, getCategoryBySlug };
