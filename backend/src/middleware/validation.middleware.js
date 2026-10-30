/**
 * Validation middleware using Zod schemas.
 * Validates body, query, and/or params against provided schemas.
 * Replaces req.body/query/params with parsed (clean) values.
 *
 * @param {{ body?: import('zod').ZodSchema, query?: import('zod').ZodSchema, params?: import('zod').ZodSchema }} schemas
 * @returns {import('express').RequestHandler}
 */
const validate = (schemas) => (req, _res, next) => {
  const errors = [];

  if (schemas.body) {
    const result = schemas.body.safeParse(req.body);
    if (!result.success) {
      errors.push(
        ...result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }))
      );
    } else {
      req.body = result.data;
    }
  }

  if (schemas.query) {
    const result = schemas.query.safeParse(req.query);
    if (!result.success) {
      errors.push(
        ...result.error.issues.map((issue) => ({
          field: `query.${issue.path.join('.')}`,
          message: issue.message,
        }))
      );
    } else {
      req.query = result.data;
    }
  }

  if (schemas.params) {
    const result = schemas.params.safeParse(req.params);
    if (!result.success) {
      errors.push(
        ...result.error.issues.map((issue) => ({
          field: `params.${issue.path.join('.')}`,
          message: issue.message,
        }))
      );
    } else {
      req.params = result.data;
    }
  }

  if (errors.length > 0) {
    return _res.status(400).json({
      success: false,
      message: 'Validation error',
      errors,
    });
  }

  next();
};

module.exports = { validate };
