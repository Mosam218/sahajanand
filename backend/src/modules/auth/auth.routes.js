const { Router } = require('express');
const authController = require('./auth.controller');
const { verifyToken } = require('../../middleware/auth.middleware');
const { authLimiter } = require('../../middleware/rateLimit.middleware');
const { validate } = require('../../middleware/validation.middleware');
const { loginSchema } = require('./auth.validation');

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.get('/me', verifyToken, authController.me);
router.post('/logout', verifyToken, authController.logout);

module.exports = router;
