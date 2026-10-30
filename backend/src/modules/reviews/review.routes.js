const { Router } = require('express');
const reviewController = require('./review.controller');
const { verifyToken } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');
const { createReviewSchema, updateReviewSchema } = require('./review.validation');

const router = Router();

router.get('/product/:productId', reviewController.getProductReviews);
router.post(
  '/product/:productId',
  verifyToken,
  validate({ body: createReviewSchema }),
  reviewController.createReview
);
router.put('/:id', verifyToken, validate({ body: updateReviewSchema }), reviewController.updateReview);
router.delete('/:id', verifyToken, reviewController.deleteReview);

module.exports = router;
