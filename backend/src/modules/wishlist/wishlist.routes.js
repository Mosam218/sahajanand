const { Router } = require('express');
const wishlistController = require('./wishlist.controller');
const { verifyToken } = require('../../middleware/auth.middleware');

const router = Router();

router.use(verifyToken);

router.get('/', wishlistController.getWishlist);
router.post('/:productId', wishlistController.addToWishlist);
router.delete('/:productId', wishlistController.removeFromWishlist);

module.exports = router;
