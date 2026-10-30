const { Router } = require('express');
const bannerService = require('./banner.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');

const router = Router();

// Public: homepage carousel slides
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const banners = await bannerService.getActiveBanners();
    return ApiResponse(res, 200, 'Banners fetched', { banners });
  })
);

module.exports = router;
