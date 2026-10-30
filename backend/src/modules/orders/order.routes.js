const { Router } = require('express');
const orderController = require('./order.controller');
const { verifyToken } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');
const { checkoutSchema, quoteSchema, cancelOrderSchema } = require('./order.validation');
const { checkoutLimiter } = require('../../middleware/rateLimit.middleware');

const router = Router();

router.use(verifyToken);

router.post('/quote', validate({ body: quoteSchema }), orderController.quote);
router.post(
  '/checkout',
  checkoutLimiter,
  validate({ body: checkoutSchema }),
  orderController.checkout
);
router.get('/my', orderController.getMyOrders);
router.get('/:id', orderController.getOrderById);
router.post('/:id/cancel', validate({ body: cancelOrderSchema }), orderController.cancelOrder);
router.get('/:id/invoice', orderController.getInvoice);

module.exports = router;
