/**
 * Wraps an async controller function to catch errors and pass them to next().
 * Eliminates the need for try/catch in every controller method.
 *
 * @param {Function} fn - Async Express route handler (req, res, next)
 * @returns {Function} Express middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
