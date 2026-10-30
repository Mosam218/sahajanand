const reviewService = require('./review.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { isStaff } = require('../../utils/roles');

const getProductReviews = asyncHandler(async (req, res) => {
  const { reviews, ratingBreakdown, meta } = await reviewService.getProductReviews(
    req.params.productId,
    req.query
  );
  return ApiResponse(res, 200, 'Reviews fetched', { reviews, ratingBreakdown }, meta);
});

const createReview = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(
    req.params.productId,
    req.user._id,
    req.body
  );
  return ApiResponse(res, 201, 'Review created', { review });
});

const updateReview = asyncHandler(async (req, res) => {
  const review = await reviewService.updateReview(req.params.id, req.user._id, req.body);
  return ApiResponse(res, 200, 'Review updated', { review });
});

const deleteReview = asyncHandler(async (req, res) => {
  await reviewService.deleteReview(req.params.id, req.user._id, isStaff(req.user));
  return ApiResponse(res, 200, 'Review deleted');
});

module.exports = { getProductReviews, createReview, updateReview, deleteReview };
