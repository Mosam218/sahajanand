const { Router } = require('express');
const settingsService = require('./settings.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

const router = Router();

// Public: store name, contact details, pricing rules, payment methods
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = await settingsService.getPublicSettings();
    return ApiResponse(res, 200, 'Settings fetched', { settings });
  })
);

// Public: one policy page (404 until the business has published it)
router.get(
  '/policies/:key',
  asyncHandler(async (req, res) => {
    const policy = await settingsService.getPolicy(req.params.key);
    if (!policy) throw ApiError.notFound('This policy has not been published');
    return ApiResponse(res, 200, 'Policy fetched', { policy });
  })
);

module.exports = router;
