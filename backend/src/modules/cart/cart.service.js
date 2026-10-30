const { Cart, Product } = require('../../models');
const ApiError = require('../../utils/ApiError');
const mongoose = require('mongoose');

const MAX_PER_ITEM = 10;

/**
 * Get cart for a user, populated with current product data.
 * Adds computed fields: subtotal, outOfStock, quantityExceedsStock per item.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getCart(userId) {
  let cart = await Cart.findOne({ user: userId }).populate({
    path: 'items.product',
    select: 'name model slug price mrp stock images isActive discountPercent category',
  });

  if (!cart) {
    return { items: [], cartTotal: 0 };
  }

  const items = cart.items
    .filter((item) => item.product) // filter out deleted products
    .map((item) => {
      const p = item.product;
      const outOfStock = !p.isActive || p.stock === 0;
      const quantityExceedsStock = item.quantity > p.stock;
      const effectiveQty = outOfStock ? 0 : Math.min(item.quantity, p.stock);
      const subtotal = p.price * effectiveQty;

      return {
        product: p,
        quantity: item.quantity,
        subtotal,
        outOfStock,
        quantityExceedsStock,
      };
    });

  const cartTotal = items.reduce((sum, i) => sum + i.subtotal, 0);

  return { items, cartTotal };
}

/**
 * Add or increment a product in the cart.
 * @param {string} userId
 * @param {string} productId
 * @param {number} quantity
 * @returns {Promise<object>}
 */
async function addItem(userId, productId, quantity = 1) {
  if (!mongoose.isValidObjectId(productId)) {
    throw ApiError.badRequest('Invalid product ID');
  }

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw ApiError.notFound('Product not found or inactive');
  }

  if (product.stock === 0) {
    throw ApiError.badRequest('Product is out of stock');
  }

  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = new Cart({ user: userId, items: [] });
  }

  const existingIndex = cart.items.findIndex(
    (item) => item.product.toString() === productId
  );

  // Never let the cart hold more than is in stock, or more than 10 of one item
  const limit = Math.min(product.stock, MAX_PER_ITEM);
  const current = existingIndex >= 0 ? cart.items[existingIndex].quantity : 0;
  if (current >= limit) {
    throw ApiError.badRequest(
      product.stock < MAX_PER_ITEM
        ? `Only ${product.stock} of "${product.model || product.name}" in stock`
        : `You can order up to ${MAX_PER_ITEM} of one product online. Request a quote for larger quantities.`
    );
  }
  const newQty = Math.min(current + quantity, limit);

  if (existingIndex >= 0) {
    cart.items[existingIndex].quantity = newQty;
  } else {
    cart.items.push({ product: productId, quantity: newQty });
  }

  await cart.save();
  return getCart(userId);
}

/**
 * Update quantity of a product in the cart.
 * @param {string} userId
 * @param {string} productId
 * @param {number} quantity
 * @returns {Promise<object>}
 */
async function updateItem(userId, productId, quantity) {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    throw ApiError.notFound('Cart not found');
  }

  const item = cart.items.find((i) => i.product.toString() === productId);
  if (!item) {
    throw ApiError.notFound('Item not found in cart');
  }

  if (quantity < 1 || quantity > MAX_PER_ITEM) {
    throw ApiError.badRequest(`Quantity must be between 1 and ${MAX_PER_ITEM}`);
  }

  const product = await Product.findById(productId).select('stock name model');
  if (product && quantity > item.quantity && quantity > product.stock) {
    throw ApiError.badRequest(`Only ${product.stock} of "${product.model || product.name}" in stock`);
  }

  item.quantity = quantity;
  await cart.save();
  return getCart(userId);
}

/**
 * Remove a product from the cart.
 * @param {string} userId
 * @param {string} productId
 * @returns {Promise<object>}
 */
async function removeItem(userId, productId) {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    return getCart(userId);
  }

  cart.items = cart.items.filter((i) => i.product.toString() !== productId);
  await cart.save();
  return getCart(userId);
}

/**
 * Clear the entire cart.
 * @param {string} userId
 */
async function clearCart(userId) {
  await Cart.findOneAndUpdate({ user: userId }, { items: [] });
}

/**
 * Merge guest cart items into the user's server cart after login.
 * Caps quantity at stock and 10.
 *
 * @param {string} userId
 * @param {Array<{productId: string, quantity: number}>} guestItems
 * @returns {Promise<object>}
 */
async function mergeCart(userId, guestItems) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = new Cart({ user: userId, items: [] });
  }

  for (const guestItem of guestItems) {
    if (!mongoose.isValidObjectId(guestItem.productId)) continue;

    const product = await Product.findById(guestItem.productId);
    if (!product || !product.isActive) continue;

    const existingIndex = cart.items.findIndex(
      (i) => i.product.toString() === guestItem.productId
    );

    const limit = Math.min(product.stock, MAX_PER_ITEM);
    const maxQty = Math.min(guestItem.quantity || 1, limit);

    if (existingIndex >= 0) {
      // Keep the larger of the two carts rather than adding them up, so
      // signing in twice does not double the quantities.
      cart.items[existingIndex].quantity = Math.max(
        1,
        Math.min(Math.max(cart.items[existingIndex].quantity, maxQty), limit || 1)
      );
    } else if (maxQty > 0) {
      cart.items.push({ product: guestItem.productId, quantity: maxQty });
    }
  }

  await cart.save();
  return getCart(userId);
}

module.exports = { getCart, addItem, updateItem, removeItem, clearCart, mergeCart };
