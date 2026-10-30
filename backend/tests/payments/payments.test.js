const request = require('supertest');
const { app, setupTestDB, teardownTestDB, clearTestDB } = require('../setup');
const firebaseService = require('../../src/integrations/firebase/firebase.service');
const razorpayService = require('../../src/integrations/razorpay/razorpay.service');
const { User, Category, Product, Order, Payment } = require('../../src/models');

// We need to mock razorpay.service methods properly
jest.mock('../../src/integrations/razorpay/razorpay.service', () => ({
  createOrder: jest.fn(),
  verifySignature: jest.fn(),
  verifyWebhookSignature: jest.fn(),
  refundPayment: jest.fn(),
  fetchPayment: jest.fn(),
}));

describe('Payments Module', () => {
  let user, order;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    user = await User.create({
      firebaseUid: 'pay-user-uid',
      name: 'Pay User',
      email: 'pay@example.com',
      role: 'user',
    });

    firebaseService.verifyIdToken.mockResolvedValue({ uid: 'pay-user-uid' });

    const category = await Category.create({ name: 'Pay Cat', isActive: true });

    const product = await Product.create({
      name: 'Pay Product',
      category: category._id,
      price: 5000,
      mrp: 6000,
      stock: 10,
      isActive: true,
    });

    // Create an order that's awaiting payment
    order = await Order.create({
      orderNumber: 'SEL-20261004-ABC123',
      user: user._id,
      items: [{
        product: product._id,
        name: 'Pay Product',
        image: '',
        sku: '',
        price: 5000,
        mrp: 6000,
        quantity: 2,
      }],
      shippingAddress: {
        fullName: 'Pay User',
        phone: '9876543210',
        line1: '123 St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      },
      itemsTotal: 10000,
      discount: 0,
      deliveryCharge: 0,
      totalAmount: 10000,
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      orderStatus: 'placed',
      razorpayOrderId: 'order_rzp_test_123',
      statusHistory: [{ status: 'placed', note: 'Order placed', at: new Date() }],
    });

    await Payment.create({
      order: order._id,
      user: user._id,
      razorpayOrderId: 'order_rzp_test_123',
      amount: 10000,
      currency: 'INR',
      status: 'created',
    });
  });

  afterEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('POST /api/payments/verify', () => {
    it('should verify valid signature, mark order paid, and reduce stock', async () => {
      razorpayService.verifySignature.mockReturnValue(true);

      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({
          razorpay_order_id: 'order_rzp_test_123',
          razorpay_payment_id: 'pay_rzp_test_456',
          razorpay_signature: 'valid-signature',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Check order is marked paid
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('paid');
      expect(updatedOrder.orderStatus).toBe('confirmed');

      // Check stock was reduced
      const updatedProduct = await Product.findOne({ name: 'Pay Product' });
      expect(updatedProduct.stock).toBe(8); // 10 - 2
    });

    it('should reject invalid signature', async () => {
      razorpayService.verifySignature.mockReturnValue(false);

      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', 'Bearer valid-token')
        .send({
          razorpay_order_id: 'order_rzp_test_123',
          razorpay_payment_id: 'pay_rzp_bad',
          razorpay_signature: 'bad-signature',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);

      // Payment should be marked failed
      const updatedPayment = await Payment.findOne({ razorpayOrderId: 'order_rzp_test_123' });
      expect(updatedPayment.status).toBe('failed');
    });
  });

  describe('POST /api/payments/webhook', () => {
    it('should return 400 for invalid webhook signature', async () => {
      razorpayService.verifyWebhookSignature.mockReturnValue(false);

      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook_1',
              order_id: 'order_rzp_test_123',
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', 'bad-sig')
        .send(payload);

      expect(res.status).toBe(400);
    });

    it('should process payment.captured and mark order paid', async () => {
      razorpayService.verifyWebhookSignature.mockReturnValue(true);

      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook_captured',
              order_id: 'order_rzp_test_123',
              method: 'upi',
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', 'valid-webhook-sig')
        .send(payload);

      expect(res.status).toBe(200);

      // Order should be paid
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('paid');
      expect(updatedOrder.orderStatus).toBe('confirmed');
    });

    it('should be idempotent — sending same event twice reduces stock once', async () => {
      razorpayService.verifyWebhookSignature.mockReturnValue(true);

      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_idempotent_1',
              order_id: 'order_rzp_test_123',
            },
          },
        },
      });

      // First call
      await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', 'valid-sig')
        .send(payload);

      const stockAfterFirst = (await Product.findOne({ name: 'Pay Product' })).stock;

      // Second call (same event)
      await request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', 'valid-sig')
        .send(payload);

      const stockAfterSecond = (await Product.findOne({ name: 'Pay Product' })).stock;

      // Stock should be the same — only decremented once
      expect(stockAfterSecond).toBe(stockAfterFirst);
    });
  });
});
