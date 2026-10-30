const ApiError = require('../utils/ApiError');
const { isStaff, isSuperAdmin } = require('../utils/roles');

/**
 * Middleware: Check if the authenticated user is an admin or super admin.
 * Must be used after verifyToken.
 */
const isAdmin = (req, _res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }

  if (!isStaff(req.user)) {
    return next(ApiError.forbidden('Admin access required'));
  }

  next();
};

/**
 * Middleware: Restrict a route to super admins (roles, store settings).
 * Must be used after verifyToken.
 */
const requireSuperAdmin = (req, _res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }

  if (!isSuperAdmin(req.user)) {
    return next(ApiError.forbidden('Super admin access required'));
  }

  next();
};

module.exports = { isAdmin, requireSuperAdmin };
