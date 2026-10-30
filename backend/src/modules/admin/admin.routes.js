const { Router } = require('express');
const adminController = require('./admin.controller');
const { verifyToken } = require('../../middleware/auth.middleware');
const { isAdmin, requireSuperAdmin } = require('../../middleware/admin.middleware');
const { auditAdminChanges } = require('../../middleware/audit.middleware');
const { validate } = require('../../middleware/validation.middleware');
const { uploadSingle, uploadMultiple } = require('../../middleware/upload.middleware');
const { adminLimiter } = require('../../middleware/rateLimit.middleware');
const v = require('./admin.validation');
const { adminUpdateEnquirySchema } = require('../enquiries/enquiry.validation');
const { updateSettingsSchema } = require('../settings/settings.validation');

const router = Router();
const id = validate({ params: v.idParamSchema });

// All admin routes require authentication + admin role. The role is checked
// here on the server for every request; the admin UI is never trusted.
router.use(verifyToken, isAdmin, adminLimiter, auditAdminChanges);

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Products
router.get('/products', validate({ query: v.adminProductsQuerySchema }), adminController.getProducts);
router.post(
  '/products',
  validate({ body: v.adminCreateProductSchema }),
  adminController.createProduct
);
router.get('/products/:id', id, adminController.getProduct);
router.put(
  '/products/:id',
  validate({ params: v.idParamSchema, body: v.adminUpdateProductSchema }),
  adminController.updateProduct
);
router.delete('/products/:id', id, adminController.deleteProduct);
router.patch(
  '/products/:id/stock',
  validate({ params: v.idParamSchema, body: v.adminStockSchema }),
  adminController.updateStock
);
router.patch('/products/:id/toggle', id, adminController.toggleProduct);
router.post('/products/:id/images', id, uploadMultiple('images', 8), adminController.uploadImages);
router.put(
  '/products/:id/images/order',
  validate({ params: v.idParamSchema, body: v.adminImageOrderSchema }),
  adminController.reorderImages
);
router.delete('/products/:id/images/:imageId', id, adminController.deleteImage);

// Categories
router.get('/categories', adminController.getCategories);
router.post(
  '/categories',
  uploadSingle('image'),
  validate({ body: v.adminCreateCategorySchema }),
  adminController.createCategory
);
router.get('/categories/:id', id, adminController.getCategory);
router.put(
  '/categories/:id',
  id,
  uploadSingle('image'),
  validate({ body: v.adminUpdateCategorySchema }),
  adminController.updateCategory
);
router.delete('/categories/:id', id, adminController.deleteCategory);

// Orders
router.get('/orders', validate({ query: v.adminOrdersQuerySchema }), adminController.getOrders);
router.get('/orders/:id', id, adminController.getOrder);
router.patch(
  '/orders/:id/status',
  validate({ params: v.idParamSchema, body: v.adminUpdateOrderStatusSchema }),
  adminController.updateOrderStatus
);
router.patch(
  '/orders/:id/payment-status',
  validate({ params: v.idParamSchema, body: v.adminUpdatePaymentStatusSchema }),
  adminController.updatePaymentStatus
);
router.patch('/orders/:id/resolve', id, adminController.resolveAttention);
router.post(
  '/orders/:id/refund',
  validate({ params: v.idParamSchema, body: v.adminRefundSchema }),
  adminController.refundOrder
);

// Customers
router.get('/users', validate({ query: v.adminUsersQuerySchema }), adminController.getUsers);
router.get('/users/:id', id, adminController.getUser);
router.patch(
  '/users/:id/role',
  requireSuperAdmin,
  validate({ params: v.idParamSchema, body: v.adminUpdateRoleSchema }),
  adminController.updateUserRole
);
router.patch(
  '/users/:id/status',
  validate({ params: v.idParamSchema, body: v.adminUpdateStatusSchema }),
  adminController.updateUserStatus
);

// Coupons
router.get('/coupons', validate({ query: v.adminCouponsQuerySchema }), adminController.getCoupons);
router.get('/coupons/:id', id, adminController.getCoupon);
router.post(
  '/coupons',
  validate({ body: v.adminCreateCouponSchema }),
  adminController.createCoupon
);
router.put(
  '/coupons/:id',
  validate({ params: v.idParamSchema, body: v.adminUpdateCouponSchema }),
  adminController.updateCoupon
);
router.delete('/coupons/:id', id, adminController.deleteCoupon);

// Reviews
router.get('/reviews', validate({ query: v.adminPageQuerySchema }), adminController.getReviews);
router.patch('/reviews/:id/approve', id, adminController.toggleReviewApproval);
router.delete('/reviews/:id', id, adminController.deleteReview);

// Payments
router.get('/payments', validate({ query: v.adminPageQuerySchema }), adminController.getPayments);

// Enquiries (quote requests)
router.get('/enquiries', validate({ query: v.adminEnquiriesQuerySchema }), adminController.getEnquiries);
router.get('/enquiries/:id', id, adminController.getEnquiry);
router.patch(
  '/enquiries/:id',
  validate({ params: v.idParamSchema, body: adminUpdateEnquirySchema }),
  adminController.updateEnquiry
);
router.delete('/enquiries/:id', id, adminController.deleteEnquiry);

// Homepage banners
router.get('/banners', adminController.getBanners);
router.post('/banners', validate({ body: v.adminCreateBannerSchema }), adminController.createBanner);
router.put(
  '/banners/:id',
  validate({ params: v.idParamSchema, body: v.adminUpdateBannerSchema }),
  adminController.updateBanner
);
router.delete('/banners/:id', id, adminController.deleteBanner);

// Store settings: any admin may read, only a super admin may change
router.get('/settings', adminController.getSettings);
router.put(
  '/settings',
  requireSuperAdmin,
  validate({ body: updateSettingsSchema }),
  adminController.updateSettings
);

// Activity log
router.get('/activity', validate({ query: v.adminPageQuerySchema }), adminController.getActivity);

module.exports = router;
