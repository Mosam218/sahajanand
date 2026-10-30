const { Router } = require('express');
const addressController = require('./address.controller');
const { verifyToken } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');
const { addressSchema, updateAddressSchema, idParamSchema } = require('./address.validation');

const router = Router();

router.use(verifyToken);

router.get('/', addressController.getAddresses);
router.post('/', validate({ body: addressSchema }), addressController.createAddress);
router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateAddressSchema }),
  addressController.updateAddress
);
router.delete('/:id', validate({ params: idParamSchema }), addressController.deleteAddress);
router.patch('/:id/default', validate({ params: idParamSchema }), addressController.setDefault);

module.exports = router;
