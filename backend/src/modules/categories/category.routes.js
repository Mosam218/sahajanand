const { Router } = require('express');
const categoryController = require('./category.controller');

const router = Router();

// Public routes
router.get('/', categoryController.getCategories);
router.get('/:slug', categoryController.getCategoryBySlug);

module.exports = router;
