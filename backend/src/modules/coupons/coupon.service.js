const mongoose = require('mongoose');
const { Coupon, Category } = require('../../models');
const ApiError = require('../../utils/ApiError');
const escapeRegex = require('../../utils/escapeRegex');
const { parsePagination, buildMeta } = require('../../utils/pagination');

/**
 * Check a coupon against a set of priced lines and work out the discount.
 * The single place the coupon rules live: used by the "apply coupon" check,
 * the checkout quote and order creation.
 *
 * @param {string} code
 * @param {Array<{price: number, quantity: number, category: *}>} lines
 * @param {string} userId
 * @returns {Promise<{discount: number, coupon: object}>}
 */
async function evaluateCoupon(code, lines, userId) {
  const coupon = await Coupon.findOne({
    code: String(code).trim().toUpperCase(),
    isActive: true,
  }).populate('category', 'name slug');

  if (!coupon) {
    throw ApiError.badRequest('Invalid coupon code');
  }

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    throw ApiError.badRequest('Coupon is not yet active');
  }
  if (coupon.expiresAt && now > coupon.expiresAt) {
    throw ApiError.badRequest('Coupon has expired');
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.badRequest('Coupon usage limit reached');
  }

  const itemsTotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  if (coupon.minOrderValue > 0 && itemsTotal < coupon.minOrderValue) {
    throw ApiError.badRequest(
      `Minimum order of ₹${coupon.minOrderValue} required for this coupon`
    );
  }

  // A category coupon discounts only the items of that category
  let eligibleTotal = itemsTotal;
  if (coupon.category) {
    const categoryId = coupon.category._id.toString();
    eligibleTotal = lines
      .filter((l) => l.category && l.category.toString() === categoryId)
      .reduce((sum, l) => sum + l.price * l.quantity, 0);
    if (eligibleTotal === 0) {
      throw ApiError.badRequest(`This coupon is only valid for ${coupon.category.name} products`);
    }
  }

  const userUsage = coupon.usedBy.find((u) => u.user.toString() === userId.toString());
  if (userUsage && userUsage.count >= coupon.perUserLimit) {
    throw ApiError.badRequest('You have already used this coupon the maximum number of times');
  }

  let discount = 0;
  if (coupon.discountType === 'percent') {
    discount = Math.round((eligibleTotal * coupon.discountValue) / 100);
    if (coupon.maxDiscount > 0) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
  } else {
    discount = coupon.discountValue;
  }

  // Don't let the discount exceed what it applies to
  discount = Math.min(discount, eligibleTotal);

  return { discount, coupon };
}

/** What the customer may see of a coupon. */
function toPublicCoupon(coupon) {
  return {
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    maxDiscount: coupon.maxDiscount,
    minOrderValue: coupon.minOrderValue,
    category: coupon.category ? { name: coupon.category.name, slug: coupon.category.slug } : null,
    expiresAt: coupon.expiresAt,
  };
}

/**
 * Validate a coupon code (user-facing).
 * @returns {Promise<{discount: number, message: string, coupon: object}>}
 */
async function validateCoupon(code, lines, userId) {
  const { discount, coupon } = await evaluateCoupon(code, lines, userId);

  const message =
    coupon.discountType === 'percent'
      ? `${coupon.discountValue}% off${coupon.maxDiscount ? ` (max ₹${coupon.maxDiscount})` : ''}`
      : `₹${coupon.discountValue} off`;

  return {
    discount,
    message: `Coupon applied! ${message}. You save ₹${discount}`,
    coupon: toPublicCoupon(coupon),
  };
}

/**
 * Record one use of a coupon by a user (atomic counters).
 */
async function recordCouponUse(couponCode, userId) {
  if (!couponCode) return;
  const bumped = await Coupon.updateOne(
    { code: couponCode, 'usedBy.user': userId },
    { $inc: { usedCount: 1, 'usedBy.$.count': 1 } }
  );
  if (bumped.matchedCount === 0) {
    await Coupon.updateOne(
      { code: couponCode },
      { $inc: { usedCount: 1 }, $push: { usedBy: { user: userId, count: 1 } } }
    );
  }
}

/**
 * Give a coupon use back (order cancelled or never paid).
 */
async function releaseCouponUse(couponCode, userId) {
  if (!couponCode) return;
  await Coupon.updateOne(
    { code: couponCode, usedCount: { $gt: 0 }, usedBy: { $elemMatch: { user: userId, count: { $gt: 0 } } } },
    { $inc: { usedCount: -1, 'usedBy.$.count': -1 } }
  );
}

/**
 * Storefront: coupons the business chose to advertise.
 */
async function listStorefrontCoupons() {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    showOnStorefront: true,
    startsAt: { $lte: now },
    expiresAt: { $gt: now },
  })
    .sort({ createdAt: -1 })
    .limit(12)
    .populate('category', 'name slug')
    .lean();

  return coupons
    .filter((c) => !(c.usageLimit > 0 && c.usedCount >= c.usageLimit))
    .map(toPublicCoupon);
}

/**
 * Admin: list all coupons.
 */
async function listCoupons(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ code: rx }, { description: rx }];
  }
  if (query.isActive !== undefined) filter.isActive = query.isActive;

  const [coupons, total] = await Promise.all([
    Coupon.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-usedBy')
      .populate('category', 'name slug')
      .lean(),
    Coupon.countDocuments(filter),
  ]);
  return { coupons, meta: buildMeta(total, page, limit) };
}

/**
 * Admin: get coupon by ID.
 */
async function getCouponById(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid coupon ID');
  const coupon = await Coupon.findById(id);
  if (!coupon) throw ApiError.notFound('Coupon not found');
  return coupon;
}

async function assertCategory(categoryId) {
  if (!categoryId) return;
  if (!mongoose.isValidObjectId(categoryId)) throw ApiError.badRequest('Invalid category ID');
  if (!(await Category.exists({ _id: categoryId }))) throw ApiError.badRequest('Category not found');
}

function assertPercent(data) {
  if (data.discountType === 'percent' && data.discountValue > 100) {
    throw ApiError.badRequest('A percentage discount cannot be more than 100');
  }
}

/**
 * Admin: create coupon.
 */
async function createCoupon(data) {
  assertPercent(data);
  await assertCategory(data.category);
  return Coupon.create(data);
}

/**
 * Admin: update coupon.
 */
async function updateCoupon(id, data) {
  const coupon = await getCouponById(id);
  await assertCategory(data.category);
  Object.assign(coupon, data);
  assertPercent(coupon);
  await coupon.save();
  return coupon;
}

/**
 * Admin: delete coupon.
 */
async function deleteCoupon(id) {
  const coupon = await getCouponById(id);
  await Coupon.findByIdAndDelete(id);
  return coupon;
}

module.exports = {
  evaluateCoupon,
  validateCoupon,
  recordCouponUse,
  releaseCouponUse,
  listStorefrontCoupons,
  listCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
};
