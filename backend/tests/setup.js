const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const app = require('../src/app');

let mongoServer;

/**
 * Connect to an in-memory MongoDB instance for testing.
 */
async function setupTestDB() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}

/**
 * Close connection and stop the in-memory server.
 */
async function teardownTestDB() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
}

/**
 * Clear all collections in the test database.
 */
async function clearTestDB() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

// Mock Firebase Admin SDK
jest.mock('../src/config/firebase', () => ({
  auth: () => ({
    verifyIdToken: jest.fn(),
    revokeRefreshTokens: jest.fn(),
  }),
}));

// Mock firebase.service
jest.mock('../src/integrations/firebase/firebase.service', () => ({
  verifyIdToken: jest.fn(),
  revokeRefreshTokens: jest.fn(),
}));

// Mock Razorpay
jest.mock('../src/config/razorpay', () => ({
  orders: {
    create: jest.fn(),
  },
  payments: {
    fetch: jest.fn(),
    refund: jest.fn(),
  },
}));

// Mock Cloudinary
jest.mock('../src/config/cloudinary', () => ({
  uploader: {
    upload: jest.fn().mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/test/image.jpg',
      public_id: 'test/image',
    }),
    destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
  },
}));

module.exports = { app, setupTestDB, teardownTestDB, clearTestDB };
