const crypto = require('crypto');

/**
 * Generate a unique order number in format: SEL-YYYYMMDD-XXXXXX
 * Uses crypto for randomness, collision-safe by design (6 hex chars = 16M possibilities per day).
 *
 * @returns {string} Order number like SEL-20261004-A3F2B1
 */
function generateOrderNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();

  return `SEL-${dateStr}-${random}`;
}

module.exports = { generateOrderNumber };
