const mongoose = require('mongoose');
const { Order, Product, Cart, Address, Payment, User } = require('../../models');
const config = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const { generateOrderNumber } = require('../../utils/generateToken');
const razorpayService = require('../../integrations/razorpay/razorpay.service');
const couponService = require('../coupons/coupon.service');
const settingsService = require('../settings/settings.service');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { sendOrderConfirmation, sendAdminAlert } = require('../../utils/email');

const MAX_PER_ITEM = 10;
const CANCELLABLE = ['placed', 'confirmed'];

/**
 * Resolve shipping address from addressId or inline object.
 * @param {string} userId
 * @param {string} [addressId]
 * @param {object} [shippingAddress]
 * @returns {Promise<object>}
 */
async function resolveAddress(userId, addressId, shippingAddress) {
  if (addressId) {
    if (!mongoose.isValidObjectId(addressId)) {
      throw ApiError.badRequest('Invalid address ID');
    }
    const addr = await Address.findOne({ _id: addressId, user: userId }).lean();
    if (!addr) {
      throw ApiError.notFound('Address not found');
    }
    return {
      fullName: addr.fullName,
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2 || '',
      landmark: addr.landmark || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
    };
  }

  if (shippingAddress) {
    return shippingAddress;
  }

  throw ApiError.badRequest('Shipping address is required');
}

/**
 * Resolve items: from body (buy-now) or from the server-side cart.
 * @param {string} userId
 * @param {Array} [bodyItems]
 * @returns {Promise<Array<{productId: string, quantity: number}>>}
 */
async function resolveItems(userId, bodyItems) {
  if (bodyItems && bodyItems.length > 0) {
    return bodyItems;
  }

  // Load from cart. Lines whose product was removed from the catalogue are
  // dropped here. The cart screen already hides them, but leaving them in
  // made checkout fail with "Product not found" before payment could start.
  const cart = await Cart.findOne({ user: userId });
  if (!cart || cart.items.length === 0) {
    throw ApiError.badRequest('Cart is empty');
  }

  const ids = cart.items.map((item) => item.product);
  const existing = await Product.find({ _id: { $in: ids } }).select('_id');
  const found = new Set(existing.map((p) => p._id.toString()));
  const kept = cart.items.filter((item) => found.has(item.product.toString()));
  if (kept.length !== cart.items.length) {
    cart.items = kept;
    await cart.save();
  }
  if (kept.length === 0) {
    throw ApiError.badRequest('Cart is empty');
  }

  return kept.map((item) => ({
    productId: item.product.toString(),
    quantity: item.quantity,
  }));
}

/**
 * Price a set of items on the server: current prices, stock checks, coupon,
 * GST and delivery. Shared by the checkout quote and by order creation so
 * the customer is always shown exactly what will be charged.
 *
 * @param {string} userId
 * @param {Array<{productId: string, quantity: number}>} rawItems
 * @param {string} [couponCode]
 * @returns {Promise<object>}
 */
async function priceItems(userId, rawItems, couponCode) {
  const settings = await settingsService.getSettings();

  // Merge duplicate lines so the stock check sees the full quantity
  const quantities = new Map();
  const itemErrors = [];
  for (const raw of rawItems) {
    if (!mongoose.isValidObjectId(raw.productId)) {
      itemErrors.push({ productId: raw.productId, message: 'Invalid product ID' });
      continue;
    }
    quantities.set(raw.productId, (quantities.get(raw.productId) || 0) + raw.quantity);
  }

  const products = await Product.find({ _id: { $in: [...quantities.keys()] } });
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const orderItems = [];
  const lines = [];

  for (const [productId, quantity] of quantities) {
    const product = byId.get(productId);
    if (!product) {
      itemErrors.push({ productId, message: 'Product not found' });
      continue;
    }
    if (!product.isActive) {
      itemErrors.push({ productId, message: `"${product.name}" is no longer available` });
      continue;
    }
    if (product.stock === 0) {
      itemErrors.push({ productId, message: `"${product.name}" is out of stock` });
      continue;
    }
    if (quantity > MAX_PER_ITEM) {
      itemErrors.push({
        productId,
        message: `You can order up to ${MAX_PER_ITEM} of "${product.name}" online`,
      });
      continue;
    }
    if (quantity > product.stock) {
      itemErrors.push({
        productId,
        message: `"${product.name}" only has ${product.stock} in stock`,
      });
      continue;
    }

    // Snapshot: use server-side prices, never client-provided
    orderItems.push({
      product: product._id,
      name: product.name,
      model: product.model || '',
      slug: product.slug,
      image: product.images.length > 0 ? product.images[0].url : '',
      sku: product.sku || '',
      price: product.price,
      mrp: product.mrp,
      quantity,
    });
    lines.push({ price: product.price, quantity, category: product.category });
  }

  const itemsTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Coupon
  let discount = 0;
  let coupon = null;
  let couponError = '';
  if (couponCode && orderItems.length > 0) {
    try {
      ({ discount, coupon } = await couponService.evaluateCoupon(couponCode, lines, userId));
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      couponError = err.message;
    }
  }

  const taxable = itemsTotal - discount;
  const taxAmount = settings.gstInclusive ? 0 : Math.round((taxable * settings.gstPercent) / 100);
  const deliveryCharge =
    orderItems.length === 0 || taxable >= settings.freeDeliveryAbove ? 0 : settings.deliveryCharge;
  const totalAmount = taxable + taxAmount + deliveryCharge;

  return {
    orderItems,
    categories: lines.map((l) => l.category),
    itemErrors,
    itemsTotal,
    discount,
    coupon,
    couponError,
    taxAmount,
    gstPercent: settings.gstPercent,
    gstInclusive: settings.gstInclusive,
    deliveryCharge,
    freeDeliveryAbove: settings.freeDeliveryAbove,
    totalAmount,
    settings,
  };
}

/**
 * Quote: what the order would cost right now, without creating it.
 */
async function quote(userId, body) {
  const rawItems = await resolveItems(userId, body.items);
  const priced = await priceItems(userId, rawItems, body.couponCode);

  return {
    items: priced.orderItems,
    itemErrors: priced.itemErrors,
    itemsTotal: priced.itemsTotal,
    discount: priced.discount,
    couponCode: priced.coupon ? priced.coupon.code : '',
    couponError: priced.couponError,
    taxAmount: priced.taxAmount,
    gstPercent: priced.gstPercent,
    gstInclusive: priced.gstInclusive,
    deliveryCharge: priced.deliveryCharge,
    freeDeliveryAbove: priced.freeDeliveryAbove,
    totalAmount: priced.totalAmount,
    paymentMethods: {
      cod: priced.settings.enableCod,
      razorpay: config.razorpay.enabled,
    },
  };
}

/**
 * Take the order's items out of stock, all or nothing.
 * @returns {Promise<string|null>} name of the item that ran short, or null
 */
async function deductStock(order) {
  const done = [];
  for (const item of order.items) {
    const result = await Product.findOneAndUpdate(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity, soldCount: item.quantity } },
      { new: true }
    );
    if (!result) {
      for (const prev of done) {
        await Product.findByIdAndUpdate(prev.product, {
          $inc: { stock: prev.quantity, soldCount: -prev.quantity },
        });
      }
      return item.name;
    }
    done.push(item);
  }
  order.stockDeducted = true;
  return null;
}

/**
 * Put items back in stock.
 */
async function returnItems(items) {
  for (const item of items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity, soldCount: -item.quantity },
    });
  }
  // soldCount can never go below zero
  await Product.updateMany(
    { _id: { $in: items.map((i) => i.product) }, soldCount: { $lt: 0 } },
    { soldCount: 0 }
  );
}

/**
 * Put an order's items back in stock (cancellation / refund), exactly once.
 * The "stock was deducted" flag is claimed atomically in the database, so two
 * requests arriving together cannot both restore the stock.
 */
async function restoreStock(order) {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, stockDeducted: true },
    { $set: { stockDeducted: false } }
  );
  order.stockDeducted = false;
  if (!claimed) return false;
  await returnItems(claimed.items);
  return true;
}

/**
 * Remove the ordered products from the customer's cart.
 */
async function removeOrderedFromCart(order) {
  await Cart.updateOne(
    { user: order.user },
    { $pull: { items: { product: { $in: order.items.map((i) => i.product) } } } }
  );
}

/**
 * Checkout: create an order with server-side price computation.
 *
 * @param {string} userId
 * @param {object} body - Checkout request body
 * @returns {Promise<object>}
 */
async function checkout(userId, body) {
  const { addressId, shippingAddress: inlineAddress, couponCode, paymentMethod, items: bodyItems, notes } = body;

  // 1. Resolve address
  const shippingAddress = await resolveAddress(userId, addressId, inlineAddress);

  // 2. Resolve items
  const rawItems = await resolveItems(userId, bodyItems);

  // 3. Price everything on the server
  const priced = await priceItems(userId, rawItems, couponCode);

  // 4. Check the payment method is available
  if (paymentMethod === 'cod' && !priced.settings.enableCod) {
    throw ApiError.badRequest('Cash on Delivery is not available');
  }
  if (paymentMethod === 'razorpay' && !config.razorpay.enabled) {
    throw ApiError.badRequest('Online payment is not available right now. Please choose another payment method.');
  }

  if (priced.itemErrors.length > 0) {
    throw ApiError.badRequest('Some items have issues', priced.itemErrors);
  }
  if (priced.orderItems.length === 0) {
    throw ApiError.badRequest('No valid items in the order');
  }
  if (priced.couponError) {
    throw ApiError.badRequest(priced.couponError);
  }

  const { orderItems, itemsTotal, discount, coupon, taxAmount, deliveryCharge, totalAmount } = priced;

  // 5. Create the order (retry on the unlikely order-number collision)
  let order;
  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    try {
      order = await Order.create({
        orderNumber: generateOrderNumber(),
        user: userId,
        items: orderItems,
        shippingAddress,
        itemsTotal,
        discount,
        couponCode: coupon ? coupon.code : '',
        deliveryCharge,
        taxAmount,
        gstPercent: priced.gstPercent,
        gstInclusive: priced.gstInclusive,
        totalAmount,
        paymentMethod,
        paymentStatus: 'pending',
        orderStatus: 'placed',
        notes: notes || '',
        statusHistory: [{ status: 'placed', note: 'Order placed', at: new Date(), by: userId }],
      });
    } catch (err) {
      if (!(err.code === 11000 && err.keyPattern && err.keyPattern.orderNumber)) throw err;
    }
  }
  if (!order) throw ApiError.internal('Could not create the order. Please try again.');

  // 6. Handle payment method
  if (paymentMethod === 'razorpay') {
    // Stock is taken when the payment is confirmed (see finalizePaidOrder)
    const amountInPaise = Math.round(totalAmount * 100);
    let rzpOrder;
    try {
      rzpOrder = await razorpayService.createOrder({
        amount: amountInPaise,
        receipt: order.orderNumber,
        notes: { orderId: order._id.toString(), userId: userId.toString() },
      });
    } catch (err) {
      // Do not leave an unpayable order behind
      await Order.findByIdAndDelete(order._id);
      const errMsg = err?.error?.description || err?.message || JSON.stringify(err);
      logger.error(`Razorpay order creation failed for ${order.orderNumber}: ${errMsg}`);
      throw new ApiError(502, 'Could not start the online payment. Please try again or choose another payment method.');
    }

    order.razorpayOrderId = rzpOrder.id;
    await order.save();

    await Payment.create({
      order: order._id,
      user: userId,
      razorpayOrderId: rzpOrder.id,
      amount: totalAmount,
      currency: 'INR',
      status: 'created',
    });

    return {
      order,
      razorpay: {
        orderId: rzpOrder.id,
        amount: amountInPaise,
        currency: 'INR',
        keyId: config.razorpay.keyId,
      },
    };
  }

  // COD flow: take the stock now
  const shortItem = await deductStock(order);
  if (shortItem) {
    await Order.findByIdAndDelete(order._id);
    throw ApiError.badRequest(`"${shortItem}" stock changed. Please try again.`);
  }

  if (coupon) {
    await couponService.recordCouponUse(coupon.code, userId);
    order.couponCounted = true;
  }
  await order.save();

  await removeOrderedFromCart(order);

  // Confirmation email (non-blocking)
  User.findById(userId)
    .then((user) => {
      if (user) sendOrderConfirmation(order, user.email).catch(() => {});
    })
    .catch(() => {});

  return { order };
}

/**
 * Get user's orders (paginated).
 * @param {string} userId
 * @param {object} query
 * @returns {Promise<{orders: Array, meta: object}>}
 */
async function getMyOrders(userId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { user: userId };

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);

  return { orders, meta: buildMeta(total, page, limit) };
}

/**
 * Get single order by ID (owner or admin).
 * @param {string} orderId
 * @param {string} userId
 * @param {boolean} isAdmin
 * @returns {Promise<object>}
 */
async function getOrderById(orderId, userId, isAdmin = false) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw ApiError.badRequest('Invalid order ID');
  }

  const order = await Order.findById(orderId).populate('user', 'name email phone company gstin');
  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  if (!isAdmin && (!order.user || order.user._id.toString() !== userId.toString())) {
    // 404, not 403: do not reveal that someone else's order exists
    throw ApiError.notFound('Order not found');
  }

  return order;
}

/**
 * Cancel an order: shared by the customer and the admin.
 * Every step is claimed atomically in the database, so a double click, a
 * retry or a payment arriving at the same moment cannot cancel twice,
 * restore stock twice or lose a refund.
 *
 * @param {object} order - Order document (only its _id is trusted)
 * @param {object} options - { reason, by, note }
 * @returns {Promise<object>} the cancelled order, freshly read
 */
async function applyCancellation(order, { reason = '', by, note }) {
  const cancelled = await Order.findOneAndUpdate(
    { _id: order._id, orderStatus: { $in: CANCELLABLE } },
    {
      $set: { orderStatus: 'cancelled', cancelledAt: new Date(), cancelReason: reason },
      $push: { statusHistory: { status: 'cancelled', note, at: new Date(), by } },
    },
    { new: true }
  );
  if (!cancelled) {
    throw ApiError.badRequest('This order can no longer be cancelled');
  }

  await restoreStock(cancelled);

  const hadCoupon = await Order.findOneAndUpdate(
    { _id: cancelled._id, couponCounted: true },
    { $set: { couponCounted: false } }
  );
  if (hadCoupon) {
    await couponService.releaseCouponUse(cancelled.couponCode, cancelled.user);
  }

  // Money already received (online, or cash recorded by an admin) has to go back
  const owesRefund = await Order.findOneAndUpdate(
    { _id: cancelled._id, paymentStatus: 'paid' },
    { $set: { paymentStatus: 'refund_pending' } }
  );
  if (owesRefund) {
    sendAdminAlert(
      `Refund Required — ${cancelled.orderNumber}`,
      `Order ${cancelled.orderNumber} was cancelled after payment. Amount: ₹${cancelled.totalAmount}. Please process the refund.`
    ).catch(() => {}); // non-blocking
  }

  return Order.findById(cancelled._id).populate('user', 'name email phone company gstin');
}

/**
 * Cancel an order (user).
 * Allowed only while placed or confirmed.
 * @param {string} orderId
 * @param {string} userId
 * @param {string} reason
 * @returns {Promise<object>}
 */
async function cancelOrder(orderId, userId, reason = '') {
  const order = await getOrderById(orderId, userId);

  if (!CANCELLABLE.includes(order.orderStatus)) {
    throw ApiError.badRequest(
      `Cannot cancel an order that is already ${order.orderStatus}`
    );
  }

  return applyCancellation(order, {
    reason,
    by: userId,
    note: reason || 'Cancelled by customer',
  });
}

/**
 * What a customer may see of their order: no internal notes or bookkeeping
 * flags, and a status history without staff notes or staff ids.
 */
function toCustomerOrder(order) {
  const o = typeof order.toJSON === 'function' ? order.toJSON() : { ...order };
  delete o.internalNotes;
  delete o.needsAttention;
  delete o.stockDeducted;
  delete o.couponCounted;
  o.statusHistory = (o.statusHistory || []).map((h) => ({ status: h.status, at: h.at }));
  if (o.user && typeof o.user === 'object' && o.user._id) o.user = o.user._id;
  return o;
}

/**
 * Get invoice-ready JSON for an order.
 * @param {string} orderId
 * @param {string} userId
 * @param {boolean} isAdmin
 * @returns {Promise<object>}
 */
async function getInvoice(orderId, userId, isAdmin = false) {
  const order = await getOrderById(orderId, userId, isAdmin);
  const settings = await settingsService.getSettings();

  return {
    seller: {
      name: settings.legalName || settings.storeName,
      address: settings.address,
      gstin: settings.gstin,
      gstNote: order.gstInclusive
        ? 'All prices are inclusive of GST'
        : `GST charged at ${order.gstPercent}%`,
    },
    order: {
      orderNumber: order.orderNumber,
      date: order.createdAt,
      status: order.orderStatus,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    },
    customer: {
      name: order.shippingAddress.fullName,
      phone: order.shippingAddress.phone,
      company: order.user ? order.user.company : '',
      gstin: order.user ? order.user.gstin : '',
      address: `${order.shippingAddress.line1}${order.shippingAddress.line2 ? ', ' + order.shippingAddress.line2 : ''}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`,
    },
    items: order.items.map((item) => ({
      name: item.name,
      model: item.model,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
      mrp: item.mrp,
      total: item.price * item.quantity,
    })),
    summary: {
      itemsTotal: order.itemsTotal,
      discount: order.discount,
      couponCode: order.couponCode,
      taxAmount: order.taxAmount,
      deliveryCharge: order.deliveryCharge,
      totalAmount: order.totalAmount,
    },
  };
}

module.exports = {
  checkout,
  quote,
  priceItems,
  resolveItems,
  getMyOrders,
  getOrderById,
  cancelOrder,
  applyCancellation,
  toCustomerOrder,
  deductStock,
  restoreStock,
  returnItems,
  removeOrderedFromCart,
  getInvoice,
};
