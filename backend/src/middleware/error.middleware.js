const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const config = require('../config/env');

/**
 * 404 handler — placed after all routes.
 */
const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

/**
 * Global error handler middleware.
 * Handles ApiError, Zod, Mongoose, Firebase, Multer and unknown errors.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || [];

  // Origin not on the allow-list
  if (typeof err.message === 'string' && err.message.startsWith('CORS:')) {
    statusCode = 403;
    message = 'Origin not allowed';
    errors = [];
  }

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
    errors = [];
  }

  if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
    errors = [];
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation error';
    errors = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
  }

  // Mongoose ValidationError
  if (err.name === 'ValidationError' && err.errors && !err.statusCode) {
    statusCode = 400;
    message = 'Validation error';
    errors = Object.keys(err.errors).map((key) => ({
      field: key,
      message: err.errors[key].message,
    }));
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
    errors = [];
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value for '${field}'. This ${field} already exists.`;
    errors = [{ field, message }];
  }

  // Firebase auth errors
  if (err.code && typeof err.code === 'string' && err.code.startsWith('auth/')) {
    statusCode = 401;
    message = 'Authentication failed';
    errors = [];
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'File too large. Maximum size is 5MB.';
    errors = [];
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
    statusCode = 400;
    message = 'Too many files, or an unexpected file field';
    errors = [];
  }

  // Never show internals for unexpected server errors
  if (statusCode >= 500 && !err.isOperational) {
    message = 'Something went wrong on our side. Please try again.';
    errors = [];
  }

  // Log errors
  if (statusCode >= 500) {
    logger.error(`[${statusCode}] ${err.message}`, { stack: err.stack });
  } else {
    logger.warn(`[${statusCode}] ${message}`);
  }

  const response = {
    success: false,
    message,
  };

  if (errors.length > 0) {
    response.errors = errors;
  }

  // Stack traces only while developing locally, never in production
  if (config.env === 'development' && statusCode >= 500 && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = { notFoundHandler, errorHandler };
