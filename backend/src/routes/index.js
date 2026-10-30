const { Router } = require('express');
const mongoose = require('mongoose');

const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/users/user.routes');
const categoryRoutes = require('../modules/categories/category.routes');
const productRoutes = require('../modules/products/product.routes');
const addressRoutes = require('../modules/addresses/address.routes');
const cartRoutes = require('../modules/cart/cart.routes');
const wishlistRoutes = require('../modules/wishlist/wishlist.routes');
const couponRoutes = require('../modules/coupons/coupon.routes');
const reviewRoutes = require('../modules/reviews/review.routes');
const orderRoutes = require('../modules/orders/order.routes');
const paymentRoutes = require('../modules/payments/payment.routes');
const adminRoutes = require('../modules/admin/admin.routes');
const enquiryRoutes = require('../modules/enquiries/enquiry.routes');
const bannerRoutes = require('../modules/banners/banner.routes');
const settingsRoutes = require('../modules/settings/settings.routes');
const paymentController = require('../modules/payments/payment.controller');

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    data: {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    },
  });
});

// Module routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/addresses', addressRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/coupons', couponRoutes);
router.use('/reviews', reviewRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/enquiries', enquiryRoutes);
router.use('/banners', bannerRoutes);
router.use('/settings', settingsRoutes);
router.use('/admin', adminRoutes);

// Razorpay Standard Checkout endpoints (POST /api/create-order & POST /api/verify-payment)
router.post('/create-order', paymentController.createOrder);
router.post('/verify-payment', paymentController.verifyPaymentSignature);

module.exports = router;
