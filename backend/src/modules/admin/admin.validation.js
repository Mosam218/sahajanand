const { z } = require('zod');
const { ROLES } = require('../../utils/roles');
const { ENQUIRY_STATUSES } = require('../../models/enquiry.model');

// ─── Helpers ─────────────────────────────────────────────
// Multipart forms send everything as text, JSON bodies send real types.
const bool = (def) =>
  z.preprocess(
    (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined),
    z.boolean().optional().default(def)
  );

const queryBool = z.preprocess(
  (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined),
  z.boolean().optional()
);

const jsonArray = (item, max = 100) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v);
    } catch {
      return v; // fails the array check below with a normal validation error
    }
  }, z.array(item).max(max).optional().default([]));

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID');
const page = z.coerce.number().int().min(1).optional().default(1);
const limit = z.coerce.number().int().min(1).max(100).optional().default(20);
const search = z.string().trim().max(100).optional();

// passthrough: routes may carry further params (e.g. :imageId)
const idParamSchema = z.object({ id: objectId }).passthrough();

/**
 * Update version of a create schema: every field optional, and only the
 * fields that were actually sent come out. (A plain .partial() would still
 * apply the create defaults and silently reset fields that were not sent.)
 */
const updateOf = (createSchema) =>
  z
    .object({})
    .passthrough()
    .transform((raw, ctx) => {
      const result = createSchema.partial().safeParse(raw);
      if (!result.success) {
        result.error.issues.forEach((issue) => ctx.addIssue(issue));
        return z.NEVER;
      }
      return Object.fromEntries(Object.entries(result.data).filter(([key]) => key in raw));
    });

// ─── Products ────────────────────────────────────────────
const adminCreateProductSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  model: z.string().trim().max(100).optional().default(''),
  description: z.string().trim().max(5000).optional().default(''),
  shortDescription: z.string().trim().max(300).optional().default(''),
  brand: z.string().trim().max(100).optional().default(''),
  category: objectId,
  subcategory: z.string().trim().max(100).optional().default(''),
  familyId: z.string().trim().max(100).optional().default(''),
  familyName: z.string().trim().max(200).optional().default(''),
  price: z.coerce.number().min(0, 'Price must be 0 or more'),
  mrp: z.coerce.number().min(0, 'MRP must be 0 or more'),
  stock: z.coerce.number().int().min(0, 'Stock must be 0 or more').default(0),
  sku: z.string().trim().max(60).optional().default(''),
  specs: jsonArray(z.object({ key: z.string().trim().min(1).max(100), value: z.string().trim().max(300) })),
  warrantyMonths: z.coerce.number().int().min(0).max(600).optional().default(0),
  features: jsonArray(z.string().trim().min(1).max(300)),
  applications: jsonArray(z.string().trim().min(1).max(200)),
  badges: jsonArray(z.string().trim().min(1).max(60), 20),
  tags: jsonArray(z.string().trim().min(1).max(40), 30),
  temp: z
    .object({ min: z.coerce.number().min(-200).max(200), max: z.coerce.number().min(-200).max(200) })
    .refine((t) => t.min <= t.max, { message: 'Minimum temperature must not be above the maximum' })
    .nullable()
    .optional(),
  tempClass: z.enum(['', 'Ultra-low', 'Freezer', 'Dual / convertible', 'Chiller', 'Heated']).optional().default(''),
  capacityL: z.coerce.number().min(0).nullable().optional(),
  refrigerant: z.string().trim().max(40).optional().default(''),
  cooling: z.string().trim().max(100).optional().default(''),
  sortOrder: z.coerce.number().int().optional().default(0),
  isFeatured: bool(false),
  isActive: bool(true),
});

const adminUpdateProductSchema = updateOf(adminCreateProductSchema);

const adminStockSchema = z.object({
  stock: z.coerce.number().int().min(0, 'Stock must be non-negative'),
});

const adminImageOrderSchema = z.object({
  order: z.array(objectId).min(1).max(8),
});

const adminProductsQuerySchema = z.object({
  search,
  category: z.string().trim().max(100).optional(),
  isActive: queryBool,
  featured: queryBool,
  stockStatus: z.enum(['in', 'low', 'out']).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular', 'name', 'stock_asc', 'catalogue']).optional().default('newest'),
  page,
  limit,
});

// ─── Categories ──────────────────────────────────────────
const adminCreateCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  shortName: z.string().trim().max(40).optional().default(''),
  tagline: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().max(500).optional().default(''),
  subcategories: jsonArray(z.string().trim().min(1).max(100), 50),
  isFeatured: bool(false),
  isActive: bool(true),
  sortOrder: z.coerce.number().int().optional().default(0),
});

const adminUpdateCategorySchema = updateOf(adminCreateCategorySchema);

// ─── Orders ──────────────────────────────────────────────
const adminUpdateOrderStatusSchema = z.object({
  status: z.enum(['confirmed', 'shipped', 'delivered', 'cancelled']),
  trackingId: z.string().trim().max(100).optional().default(''),
  courierName: z.string().trim().max(100).optional().default(''),
  note: z.string().trim().max(500).optional().default(''),
});

const adminUpdatePaymentStatusSchema = z.object({
  paymentStatus: z.enum(['paid', 'pending', 'refunded']),
});

const adminRefundSchema = z.object({
  amount: z.coerce.number().min(0).optional().default(0),
});

const adminOrdersQuerySchema = z.object({
  status: z.enum(['placed', 'confirmed', 'shipped', 'delivered', 'cancelled']).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'refund_pending', 'refunded']).optional(),
  paymentMethod: z.enum(['razorpay', 'cod']).optional(),
  needsAttention: queryBool,
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search,
  page,
  limit,
});

// ─── Users ───────────────────────────────────────────────
const adminUpdateRoleSchema = z.object({
  role: z.enum(Object.values(ROLES)),
});

const adminUpdateStatusSchema = z.object({
  isActive: z.boolean(),
});

const adminUsersQuerySchema = z.object({
  search,
  role: z.enum(Object.values(ROLES)).optional(),
  isActive: queryBool,
  page,
  limit,
});

// ─── Coupons ─────────────────────────────────────────────
const couponFields = {
  code: z
    .string()
    .trim()
    .min(1, 'Code is required')
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, - and _ only')
    .transform((v) => v.toUpperCase()),
  description: z.string().trim().max(200).optional().default(''),
  discountType: z.enum(['percent', 'flat']),
  discountValue: z.coerce.number().min(0),
  maxDiscount: z.coerce.number().min(0).optional().default(0),
  minOrderValue: z.coerce.number().min(0).optional().default(0),
  usageLimit: z.coerce.number().int().min(0).optional().default(0),
  perUserLimit: z.coerce.number().int().min(1).optional().default(1),
  category: objectId.nullable().optional().default(null),
  showOnStorefront: z.boolean().optional().default(false),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date(),
  isActive: z.boolean().optional().default(true),
};

const adminCreateCouponSchema = z.object(couponFields);

const adminUpdateCouponSchema = updateOf(adminCreateCouponSchema);

const adminCouponsQuerySchema = z.object({ search, isActive: queryBool, page, limit });

// ─── Enquiries ───────────────────────────────────────────
const adminEnquiriesQuerySchema = z.object({
  status: z.enum(ENQUIRY_STATUSES).optional(),
  search,
  page,
  limit,
});

// ─── Banners ─────────────────────────────────────────────
const bannerFields = {
  badge: z.string().trim().max(60).optional().default(''),
  title: z.string().trim().min(1, 'Title is required').max(120),
  subtitle: z.string().trim().max(300).optional().default(''),
  product: objectId,
  facts: z.array(z.string().trim().min(1).max(60)).max(4).optional().default([]),
  cta: z.string().trim().min(1).max(40).optional().default('Explore product'),
  tone: z.enum(['ice', 'steel', 'dark']).optional().default('ice'),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().optional().default(0),
};

const adminCreateBannerSchema = z.object(bannerFields);

const adminUpdateBannerSchema = updateOf(adminCreateBannerSchema);

// ─── Generic paging ──────────────────────────────────────
const adminPageQuerySchema = z.object({ search, status: z.string().trim().max(40).optional(), page, limit });

module.exports = {
  idParamSchema,
  adminCreateProductSchema,
  adminUpdateProductSchema,
  adminStockSchema,
  adminImageOrderSchema,
  adminProductsQuerySchema,
  adminCreateCategorySchema,
  adminUpdateCategorySchema,
  adminUpdateOrderStatusSchema,
  adminUpdatePaymentStatusSchema,
  adminRefundSchema,
  adminOrdersQuerySchema,
  adminUpdateRoleSchema,
  adminUpdateStatusSchema,
  adminUsersQuerySchema,
  adminCreateCouponSchema,
  adminUpdateCouponSchema,
  adminCouponsQuerySchema,
  adminEnquiriesQuerySchema,
  adminCreateBannerSchema,
  adminUpdateBannerSchema,
  adminPageQuerySchema,
};
