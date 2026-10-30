const { Router } = require('express');
const enquiryService = require('./enquiry.service');
const { verifyToken, optionalAuth } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');
const { enquiryLimiter } = require('../../middleware/rateLimit.middleware');
const { createEnquirySchema } = require('./enquiry.validation');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');

const router = Router();

// Public: request a quote (guests allowed)
router.post(
  '/',
  enquiryLimiter,
  optionalAuth,
  validate({ body: createEnquirySchema }),
  asyncHandler(async (req, res) => {
    const enquiry = await enquiryService.createEnquiry(req.body, req.user);
    return ApiResponse(res, 201, 'Enquiry received', {
      enquiry: { reference: enquiry.reference, status: enquiry.status, createdAt: enquiry.createdAt },
    });
  })
);

router.get(
  '/my',
  verifyToken,
  asyncHandler(async (req, res) => {
    const { enquiries, meta } = await enquiryService.getMyEnquiries(req.user, req.query);
    return ApiResponse(res, 200, 'Enquiries fetched', { enquiries }, meta);
  })
);

module.exports = router;
