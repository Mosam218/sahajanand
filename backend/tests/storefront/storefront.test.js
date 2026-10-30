const request = require('supertest');
const { app, setupTestDB, teardownTestDB, clearTestDB } = require('../setup');
const razorpay = require('../../src/config/razorpay');
const { Product, Order, Coupon, Cart, Enquiry, Setting } = require('../../src/models');
const { makeUser, tokensFor, makeCatalogue, makeAddress } = require('../helpers');

describe('Storefront API', () => {
  let customer, other, admin, asCustomer, asOther, asAdmin, cat, address;

  beforeAll(setupTestDB);
  afterAll(teardownTestDB);

  beforeEach(async () => {
    customer = await makeUser('user');
    other = await makeUser('user');
    admin = await makeUser('admin');
    [asCustomer, asOther, asAdmin] = tokensFor(customer, other, admin);
    cat = await makeCatalogue();
    address = await makeAddress(customer);
  });

  afterEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  const A = () => cat.productA._id.toString();
  const B = () => cat.productB._id.toString();

  describe('health', () => {
    it('reports the API and database as up', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.db).toBe('connected');
    });

    it('answers unknown routes with a JSON 404 and no stack trace', async () => {
      const res = await request(app).get('/api/nope');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.stack).toBeUndefined();
    });
  });

  describe('catalogue', () => {
    it('treats search text literally (no regex injection)', async () => {
      const res = await request(app).get('/api/products').query({ search: '((((.*' });
      expect(res.status).toBe(200);
      expect(res.body.data.products).toHaveLength(0);
    });

    it('finds a product by model number and returns its series and related products', async () => {
      const list = await request(app).get('/api/products').query({ search: 'EWG' });
      expect(list.body.data.products.map((p) => p.model)).toEqual(['EWG 51 D']);

      const one = await request(app).get('/api/products/ewg-51-d');
      expect(one.status).toBe(200);
      expect(one.body.data.product.category.slug).toBe('bar-refrigeration');
      expect(Array.isArray(one.body.data.variants)).toBe(true);
      expect(Array.isArray(one.body.data.relatedProducts)).toBe(true);
    });

    it('reads inStock=false as false', async () => {
      await Product.updateOne({ _id: cat.productB._id }, { stock: 0 });
      const all = await request(app).get('/api/products').query({ inStock: 'false' });
      expect(all.body.data.products).toHaveLength(2);
      const inStock = await request(app).get('/api/products').query({ inStock: 'true' });
      expect(inStock.body.data.products).toHaveLength(1);
    });

    it('rejects an out-of-range page size', async () => {
      const res = await request(app).get('/api/products').query({ limit: 5000 });
      expect(res.status).toBe(400);
    });
  });

  describe('cart', () => {
    it('adds, changes and removes items, and never exceeds stock', async () => {
      const add = await request(app).post('/api/cart/items').set('Authorization', asCustomer).send({ productId: B(), quantity: 2 });
      expect(add.status).toBe(200);
      expect(add.body.data.cart.items[0].quantity).toBe(2);
      expect(add.body.data.cart.cartTotal).toBe(4000);

      // Only 3 in stock: asking for 5 more stops at 3
      const more = await request(app).post('/api/cart/items').set('Authorization', asCustomer).send({ productId: B(), quantity: 5 });
      expect(more.body.data.cart.items[0].quantity).toBe(3);
      const full = await request(app).post('/api/cart/items').set('Authorization', asCustomer).send({ productId: B(), quantity: 1 });
      expect(full.status).toBe(400);

      const tooMany = await request(app).put(`/api/cart/items/${B()}`).set('Authorization', asCustomer).send({ quantity: 9 });
      expect(tooMany.status).toBe(400);
      const less = await request(app).put(`/api/cart/items/${B()}`).set('Authorization', asCustomer).send({ quantity: 1 });
      expect(less.body.data.cart.items[0].quantity).toBe(1);

      const bad = await request(app).post('/api/cart/items').set('Authorization', asCustomer).send({ productId: B(), quantity: -3 });
      expect(bad.status).toBe(400);

      const removed = await request(app).delete(`/api/cart/items/${B()}`).set('Authorization', asCustomer);
      expect(removed.body.data.cart.items).toHaveLength(0);
    });

    it('merging a guest cart twice does not double the quantities', async () => {
      const merge = () =>
        request(app).post('/api/cart/merge').set('Authorization', asCustomer).send({ items: [{ productId: A(), quantity: 2 }] });
      await merge();
      const second = await merge();
      expect(second.body.data.cart.items[0].quantity).toBe(2);
    });

    it('requires sign-in', async () => {
      expect((await request(app).get('/api/cart')).status).toBe(401);
    });
  });

  describe('checkout pricing', () => {
    it('quotes the same totals the order is then created with (GST added on top)', async () => {
      await Setting.create({ key: 'store', gstInclusive: false, gstPercent: 18, deliveryCharge: 500, freeDeliveryAbove: 10000 });
      const items = [{ productId: A(), quantity: 2 }, { productId: B(), quantity: 1 }];

      const quote = await request(app).post('/api/orders/quote').set('Authorization', asCustomer).send({ items });
      expect(quote.status).toBe(200);
      const q = quote.body.data.quote;
      expect(q.itemsTotal).toBe(4000);
      expect(q.taxAmount).toBe(720);
      expect(q.deliveryCharge).toBe(500);
      expect(q.totalAmount).toBe(5220);

      const order = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', asCustomer)
        .send({ addressId: address._id.toString(), paymentMethod: 'cod', items });
      expect(order.status).toBe(201);
      expect(order.body.data.order.totalAmount).toBe(5220);
      expect(order.body.data.order.taxAmount).toBe(720);
      expect(order.body.data.order.gstInclusive).toBe(false);
    });

    it('a quote reports unavailable items and a bad coupon without failing', async () => {
      await Product.updateOne({ _id: cat.productB._id }, { stock: 0 });
      const res = await request(app)
        .post('/api/orders/quote')
        .set('Authorization', asCustomer)
        .send({ items: [{ productId: A(), quantity: 1 }, { productId: B(), quantity: 1 }], couponCode: 'NOPE' });
      expect(res.status).toBe(200);
      expect(res.body.data.quote.items).toHaveLength(1);
      expect(res.body.data.quote.itemErrors).toHaveLength(1);
      expect(res.body.data.quote.couponError).toBe('Invalid coupon code');
      expect(res.body.data.quote.discount).toBe(0);
    });

    it('a category coupon only discounts that category', async () => {
      await Coupon.create({
        code: 'BAR10', discountType: 'percent', discountValue: 10, category: cat.category._id,
        startsAt: new Date('2020-01-01'), expiresAt: new Date('2099-01-01'),
      });
      const both = await request(app)
        .post('/api/orders/quote')
        .set('Authorization', asCustomer)
        .send({ items: [{ productId: A(), quantity: 2 }, { productId: B(), quantity: 1 }], couponCode: 'bar10' });
      expect(both.body.data.quote.discount).toBe(200); // 10% of the bar items (2000) only

      const none = await request(app)
        .post('/api/orders/quote')
        .set('Authorization', asCustomer)
        .send({ items: [{ productId: B(), quantity: 1 }], couponCode: 'BAR10' });
      expect(none.body.data.quote.couponError).toMatch(/only valid for Bar Refrigeration/);
    });

    it('counts a coupon when the order is placed and gives it back on cancellation', async () => {
      await Coupon.create({
        code: 'ONCE', discountType: 'flat', discountValue: 100, perUserLimit: 1,
        startsAt: new Date('2020-01-01'), expiresAt: new Date('2099-01-01'),
      });
      const place = () =>
        request(app)
          .post('/api/orders/checkout')
          .set('Authorization', asCustomer)
          .send({ addressId: address._id.toString(), paymentMethod: 'cod', items: [{ productId: A(), quantity: 1 }], couponCode: 'ONCE' });

      const first = await place();
      expect(first.status).toBe(201);
      expect((await Coupon.findOne({ code: 'ONCE' })).usedCount).toBe(1);
      expect((await place()).status).toBe(400); // per-customer limit reached

      await request(app).post(`/api/orders/${first.body.data.order._id}/cancel`).set('Authorization', asCustomer).send({});
      expect((await Coupon.findOne({ code: 'ONCE' })).usedCount).toBe(0);
      expect((await place()).status).toBe(201);
    });

    it('only removes the purchased items from the cart', async () => {
      await Cart.create({ user: customer._id, items: [{ product: cat.productA._id, quantity: 1 }, { product: cat.productB._id, quantity: 1 }] });
      await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', asCustomer)
        .send({ addressId: address._id.toString(), paymentMethod: 'cod', items: [{ productId: A(), quantity: 1 }] });
      const cart = await Cart.findOne({ user: customer._id });
      expect(cart.items.map((i) => i.product.toString())).toEqual([B()]);
    });

    it('does not leave an order behind when the payment gateway fails', async () => {
      razorpay.orders.create.mockRejectedValue(new Error('gateway down'));
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', asCustomer)
        .send({ addressId: address._id.toString(), paymentMethod: 'razorpay', items: [{ productId: A(), quantity: 1 }] });
      expect(res.status).toBe(502);
      expect(await Order.countDocuments()).toBe(0);
    });

    it('rejects an address that belongs to someone else', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', asOther)
        .send({ addressId: address._id.toString(), paymentMethod: 'cod', items: [{ productId: A(), quantity: 1 }] });
      expect(res.status).toBe(404);
    });
  });

  describe('orders', () => {
    it('shows an order to its owner and to admins, and to nobody else', async () => {
      const placed = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', asCustomer)
        .send({ addressId: address._id.toString(), paymentMethod: 'cod', items: [{ productId: A(), quantity: 1 }] });
      const id = placed.body.data.order._id;

      expect((await request(app).get(`/api/orders/${id}`).set('Authorization', asCustomer)).status).toBe(200);
      expect((await request(app).get(`/api/orders/${id}`).set('Authorization', asAdmin)).status).toBe(200);
      expect((await request(app).get(`/api/orders/${id}`).set('Authorization', asOther)).status).toBe(404);
      expect((await request(app).post(`/api/orders/${id}/cancel`).set('Authorization', asOther).send({})).status).toBe(404);
      expect((await request(app).get(`/api/orders/${id}/invoice`).set('Authorization', asOther)).status).toBe(404);

      const mine = await request(app).get('/api/orders/my').set('Authorization', asCustomer);
      expect(mine.body.data.orders).toHaveLength(1);
      const theirs = await request(app).get('/api/orders/my').set('Authorization', asOther);
      expect(theirs.body.data.orders).toHaveLength(0);
    });

    it('a late "payment failed" report cannot undo a paid order', async () => {
      const order = await Order.create({
        orderNumber: 'SEL-TEST-000001', user: customer._id,
        items: [{ product: cat.productA._id, name: 'Wine Chiller', price: 1000, mrp: 1000, quantity: 1 }],
        shippingAddress: { fullName: 'T', phone: '9876543210', line1: 'x', city: 'Gandhinagar', state: 'Gujarat', pincode: '382021' },
        itemsTotal: 1000, totalAmount: 1000, paymentMethod: 'razorpay', paymentStatus: 'paid', orderStatus: 'confirmed',
        razorpayOrderId: 'order_paid_1',
      });
      const res = await request(app)
        .post('/api/payments/failed')
        .set('Authorization', asCustomer)
        .send({ razorpay_order_id: 'order_paid_1' });
      expect(res.status).toBe(200);
      expect((await Order.findById(order._id)).paymentStatus).toBe('paid');
    });
  });

  describe('addresses', () => {
    it('validates addresses and keeps them private to their owner', async () => {
      const bad = await request(app).post('/api/addresses').set('Authorization', asCustomer).send({ fullName: 'X', phone: '123', line1: 'a', city: 'b', state: 'c', pincode: '12' });
      expect(bad.status).toBe(400);
      expect(bad.body.errors.map((e) => e.field).sort()).toEqual(['phone', 'pincode']);

      const stolen = await request(app).put(`/api/addresses/${address._id}`).set('Authorization', asOther).send({ city: 'Surat' });
      expect(stolen.status).toBe(404);
      const deleted = await request(app).delete(`/api/addresses/${address._id}`).set('Authorization', asOther);
      expect(deleted.status).toBe(404);
    });
  });

  describe('enquiries', () => {
    const enquiry = { name: 'Kavita Menon', email: 'kavita@example.com', phone: '98450 11223', product: 'EIM 101', quantity: 2, message: 'Need two ice machines.' };

    it('accepts a quote request from a guest', async () => {
      const res = await request(app).post('/api/enquiries').send(enquiry);
      expect(res.status).toBe(201);
      expect(res.body.data.enquiry.reference).toMatch(/^ENQ-[0-9A-F]{8}$/);
      const saved = await Enquiry.findOne({ reference: res.body.data.enquiry.reference });
      expect(saved.user).toBeNull();
      expect(saved.status).toBe('new');
    });

    it('rejects an incomplete quote request', async () => {
      const res = await request(app).post('/api/enquiries').send({ ...enquiry, email: 'nope', phone: '12' });
      expect(res.status).toBe(400);
      expect(res.body.errors.map((e) => e.field).sort()).toEqual(['email', 'phone']);
    });

    it('links a signed-in customer\'s enquiry to their account, hiding internal notes', async () => {
      const sent = await request(app).post('/api/enquiries').set('Authorization', asCustomer).send(enquiry);
      const saved = await Enquiry.findOne({ reference: sent.body.data.enquiry.reference });

      const update = await request(app)
        .patch(`/api/admin/enquiries/${saved._id}`)
        .set('Authorization', asAdmin)
        .send({ status: 'quoted', notes: 'Offered 8% volume discount' });
      expect(update.status).toBe(200);

      const mine = await request(app).get('/api/enquiries/my').set('Authorization', asCustomer);
      expect(mine.body.data.enquiries).toHaveLength(1);
      expect(mine.body.data.enquiries[0].status).toBe('quoted');
      expect(mine.body.data.enquiries[0].notes).toBeUndefined();

      const theirs = await request(app).get('/api/enquiries/my').set('Authorization', asOther);
      expect(theirs.body.data.enquiries).toHaveLength(0);

      const adminList = await request(app).get('/api/admin/enquiries?status=quoted&search=kavita').set('Authorization', asAdmin);
      expect(adminList.body.data.enquiries).toHaveLength(1);
      expect(adminList.body.data.enquiries[0].notes).toBe('Offered 8% volume discount');
    });
  });

  describe('public content', () => {
    it('serves settings, storefront coupons and banners without sign-in', async () => {
      await Coupon.create({ code: 'SHOWN', discountType: 'flat', discountValue: 100, showOnStorefront: true, startsAt: new Date('2020-01-01'), expiresAt: new Date('2099-01-01') });
      await Coupon.create({ code: 'HIDDEN', discountType: 'flat', discountValue: 100, startsAt: new Date('2020-01-01'), expiresAt: new Date('2099-01-01') });

      const settings = await request(app).get('/api/settings');
      expect(settings.body.data.settings.storeName).toBe('Sahajanand Electronics');
      expect(settings.body.data.settings.serviceAreas).toEqual(['Gandhinagar', 'Ahmedabad']);

      const coupons = await request(app).get('/api/coupons');
      expect(coupons.body.data.coupons.map((c) => c.code)).toEqual(['SHOWN']);
      expect(coupons.body.data.coupons[0].usedBy).toBeUndefined();

      const banners = await request(app).get('/api/banners');
      expect(banners.status).toBe(200);
      expect(banners.body.data.banners).toEqual([]);
    });
  });
});
