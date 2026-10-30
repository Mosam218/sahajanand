const orderService = require('./order.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { isStaff } = require('../../utils/roles');

const checkout = asyncHandler(async (req, res) => {
  const result = await orderService.checkout(req.user._id, req.body);
  return ApiResponse(res, 201, 'Order placed successfully', {
    ...result,
    order: orderService.toCustomerOrder(result.order),
  });
});

const quote = asyncHandler(async (req, res) => {
  const result = await orderService.quote(req.user._id, req.body);
  return ApiResponse(res, 200, 'Order quote calculated', { quote: result });
});

const getMyOrders = asyncHandler(async (req, res) => {
  const { orders, meta } = await orderService.getMyOrders(req.user._id, req.query);
  return ApiResponse(res, 200, 'Orders fetched', { orders: orders.map(orderService.toCustomerOrder) }, meta);
});

const getOrderById = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(
    req.params.id,
    req.user._id,
    isStaff(req.user)
  );
  // Staff manage orders through /api/admin; this endpoint is the customer view
  return ApiResponse(res, 200, 'Order fetched', { order: orderService.toCustomerOrder(order) });
});

const cancelOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrder(
    req.params.id,
    req.user._id,
    req.body.reason
  );
  return ApiResponse(res, 200, 'Order cancelled', { order: orderService.toCustomerOrder(order) });
});

const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await orderService.getInvoice(
    req.params.id,
    req.user._id,
    isStaff(req.user)
  );
  return ApiResponse(res, 200, 'Invoice fetched', { invoice });
});

module.exports = { checkout, quote, getMyOrders, getOrderById, cancelOrder, getInvoice };
