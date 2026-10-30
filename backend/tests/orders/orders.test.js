const request = require('supertest');
const { app, setupTestDB, teardownTestDB, clearTestDB } = require('../setup');
const firebaseService = require('../../src/integrations/firebase/firebase.service');
const { User, Category, Product, Cart, Address, Coupon } = require('../../src/models');

describe('Orders Module', () => {
  let user, address, productA, productB, category;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    user = await User.create({
      firebaseUid: 'order-user-uid',
      name: 'Order User',
      email: 'order@example.com',
      role: 'user',
    });

    firebaseService.verifyIdToken.mockResolvedValue({ uid: 'order-user-uid' });

    category = await Category.create({ name: 'Order Test Cat', isActive: true });

    productA = await Product.create({
      name: 'Order Product A',
      category: category._id,
      price: 1000,
      mrp: 1500,
      stock: 10,
      isActive: true,
    });

    productB = await Product.create({
      name: 'Order Product B',
      category: category._id,
      price: 2000,
      mrp: 2500,
      stock: 3,
      isActive: true,
    });

    address = await Address.create({
      user: user._id,
      fullName: 'Test User',
      phone: '9876543210',
      line1: '123 Test Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      isDefault: true,
    });

    await Coupon.create({
      code: 'TEST10',
      discountType: 'percent',
      discountValue: 10,
      maxDiscount: 500,
      minOrderValue: 1000,
      perUserLimit: 1,
      startsAt: new Date('2020-01-01'),
      expiresAt: new Date('2030-12-31'),
      isActive: true,
    });

    // Add items to cart
    await Cart.create({
      user: user._id,
      items: [
        { product: productA._id, quantity: 2 },
        { product: productB._id, quantity: 1 },
      ],
    });
  });

  afterEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('POST /api/orders/checkout (COD)', () => {
    it('should create a COD order with server-side pricing (ignore client price)', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', 'Bearer valid-token')
        .send({
          addressId: address._id.toString(),
          paymentMethod: 'cod',
          // No items = use cart. Client cannot set prices.
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const order = res.body.data.order;
      // Server computed: 1000*2 + 2000*1 = 4000
      expect(order.itemsTotal).toBe(4000);
      expect(order.paymentMethod).toBe('cod');
      expect(order.orderNumber).toMatch(/^SEL-/);

      // Stock should be decremented
      const updatedA = await Product.findById(productA._id);
      expect(updatedA.stock).toBe(8); // 10 - 2

      const updatedB = await Product.findById(productB._id);
      expect(updatedB.stock).toBe(2); // 3 - 1
    });

    it('should recompute prices and ignore tampered prices from client', async () => {
      // Send items with tampered prices (buy now flow)
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', 'Bearer valid-token')
        .send({
          addressId: address._id.toString(),
          paymentMethod: 'cod',
          items: [
            { productId: productA._id.toString(), quantity: 1 },
          ],
        });

      expect(res.status).toBe(201);
      // Even if client tried to set a price, server uses DB price (1000)
      expect(res.body.data.order.itemsTotal).toBe(1000);
    });

    it('should reject out-of-stock products', async () => {
      // Set stock to 0
      await Product.findByIdAndUpdate(productB._id, { stock: 0 });

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', 'Bearer valid-token')
        .send({
          addressId: address._id.toString(),
          paymentMethod: 'cod',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject quantity exceeding stock', async () => {
      // Set cart to have quantity > stock
      await Cart.findOneAndUpdate(
        { user: user._id },
        { items: [{ product: productB._id, quantity: 10 }] }
      );

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', 'Bearer valid-token')
        .send({
          addressId: address._id.toString(),
          paymentMethod: 'cod',
        });

      expect(res.status).toBe(400);
    });

    it('should apply coupon correctly', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', 'Bearer valid-token')
        .send({
          addressId: address._id.toString(),
          paymentMethod: 'cod',
          couponCode: 'TEST10',
        });

      expect(res.status).toBe(201);
      const order = res.body.data.order;
      // itemsTotal = 4000, 10% = 400, max 500, so discount = 400
      expect(order.discount).toBe(400);
      expect(order.totalAmount).toBe(4000 - 400 + order.deliveryCharge);
    });
  });

  describe('POST /api/orders/:id/cancel', () => {
    it('should cancel a placed order and restock', async () => {
      // Create COD order first
      const checkoutRes = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', 'Bearer valid-token')
        .send({
          addressId: address._id.toString(),
          paymentMethod: 'cod',
          items: [{ productId: productA._id.toString(), quantity: 2 }],
        });

      const orderId = checkoutRes.body.data.order._id;
      const stockAfterOrder = (await Product.findById(productA._id)).stock;
      expect(stockAfterOrder).toBe(8);

      // Cancel
      const cancelRes = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'Changed my mind' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.order.orderStatus).toBe('cancelled');

      // Stock should be restored
      const restoredStock = (await Product.findById(productA._id)).stock;
      expect(restoredStock).toBe(10);
    });
  });
});
