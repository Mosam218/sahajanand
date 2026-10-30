const request = require('supertest');
const { app, setupTestDB, teardownTestDB, clearTestDB } = require('../setup');
const firebaseService = require('../../src/integrations/firebase/firebase.service');
const { User } = require('../../src/models');

describe('Auth Module', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should create a new user on first login', async () => {
      firebaseService.verifyIdToken.mockResolvedValue({
        uid: 'firebase-uid-123',
        name: 'Test User',
        email: 'test@example.com',
        picture: 'https://photo.url/test.jpg',
        email_verified: true,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .set('Authorization', 'Bearer valid-token-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('test@example.com');
      expect(res.body.data.user.name).toBe('Test User');
      expect(res.body.data.user.role).toBe('user');

      // Verify user was created in DB
      const dbUser = await User.findOne({ firebaseUid: 'firebase-uid-123' });
      expect(dbUser).toBeTruthy();
      expect(dbUser.email).toBe('test@example.com');
    });

    it('should keep the profile name the customer edited on subsequent login', async () => {
      // Create user first
      await User.create({
        firebaseUid: 'firebase-uid-123',
        name: 'Old Name',
        email: 'test@example.com',
        role: 'user',
      });

      firebaseService.verifyIdToken.mockResolvedValue({
        uid: 'firebase-uid-123',
        name: 'Updated Name',
        email: 'test@example.com',
        picture: 'https://new-photo.url',
        email_verified: true,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .set('Authorization', 'Bearer valid-token-123');

      expect(res.status).toBe(200);
      // The name is the customer's to edit (PUT /users/profile); a new login
      // must not overwrite it with whatever the sign-in provider holds.
      expect(res.body.data.user.name).toBe('Old Name');
      expect(res.body.data.user.photoURL).toBe('https://new-photo.url');
      expect(res.body.data.user.emailVerified).toBe(true);
    });

    it('should assign admin role if email is in ADMIN_EMAILS', async () => {
      const config = require('../../src/config/env');
      const adminEmail = config.adminEmails[0] || 'admin@example.com';

      firebaseService.verifyIdToken.mockResolvedValue({
        uid: 'admin-uid-456',
        name: 'Admin User',
        email: adminEmail,
        email_verified: true,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('admin');
    });

    it('should return 401 for invalid token', async () => {
      firebaseService.verifyIdToken.mockRejectedValue(
        new Error('Firebase ID token has expired')
      );

      const res = await request(app)
        .post('/api/auth/login')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 when no token is provided', async () => {
      const res = await request(app).post('/api/auth/login');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user profile', async () => {
      await User.create({
        firebaseUid: 'uid-me-test',
        name: 'Me User',
        email: 'me@example.com',
        role: 'user',
      });

      firebaseService.verifyIdToken.mockResolvedValue({ uid: 'uid-me-test' });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('me@example.com');
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
