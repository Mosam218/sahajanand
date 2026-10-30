const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');
const { app, setupTestDB, teardownTestDB, clearTestDB } = require('../setup');
const razorpay = require('../../src/config/razorpay');
const razorpayService = require('../../src/integrations/razorpay/razorpay.service');
const adminRoutes = require('../../src/modules/admin/admin.routes');
const paymentService = require('../../src/modules/payments/payment.service');
const { Product, Order, Payment, Cart, Coupon, Setting, AuditLog, User } = require('../../src/models');
const { makeUser, tokensFor, makeCatalogue, makeAddress } = require('../helpers');

const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
const uploadCount = () => fs.readdirSync(UPLOADS).filter((f) => f !== '.gitkeep').length;

describe('Security and state hardening', () => {
  let customer, other, admin, superAdmin, asCustomer, asOther, asAdmin, asSuper, cat, address;

  beforeAll(setupTestDB);
  afterAll(teardownTestDB);

  beforeEach(async () => {
    customer = await makeUser('user');
    other = await makeUser('user');
    admin = await makeUser('admin');
    superAdmin = await makeUser('superadmin');
    [asCustomer, asOther, asAdmin, asSuper] = tokensFor(customer, other, admin, superAdmin);
    cat = await makeCatalogue();
    address = await makeAddress(customer);
  });

  afterEach(async () => {
    await clearTestDB();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const A = () => cat.productA._id.toString(); // ₹1000, 10 in stock
  const B = () => cat.productB._id.toString(); // ₹2000, 3 in stock
  const stockOf = async (id) => (await Product.findById(id)).stock;
  const checkout = (auth, body) => request(app).post('/api/orders/checkout').set('Authorization', auth).send(body);
  const cod = (items, extra = {}) => checkout(asCustomer, { addressId: address._id.toString(), paymentMethod: 'cod', items, ...extra });

  // ─── Admin authorisation: every route, every kind of caller ────────────────
  describe('admin endpoint authorisation matrix', () => {
    const SUPER_ONLY = new Set(['PATCH /users/:id/role', 'PUT /settings']);
    const routes = adminRoutes.stack
      .filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route.methods).map((m) => ({ method: m, path: layer.route.path })));

    it('covers every admin route and enforces the role on the server', async () => {
      expect(routes.length).toBeGreaterThanOrEqual(45);
      const id = new mongoose.Types.ObjectId().toString();
      const rows = [];

      for (const { method, path: routePath } of routes) {
        const url = `/api/admin${routePath.replace(/:[a-zA-Z]+/g, id)}`;
        const call = (auth) => {
          const req = request(app)[method](url);
          if (auth) req.set('Authorization', auth);
          return method === 'get' ? req : req.send({});
        };
        const [none, forged, cust, adm, sup] = await Promise.all([
          call(null),
          call('Bearer not-a-real-token'),
          call(asCustomer),
          call(asAdmin),
          call(asSuper),
        ]);
        const key = `${method.toUpperCase()} ${routePath}`;
        rows.push({ key, none: none.status, cust: cust.status, adm: adm.status, sup: sup.status });

        expect([key, 'unauthenticated', none.status]).toEqual([key, 'unauthenticated', 401]);
        expect([key, 'forged token', forged.status]).toEqual([key, 'forged token', 401]);
        expect([key, 'customer', cust.status]).toEqual([key, 'customer', 403]);
        if (SUPER_ONLY.has(key)) {
          expect([key, 'admin', adm.status]).toEqual([key, 'admin', 403]);
        } else {
          expect([key, 'admin allowed', [401, 403].includes(adm.status)]).toEqual([key, 'admin allowed', false]);
        }
        expect([key, 'super admin allowed', [401, 403].includes(sup.status)]).toEqual([key, 'super admin allowed', false]);
      }

      // Refused requests must leave nothing behind
      expect(await User.countDocuments({ role: { $ne: 'user' } })).toBe(2);

      if (process.env.WRITE_AUTH_MATRIX) {
        const allowed = (s) => ([401, 403].includes(s) ? `denied (${s})` : 'allowed');
        const lines = [
          '| Endpoint (`/api/admin`) | Unauthenticated | Customer | Admin | Super admin |',
          '|---|---|---|---|---|',
          ...rows.map((r) => `| \`${r.key}\` | denied (${r.none}) | denied (${r.cust}) | ${allowed(r.adm)} | ${allowed(r.sup)} |`),
        ];
        fs.writeFileSync(process.env.WRITE_AUTH_MATRIX, lines.join('\n') + '\n');
      }
    });

    it('requires sign-in on every customer endpoint', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const calls = [
        ['get', '/api/auth/me'], ['post', '/api/auth/logout'],
        ['get', '/api/users/profile'], ['put', '/api/users/profile'],
        ['get', '/api/addresses'], ['post', '/api/addresses'], ['put', `/api/addresses/${id}`], ['delete', `/api/addresses/${id}`], ['patch', `/api/addresses/${id}/default`],
        ['get', '/api/cart'], ['post', '/api/cart/items'], ['put', `/api/cart/items/${id}`], ['delete', `/api/cart/items/${id}`], ['delete', '/api/cart'], ['post', '/api/cart/merge'],
        ['get', '/api/wishlist'], ['post', `/api/wishlist/${id}`], ['delete', `/api/wishlist/${id}`],
        ['post', '/api/coupons/validate'],
        ['post', `/api/reviews/product/${id}`], ['put', `/api/reviews/${id}`], ['delete', `/api/reviews/${id}`],
        ['post', '/api/orders/quote'], ['post', '/api/orders/checkout'], ['get', '/api/orders/my'], ['get', `/api/orders/${id}`], ['post', `/api/orders/${id}/cancel`], ['get', `/api/orders/${id}/invoice`],
        ['post', '/api/payments/verify'], ['post', '/api/payments/failed'], ['post', `/api/payments/retry/${id}`],
        ['get', '/api/enquiries/my'],
      ];
      for (const [method, url] of calls) {
        const res = await request(app)[method](url).send({});
        expect([method, url, res.status]).toEqual([method, url, 401]);
      }
    });

    it('a customer cannot make themselves an admin through any profile field', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', asCustomer)
        .send({ name: 'Mallory', role: 'superadmin', isActive: true, emailVerified: true, firebaseUid: 'x' });
      expect(res.status).toBe(200);
      const saved = await User.findById(customer._id);
      expect(saved.role).toBe('user');
      expect(saved.firebaseUid).toBe(customer.firebaseUid);
      expect(res.body.data.user.firebaseUid).toBeUndefined();

      // Signing in again with a "role" in the body changes nothing either
      const firebaseService = require('../../src/integrations/firebase/firebase.service');
      firebaseService.verifyIdToken.mockResolvedValue({ uid: customer.firebaseUid, email: customer.email, email_verified: true });
      const login = await request(app).post('/api/auth/login').set('Authorization', 'Bearer t').send({ name: 'M', role: 'admin' });
      expect(login.status).toBe(200);
      expect(login.body.data.user.role).toBe('user');
    });

    it('does not grant admin to an unverified allow-listed email', async () => {
      const firebaseService = require('../../src/integrations/firebase/firebase.service');
      firebaseService.verifyIdToken.mockResolvedValue({ uid: 'squatter', email: 'owner@example.com', email_verified: false });
      const res = await request(app).post('/api/auth/login').set('Authorization', 'Bearer t').send({});
      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('user');
    });

    it('activity log entries cannot be written or altered by clients', async () => {
      for (const auth of [asCustomer, asAdmin, asSuper]) {
        for (const method of ['post', 'put', 'patch', 'delete']) {
          const res = await request(app)[method]('/api/admin/activity').set('Authorization', auth).send({ action: 'forged', userName: 'Someone else' });
          expect([403, 404]).toContain(res.status);
        }
      }
      // A real change is attributed to the caller's own account, whatever the body says
      await request(app)
        .patch(`/api/admin/products/${A()}/stock`)
        .set('Authorization', asAdmin)
        .send({ stock: 7, userName: 'Someone else', user: superAdmin._id.toString() });
      await new Promise((r) => setTimeout(r, 100));
      const logs = await AuditLog.find();
      expect(logs).toHaveLength(1);
      expect(logs[0].user.toString()).toBe(admin._id.toString());
      expect(logs[0].userName).toBe(admin.name);
    });
  });

  // ─── One customer can never reach another customer's data ──────────────────
  describe('customer data isolation', () => {
    it('keeps orders, addresses, carts and enquiries private', async () => {
      const placed = await cod([{ productId: A(), quantity: 1 }]);
      const orderId = placed.body.data.order._id;
      await Cart.create({ user: customer._id, items: [{ product: cat.productB._id, quantity: 2 }] });

      const tries = [
        ['get', `/api/orders/${orderId}`, 404],
        ['get', `/api/orders/${orderId}/invoice`, 404],
        ['post', `/api/orders/${orderId}/cancel`, 404],
        ['post', `/api/payments/retry/${orderId}`, 404],
        ['put', `/api/addresses/${address._id}`, 404],
        ['delete', `/api/addresses/${address._id}`, 404],
        ['patch', `/api/addresses/${address._id}/default`, 404],
      ];
      for (const [method, url, expected] of tries) {
        const res = await request(app)[method](url).set('Authorization', asOther).send({ city: 'X', reason: 'x' });
        expect([url, res.status]).toEqual([url, expected]);
      }

      expect((await request(app).get('/api/orders/my').set('Authorization', asOther)).body.data.orders).toHaveLength(0);
      expect((await request(app).get('/api/addresses').set('Authorization', asOther)).body.data.addresses).toHaveLength(0);
      expect((await request(app).get('/api/cart').set('Authorization', asOther)).body.data.cart.items).toHaveLength(0);

      // ... and the owner's data is untouched
      expect((await Order.findById(orderId)).orderStatus).toBe('placed');
      expect((await Cart.findOne({ user: customer._id })).items).toHaveLength(1);
    });

    it('never sends staff notes or bookkeeping flags to the customer', async () => {
      const placed = await cod([{ productId: A(), quantity: 1 }]);
      const id = placed.body.data.order._id;
      await Order.updateOne({ _id: id }, { internalNotes: 'STOCK ISSUE: secret', needsAttention: true });
      await request(app).patch(`/api/admin/orders/${id}/status`).set('Authorization', asAdmin).send({ status: 'confirmed', note: 'Customer is difficult' });

      for (const res of [
        await request(app).get(`/api/orders/${id}`).set('Authorization', asCustomer),
        await request(app).get('/api/orders/my').set('Authorization', asCustomer),
      ]) {
        const text = JSON.stringify(res.body);
        expect(text).not.toContain('secret');
        expect(text).not.toContain('difficult');
        expect(text).not.toContain('needsAttention');
        expect(text).not.toContain('stockDeducted');
        expect(text).not.toContain(admin._id.toString());
      }
      // Staff still see them
      const staff = await request(app).get(`/api/admin/orders/${id}`).set('Authorization', asAdmin);
      expect(staff.body.data.order.internalNotes).toBe('STOCK ISSUE: secret');
    });
  });

  // ─── Cart and checkout: hostile input ──────────────────────────────────────
  describe('cart and checkout input', () => {
    it('rejects bad quantities and product ids in the cart', async () => {
      const add = (body) => request(app).post('/api/cart/items').set('Authorization', asCustomer).send(body);
      for (const quantity of [0, -1, 1.5, 11, 1e9, 'abc', null, { $gt: 0 }]) {
        const res = await add({ productId: A(), quantity });
        expect([JSON.stringify(quantity), res.status]).toEqual([JSON.stringify(quantity), 400]);
      }
      for (const productId of ['', 'nope', { $ne: null }, '../../etc/passwd', new mongoose.Types.ObjectId().toString()]) {
        const res = await add({ productId, quantity: 1 });
        expect([400, 404]).toContain(res.status);
      }
      expect(await Cart.countDocuments()).toBe(0);
    });

    it('refuses deleted, hidden and out-of-stock products at checkout', async () => {
      const gone = new mongoose.Types.ObjectId().toString();
      expect((await cod([{ productId: gone, quantity: 1 }])).status).toBe(400);

      await Product.updateOne({ _id: cat.productA._id }, { isActive: false });
      expect((await cod([{ productId: A(), quantity: 1 }])).status).toBe(400);

      await Product.updateOne({ _id: cat.productB._id }, { stock: 0 });
      expect((await cod([{ productId: B(), quantity: 1 }])).status).toBe(400);
      expect(await Order.countDocuments()).toBe(0);
    });

    it('rejects quantity 0, negative, fractional and oversized quantities at checkout', async () => {
      for (const quantity of [0, -5, 2.5, 11, 999999]) {
        const res = await cod([{ productId: A(), quantity }]);
        expect([quantity, res.status]).toEqual([quantity, 400]);
      }
      // The per-product limit cannot be dodged by repeating the line
      const split = await cod([{ productId: A(), quantity: 6 }, { productId: A(), quantity: 6 }]);
      expect(split.status).toBe(400);
      expect(await stockOf(A())).toBe(10);
    });

    it('ignores every price, total, tax, delivery and discount value sent by the browser', async () => {
      await Setting.create({ key: 'store', gstInclusive: false, gstPercent: 18, deliveryCharge: 500, freeDeliveryAbove: 100000 });
      await Coupon.create({ code: 'REAL10', discountType: 'percent', discountValue: 10, startsAt: new Date('2020-01-01'), expiresAt: new Date('2099-01-01') });

      const res = await cod(
        [{ productId: A(), quantity: 2, price: 1, mrp: 1, name: 'Free fridge' }],
        {
          couponCode: 'REAL10',
          itemsTotal: 1, totalAmount: 1, discount: 99999, deliveryCharge: 0, taxAmount: 0, gstPercent: 0, gstInclusive: true,
          paymentStatus: 'paid', orderStatus: 'delivered', user: other._id.toString(), stockDeducted: false,
          coupon: { discountValue: 100, discountType: 'percent' },
        }
      );
      expect(res.status).toBe(201);
      const order = await Order.findById(res.body.data.order._id);
      expect(order.items[0].price).toBe(1000);
      expect(order.items[0].name).toBe('Wine Chiller');
      expect(order.itemsTotal).toBe(2000);
      expect(order.discount).toBe(200);       // 10% from the database coupon
      expect(order.taxAmount).toBe(324);      // 18% of 1800
      expect(order.deliveryCharge).toBe(500);
      expect(order.totalAmount).toBe(2624);
      expect(order.paymentStatus).toBe('pending');
      expect(order.orderStatus).toBe('placed');
      expect(order.user.toString()).toBe(customer._id.toString());
    });

    it('rejects an invented or expired coupon and a malformed address', async () => {
      await Coupon.create({ code: 'OLD', discountType: 'flat', discountValue: 500, startsAt: new Date('2020-01-01'), expiresAt: new Date('2021-01-01') });
      expect((await cod([{ productId: A(), quantity: 1 }], { couponCode: 'FREE100' })).status).toBe(400);
      expect((await cod([{ productId: A(), quantity: 1 }], { couponCode: 'OLD' })).status).toBe(400);
      expect((await cod([{ productId: A(), quantity: 1 }], { couponCode: { $ne: '' } })).status).toBe(400);

      const inline = (shippingAddress) => checkout(asCustomer, { paymentMethod: 'cod', items: [{ productId: A(), quantity: 1 }], shippingAddress });
      const good = { fullName: 'T', phone: '9876543210', line1: 'x', city: 'Gandhinagar', state: 'Gujarat', pincode: '382021' };
      expect((await inline({ ...good, phone: '12345' })).status).toBe(400);
      expect((await inline({ ...good, pincode: '38202A' })).status).toBe(400);
      expect((await inline({ ...good, fullName: '' })).status).toBe(400);
      expect((await inline({ ...good, line1: 'x'.repeat(500) })).status).toBe(400);
      expect((await checkout(asCustomer, { paymentMethod: 'bitcoin', items: [{ productId: A(), quantity: 1 }], shippingAddress: good })).status).toBe(400);
      expect(await Order.countDocuments()).toBe(0);
      expect(await stockOf(A())).toBe(10);
    });

    it('never lets stock go below zero when two customers buy the last units together', async () => {
      const otherAddress = await makeAddress(other);
      const [one, two] = await Promise.all([
        cod([{ productId: B(), quantity: 2 }]),
        checkout(asOther, { addressId: otherAddress._id.toString(), paymentMethod: 'cod', items: [{ productId: B(), quantity: 2 }] }),
      ]);
      expect([one.status, two.status].sort()).toEqual([201, 400]);
      expect(await stockOf(B())).toBe(1);
      expect(await Order.countDocuments()).toBe(1);
    });
  });

  // ─── Order and payment state machine ───────────────────────────────────────
  describe('order and payment states', () => {
    const onlineOrder = async (quantity = 2) => {
      razorpay.orders.create.mockResolvedValue({ id: `order_rzp_${Math.random().toString(36).slice(2)}` });
      const res = await checkout(asCustomer, { addressId: address._id.toString(), paymentMethod: 'razorpay', items: [{ productId: A(), quantity }] });
      expect(res.status).toBe(201);
      return Order.findById(res.body.data.order._id);
    };

    it('gives customers no way to change an order or payment status', async () => {
      const placed = await cod([{ productId: A(), quantity: 1 }]);
      const id = placed.body.data.order._id;
      const attempts = [
        ['patch', `/api/orders/${id}`], ['put', `/api/orders/${id}`], ['patch', `/api/orders/${id}/status`],
        ['patch', `/api/orders/${id}/payment-status`], ['post', `/api/orders/${id}/pay`],
        ['patch', `/api/admin/orders/${id}/status`], ['patch', `/api/admin/orders/${id}/payment-status`], ['post', `/api/admin/orders/${id}/refund`],
      ];
      for (const [method, url] of attempts) {
        const res = await request(app)[method](url).set('Authorization', asCustomer).send({ status: 'delivered', paymentStatus: 'paid', orderStatus: 'delivered' });
        expect([403, 404]).toContain(res.status);
      }
      // A forged payment confirmation is refused
      const forged = await request(app).post('/api/payments/verify').set('Authorization', asCustomer)
        .send({ razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x', razorpay_signature: 'f'.repeat(64) });
      expect(forged.status).toBe(404);

      const order = await Order.findById(id);
      expect([order.orderStatus, order.paymentStatus]).toEqual(['placed', 'pending']);
    });

    it('refuses a payment confirmation with a wrong signature, and one for someone else\'s order', async () => {
      const order = await onlineOrder();
      const bad = await request(app).post('/api/payments/verify').set('Authorization', asCustomer)
        .send({ razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'deadbeef' });
      expect(bad.status).toBe(400);
      const notMine = await request(app).post('/api/payments/verify').set('Authorization', asOther)
        .send({ razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'deadbeef' });
      expect(notMine.status).toBe(403);
      expect((await Order.findById(order._id)).paymentStatus).toBe('pending');
      expect(await stockOf(A())).toBe(10);
    });

    it('takes stock exactly once when verification and webhooks arrive together', async () => {
      const order = await onlineOrder(2);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => paymentService.finalizePaidOrder(order, { razorpayPaymentId: `pay_same_${i % 2}` }))
      );
      expect(new Set(results.map((o) => o.paymentStatus))).toEqual(new Set(['paid']));
      expect(await stockOf(A())).toBe(8);
      const saved = await Order.findById(order._id);
      expect([saved.orderStatus, saved.paymentStatus, saved.stockDeducted]).toEqual(['confirmed', 'paid', true]);
      expect(saved.statusHistory.filter((h) => h.status === 'confirmed')).toHaveLength(1);
    });

    it('a "failed" report after payment, by API or webhook, changes nothing', async () => {
      const order = await onlineOrder();
      await paymentService.finalizePaidOrder(order, { razorpayPaymentId: 'pay_ok' });

      const viaApi = await request(app).post('/api/payments/failed').set('Authorization', asCustomer).send({ razorpay_order_id: order.razorpayOrderId });
      expect(viaApi.status).toBe(200);

      jest.spyOn(razorpayService, 'verifyWebhookSignature').mockReturnValue(true);
      const body = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_late', order_id: order.razorpayOrderId } } } });
      const viaWebhook = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', 'sig').send(body);
      expect(viaWebhook.status).toBe(200);

      const saved = await Order.findById(order._id);
      expect([saved.orderStatus, saved.paymentStatus]).toEqual(['confirmed', 'paid']);
      expect((await Payment.findOne({ razorpayOrderId: order.razorpayOrderId })).status).toBe('captured');
    });

    it('rejects webhooks without a valid signature', async () => {
      const order = await onlineOrder();
      const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_fake', order_id: order.razorpayOrderId } } } });
      const unsigned = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').send(body);
      expect(unsigned.status).toBe(400);
      const wrong = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', 'a'.repeat(64)).send(body);
      expect(wrong.status).toBe(400);
      expect((await Order.findById(order._id)).paymentStatus).toBe('pending');
    });

    it('a payment that arrives for a cancelled order is flagged for refund, not revived', async () => {
      const order = await onlineOrder(2);
      await request(app).post(`/api/orders/${order._id}/cancel`).set('Authorization', asCustomer).send({});
      await paymentService.finalizePaidOrder(order, { razorpayPaymentId: 'pay_late' });
      const saved = await Order.findById(order._id);
      expect([saved.orderStatus, saved.paymentStatus, saved.needsAttention]).toEqual(['cancelled', 'refund_pending', true]);
      expect(await stockOf(A())).toBe(10);
    });

    it('restores stock exactly once when a cancellation is sent many times at once', async () => {
      const placed = await cod([{ productId: A(), quantity: 4 }]);
      const id = placed.body.data.order._id;
      expect(await stockOf(A())).toBe(6);

      const results = await Promise.all([
        ...Array.from({ length: 4 }, () => request(app).post(`/api/orders/${id}/cancel`).set('Authorization', asCustomer).send({})),
        ...Array.from({ length: 4 }, () => request(app).patch(`/api/admin/orders/${id}/status`).set('Authorization', asAdmin).send({ status: 'cancelled' })),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await stockOf(A())).toBe(10);
      const saved = await Order.findById(id);
      expect(saved.statusHistory.filter((h) => h.status === 'cancelled')).toHaveLength(1);
      expect((await Product.findById(A())).soldCount).toBe(0);
    });

    it('does not let an admin create an impossible payment state', async () => {
      const placed = await cod([{ productId: A(), quantity: 1 }]);
      const id = placed.body.data.order._id;
      const pay = (paymentStatus) => request(app).patch(`/api/admin/orders/${id}/payment-status`).set('Authorization', asAdmin).send({ paymentStatus });

      for (const invalid of ['failed', 'refund_pending', 'captured', '', null]) {
        expect((await pay(invalid)).status).toBe(400);
      }
      expect((await pay('refunded')).status).toBe(400);      // nothing was paid
      expect((await pay('paid')).status).toBe(200);          // cash collected

      // Paid cash order cancelled → the cash is owed back, then recorded as returned
      await request(app).patch(`/api/admin/orders/${id}/status`).set('Authorization', asAdmin).send({ status: 'cancelled' });
      expect((await Order.findById(id)).paymentStatus).toBe('refund_pending');
      expect((await pay('paid')).status).toBe(400);
      expect((await pay('pending')).status).toBe(400);
      expect((await pay('refunded')).status).toBe(200);
      expect((await pay('paid')).status).toBe(400);
      expect((await Order.findById(id)).paymentStatus).toBe('refunded');
    });

    it('does not let a customer cancel once the order is dispatched', async () => {
      const placed = await cod([{ productId: A(), quantity: 1 }]);
      const id = placed.body.data.order._id;
      for (const status of ['confirmed', 'shipped']) {
        await request(app).patch(`/api/admin/orders/${id}/status`).set('Authorization', asAdmin).send({ status });
      }
      const res = await request(app).post(`/api/orders/${id}/cancel`).set('Authorization', asCustomer).send({});
      expect(res.status).toBe(400);
      expect(await stockOf(A())).toBe(9);
    });
  });

  // ─── Injection, search, errors ─────────────────────────────────────────────
  describe('injection and error handling', () => {
    it('search input cannot break or slow the query', async () => {
      const nasty = ['(a+)+$', '^(a|a)*$', '.*.*.*.*.*.*x', '[', '\\', '$where', '{"$gt":""}', 'a'.repeat(100), '%00', '<script>alert(1)</script>'];
      for (const search of nasty) {
        const started = Date.now();
        const res = await request(app).get('/api/products').query({ search });
        expect([search, res.status]).toEqual([search, 200]);
        expect(Date.now() - started).toBeLessThan(2000);
        const adminRes = await request(app).get('/api/admin/orders').query({ search }).set('Authorization', asAdmin);
        expect([search, adminRes.status]).toEqual([search, 200]);
        const users = await request(app).get('/api/admin/users').query({ search }).set('Authorization', asAdmin);
        expect([search, users.status]).toEqual([search, 200]);
      }
      expect((await request(app).get('/api/products').query({ search: 'a'.repeat(101) })).status).toBe(400);
      // Still friendly: case-insensitive, partial model numbers
      const found = await request(app).get('/api/products').query({ search: 'ewg' });
      expect(found.body.data.products.map((p) => p.model)).toEqual(['EWG 51 D']);
    });

    it('query operators in parameters are not interpreted', async () => {
      const res = await request(app).get('/api/products?category[$ne]=x&brand[$regex]=.*');
      expect([200, 400]).toContain(res.status);
      const slug = await request(app).get('/api/products/%7B%22%24ne%22%3Anull%7D');
      expect(slug.status).toBe(404);
      const body = await request(app).post('/api/enquiries').send({ name: { $ne: '' }, email: { $gt: '' }, phone: '9811122233' });
      expect(body.status).toBe(400);
    });

    it('errors never include stack traces, file paths or database details', async () => {
      const responses = [
        await request(app).get('/api/nope'),
        await request(app).get('/api/orders/not-an-id').set('Authorization', asCustomer),
        await request(app).post('/api/orders/checkout').set('Authorization', asCustomer).set('Content-Type', 'application/json').send('{"broken'),
        await request(app).post('/api/admin/products').set('Authorization', asAdmin).send({ name: 'x', category: 'bad', price: 'abc' }),
        await request(app).get('/api/products').set('Origin', 'https://evil.example'),
      ];
      jest.spyOn(Product, 'find').mockImplementation(() => { throw new Error('connect ECONNREFUSED mongodb://admin:hunter2@db.internal:27017'); });
      responses.push(await request(app).get('/api/products/featured'));

      for (const res of responses) {
        const text = JSON.stringify(res.body);
        expect(res.body.success).toBe(false);
        expect(res.body.stack).toBeUndefined();
        expect(text).not.toMatch(/node_modules|\.js:\d+|at Object\.|hunter2|ECONNREFUSED|mongodb:\/\/|MongoServerError|C:\\\\|\/src\//);
      }
      expect(responses[responses.length - 1].status).toBe(500);
      expect(responses[responses.length - 1].body.message).toBe('Something went wrong on our side. Please try again.');
      expect(responses[4].status).toBe(403);
    });

    it('stores markup as plain text and validates admin-entered data', async () => {
      const enquiry = await request(app).post('/api/enquiries').send({ name: '<img src=x onerror=alert(1)>', email: 'x@example.com', phone: '9811122233', message: '<script>1</script>' });
      expect(enquiry.status).toBe(201); // kept as text; the UI never renders it as HTML

      const product = (body) => request(app).post('/api/admin/products').set('Authorization', asAdmin).send({ name: 'P', category: cat.category._id.toString(), price: 10, mrp: 10, ...body });
      for (const bad of [{ price: -1 }, { stock: -3 }, { stock: 1.5 }, { price: 20, mrp: 10 }, { name: '' }, { name: 'x'.repeat(300) }, { category: 'nope' }, { sku: 'x'.repeat(100) }, { specs: 'not json' }, { tempClass: 'Lukewarm' }, { temp: { min: 10, max: 2 } }]) {
        const res = await product(bad);
        expect([JSON.stringify(bad).slice(0, 40), res.status]).toEqual([JSON.stringify(bad).slice(0, 40), 400]);
      }

      const coupon = (body) => request(app).post('/api/admin/coupons').set('Authorization', asAdmin).send({ code: 'OK10', discountType: 'percent', discountValue: 10, expiresAt: '2099-01-01', ...body });
      for (const bad of [{ code: 'has space' }, { code: '' }, { discountValue: -5 }, { discountValue: 150 }, { discountType: 'bogus' }, { expiresAt: 'never' }, { category: 'nope' }, { perUserLimit: 0 }]) {
        expect([JSON.stringify(bad), (await coupon(bad)).status]).toEqual([JSON.stringify(bad), 400]);
      }

      const banner = (body) => request(app).post('/api/admin/banners').set('Authorization', asAdmin).send({ title: 'T', product: A(), ...body });
      for (const bad of [{ title: '' }, { product: 'nope' }, { product: new mongoose.Types.ObjectId().toString() }, { tone: 'neon' }, { facts: ['a', 'b', 'c', 'd', 'e'] }]) {
        expect([JSON.stringify(bad), (await banner(bad)).status]).toEqual([JSON.stringify(bad), 400]);
      }

      const settings = (body) => request(app).put('/api/admin/settings').set('Authorization', asSuper).send(body);
      for (const bad of [{ supportEmail: 'not-an-email' }, { gstin: 'SHORT' }, { gstPercent: -1 }, { deliveryCharge: -10 }, { storeName: '' }, { unknownField: 1 }, { serviceAreas: 'Gandhinagar' }]) {
        expect([JSON.stringify(bad), (await settings(bad)).status]).toEqual([JSON.stringify(bad), 400]);
      }

      const profile = (body) => request(app).put('/api/users/profile').set('Authorization', asCustomer).send(body);
      for (const bad of [{ name: '' }, { phone: '12345' }, { gstin: 'bad' }, { name: 'x'.repeat(200) }]) {
        expect([JSON.stringify(bad), (await profile(bad)).status]).toEqual([JSON.stringify(bad), 400]);
      }
    });
  });

  // ─── Uploads ───────────────────────────────────────────────────────────────
  describe('image uploads', () => {
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const upload = (auth, buffer, filename, contentType) =>
      request(app).post(`/api/admin/products/${A()}/images`).set('Authorization', auth).attach('images', buffer, { filename, contentType });

    it('rejects files that are not really images, and leaves nothing on disk', async () => {
      const before = uploadCount();
      const cases = [
        [Buffer.from('<?php system($_GET["c"]); ?>'), 'shell.png', 'image/png'],         // script renamed to .png
        [Buffer.from('<html><script>alert(1)</script></html>'), 'page.jpg', 'image/jpeg'],
        [PNG, 'real.png.php', 'image/png'],                                               // double extension
        [PNG, 'photo.svg', 'image/svg+xml'],
        [PNG, 'photo.gif', 'image/gif'],
        [PNG, 'photo.jpg', 'image/jpeg'],                                                 // PNG bytes claiming to be JPEG
        [PNG, '../../../evil.png', 'text/html'],
        [Buffer.alloc(5 * 1024 * 1024 + 10, 1), 'huge.png', 'image/png'],                 // over 5 MB
      ];
      for (const [buffer, filename, type] of cases) {
        const res = await upload(asAdmin, buffer, filename, type);
        expect([filename, res.status]).toEqual([filename, 400]);
      }
      await new Promise((r) => setTimeout(r, 150)); // cleanup runs after the response
      expect(uploadCount()).toBe(before);
      expect((await Product.findById(A())).images).toHaveLength(0);
    });

    it('stores an accepted image under a random name inside the uploads folder only', async () => {
      const before = uploadCount();
      const res = await upload(asAdmin, PNG, '../../../../etc/cron.d/evil.png', 'image/png');
      expect(res.status).toBe(200);
      const image = res.body.data.product.images[0];
      const name = path.basename(image.url);
      expect(name).toMatch(/^[0-9a-f]{32}\.png$/);
      expect(fs.existsSync(path.join(UPLOADS, name))).toBe(true);
      expect(uploadCount()).toBe(before + 1);

      // Served as an image, never sniffed as anything else; no directory listing or traversal
      const served = await request(app).get(`/uploads/${name}`);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect((await request(app).get('/uploads/')).status).toBe(404);
      expect((await request(app).get('/uploads/..%2F.env')).status).toBe(404);
      expect((await request(app).get('/uploads/%2e%2e/package.json')).status).toBe(404);

      // A forged image reference cannot delete files outside the uploads folder
      await Product.updateOne({ _id: A() }, { $push: { images: { url: 'x', publicId: 'local:../package.json' } } });
      const forged = (await Product.findById(A())).images[1];
      await request(app).delete(`/api/admin/products/${A()}/images/${forged._id}`).set('Authorization', asAdmin);
      expect(fs.existsSync(path.join(__dirname, '..', '..', 'package.json'))).toBe(true);

      const del = await request(app).delete(`/api/admin/products/${A()}/images/${image._id}`).set('Authorization', asAdmin);
      expect(del.status).toBe(200);
      expect(fs.existsSync(path.join(UPLOADS, name))).toBe(false);
    });

    it('needs an admin to upload', async () => {
      const before = uploadCount();
      expect((await upload(asCustomer, PNG, 'a.png', 'image/png')).status).toBe(403);
      expect((await request(app).post(`/api/admin/products/${A()}/images`).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(401);
      await new Promise((r) => setTimeout(r, 100));
      expect(uploadCount()).toBe(before);
    });
  });

  // ─── Policies: only what the business has written ──────────────────────────
  describe('policy pages', () => {
    it('are unpublished until the business enters the text', async () => {
      expect((await request(app).get('/api/settings/policies/privacy')).status).toBe(404);
      expect((await request(app).get('/api/settings')).body.data.settings.policies).toEqual({ privacy: false, terms: false, shipping: false, returns: false });

      expect((await request(app).put('/api/admin/settings').set('Authorization', asAdmin).send({ privacyPolicy: 'x' })).status).toBe(403);
      await request(app).put('/api/admin/settings').set('Authorization', asSuper).send({ privacyPolicy: 'Approved privacy text.' });

      const page = await request(app).get('/api/settings/policies/privacy');
      expect(page.body.data.policy.content).toBe('Approved privacy text.');
      const pub = (await request(app).get('/api/settings')).body.data.settings;
      expect(pub.policies.privacy).toBe(true);
      expect(pub.privacyPolicy).toBeUndefined();
      expect((await request(app).get('/api/settings/policies/__proto__')).status).toBe(404);
      expect((await request(app).get('/api/settings/policies/storeName')).status).toBe(404);
    });
  });
});
