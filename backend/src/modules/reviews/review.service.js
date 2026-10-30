const { Review, Product, Order } = require('../../models');
const ApiError = require('../../utils/ApiError');
const mongoose = require('mongoose');
const { parsePagination, buildMeta } = require('../../utils/pagination');

function assertId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid review ID');
  }
}

/**
 * Recalculate product rating average and count from reviews.
 * @param {string} productId
 */
async function recalculateRatings(productId) {
  const result = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), isApproved: true } },
    {
      $group: {
        _id: '$product',
        ratingAverage: { $avg: '$rating' },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  if (result.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      ratingAverage: Math.round(result[0].ratingAverage * 10) / 10,
      ratingCount: result[0].ratingCount,
    });
  } else {
    await Product.findByIdAndUpdate(productId, {
      ratingAverage: 0,
      ratingCount: 0,
    });
  }
}

/**
 * Get reviews for a product (public, paginated).
 * Includes rating breakdown.
 */
async function getProductReviews(productId, query) {
  if (!mongoose.isValidObjectId(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const { page, limit, skip } = parsePagination(query);
  const filter = { product: productId, isApproved: true };

  const [reviews, total, breakdown] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name photoURL')
      .lean(),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(productId), isApproved: true } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]),
  ]);

  const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  breakdown.forEach((b) => {
    ratingBreakdown[b._id] = b.count;
  });

  return {
    reviews,
    ratingBreakdown,
    meta: buildMeta(total, page, limit),
  };
}

/**
 * Create a review for a product.
 * One review per user per product.
 */
async function createReview(productId, userId, data) {
  if (!mongoose.isValidObjectId(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  // Check if user already reviewed
  const existing = await Review.findOne({ product: productId, user: userId });
  if (existing) {
    throw ApiError.conflict('You have already reviewed this product');
  }

  // Check verified purchase
  const hasDeliveredOrder = await Order.findOne({
    user: userId,
    'items.product': productId,
    orderStatus: 'delivered',
  });

  const review = await Review.create({
    product: productId,
    user: userId,
    rating: data.rating,
    title: data.title || '',
    comment: data.comment || '',
    isVerifiedPurchase: !!hasDeliveredOrder,
  });

  await recalculateRatings(productId);
  return review;
}

/**
 * Update a review (owner only).
 */
async function updateReview(reviewId, userId, data) {
  assertId(reviewId);
  const review = await Review.findById(reviewId);
  if (!review) {
    throw ApiError.notFound('Review not found');
  }
  if (review.user.toString() !== userId.toString()) {
    throw ApiError.forbidden('You can only edit your own reviews');
  }

  if (data.rating !== undefined) review.rating = data.rating;
  if (data.title !== undefined) review.title = data.title;
  if (data.comment !== undefined) review.comment = data.comment;
  await review.save();

  await recalculateRatings(review.product.toString());
  return review;
}

/**
 * Delete a review (owner or admin).
 */
async function deleteReview(reviewId, userId, isAdmin = false) {
  assertId(reviewId);
  const review = await Review.findById(reviewId);
  if (!review) {
    throw ApiError.notFound('Review not found');
  }

  if (!isAdmin && review.user.toString() !== userId.toString()) {
    throw ApiError.forbidden('You can only delete your own reviews');
  }

  const productId = review.product.toString();
  await Review.findByIdAndDelete(reviewId);
  await recalculateRatings(productId);
}

/**
 * Admin: list all reviews.
 */
async function listAllReviews(query) {
  const { page, limit, skip } = parsePagination(query);
  const [reviews, total] = await Promise.all([
    Review.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email')
      .populate('product', 'name slug')
      .lean(),
    Review.countDocuments(),
  ]);
  return { reviews, meta: buildMeta(total, page, limit) };
}

/**
 * Admin: toggle review approval.
 */
async function toggleApproval(reviewId) {
  assertId(reviewId);
  const review = await Review.findById(reviewId);
  if (!review) throw ApiError.notFound('Review not found');
  review.isApproved = !review.isApproved;
  await review.save();
  await recalculateRatings(review.product.toString());
  return review;
}

module.exports = {
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,
  listAllReviews,
  toggleApproval,
};
