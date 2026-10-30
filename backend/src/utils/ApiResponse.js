/**
 * Standard API response helper.
 * All API responses go through this for consistency.
 *
 * @param {import('express').Response} res
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Human-readable message
 * @param {*} [data] - Response payload
 * @param {object} [meta] - Pagination or extra metadata
 */
function ApiResponse(res, statusCode, message, data = null, meta = null) {
  const body = {
    success: statusCode >= 200 && statusCode < 300,
    message,
  };

  if (data !== null && data !== undefined) {
    body.data = data;
  }

  if (meta !== null && meta !== undefined) {
    body.meta = meta;
  }

  return res.status(statusCode).json(body);
}

module.exports = ApiResponse;
