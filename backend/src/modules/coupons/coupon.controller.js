const couponService = require('./coupon.service');
const orderService = require('../orders/order.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

/**
 * GET /api/coupons — offers the store chose to show on the storefront.
 */
const getStorefrontCoupons = asyncHandler(async (_req, res) => {
  const coupons = await couponService.listStorefrontCoupons();
  return ApiResponse(res, 200, 'Coupons fetched', { coupons });
});

/**
 * POST /api/coupons/validate
 * Checks a code against the cart (or the given items), priced on the server.
 */
const validateCoupon = asyncHandler(async (req, res) => {
  const rawItems = await orderService.resolveItems(req.user._id, req.body.items);
  const priced = await orderService.priceItems(req.user._id, rawItems, req.body.code);

  if (priced.orderItems.length === 0) {
    throw ApiError.badRequest('Cart is empty');
  }
  if (priced.couponError) {
    throw ApiError.badRequest(priced.couponError);
  }

  const result = await couponService.validateCoupon(
    req.body.code,
    priced.orderItems.map((i, idx) => ({ price: i.price, quantity: i.quantity, category: priced.categories[idx] })),
    req.user._id
  );
  return ApiResponse(res, 200, result.message, result);
});

module.exports = { getStorefrontCoupons, validateCoupon };
