const request = require('supertest');
const { app, setupTestDB, teardownTestDB, clearTestDB } = require('../setup');
const firebaseService = require('../../src/integrations/firebase/firebase.service');
const { User, Category, Product } = require('../../src/models');

describe('Products Module', () => {
  let category;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    category = await Category.create({
      name: 'Test Category',
      description: 'Test',
      isActive: true,
    });

    // Create some products
    await Product.create([
      {
        name: 'Product A',
        brand: 'BrandX',
        category: category._id,
        price: 1000,
        mrp: 1500,
        stock: 10,
        isActive: true,
        isFeatured: true,
        tags: ['electronics'],
      },
      {
        name: 'Product B',
        brand: 'BrandY',
        category: category._id,
        price: 2000,
        mrp: 2500,
        stock: 5,
        isActive: true,
        tags: ['gadget'],
      },
      {
        name: 'Product C',
        brand: 'BrandX',
        category: category._id,
        price: 500,
        mrp: 800,
        stock: 0,
        isActive: true,
        tags: ['electronics', 'budget'],
      },
      {
        name: 'Inactive Product',
        brand: 'BrandZ',
        category: category._id,
        price: 3000,
        mrp: 4000,
        stock: 20,
        isActive: false,
      },
    ]);

    await User.create({
      firebaseUid: 'admin-uid-products',
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
    });
  });

  afterEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('GET /api/products', () => {
    it('should return only active products', async () => {
      const res = await request(app).get('/api/products');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.products.length).toBe(3); // excludes inactive
      expect(res.body.meta).toBeDefined();
    });

    it('should filter by brand', async () => {
      const res = await request(app).get('/api/products?brand=BrandX');

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(2);
      res.body.data.products.forEach((p) => {
        expect(p.brand).toBe('BrandX');
      });
    });

    it('should filter by price range', async () => {
      const res = await request(app).get('/api/products?minPrice=800&maxPrice=1500');

      expect(res.status).toBe(200);
      res.body.data.products.forEach((p) => {
        expect(p.price).toBeGreaterThanOrEqual(800);
        expect(p.price).toBeLessThanOrEqual(1500);
      });
    });

    it('should filter in-stock products', async () => {
      const res = await request(app).get('/api/products?inStock=true');

      expect(res.status).toBe(200);
      res.body.data.products.forEach((p) => {
        expect(p.stock).toBeGreaterThan(0);
      });
    });

    it('should sort by price ascending', async () => {
      const res = await request(app).get('/api/products?sort=price_asc');

      expect(res.status).toBe(200);
      const prices = res.body.data.products.map((p) => p.price);
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    });

    it('should paginate results', async () => {
      const res = await request(app).get('/api/products?page=1&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(2);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.totalPages).toBe(2);
    });

    it('should search products by name', async () => {
      const res = await request(app).get('/api/products?search=Product%20A');

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/products/featured', () => {
    it('should return featured products', async () => {
      const res = await request(app).get('/api/products/featured');

      expect(res.status).toBe(200);
      res.body.data.products.forEach((p) => {
        expect(p.isFeatured).toBe(true);
      });
    });
  });

  describe('GET /api/products/:slug', () => {
    it('should return product by slug with related products', async () => {
      const product = await Product.findOne({ name: 'Product A' });

      const res = await request(app).get(`/api/products/${product.slug}`);

      expect(res.status).toBe(200);
      expect(res.body.data.product.name).toBe('Product A');
      expect(res.body.data.relatedProducts).toBeDefined();
    });

    it('should return 404 for non-existent slug', async () => {
      const res = await request(app).get('/api/products/does-not-exist');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/admin/products', () => {
    it('should create a product (admin only)', async () => {
      firebaseService.verifyIdToken.mockResolvedValue({ uid: 'admin-uid-products' });

      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', 'Bearer admin-token')
        .send({
          name: 'New Product',
          category: category._id.toString(),
          price: 5000,
          mrp: 7000,
          stock: 15,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.product.name).toBe('New Product');
      expect(res.body.data.product.discountPercent).toBeGreaterThan(0);
    });

    it('should reject non-admin users', async () => {
      await User.create({
        firebaseUid: 'normal-uid',
        name: 'Normal',
        email: 'normal@example.com',
        role: 'user',
      });
      firebaseService.verifyIdToken.mockResolvedValue({ uid: 'normal-uid' });

      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', 'Bearer normal-token')
        .send({
          name: 'Fail Product',
          category: category._id.toString(),
          price: 5000,
          mrp: 7000,
          stock: 15,
        });

      expect(res.status).toBe(403);
    });

    it('should reject price greater than mrp', async () => {
      firebaseService.verifyIdToken.mockResolvedValue({ uid: 'admin-uid-products' });

      const res = await request(app)
        .post('/api/admin/products')
        .set('Authorization', 'Bearer admin-token')
        .send({
          name: 'Bad Price Product',
          category: category._id.toString(),
          price: 9000,
          mrp: 7000,
          stock: 15,
        });

      expect(res.status).toBe(400);
    });
  });
});
