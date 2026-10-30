const { AuditLog } = require('../models');
const logger = require('../utils/logger');

const VERBS = { POST: 'Created', PUT: 'Updated', PATCH: 'Updated', DELETE: 'Deleted' };
const SINGULAR = {
  products: 'product',
  categories: 'category',
  orders: 'order',
  users: 'customer',
  coupons: 'coupon',
  reviews: 'review',
  enquiries: 'enquiry',
  banners: 'banner',
  settings: 'store settings',
};

/**
 * Describe an admin request in plain words, e.g. "Updated order status to shipped".
 */
function describe(req) {
  const [resource, id, sub] = req.path.split('/').filter(Boolean);
  const noun = SINGULAR[resource] || resource || 'record';
  let action = `${VERBS[req.method] || req.method} ${noun}`;
  if (sub) action += ` ${sub.replace(/-/g, ' ')}`;

  const body = req.body || {};
  const detail = body.status ?? body.paymentStatus ?? body.role ?? body.code ?? body.model ?? body.name ?? body.title;
  if (typeof detail === 'string' && detail) action += `: ${detail}`;
  else if (typeof body.isActive === 'boolean' && sub === 'status') action += body.isActive ? ': activated' : ': deactivated';
  else if (typeof body.stock === 'number') action += `: ${body.stock}`;

  return { action: action.slice(0, 300), target: id || '' };
}

/**
 * Middleware: record every successful change made through the admin API.
 * Must be used after verifyToken + isAdmin.
 */
const auditAdminChanges = (req, res, next) => {
  if (req.method === 'GET') return next();

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const { action, target } = describe(req);
    AuditLog.create({
      user: req.user._id,
      userName: req.user.name,
      action: target ? `${action} (${target})` : action,
      method: req.method,
      path: req.originalUrl.split('?')[0],
    }).catch((err) => logger.warn(`Audit log write failed: ${err.message}`));
  });

  next();
};

module.exports = { auditAdminChanges };
