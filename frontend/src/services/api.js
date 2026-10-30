// API client. Every call goes to the backend (VITE_API_URL); nothing is mocked.
// Responses are { success, message, data, meta }; errors { success, message, errors }.
import { auth } from './firebase.js';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
// Uploaded images are served by the API host
export const API_ORIGIN = BASE.replace(/\/api$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, errors = [], network = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors; // [{ field, message }]
    this.network = network;
  }
  /** Field errors as { field: message } for forms. */
  get fields() {
    return Object.fromEntries(this.errors.filter((e) => e.field).map((e) => [e.field, e.message]));
  }
}

const NETWORK_MESSAGE = 'We could not reach the server. Check your connection and try again.';

async function request(path, { method = 'GET', body, query, form, signal, authed = true } = {}) {
  const url = new URL(`${BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  const headers = {};
  if (authed && auth?.currentUser) {
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(NETWORK_MESSAGE, { network: true });
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // Not JSON (proxy error page, empty body): handled below
  }

  if (!res.ok || !payload || payload.success === false) {
    const message =
      payload?.message ||
      (res.status === 429 ? 'Too many requests. Please wait a moment and try again.' : 'Something went wrong. Please try again.');
    throw new ApiError(message, { status: res.status, errors: payload?.errors || [] });
  }

  return payload;
}

const data = (promise) => promise.then((p) => p.data ?? {});
const paged = (promise, key) => promise.then((p) => ({ items: p.data?.[key] ?? [], meta: p.meta ?? { page: 1, totalPages: 1, total: 0 } }));

const get = (path, query, opts) => request(path, { query, ...opts });
const send = (method) => (path, body, opts) => request(path, { method, body: body ?? {}, ...opts });
const post = send('POST');
const put = send('PUT');
const patch = send('PATCH');
const del = (path) => request(path, { method: 'DELETE' });

/** Load every page of the public product list (the catalogue is small). */
async function allProducts() {
  const first = await request('/products', { query: { limit: 100, page: 1, sort: 'catalogue' }, authed: false });
  let products = first.data.products;
  for (let page = 2; page <= (first.meta?.totalPages || 1); page++) {
    const next = await request('/products', { query: { limit: 100, page, sort: 'catalogue' }, authed: false });
    products = products.concat(next.data.products);
  }
  return products;
}

export const api = {
  // ─── Storefront (public) ─────────────────────────────────
  settings: () => data(get('/settings', null, { authed: false })).then((d) => d.settings),
  categories: () => data(get('/categories', null, { authed: false })).then((d) => d.categories),
  products: allProducts,
  product: (slug) => data(get(`/products/${encodeURIComponent(slug)}`, null, { authed: false })),
  banners: () => data(get('/banners', null, { authed: false })).then((d) => d.banners),
  coupons: () => data(get('/coupons', null, { authed: false })).then((d) => d.coupons),
  policy: (key) => data(get(`/settings/policies/${encodeURIComponent(key)}`, null, { authed: false })).then((d) => d.policy),
  submitEnquiry: (values) => data(post('/enquiries', values)).then((d) => d.enquiry),

  // ─── Account ─────────────────────────────────────────────
  login: (profile) => data(post('/auth/login', profile)).then((d) => d.user),
  me: () => data(get('/auth/me')).then((d) => d.user),
  logout: () => post('/auth/logout'),
  updateProfile: (values) => data(put('/users/profile', values)).then((d) => d.user),
  myEnquiries: () => paged(get('/enquiries/my', { limit: 50 }), 'enquiries'),

  addresses: () => data(get('/addresses')).then((d) => d.addresses),
  createAddress: (a) => data(post('/addresses', a)).then((d) => d.address),
  updateAddress: (id, a) => data(put(`/addresses/${id}`, a)).then((d) => d.address),
  deleteAddress: (id) => del(`/addresses/${id}`),
  setDefaultAddress: (id) => data(patch(`/addresses/${id}/default`)).then((d) => d.address),

  // ─── Cart ────────────────────────────────────────────────
  cart: () => data(get('/cart')).then((d) => d.cart),
  cartAdd: (productId, quantity) => data(post('/cart/items', { productId, quantity })).then((d) => d.cart),
  cartUpdate: (productId, quantity) => data(put(`/cart/items/${productId}`, { quantity })).then((d) => d.cart),
  cartRemove: (productId) => data(del(`/cart/items/${productId}`)).then((d) => d.cart),
  cartClear: () => del('/cart'),
  cartMerge: (items) => data(post('/cart/merge', { items })).then((d) => d.cart),

  // ─── Orders & payment ────────────────────────────────────
  quote: (body, opts) => data(post('/orders/quote', body, opts)).then((d) => d.quote),
  checkout: (body) => data(post('/orders/checkout', body)),
  myOrders: (page = 1) => paged(get('/orders/my', { page, limit: 10 }), 'orders'),
  order: (id) => data(get(`/orders/${id}`)).then((d) => d.order),
  cancelOrder: (id, reason) => data(post(`/orders/${id}/cancel`, { reason })).then((d) => d.order),
  verifyPayment: (body) => data(post('/payments/verify', body)).then((d) => d.order),
  paymentFailed: (razorpayOrderId) => post('/payments/failed', { razorpay_order_id: razorpayOrderId }),
  retryPayment: (orderId) => data(post(`/payments/retry/${orderId}`)),

  // ─── Admin (every call is authorised again on the server) ─
  admin: {
    dashboard: () => data(get('/admin/dashboard')),

    products: (query) => paged(get('/admin/products', query), 'products'),
    product: (id) => data(get(`/admin/products/${id}`)).then((d) => d.product),
    createProduct: (body) => data(post('/admin/products', body)).then((d) => d.product),
    updateProduct: (id, body) => data(put(`/admin/products/${id}`, body)).then((d) => d.product),
    deleteProduct: (id) => request(`/admin/products/${id}`, { method: 'DELETE' }),
    setStock: (id, stock) => data(patch(`/admin/products/${id}/stock`, { stock })).then((d) => d.product),
    toggleProduct: (id) => data(patch(`/admin/products/${id}/toggle`)).then((d) => d.product),
    uploadImages: (id, files) => {
      const form = new FormData();
      for (const f of files) form.append('images', f);
      return data(request(`/admin/products/${id}/images`, { method: 'POST', form })).then((d) => d.product);
    },
    deleteImage: (id, imageId) => data(del(`/admin/products/${id}/images/${imageId}`)).then((d) => d.product),
    reorderImages: (id, order) => data(put(`/admin/products/${id}/images/order`, { order })).then((d) => d.product),

    categories: () => data(get('/admin/categories')).then((d) => d.categories),
    saveCategory: (id, fields, imageFile) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
      if (imageFile) form.append('image', imageFile);
      return data(request(id ? `/admin/categories/${id}` : '/admin/categories', { method: id ? 'PUT' : 'POST', form })).then((d) => d.category);
    },
    deleteCategory: (id) => del(`/admin/categories/${id}`),

    orders: (query) => paged(get('/admin/orders', query), 'orders'),
    order: (id) => data(get(`/admin/orders/${id}`)),
    setOrderStatus: (id, body) => data(patch(`/admin/orders/${id}/status`, body)).then((d) => d.order),
    setPaymentStatus: (id, paymentStatus) => data(patch(`/admin/orders/${id}/payment-status`, { paymentStatus })).then((d) => d.order),
    resolveOrder: (id) => data(patch(`/admin/orders/${id}/resolve`)).then((d) => d.order),
    refundOrder: (id, amount) => data(post(`/admin/orders/${id}/refund`, { amount })),

    users: (query) => paged(get('/admin/users', query), 'users'),
    user: (id) => data(get(`/admin/users/${id}`)),
    setUserRole: (id, role) => data(patch(`/admin/users/${id}/role`, { role })).then((d) => d.user),
    setUserStatus: (id, isActive) => data(patch(`/admin/users/${id}/status`, { isActive })).then((d) => d.user),

    enquiries: (query) => paged(get('/admin/enquiries', query), 'enquiries'),
    updateEnquiry: (id, body) => data(patch(`/admin/enquiries/${id}`, body)).then((d) => d.enquiry),
    deleteEnquiry: (id) => del(`/admin/enquiries/${id}`),

    coupons: (query) => paged(get('/admin/coupons', query), 'coupons'),
    createCoupon: (body) => data(post('/admin/coupons', body)).then((d) => d.coupon),
    updateCoupon: (id, body) => data(put(`/admin/coupons/${id}`, body)).then((d) => d.coupon),
    deleteCoupon: (id) => del(`/admin/coupons/${id}`),

    banners: () => data(get('/admin/banners')).then((d) => d.banners),
    createBanner: (body) => data(post('/admin/banners', body)).then((d) => d.banner),
    updateBanner: (id, body) => data(put(`/admin/banners/${id}`, body)).then((d) => d.banner),
    deleteBanner: (id) => del(`/admin/banners/${id}`),

    settings: () => data(get('/admin/settings')).then((d) => d.settings),
    saveSettings: (body) => data(put('/admin/settings', body)).then((d) => d.settings),

    activity: (query) => paged(get('/admin/activity', query), 'activity'),
  },
};
