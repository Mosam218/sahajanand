const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;
const DEFAULT_PAGE = 1;

/**
 * Parse pagination parameters from the request query.
 *
 * @param {object} query - Express req.query
 * @returns {{ page: number, limit: number, skip: number, sort: string }}
 */
function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (isNaN(page) || page < 1) page = DEFAULT_PAGE;
  if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const skip = (page - 1) * limit;
  const sort = query.sort || '';

  return { page, limit, skip, sort };
}

/**
 * Build pagination metadata for the response.
 *
 * @param {number} total - Total documents matching the query
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {{ page: number, limit: number, total: number, totalPages: number }}
 */
function buildMeta(total, page, limit) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

module.exports = { parsePagination, buildMeta };
