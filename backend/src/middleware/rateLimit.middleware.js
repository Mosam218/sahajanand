const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const WINDOW_MS = 15 * 60 * 1000;

const limiter = (max, message) =>
  rateLimit({
    windowMs: WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Automated tests fire many requests from one address
    skip: () => config.isTest,
    message: {
      success: false,
      message,
    },
  });

/**
 * Global rate limiter: 3000 requests per 15 minutes per IP.
 * This is only a flood guard. A storefront page load makes about eight API
 * calls, and many customers can share one address (offices, and mobile
 * networks that put thousands of phones behind one IP), so a tight limit
 * here would lock out real shoppers. The sensitive actions below have their
 * own, much stricter limits.
 */
const globalLimiter = limiter(3000, 'Too many requests, please try again later.');

/**
 * Sign-in registration: 60 per 15 minutes per IP. Passwords are checked by
 * Firebase (which has its own brute-force protection); this only limits how
 * often sessions can be registered with this API.
 */
const authLimiter = limiter(60, 'Too many authentication attempts. Please try again later.');

/**
 * Payment endpoints rate limiter: 30 requests per 15 minutes per IP.
 */
const paymentLimiter = limiter(30, 'Too many payment requests. Please try again later.');

/**
 * Order placement: 20 per 15 minutes per IP.
 */
const checkoutLimiter = limiter(20, 'Too many orders in a short time. Please try again later.');

/**
 * Public quote requests: 10 per 15 minutes per IP (spam protection).
 */
const enquiryLimiter = limiter(10, 'Too many enquiries in a short time. Please try again later.');

/**
 * Admin endpoints rate limiter: 1500 requests per 15 minutes per IP.
 */
const adminLimiter = limiter(1500, 'Too many admin requests. Please try again later.');

module.exports = {
  globalLimiter,
  authLimiter,
  paymentLimiter,
  checkoutLimiter,
  enquiryLimiter,
  adminLimiter,
};
