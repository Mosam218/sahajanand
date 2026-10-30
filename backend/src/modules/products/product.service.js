const mongoose = require('mongoose');
const { Product, Category, Order, Cart, Wishlist, Banner } = require('../../models');
const ApiError = require('../../utils/ApiError');
const cloudinaryService = require('../../integrations/cloudinary/cloudinary.service');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const escapeRegex = require('../../utils/escapeRegex');

/**
 * Build a sort object from the sort string.
 * @param {string} sortStr
 * @returns {object}
 */
function buildSort(sortStr) {
  switch (sortStr) {
    case 'price_asc':
      return { price: 1 };
    case 'price_desc':
      return { price: -1 };
    case 'popular':
      return { soldCount: -1, createdAt: -1 };
    case 'rating':
      return { ratingAverage: -1, ratingCount: -1 };
    case 'discount':
      return { discountPercent: -1 };
    case 'name':
      return { model: 1, name: 1 };
    case 'stock_asc':
      return { stock: 1, name: 1 };
    case 'catalogue':
      return { sortOrder: 1, createdAt: 1 };
    case 'newest':
    default:
      return { createdAt: -1 };
  }
}

/**
 * List products with search, filters, and pagination.
 * Returns only active products for public queries.
 *
 * @param {object} query - Parsed query params
 * @param {boolean} [includeInactive=false] - Include inactive (admin)
 * @returns {Promise<{products: Array, meta: object}>}
 */
async function listProducts(query, includeInactive = false) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (!includeInactive) {
    filter.isActive = true;
  } else if (query.isActive !== undefined) {
    filter.isActive = query.isActive;
  }

  // Category filter (slug or id)
  if (query.category) {
    if (mongoose.isValidObjectId(query.category)) {
      filter.category = query.category;
    } else {
      const cat = await Category.findOne({ slug: query.category }).lean();
      if (cat) {
        filter.category = cat._id;
      } else {
        return { products: [], meta: buildMeta(0, page, limit) };
      }
    }
  }

  // Brand filter
  if (query.brand) {
    filter.brand = { $regex: new RegExp(`^${escapeRegex(query.brand)}$`, 'i') };
  }

  if (query.subcategory) {
    filter.subcategory = query.subcategory;
  }
  if (query.tempClass) {
    filter.tempClass = query.tempClass;
  }
  if (query.family) {
    filter.familyId = query.family;
  }

  // Price range
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {};
    if (query.minPrice !== undefined) filter.price.$gte = query.minPrice;
    if (query.maxPrice !== undefined) filter.price.$lte = query.maxPrice;
  }

  // Stock filter
  if (query.inStock === true || query.inStock === 'true') {
    filter.stock = { $gt: 0 };
  }

  // Stock level (admin inventory views)
  if (query.stockStatus === 'out') {
    filter.stock = 0;
  } else if (query.stockStatus === 'low') {
    filter.stock = { $gt: 0, $lte: query.lowStockThreshold ?? 3 };
  } else if (query.stockStatus === 'in') {
    filter.stock = { $gt: 0 };
  }

  // Featured filter
  if (query.featured === true || query.featured === 'true') {
    filter.isFeatured = true;
  }

  // Rating filter
  if (query.rating !== undefined) {
    filter.ratingAverage = { $gte: query.rating };
  }

  // Search
  let products;
  let total;

  if (query.search) {
    let textMatched = false;
    try {
      // Try text search first
      const textFilter = { ...filter, $text: { $search: query.search } };
      total = await Product.countDocuments(textFilter);

      if (total > 0) {
        textMatched = true;
        products = await Product.find(textFilter, { score: { $meta: 'textScore' } })
          .sort({ score: { $meta: 'textScore' }, ...buildSort(query.sort) })
          .skip(skip)
          .limit(limit)
          .populate('category', 'name slug')
          .lean();
      }
    } catch (_textErr) {
      // Text index not built or search syntax error; fallback to regex
      textMatched = false;
    }

    if (!textMatched) {
      // Regex fallback (partial words, model numbers typed without spaces)
      const rx = new RegExp(escapeRegex(query.search).replace(/\s+/g, '\\s*'), 'i');
      const regexFilter = {
        ...filter,
        $or: [{ name: rx }, { model: rx }, { sku: rx }, { brand: rx }, { subcategory: rx }, { tags: rx }],
      };
      total = await Product.countDocuments(regexFilter);
      products = await Product.find(regexFilter)
        .sort(buildSort(query.sort))
        .skip(skip)
        .limit(limit)
        .populate('category', 'name slug')
        .lean();
    }
  } else {
    total = await Product.countDocuments(filter);
    products = await Product.find(filter)
      .sort(buildSort(query.sort))
      .skip(skip)
      .limit(limit)
      .populate('category', 'name slug')
      .lean();
  }

  return { products, meta: buildMeta(total, page, limit) };
}

/**
 * Get featured products.
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function getFeaturedProducts(limit = 12) {
  return Product.find({ isActive: true, isFeatured: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('category', 'name slug')
    .lean();
}

/**
 * Get new arrivals.
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function getNewArrivals(limit = 12) {
  return Product.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('category', 'name slug')
    .lean();
}

/**
 * Get unique brands.
 * @returns {Promise<string[]>}
 */
async function getBrands() {
  const brands = await Product.distinct('brand', { isActive: true, brand: { $ne: '' } });
  return brands.sort();
}

/**
 * Get product by slug.
 * @param {string} slug
 * @returns {Promise<{product: object, relatedProducts: Array}>}
 */
async function getProductBySlug(slug) {
  const product = await Product.findOne({ slug, isActive: true })
    .populate('category', 'name slug')
    .lean();

  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  // Get related products from the same category
  const relatedProducts = await Product.find({
    category: product.category._id,
    _id: { $ne: product._id },
    isActive: true,
  })
    .sort({ soldCount: -1, sortOrder: 1 })
    .limit(8)
    .populate('category', 'name slug')
    .lean();

  // Other models of the same series
  const variants = product.familyId
    ? await Product.find({ familyId: product.familyId, isActive: true })
        .sort({ sortOrder: 1, model: 1 })
        .limit(30)
        .populate('category', 'name slug')
        .lean()
    : [];

  return { product, relatedProducts, variants };
}

/**
 * Get related products for a product.
 * @param {string} productId
 * @returns {Promise<Array>}
 */
async function getRelatedProducts(productId) {
  if (!mongoose.isValidObjectId(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const product = await Product.findById(productId).lean();
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  return Product.find({
    category: product.category,
    _id: { $ne: productId },
    isActive: true,
  })
    .sort({ soldCount: -1 })
    .limit(8)
    .populate('category', 'name slug')
    .lean();
}

/**
 * Get product by ID (admin — includes inactive).
 * @param {string} id
 * @returns {Promise<object>}
 */
async function getProductById(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const product = await Product.findById(id).populate('category', 'name slug');
  if (!product) {
    throw ApiError.notFound('Product not found');
  }
  return product;
}

/**
 * Create a new product (admin).
 * @param {object} data
 * @returns {Promise<object>}
 */
async function createProduct(data) {
  // Validate category exists
  if (!mongoose.isValidObjectId(data.category)) {
    throw ApiError.badRequest('Invalid category ID');
  }
  const category = await Category.findById(data.category);
  if (!category) {
    throw ApiError.badRequest('Category not found');
  }

  const product = await Product.create({ ...data, priceSource: 'confirmed' });
  return product.populate('category', 'name slug');
}

/**
 * Update a product (admin).
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
async function updateProduct(id, data) {
  const product = await getProductById(id);

  if (data.category) {
    if (!mongoose.isValidObjectId(data.category)) {
      throw ApiError.badRequest('Invalid category ID');
    }
    const category = await Category.findById(data.category);
    if (!category) {
      throw ApiError.badRequest('Category not found');
    }
  }

  // A price set from the admin panel is the store's own confirmed price
  if (data.price !== undefined && data.price !== product.price) {
    product.priceSource = 'confirmed';
  }

  Object.assign(product, data);
  await product.save();
  return product.populate('category', 'name slug');
}

/**
 * Delete a product (admin).
 * Soft-delete if it appears in orders; hard-delete otherwise.
 * @param {string} id
 */
async function deleteProduct(id) {
  const product = await getProductById(id);
  const orderCount = await Order.countDocuments({ 'items.product': id });

  if (orderCount > 0) {
    // Soft delete
    product.isActive = false;
    await product.save();
  } else {
    // Hard delete — remove stored images
    if (product.images && product.images.length > 0) {
      const publicIds = product.images.map((img) => img.publicId).filter(Boolean);
      await cloudinaryService.deleteMultipleImages(publicIds);
    }
    await Product.findByIdAndDelete(id);
    await Promise.all([
      Cart.updateMany({}, { $pull: { items: { product: product._id } } }),
      Wishlist.updateMany({}, { $pull: { products: product._id } }),
      Banner.deleteMany({ product: product._id }),
    ]);
  }

  return { archived: orderCount > 0 };
}

/**
 * Toggle product active status.
 * @param {string} id
 * @returns {Promise<object>}
 */
async function toggleProduct(id) {
  const product = await getProductById(id);
  product.isActive = !product.isActive;
  await product.save();
  return product;
}

/**
 * Update product stock.
 * @param {string} id
 * @param {number} stock
 * @returns {Promise<object>}
 */
async function updateStock(id, stock) {
  const product = await getProductById(id);
  product.stock = stock;
  await product.save();
  return product;
}

/**
 * Upload product images.
 * @param {string} id
 * @param {Array} files - Multer files
 * @returns {Promise<object>}
 */
async function uploadImages(id, files) {
  const product = await getProductById(id);

  if (product.images.length + files.length > 8) {
    // Clean up temp files
    files.forEach((f) => cloudinaryService.deleteTempFile(f.path));
    throw ApiError.badRequest(
      `Product can have max 8 images. Currently has ${product.images.length}, trying to add ${files.length}.`
    );
  }

  const uploaded = await cloudinaryService.uploadMultipleImages(
    files.map((f) => f.path),
    'sahajanand/products'
  );

  product.images.push(...uploaded);
  await product.save();
  return product;
}

/**
 * Delete a product image by publicId.
 * @param {string} productId
 * @param {string} publicId - URL-encoded Cloudinary public ID
 */
async function deleteImage(productId, publicId) {
  const product = await getProductById(productId);

  // Accepts the image's own id, or its storage public ID
  const index = product.images.findIndex(
    (img) => img._id.toString() === publicId || (img.publicId && img.publicId === publicId)
  );
  if (index === -1) {
    throw ApiError.notFound('Image not found on this product');
  }

  await cloudinaryService.deleteImage(product.images[index].publicId);
  product.images.splice(index, 1);
  await product.save();
  return product;
}

/**
 * Reorder a product's images (the first one is the main photo).
 * @param {string} productId
 * @param {string[]} imageIds - every image id of the product, in the new order
 */
async function reorderImages(productId, imageIds) {
  const product = await getProductById(productId);
  const byId = new Map(product.images.map((img) => [img._id.toString(), img]));
  if (imageIds.length !== byId.size || !imageIds.every((id) => byId.has(id)) || new Set(imageIds).size !== byId.size) {
    throw ApiError.badRequest('Image order must list every image of the product exactly once');
  }
  product.images = imageIds.map((id) => byId.get(id));
  await product.save();
  return product;
}

module.exports = {
  listProducts,
  getFeaturedProducts,
  getNewArrivals,
  getBrands,
  getProductBySlug,
  getRelatedProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProduct,
  updateStock,
  uploadImages,
  deleteImage,
  reorderImages,
};
