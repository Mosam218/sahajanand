const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app, setupTestDB, teardownTestDB, clearTestDB } = require('../setup');
const razorpay = require('../../src/config/razorpay');
const { Product, Order, AuditLog, User } = require('../../src/models');
const { makeUser, tokensFor, makeCatalogue, makeAddress } = require('../helpers');

// Smallest valid PNG (1×1 pixel)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const UPLOADS = path.join(__dirname, '..', '..', 'uploads');

describe('Admin API', () => {
  let customer, admin, superAdmin, asCustomer, asAdmin, asSuper, cat;

  beforeAll(setupTestDB);
  afterAll(teardownTestDB);

  beforeEach(async () => {
    customer = await makeUser('user');
    admin = await makeUser('admin');
    superAdmin = await makeUser('superadmin');
    [asCustomer, asAdmin, asSuper] = tokensFor(customer, admin, superAdmin);
    cat = await makeCatalogue();
  });

  afterEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  const placeCodOrder = async (items) => {
    const address = await makeAddress(customer);
    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', asCustomer)
      .send({ addressId: address._id.toString(), paymentMethod: 'cod', items });
    expect(res.status).toBe(201);
    return res.body.data.order;
  };

  describe('authorization', () => {
    const adminCalls = [
      ['get', '/api/admin/dashboard'],
      ['get', '/api/admin/orders'],
      ['get', '/api/admin/users'],
      ['get', '/api/admin/products'],
      ['get', '/api/admin/enquiries'],
      ['get', '/api/admin/settings'],
      ['post', '/api/admin/products'],
      ['put', '/api/admin/settings'],
      ['get', '/api/admin/activity'],
    ];

    it('rejects requests without a token', async () => {
      for (const [method, url] of adminCalls) {
        const res = await request(app)[method](url);
        expect([method, url, res.status]).toEqual([method, url, 401]);
      }
    });

    it('rejects a signed-in customer on every admin endpoint', async () => {
      for (const [method, url] of adminCalls) {
        const res = await request(app)[method](url).set('Authorization', asCustomer).send({});
        expect([method, url, res.status]).toEqual([method, url, 403]);
      }
    });

    it('rejects a deactivated admin', async () => {
      await User.updateOne({ _id: admin._id }, { isActive: false });
      const res = await request(app).get('/api/admin/dashboard').set('Authorization', asAdmin);
      expect(res.status).toBe(403);
    });

    it('lets only a super admin change roles and settings', async () => {
      const roleAsAdmin = await request(app)
        .patch(`/api/admin/users/${customer._id}/role`)
        .set('Authorization', asAdmin)
        .send({ role: 'admin' });
      expect(roleAsAdmin.status).toBe(403);

      const settingsAsAdmin = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', asAdmin)
        .send({ storeName: 'Hacked' });
      expect(settingsAsAdmin.status).toBe(403);

      const roleAsSuper = await request(app)
        .patch(`/api/admin/users/${customer._id}/role`)
        .set('Authorization', asSuper)
        .send({ role: 'admin' });
      expect(roleAsSuper.status).toBe(200);
      expect(roleAsSuper.body.data.user.role).toBe('admin');

      const own = await request(app)
        .patch(`/api/admin/users/${superAdmin._id}/role`)
        .set('Authorization', asSuper)
        .send({ role: 'user' });
      expect(own.status).toBe(400);
    });

    it('does not let an admin deactivate another admin', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${superAdmin._id}/status`)
        .set('Authorization', asAdmin)
        .send({ isActive: false });
      expect(res.status).toBe(403);
    });
  });

  describe('settings', () => {
    it('saves settings and shows them on the public endpoint', async () => {
      const res = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', asSuper)
        .send({ supportPhone: '+91 98765 43210', deliveryCharge: 750, gstInclusive: false });
      expect(res.status).toBe(200);

      const pub = await request(app).get('/api/settings');
      expect(pub.status).toBe(200);
      expect(pub.body.data.settings.supportPhone).toBe('+91 98765 43210');
      expect(pub.body.data.settings.deliveryCharge).toBe(750);
      expect(pub.body.data.settings.gstInclusive).toBe(false);
      expect(pub.body.data.settings.paymentMethods).toEqual({ cod: true, razorpay: true });
    });

    it('rejects unknown or invalid settings', async () => {
      const res = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', asSuper)
        .send({ gstPercent: 250 });
      expect(res.status).toBe(400);
    });
  });

  describe('dashboard', () => {
    it('reports product, order, stock and customer metrics', async () => {
      await Product.updateOne({ _id: cat.productB._id }, { stock: 0 });
      await placeCodOrder([{ productId: cat.productA._id.toString(), quantity: 8 }]); // leaves 2: low stock

      const res = await request(app).get('/api/admin/dashboard').set('Authorization', asAdmin);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.totalProducts).toBe(2);
      expect(d.activeProducts).toBe(2);
      expect(d.outOfStockCount).toBe(1);
      expect(d.lowStockCount).toBe(1);
      expect(d.totalOrders).toBe(1);
      expect(d.pendingOrders).toBe(1);
      expect(d.completedOrders).toBe(0);
      expect(d.cancelledOrders).toBe(0);
      expect(d.totalCustomers).toBe(1);
      expect(d.recentOrders).toHaveLength(1);
    });
  });

  describe('products', () => {
    const base = () => ({ name: 'Back Bar', model: 'EBB 2D', category: cat.category._id.toString(), price: 5000, mrp: 6000, stock: 4 });

    it('creates, edits, restocks, hides and deletes a product', async () => {
      const created = await request(app).post('/api/admin/products').set('Authorization', asAdmin).send(base());
      expect(created.status).toBe(201);
      const id = created.body.data.product._id;
      expect(created.body.data.product.slug).toBe('ebb-2d');

      // Editing one field must not reset the others to their defaults
      const edited = await request(app)
        .put(`/api/admin/products/${id}`)
        .set('Authorization', asAdmin)
        .send({ price: 5500, name: 'Back Bar Cooler' });
      expect(edited.status).toBe(200);
      expect(edited.body.data.product.price).toBe(5500);
      expect(edited.body.data.product.stock).toBe(4);
      expect(edited.body.data.product.model).toBe('EBB 2D');
      expect(edited.body.data.product.slug).toBe('ebb-2d'); // link survives a rename

      const stock = await request(app)
        .patch(`/api/admin/products/${id}/stock`)
        .set('Authorization', asAdmin)
        .send({ stock: 12 });
      expect(stock.body.data.product.stock).toBe(12);

      const negative = await request(app)
        .patch(`/api/admin/products/${id}/stock`)
        .set('Authorization', asAdmin)
        .send({ stock: -1 });
      expect(negative.status).toBe(400);

      // Visible on the storefront, then hidden
      expect((await request(app).get('/api/products/ebb-2d')).status).toBe(200);
      const toggled = await request(app).patch(`/api/admin/products/${id}/toggle`).set('Authorization', asAdmin);
      expect(toggled.body.data.product.isActive).toBe(false);
      expect((await request(app).get('/api/products/ebb-2d')).status).toBe(404);

      const deleted = await request(app).delete(`/api/admin/products/${id}`).set('Authorization', asAdmin);
      expect(deleted.status).toBe(200);
      expect(deleted.body.data.archived).toBe(false);
      expect(await Product.findById(id)).toBeNull();
    });

    it('archives instead of deleting a product that has orders', async () => {
      await placeCodOrder([{ productId: cat.productA._id.toString(), quantity: 1 }]);
      const res = await request(app).delete(`/api/admin/products/${cat.productA._id}`).set('Authorization', asAdmin);
      expect(res.status).toBe(200);
      expect(res.body.data.archived).toBe(true);
      expect((await Product.findById(cat.productA._id)).isActive).toBe(false);
    });

    it('allows several products without a SKU', async () => {
      const a = await request(app).post('/api/admin/products').set('Authorization', asAdmin).send({ ...base(), model: 'M1' });
      const b = await request(app).post('/api/admin/products').set('Authorization', asAdmin).send({ ...base(), model: 'M2' });
      expect([a.status, b.status]).toEqual([201, 201]);
    });

    it('filters the inventory by stock level', async () => {
      await Product.updateOne({ _id: cat.productB._id }, { stock: 0 });
      const out = await request(app).get('/api/admin/products?stockStatus=out').set('Authorization', asAdmin);
      expect(out.body.data.products.map((p) => p.model)).toEqual(['EIM 101']);
      const low = await request(app).get('/api/admin/products?stockStatus=low').set('Authorization', asAdmin);
      expect(low.body.data.products).toHaveLength(0);
      expect(out.body.meta.total).toBe(1);
    });

    it('accepts an image upload and refuses anything that is not an image', async () => {
      const ok = await request(app)
        .post(`/api/admin/products/${cat.productA._id}/images`)
        .set('Authorization', asAdmin)
        .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
      expect(ok.status).toBe(200);
      const image = ok.body.data.product.images[0];
      expect(image.url).toMatch(/\/uploads\/[0-9a-f]{32}\.png$/);
      const stored = path.join(UPLOADS, path.basename(image.url));
      expect(fs.existsSync(stored)).toBe(true);

      const before = fs.readdirSync(UPLOADS).length;
      const svg = await request(app)
        .post(`/api/admin/products/${cat.productA._id}/images`)
        .set('Authorization', asAdmin)
        .attach('images', Buffer.from('<svg onload="alert(1)"/>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
      expect(svg.status).toBe(400);

      const disguised = await request(app)
        .post(`/api/admin/products/${cat.productA._id}/images`)
        .set('Authorization', asAdmin)
        .attach('images', Buffer.from('<?php echo 1;'), { filename: 'shell.php', contentType: 'image/png' });
      expect(disguised.status).toBe(400);
      expect(fs.readdirSync(UPLOADS).length).toBe(before);

      const notAdmin = await request(app)
        .post(`/api/admin/products/${cat.productA._id}/images`)
        .set('Authorization', asCustomer)
        .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
      expect(notAdmin.status).toBe(403);
      expect(fs.readdirSync(UPLOADS).length).toBe(before);

      // Deleting the image removes the stored file too
      const del = await request(app)
        .delete(`/api/admin/products/${cat.productA._id}/images/${image._id}`)
        .set('Authorization', asAdmin);
      expect(del.status).toBe(200);
      expect(del.body.data.product.images).toHaveLength(0);
      expect(fs.existsSync(stored)).toBe(false);
    });
  });

  describe('categories', () => {
    it('creates, edits and deletes a category, but not one that has products', async () => {
      const created = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', asAdmin)
        .send({ name: 'Cold Rooms', tagline: 'Walk-in storage', subcategories: ['Modular'] });
      expect(created.status).toBe(201);
      const id = created.body.data.category._id;
      expect(created.body.data.category.slug).toBe('cold-rooms');

      const edited = await request(app)
        .put(`/api/admin/categories/${id}`)
        .set('Authorization', asAdmin)
        .send({ isActive: false });
      expect(edited.body.data.category.isActive).toBe(false);
      expect(edited.body.data.category.tagline).toBe('Walk-in storage');

      const pub = await request(app).get('/api/categories');
      expect(pub.body.data.categories.map((c) => c.slug)).not.toContain('cold-rooms');

      const blocked = await request(app).delete(`/api/admin/categories/${cat.category._id}`).set('Authorization', asAdmin);
      expect(blocked.status).toBe(409);

      const deleted = await request(app).delete(`/api/admin/categories/${id}`).set('Authorization', asAdmin);
      expect(deleted.status).toBe(200);
    });
  });

  describe('orders', () => {
    it('lists, searches and walks an order through its statuses in order', async () => {
      const order = await placeCodOrder([{ productId: cat.productA._id.toString(), quantity: 2 }]);

      const list = await request(app).get(`/api/admin/orders?search=${order.orderNumber}`).set('Authorization', asAdmin);
      expect(list.status).toBe(200);
      expect(list.body.data.orders).toHaveLength(1);
      expect(list.body.data.orders[0].user.email).toBe(customer.email);

      const none = await request(app).get('/api/admin/orders?status=delivered').set('Authorization', asAdmin);
      expect(none.body.data.orders).toHaveLength(0);

      const setStatus = (status, extra = {}) =>
        request(app)
          .patch(`/api/admin/orders/${order._id}/status`)
          .set('Authorization', asAdmin)
          .send({ status, ...extra });

      // Skipping steps is refused
      expect((await setStatus('delivered')).status).toBe(400);
      expect((await setStatus('shipped')).status).toBe(400);

      expect((await setStatus('confirmed')).status).toBe(200);
      const shipped = await setStatus('shipped', { trackingId: 'TRK123', courierName: 'Own vehicle' });
      expect(shipped.body.data.order.trackingId).toBe('TRK123');
      const delivered = await setStatus('delivered');
      expect(delivered.body.data.order.orderStatus).toBe('delivered');
      expect(delivered.body.data.order.deliveredAt).toBeTruthy();

      // Nothing can follow "delivered"
      expect((await setStatus('cancelled')).status).toBe(400);

      // The customer sees the same status
      const mine = await request(app).get(`/api/orders/${order._id}`).set('Authorization', asCustomer);
      expect(mine.body.data.order.orderStatus).toBe('delivered');
      expect(mine.body.data.order.statusHistory.map((h) => h.status)).toEqual(['placed', 'confirmed', 'shipped', 'delivered']);

      // Cash collected
      const paid = await request(app)
        .patch(`/api/admin/orders/${order._id}/payment-status`)
        .set('Authorization', asAdmin)
        .send({ paymentStatus: 'paid' });
      expect(paid.body.data.order.paymentStatus).toBe('paid');
    });

    it('puts stock back exactly once when an order is cancelled', async () => {
      const order = await placeCodOrder([{ productId: cat.productA._id.toString(), quantity: 4 }]);
      expect((await Product.findById(cat.productA._id)).stock).toBe(6);

      const cancel = () =>
        request(app)
          .patch(`/api/admin/orders/${order._id}/status`)
          .set('Authorization', asAdmin)
          .send({ status: 'cancelled', note: 'Customer called' });

      expect((await cancel()).status).toBe(200);
      expect((await cancel()).status).toBe(400);
      expect((await Product.findById(cat.productA._id)).stock).toBe(10);
    });

    it('never adds stock for an unpaid online order, and will not confirm it', async () => {
      razorpay.orders.create.mockResolvedValue({ id: 'order_rzp_admin_1' });
      const address = await makeAddress(customer);
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', asCustomer)
        .send({
          addressId: address._id.toString(),
          paymentMethod: 'razorpay',
          items: [{ productId: cat.productA._id.toString(), quantity: 3 }],
        });
      expect(res.status).toBe(201);
      const orderId = res.body.data.order._id;
      expect((await Product.findById(cat.productA._id)).stock).toBe(10); // not taken until paid

      const confirm = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', asAdmin)
        .send({ status: 'confirmed' });
      expect(confirm.status).toBe(400);

      const markPaid = await request(app)
        .patch(`/api/admin/orders/${orderId}/payment-status`)
        .set('Authorization', asAdmin)
        .send({ paymentStatus: 'paid' });
      expect(markPaid.status).toBe(400); // online payments are never marked paid by hand

      const cancel = await request(app)
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', asAdmin)
        .send({ status: 'cancelled' });
      expect(cancel.status).toBe(200);
      expect((await Product.findById(cat.productA._id)).stock).toBe(10);
      expect((await Order.findById(orderId)).paymentStatus).toBe('pending');
    });
  });

  describe('customers', () => {
    it('lists customers with order totals and without sign-in identifiers', async () => {
      await placeCodOrder([{ productId: cat.productA._id.toString(), quantity: 1 }]);

      const list = await request(app).get(`/api/admin/users?search=${customer.email}`).set('Authorization', asAdmin);
      expect(list.status).toBe(200);
      expect(list.body.data.users).toHaveLength(1);
      expect(list.body.data.users[0].orderCount).toBe(1);
      expect(list.body.data.users[0].firebaseUid).toBeUndefined();

      const detail = await request(app).get(`/api/admin/users/${customer._id}`).set('Authorization', asAdmin);
      expect(detail.body.data.user.firebaseUid).toBeUndefined();
      expect(detail.body.data.orders).toHaveLength(1);
      expect(detail.body.data.addresses).toHaveLength(1);

      const blocked = await request(app)
        .patch(`/api/admin/users/${customer._id}/status`)
        .set('Authorization', asAdmin)
        .send({ isActive: false });
      expect(blocked.status).toBe(200);
      const after = await request(app).get('/api/orders/my').set('Authorization', asCustomer);
      expect(after.status).toBe(403);
    });
  });

  describe('activity log', () => {
    it('records admin changes', async () => {
      await request(app)
        .patch(`/api/admin/products/${cat.productA._id}/stock`)
        .set('Authorization', asAdmin)
        .send({ stock: 25 });

      // The log is written after the response has been sent
      await new Promise((r) => setTimeout(r, 100));
      const logs = await AuditLog.find();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toContain('Updated product stock: 25');
      expect(logs[0].user.toString()).toBe(admin._id.toString());

      const res = await request(app).get('/api/admin/activity').set('Authorization', asAdmin);
      expect(res.body.data.activity).toHaveLength(1);
    });
  });
});
