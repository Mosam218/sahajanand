const productService = require('./product.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');

/**
 * GET /api/products — list products with filters (public).
 */
const getProducts = asyncHandler(async (req, res) => {
  const { products, meta } = await productService.listProducts(req.query);
  return ApiResponse(res, 200, 'Products fetched', { products }, meta);
});

/**
 * GET /api/products/featured
 */
const getFeatured = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 12;
  const products = await productService.getFeaturedProducts(limit);
  return ApiResponse(res, 200, 'Featured products fetched', { products });
});

/**
 * GET /api/products/new-arrivals
 */
const getNewArrivals = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 12;
  const products = await productService.getNewArrivals(limit);
  return ApiResponse(res, 200, 'New arrivals fetched', { products });
});

/**
 * GET /api/products/brands
 */
const getBrands = asyncHandler(async (_req, res) => {
  const brands = await productService.getBrands();
  return ApiResponse(res, 200, 'Brands fetched', { brands });
});

/**
 * GET /api/products/:slug — single product by slug with related products.
 */
const getProductBySlug = asyncHandler(async (req, res) => {
  const { product, relatedProducts, variants } = await productService.getProductBySlug(
    req.params.slug
  );
  return ApiResponse(res, 200, 'Product fetched', { product, relatedProducts, variants });
});

/**
 * GET /api/products/:id/related
 */
const getRelatedProducts = asyncHandler(async (req, res) => {
  const products = await productService.getRelatedProducts(req.params.id);
  return ApiResponse(res, 200, 'Related products fetched', { products });
});

module.exports = {
  getProducts,
  getFeatured,
  getNewArrivals,
  getBrands,
  getProductBySlug,
  getRelatedProducts,
};
