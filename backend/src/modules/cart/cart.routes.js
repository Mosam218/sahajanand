const { Router } = require('express');
const cartController = require('./cart.controller');
const { verifyToken } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');
const { addItemSchema, updateItemSchema, mergeCartSchema } = require('./cart.validation');

const router = Router();

router.use(verifyToken);

router.get('/', cartController.getCart);
router.post('/items', validate({ body: addItemSchema }), cartController.addItem);
router.put('/items/:productId', validate({ body: updateItemSchema }), cartController.updateItem);
router.delete('/items/:productId', cartController.removeItem);
router.delete('/', cartController.clearCart);
router.post('/merge', validate({ body: mergeCartSchema }), cartController.mergeCart);

module.exports = router;
