const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const morgan = require('morgan');
const path = require('path');

const config = require('./config/env');
const { connectDB } = require('./config/db');
const routes = require('./routes');
const paymentController = require('./modules/payments/payment.controller');
const { globalLimiter } = require('./middleware/rateLimit.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const logger = require('./utils/logger');

const app = express();

// 1. Trust proxy (Render, Vercel, etc.)
app.set('trust proxy', 1);

// 2. Security headers & compression
// The API serves JSON and uploaded images to the storefront on another origin
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);
app.use(compression());

// 3. CORS — allow configured client URLs + no-origin for server-to-server/webhooks
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (webhooks, server-to-server, curl)
    if (!origin) return callback(null, true);
    if (config.clientUrls.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Razorpay-Signature'],
};
app.use(cors(corsOptions));

// Database. Done inside the request so a serverless host waits for the
// response. A failure is returned as JSON instead of killing the process.
app.use((req, res, next) => {
  connectDB()
    .then(() => next())
    .catch((err) => {
      console.error(err);
      if (res.headersSent) return next(err);
      res.status(500).json({
        success: false,
        message: err.message || 'Database connection failed',
      });
    });
});

// 4. Razorpay webhook — MUST be before express.json() to receive raw body
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.webhook
);

// Uploaded images (used when Cloudinary is not configured). Only image files
// written by the upload middleware live here; nothing is executed.
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), {
    index: false,
    dotfiles: 'ignore',
    maxAge: '7d',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  })
);

// 5. Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 6. NoSQL injection prevention & HTTP parameter pollution
app.use(mongoSanitize());
app.use(hpp());

// 7. HTTP logging (piped into winston)
if (!config.isTest) {
  app.use(
    morgan('short', {
      stream: logger.stream,
      skip: (_req, res) => res.statusCode < 400,
    })
  );
}

// 8. Global rate limiter + API routes (the health check stays reachable
//    for uptime monitors even when an address is being limited)
app.use((req, res, next) =>
  req.path === '/api/health' || req.path === '/health' ? next() : globalLimiter(req, res, next)
);

// Root: a plain status message so opening the API address in a browser
// does not look like an error
app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Sahajanand Electronics API is running',
    data: { health: '/api/health' },
  });
});

app.use('/api', routes);
// Also serve the same routes without the /api prefix, so a storefront whose
// VITE_API_URL was set without "/api" still works
app.use(routes);

// Top-level endpoints for standard checkout callers
app.post('/create-order', paymentController.createOrder);
app.post('/verify-payment', paymentController.verifyPaymentSignature);

// 9. 404 + error handler (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
