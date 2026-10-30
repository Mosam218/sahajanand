const mongoose = require('mongoose');
const { Order, Product, User, Payment, Enquiry, Address, AuditLog } = require('../../models');
const ApiError = require('../../utils/ApiError');
const escapeRegex = require('../../utils/escapeRegex');
const { ROLES, isStaff, isSuperAdmin } = require('../../utils/roles');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { sendOrderStatusUpdate } = require('../../utils/email');
const orderService = require('../orders/order.service');
const settingsService = require('../settings/settings.service');

// ─── Dashboard ───────────────────────────────────────────
/**
 * Get admin dashboard stats.
 */
async function getDashboard() {
  const settings = await settingsService.getSettings();
  const lowStockThreshold = settings.lowStockThreshold;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const dailyRevenue = (since) =>
    Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

  const [
    totalProducts,
    activeProducts,
    totalOrders,
    revenueResult,
    todayOrders,
    todayRevenueResult,
    lowStockProducts,
    lowStockCount,
    outOfStockCount,
    totalCustomers,
    newCustomers,
    topProducts,
    ordersByStatus,
    dailyRevenue7,
    dailyRevenue30,
    recentOrders,
    newEnquiries,
    needsAttention,
    refundsPending,
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ isActive: true }),
    Order.countDocuments(),
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    Order.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: todayStart } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    Product.find({ stock: { $gt: 0, $lte: lowStockThreshold }, isActive: true })
      .select('name model slug stock sku')
      .sort({ stock: 1 })
      .limit(10)
      .lean(),
    Product.countDocuments({ stock: { $gt: 0, $lte: lowStockThreshold }, isActive: true }),
    Product.countDocuments({ stock: 0, isActive: true }),
    User.countDocuments({ role: ROLES.USER }),
    User.countDocuments({ role: ROLES.USER, createdAt: { $gte: thirtyDaysAgo } }),
    Order.aggregate([
      { $match: { orderStatus: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          model: { $first: '$items.model' },
          totalSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
    ]),
    Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
    dailyRevenue(sevenDaysAgo),
    dailyRevenue(thirtyDaysAgo),
    Order.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .select('orderNumber totalAmount orderStatus paymentStatus paymentMethod createdAt user shippingAddress.fullName')
      .populate('user', 'name email')
      .lean(),
    Enquiry.countDocuments({ status: 'new' }),
    Order.countDocuments({ needsAttention: true, orderStatus: { $ne: 'cancelled' } }),
    Order.countDocuments({ paymentStatus: 'refund_pending' }),
  ]);

  const statusMap = { placed: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 };
  ordersByStatus.forEach((s) => { statusMap[s._id] = s.count; });

  return {
    totalProducts,
    activeProducts,
    totalOrders,
    totalRevenue: revenueResult[0]?.total || 0,
    pendingOrders: statusMap.placed + statusMap.confirmed,
    completedOrders: statusMap.delivered,
    cancelledOrders: statusMap.cancelled,
    todayOrders,
    todayRevenue: todayRevenueResult[0]?.total || 0,
    lowStockThreshold,
    lowStockProducts,
    lowStockCount,
    outOfStockCount,
    totalCustomers,
    newCustomers,
    topSellingProducts: topProducts,
    ordersByStatus: statusMap,
    revenueDaily7: dailyRevenue7,
    revenueDaily30: dailyRevenue30,
    recentOrders,
    newEnquiries,
    needsAttention,
    refundsPending,
  };
}

// ─── Orders ──────────────────────────────────────────────
/**
 * Admin: list orders with filters.
 */
async function listOrders(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.orderStatus = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;
  if (query.needsAttention !== undefined) filter.needsAttention = query.needsAttention;

  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }

  if (query.search) {
    const searchRegex = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [
      { orderNumber: searchRegex },
      { 'shippingAddress.fullName': searchRegex },
      { 'shippingAddress.phone': searchRegex },
    ];

    // Also search by customer name/email via user lookup
    const matchingUsers = await User.find({
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ],
    }).select('_id').limit(200).lean();

    if (matchingUsers.length > 0) {
      filter.$or.push({ user: { $in: matchingUsers.map((u) => u._id) } });
    }
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email phone')
      .lean(),
    Order.countDocuments(filter),
  ]);

  return { orders, meta: buildMeta(total, page, limit) };
}

/**
 * Admin: update order status with transition validation.
 */
const COD_PAYMENT_MOVES = {
  paid: ['pending'],
  pending: ['paid'],
  refunded: ['refund_pending'],
};

const VALID_TRANSITIONS = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

async function updateOrderStatus(orderId, data, adminId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const order = await Order.findById(orderId).populate('user', 'name email');
  if (!order) throw ApiError.notFound('Order not found');

  const { status, trackingId, courierName, note } = data;
  const allowed = VALID_TRANSITIONS[order.orderStatus] || [];

  if (!allowed.includes(status)) {
    throw ApiError.badRequest(
      `Cannot transition from '${order.orderStatus}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}`
    );
  }

  // An online order must be paid before it is confirmed or shipped
  if (
    order.paymentMethod === 'razorpay' &&
    order.paymentStatus !== 'paid' &&
    ['confirmed', 'shipped', 'delivered'].includes(status)
  ) {
    throw ApiError.badRequest('This online order has not been paid yet, so it cannot move forward. It can only be cancelled.');
  }

  let updated;
  if (status === 'cancelled') {
    updated = await orderService.applyCancellation(order, {
      reason: note || 'Cancelled by admin',
      by: adminId,
      note: note || 'Cancelled by admin',
    });
  } else {
    const set = { orderStatus: status };
    if (status === 'shipped') {
      if (trackingId) set.trackingId = trackingId;
      if (courierName) set.courierName = courierName;
    }
    if (status === 'delivered') {
      set.deliveredAt = new Date();
    }

    // Only move forward from the status we just checked: if someone else
    // changed the order in the meantime, nothing is written.
    updated = await Order.findOneAndUpdate(
      { _id: order._id, orderStatus: order.orderStatus },
      {
        $set: set,
        $push: { statusHistory: { status, note: note || `Status updated to ${status}`, at: new Date(), by: adminId } },
      },
      { new: true }
    ).populate('user', 'name email');

    if (!updated) {
      throw ApiError.conflict('This order was changed by someone else. Reload it and try again.');
    }
  }

  // Email customer (non-blocking)
  if (updated.user && updated.user.email) {
    sendOrderStatusUpdate(updated, updated.user.email, status).catch(() => {});
  }

  return updated;
}

/**
 * Admin: record that a cash-on-delivery order was paid (or undo that).
 * Online payments are only ever marked paid by Razorpay verification.
 */
async function updatePaymentStatus(orderId, paymentStatus, adminId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  if (order.paymentMethod !== 'cod') {
    throw ApiError.badRequest('Payment status can only be changed by hand for cash on delivery orders');
  }
  if (order.paymentStatus === paymentStatus) return order;

  // The only moves that make sense for cash:
  //   pending → paid          cash collected
  //   paid → pending          correcting a mistake
  //   refund_pending → refunded   cash returned after a cancellation
  const from = COD_PAYMENT_MOVES[paymentStatus];
  if (!from || !from.includes(order.paymentStatus)) {
    throw ApiError.badRequest(`Payment status cannot be changed from '${order.paymentStatus}' to '${paymentStatus}'`);
  }
  if (order.orderStatus === 'cancelled' && paymentStatus !== 'refunded') {
    throw ApiError.badRequest('This order has been cancelled');
  }

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: order.paymentStatus, orderStatus: order.orderStatus },
    {
      $set: { paymentStatus },
      $push: {
        statusHistory: {
          status: `payment_${paymentStatus}`,
          note: `Payment marked as ${paymentStatus} by admin`,
          at: new Date(),
          by: adminId,
        },
      },
    },
    { new: true }
  );
  if (!updated) {
    throw ApiError.conflict('This order was changed by someone else. Reload it and try again.');
  }
  return updated;
}

/**
 * Admin: an order that needed attention has been dealt with.
 */
async function resolveAttention(orderId, adminId) {
  if (!mongoose.isValidObjectId(orderId)) throw ApiError.badRequest('Invalid order ID');
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  order.needsAttention = false;
  order.statusHistory.push({ status: order.orderStatus, note: 'Marked as resolved', at: new Date(), by: adminId });
  await order.save();
  return order;
}

// ─── Users ───────────────────────────────────────────────
// Never send the sign-in identifier to the browser
const USER_FIELDS = '-firebaseUid';

/**
 * Admin: list users with order totals.
 */
async function listUsers(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.search) {
    const searchRegex = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [
      { name: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
      { company: searchRegex },
    ];
  }
  if (query.role) filter.role = query.role;
  if (query.isActive !== undefined) filter.isActive = query.isActive;

  const [users, total] = await Promise.all([
    User.find(filter).select(USER_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  const stats = await Order.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) } } },
    {
      $group: {
        _id: '$user',
        orderCount: { $sum: 1 },
        totalSpent: { $sum: { $cond: [{ $eq: ['$orderStatus', 'cancelled'] }, 0, '$totalAmount'] } },
        lastOrderAt: { $max: '$createdAt' },
      },
    },
  ]);
  const byUser = new Map(stats.map((s) => [String(s._id), s]));

  return {
    users: users.map((u) => {
      const s = byUser.get(String(u._id));
      return { ...u, orderCount: s?.orderCount || 0, totalSpent: s?.totalSpent || 0, lastOrderAt: s?.lastOrderAt || null };
    }),
    meta: buildMeta(total, page, limit),
  };
}

/**
 * Admin: get user by ID with their orders, addresses and enquiries.
 */
async function getUserById(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw ApiError.badRequest('Invalid user ID');
  }

  const user = await User.findById(userId).select(USER_FIELDS).lean();
  if (!user) throw ApiError.notFound('User not found');

  const [orders, addresses, enquiries] = await Promise.all([
    Order.find({ user: userId }).sort({ createdAt: -1 }).limit(20).lean(),
    Address.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 }).lean(),
    Enquiry.find({ $or: [{ user: userId }, { email: user.email }] }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);

  return { user, orders, addresses, enquiries };
}

async function loadTarget(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw ApiError.badRequest('Invalid user ID');
  }
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/**
 * Super admin: change a user's role.
 */
async function updateUserRole(userId, role, admin) {
  if (userId.toString() === admin._id.toString()) {
    throw ApiError.badRequest('You cannot change your own role');
  }

  const user = await loadTarget(userId);

  // Never leave the store without a super admin
  if (user.role === ROLES.SUPER_ADMIN && role !== ROLES.SUPER_ADMIN) {
    const others = await User.countDocuments({ role: ROLES.SUPER_ADMIN, isActive: true, _id: { $ne: user._id } });
    if (others === 0) throw ApiError.badRequest('There must be at least one super admin');
  }

  user.role = role;
  await user.save();
  return user;
}

/**
 * Admin: activate/deactivate a customer. Only a super admin can do this to
 * another admin.
 */
async function updateUserStatus(userId, isActive, admin) {
  if (userId.toString() === admin._id.toString()) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  const user = await loadTarget(userId);

  if (isStaff(user) && !isSuperAdmin(admin)) {
    throw ApiError.forbidden('Only a super admin can change another admin account');
  }

  user.isActive = isActive;
  await user.save();
  return user;
}

// ─── Payments ────────────────────────────────────────────
/**
 * Admin: list payments.
 */
async function listPayments(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = query.status;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-razorpaySignature -rawResponse -webhookEvents')
      .populate('order', 'orderNumber totalAmount')
      .populate('user', 'name email')
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return { payments, meta: buildMeta(total, page, limit) };
}

// ─── Activity log ────────────────────────────────────────
async function listActivity(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ action: rx }, { userName: rx }];
  }

  const [activity, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return { activity, meta: buildMeta(total, page, limit) };
}

module.exports = {
  getDashboard,
  listOrders,
  updateOrderStatus,
  updatePaymentStatus,
  resolveAttention,
  listUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  listPayments,
  listActivity,
  VALID_TRANSITIONS,
};
