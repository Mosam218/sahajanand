// Turns API records into the shapes the storefront components use.
// This is the only place that knows both sides of the contract.
import { registerImageFallback } from '../utils/format.js';

export function toProduct(p) {
  const gallery = (p.images || []).map((i) => i.url);
  // If the main photo fails to load, show the next one instead
  if (gallery.length > 1) registerImageFallback(gallery[0], gallery[1]);
  const category = p.category && typeof p.category === 'object' ? p.category : null;

  return {
    _id: p._id,
    id: p.slug, // used in URLs: /product/:id
    // The model number is the headline; products without one use their name
    model: p.model || p.name,
    name: p.model ? p.name : p.shortDescription || p.brand || '',
    title: p.model ? `${p.model} ${p.name}` : p.name,
    brand: p.brand || '',
    sku: p.sku || '',
    familyId: p.familyId || '',
    familyName: p.familyName || '',
    category: category?.slug || '',
    categoryName: category?.name || '',
    subcategory: p.subcategory || '',
    description: p.description || '',
    image: gallery[0] || '',
    gallery,
    features: p.features || [],
    specifications: (p.specs || []).map((s) => ({ label: s.key, value: s.value })),
    applications: p.applications || [],
    badges: p.badges || [],
    temp: p.temp && p.temp.min != null && p.temp.max != null ? [p.temp.min, p.temp.max] : null,
    tempClass: p.tempClass || null,
    capacityL: p.capacityL ?? null,
    refrigerant: p.refrigerant || null,
    cooling: p.cooling || null,
    warrantyMonths: p.warrantyMonths || 0,
    price: p.price,
    mrp: p.mrp,
    discountPercent: p.discountPercent || 0,
    priceSource: p.priceSource || 'confirmed',
    stock: p.stock ?? 0,
    featured: Boolean(p.isFeatured),
  };
}

export function toCategory(c) {
  return {
    _id: c._id,
    slug: c.slug,
    name: c.name,
    shortName: c.shortName || c.name,
    tagline: c.tagline || '',
    description: c.description || '',
    image: c.image?.url || '',
    scene: c.scene || '',
    featured: Boolean(c.isFeatured),
    subcategories: c.subcategories || [],
    productCount: c.productCount || 0,
  };
}

export function toBanner(b) {
  return {
    id: b._id,
    badge: b.badge,
    title: b.title,
    subtitle: b.subtitle,
    facts: b.facts || [],
    cta: b.cta || 'Explore product',
    tone: b.tone || 'ice',
    productSlug: b.product?.slug || '',
  };
}

/** A server cart line → what the cart UI renders. */
export function toCartLine(line) {
  const p = line.product;
  return {
    productId: p._id,
    id: p.slug,
    model: p.model || p.name,
    name: p.model ? p.name : '',
    image: p.images?.[0]?.url || '',
    price: p.price,
    qty: line.quantity,
    stock: p.stock,
    unavailable: Boolean(line.outOfStock),
    exceedsStock: Boolean(line.quantityExceedsStock) && !line.outOfStock,
  };
}

// Order status as shown to people
export const ORDER_STEPS = ['placed', 'confirmed', 'shipped', 'delivered'];
export const ORDER_STATUS_LABEL = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  shipped: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
export const PAYMENT_STATUS_LABEL = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
};
export const PAYMENT_METHOD_LABEL = {
  cod: 'Pay on delivery',
  razorpay: 'Online payment',
};
export const ENQUIRY_STATUS_LABEL = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', won: 'Won', lost: 'Lost' };

export const orderItemTitle = (item) => item.model || item.name;
export const formatAddress = (a) =>
  a ? [a.line1, a.line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', ') : '';
