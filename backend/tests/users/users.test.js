const request = require('supertest');
const { app, setupTestDB, teardownTestDB, clearTestDB } = require('../setup');
const firebaseService = require('../../src/integrations/firebase/firebase.service');
const { User } = require('../../src/models');

describe('Users Module', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await User.create({
      firebaseUid: 'user-uid-001',
      name: 'Test User',
      email: 'testuser@example.com',
      phone: '9876543210',
      role: 'user',
    });

    firebaseService.verifyIdToken.mockResolvedValue({ uid: 'user-uid-001' });
  });

  afterEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('GET /api/users/profile', () => {
    it('should return user profile', async () => {
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('testuser@example.com');
      expect(res.body.data.user.name).toBe('Test User');
    });

    it('should block unauthenticated requests', async () => {
      const res = await request(app).get('/api/users/profile');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update user name and phone', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated Name', phone: '9123456789' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.name).toBe('Updated Name');
      expect(res.body.data.user.phone).toBe('9123456789');
    });

    it('should reject invalid phone number', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send({ phone: '123' });

      expect(res.status).toBe(400);
    });
  });
});
