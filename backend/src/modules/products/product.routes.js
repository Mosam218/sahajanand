const { Router } = require('express');
const productController = require('./product.controller');
const { validate } = require('../../middleware/validation.middleware');
const { productQuerySchema, limitQuerySchema } = require('./product.validation');

const router = Router();

// Public routes — order matters: static paths before :slug
router.get('/featured', validate({ query: limitQuerySchema }), productController.getFeatured);
router.get('/new-arrivals', validate({ query: limitQuerySchema }), productController.getNewArrivals);
router.get('/brands', productController.getBrands);
router.get('/', validate({ query: productQuerySchema }), productController.getProducts);
router.get('/:id/related', productController.getRelatedProducts);
router.get('/:slug', productController.getProductBySlug);

module.exports = router;
