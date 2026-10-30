const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin', SUPER_ADMIN: 'superadmin' });
const STAFF_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN];

/** True for admins and super admins. */
const isStaff = (user) => Boolean(user && STAFF_ROLES.includes(user.role));
const isSuperAdmin = (user) => Boolean(user && user.role === ROLES.SUPER_ADMIN);

module.exports = { ROLES, STAFF_ROLES, isStaff, isSuperAdmin };
