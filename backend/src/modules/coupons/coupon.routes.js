const { Router } = require('express');
const couponController = require('./coupon.controller');
const { verifyToken } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');
const { validateCouponSchema } = require('./coupon.validation');

const router = Router();

router.get('/', couponController.getStorefrontCoupons);
router.post(
  '/validate',
  verifyToken,
  validate({ body: validateCouponSchema }),
  couponController.validateCoupon
);

module.exports = router;
