const adminService = require('./admin.service');
const productService = require('../products/product.service');
const categoryService = require('../categories/category.service');
const couponService = require('../coupons/coupon.service');
const reviewService = require('../reviews/review.service');
const paymentService = require('../payments/payment.service');
const orderService = require('../orders/order.service');
const enquiryService = require('../enquiries/enquiry.service');
const bannerService = require('../banners/banner.service');
const settingsService = require('../settings/settings.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

// ─── Dashboard ───────────────────────────────────────────
const getDashboard = asyncHandler(async (_req, res) => {
  const data = await adminService.getDashboard();
  return ApiResponse(res, 200, 'Dashboard data fetched', data);
});

// ─── Products ────────────────────────────────────────────
const getProducts = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings();
  const { products, meta } = await productService.listProducts(
    { ...req.query, lowStockThreshold: settings.lowStockThreshold },
    true
  );
  return ApiResponse(res, 200, 'Products fetched', { products }, meta);
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  return ApiResponse(res, 201, 'Product created', { product });
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  return ApiResponse(res, 200, 'Product fetched', { product });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  return ApiResponse(res, 200, 'Product updated', { product });
});

const deleteProduct = asyncHandler(async (req, res) => {
  const { archived } = await productService.deleteProduct(req.params.id);
  return ApiResponse(
    res,
    200,
    archived ? 'Product has orders, so it was archived (hidden from the store) instead of deleted' : 'Product deleted',
    { archived }
  );
});

const updateStock = asyncHandler(async (req, res) => {
  const product = await productService.updateStock(req.params.id, req.body.stock);
  return ApiResponse(res, 200, 'Stock updated', { product });
});

const toggleProduct = asyncHandler(async (req, res) => {
  const product = await productService.toggleProduct(req.params.id);
  return ApiResponse(res, 200, `Product ${product.isActive ? 'activated' : 'deactivated'}`, { product });
});

const uploadImages = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw ApiError.badRequest('No images uploaded');
  }
  const product = await productService.uploadImages(req.params.id, req.files);
  return ApiResponse(res, 200, 'Images uploaded', { product });
});

const deleteImage = asyncHandler(async (req, res) => {
  const product = await productService.deleteImage(req.params.id, req.params.imageId);
  return ApiResponse(res, 200, 'Image deleted', { product });
});

const reorderImages = asyncHandler(async (req, res) => {
  const product = await productService.reorderImages(req.params.id, req.body.order);
  return ApiResponse(res, 200, 'Image order saved', { product });
});

// ─── Categories ──────────────────────────────────────────
const getCategories = asyncHandler(async (_req, res) => {
  const categories = await categoryService.getAllCategories();
  return ApiResponse(res, 200, 'Categories fetched', { categories });
});

const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body, req.file);
  return ApiResponse(res, 201, 'Category created', { category });
});

const getCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);
  return ApiResponse(res, 200, 'Category fetched', { category });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body, req.file);
  return ApiResponse(res, 200, 'Category updated', { category });
});

const deleteCategory = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(req.params.id);
  return ApiResponse(res, 200, 'Category deleted');
});

// ─── Orders ──────────────────────────────────────────────
const getOrders = asyncHandler(async (req, res) => {
  const { orders, meta } = await adminService.listOrders(req.query);
  return ApiResponse(res, 200, 'Orders fetched', { orders }, meta);
});

const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id, req.user._id, true);
  return ApiResponse(res, 200, 'Order fetched', { order, allowedStatuses: adminService.VALID_TRANSITIONS[order.orderStatus] || [] });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await adminService.updateOrderStatus(req.params.id, req.body, req.user._id);
  return ApiResponse(res, 200, 'Order status updated', { order });
});

const updatePaymentStatus = asyncHandler(async (req, res) => {
  const order = await adminService.updatePaymentStatus(
    req.params.id,
    req.body.paymentStatus,
    req.user._id
  );
  return ApiResponse(res, 200, 'Payment status updated', { order });
});

const resolveAttention = asyncHandler(async (req, res) => {
  const order = await adminService.resolveAttention(req.params.id, req.user._id);
  return ApiResponse(res, 200, 'Order marked as resolved', { order });
});

const refundOrder = asyncHandler(async (req, res) => {
  const result = await paymentService.processRefund(
    req.params.id,
    req.body.amount,
    req.user._id
  );
  return ApiResponse(res, 200, 'Refund initiated', result);
});

// ─── Users ───────────────────────────────────────────────
const getUsers = asyncHandler(async (req, res) => {
  const { users, meta } = await adminService.listUsers(req.query);
  return ApiResponse(res, 200, 'Users fetched', { users }, meta);
});

const getUser = asyncHandler(async (req, res) => {
  const data = await adminService.getUserById(req.params.id);
  return ApiResponse(res, 200, 'User fetched', data);
});

const updateUserRole = asyncHandler(async (req, res) => {
  const user = await adminService.updateUserRole(req.params.id, req.body.role, req.user);
  return ApiResponse(res, 200, 'User role updated', { user });
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const user = await adminService.updateUserStatus(req.params.id, req.body.isActive, req.user);
  return ApiResponse(res, 200, `User ${user.isActive ? 'activated' : 'deactivated'}`, { user });
});

// ─── Coupons ─────────────────────────────────────────────
const getCoupons = asyncHandler(async (req, res) => {
  const { coupons, meta } = await couponService.listCoupons(req.query);
  return ApiResponse(res, 200, 'Coupons fetched', { coupons }, meta);
});

const getCoupon = asyncHandler(async (req, res) => {
  const coupon = await couponService.getCouponById(req.params.id);
  return ApiResponse(res, 200, 'Coupon fetched', { coupon });
});

const createCoupon = asyncHandler(async (req, res) => {
  const coupon = await couponService.createCoupon(req.body);
  return ApiResponse(res, 201, 'Coupon created', { coupon });
});

const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await couponService.updateCoupon(req.params.id, req.body);
  return ApiResponse(res, 200, 'Coupon updated', { coupon });
});

const deleteCoupon = asyncHandler(async (req, res) => {
  await couponService.deleteCoupon(req.params.id);
  return ApiResponse(res, 200, 'Coupon deleted');
});

// ─── Reviews ─────────────────────────────────────────────
const getReviews = asyncHandler(async (req, res) => {
  const { reviews, meta } = await reviewService.listAllReviews(req.query);
  return ApiResponse(res, 200, 'Reviews fetched', { reviews }, meta);
});

const toggleReviewApproval = asyncHandler(async (req, res) => {
  const review = await reviewService.toggleApproval(req.params.id);
  return ApiResponse(res, 200, `Review ${review.isApproved ? 'approved' : 'hidden'}`, { review });
});

const deleteReview = asyncHandler(async (req, res) => {
  await reviewService.deleteReview(req.params.id, null, true);
  return ApiResponse(res, 200, 'Review deleted');
});

// ─── Payments ────────────────────────────────────────────
const getPayments = asyncHandler(async (req, res) => {
  const { payments, meta } = await adminService.listPayments(req.query);
  return ApiResponse(res, 200, 'Payments fetched', { payments }, meta);
});

// ─── Enquiries ───────────────────────────────────────────
const getEnquiries = asyncHandler(async (req, res) => {
  const { enquiries, meta } = await enquiryService.listEnquiries(req.query);
  return ApiResponse(res, 200, 'Enquiries fetched', { enquiries }, meta);
});

const getEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.getEnquiryById(req.params.id);
  return ApiResponse(res, 200, 'Enquiry fetched', { enquiry });
});

const updateEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.updateEnquiry(req.params.id, req.body);
  return ApiResponse(res, 200, 'Enquiry updated', { enquiry });
});

const deleteEnquiry = asyncHandler(async (req, res) => {
  await enquiryService.deleteEnquiry(req.params.id);
  return ApiResponse(res, 200, 'Enquiry deleted');
});

// ─── Banners ─────────────────────────────────────────────
const getBanners = asyncHandler(async (_req, res) => {
  const banners = await bannerService.listBanners();
  return ApiResponse(res, 200, 'Banners fetched', { banners });
});

const createBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.createBanner(req.body);
  return ApiResponse(res, 201, 'Banner created', { banner });
});

const updateBanner = asyncHandler(async (req, res) => {
  const banner = await bannerService.updateBanner(req.params.id, req.body);
  return ApiResponse(res, 200, 'Banner updated', { banner });
});

const deleteBanner = asyncHandler(async (req, res) => {
  await bannerService.deleteBanner(req.params.id);
  return ApiResponse(res, 200, 'Banner deleted');
});

// ─── Settings ────────────────────────────────────────────
const getSettings = asyncHandler(async (_req, res) => {
  const settings = await settingsService.getAdminSettings();
  return ApiResponse(res, 200, 'Settings fetched', { settings });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.body);
  return ApiResponse(res, 200, 'Settings saved', { settings });
});

// ─── Activity ────────────────────────────────────────────
const getActivity = asyncHandler(async (req, res) => {
  const { activity, meta } = await adminService.listActivity(req.query);
  return ApiResponse(res, 200, 'Activity fetched', { activity }, meta);
});

module.exports = {
  getDashboard,
  getProducts, createProduct, getProduct, updateProduct, deleteProduct,
  updateStock, toggleProduct, uploadImages, deleteImage, reorderImages,
  getCategories, createCategory, getCategory, updateCategory, deleteCategory,
  getOrders, getOrder, updateOrderStatus, updatePaymentStatus, resolveAttention, refundOrder,
  getUsers, getUser, updateUserRole, updateUserStatus,
  getCoupons, getCoupon, createCoupon, updateCoupon, deleteCoupon,
  getReviews, toggleReviewApproval, deleteReview,
  getPayments,
  getEnquiries, getEnquiry, updateEnquiry, deleteEnquiry,
  getBanners, createBanner, updateBanner, deleteBanner,
  getSettings, updateSettings,
  getActivity,
};
