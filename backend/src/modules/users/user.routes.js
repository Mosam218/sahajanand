const { Router } = require('express');
const userController = require('./user.controller');
const { verifyToken } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');
const { updateProfileSchema } = require('./user.validation');

const router = Router();

router.get('/profile', verifyToken, userController.getProfile);
router.put(
  '/profile',
  verifyToken,
  validate({ body: updateProfileSchema }),
  userController.updateProfile
);

module.exports = router;
