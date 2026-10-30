const cartService = require('./cart.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');

const getCart = asyncHandler(async (req, res) => {
  const cart = await cartService.getCart(req.user._id);
  return ApiResponse(res, 200, 'Cart fetched', { cart });
});

const addItem = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;
  const cart = await cartService.addItem(req.user._id, productId, quantity || 1);
  return ApiResponse(res, 200, 'Item added to cart', { cart });
});

const updateItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const cart = await cartService.updateItem(req.user._id, req.params.productId, quantity);
  return ApiResponse(res, 200, 'Cart item updated', { cart });
});

const removeItem = asyncHandler(async (req, res) => {
  const cart = await cartService.removeItem(req.user._id, req.params.productId);
  return ApiResponse(res, 200, 'Item removed from cart', { cart });
});

const clearCart = asyncHandler(async (req, res) => {
  await cartService.clearCart(req.user._id);
  return ApiResponse(res, 200, 'Cart cleared');
});

const mergeCart = asyncHandler(async (req, res) => {
  const { items } = req.body;
  const cart = await cartService.mergeCart(req.user._id, items || []);
  return ApiResponse(res, 200, 'Cart merged', { cart });
});

module.exports = { getCart, addItem, updateItem, removeItem, clearCart, mergeCart };
