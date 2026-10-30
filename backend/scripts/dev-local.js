/**
 * Run the API on this machine with no cloud accounts at all:
 *   - MongoDB: a local mongod started for you (data kept in backend/.localdb)
 *   - Sign-in: the Firebase Auth emulator (start it first, see below)
 *   - Payments: cash on delivery only; images: stored in backend/uploads
 *
 * For development and end-to-end testing only. Nothing here is used in
 * production, where the real services are configured in .env.
 *
 *   1. In the repository root:  npx firebase-tools emulators:start --only auth --project demo-sahajanand
 *   2. In backend/:             npm run dev:local
 *   3. In frontend/:            npm run dev   (with the emulator settings from frontend/.env.example)
 */

const fs = require('fs');
const path = require('path');

if (process.env.NODE_ENV === 'production') {
  console.error('dev-local must not be used in production.');
  process.exit(1);
}

const DB_PORT = Number(process.env.LOCAL_DB_PORT || 27018);
const DB_PATH = path.join(__dirname, '..', '.localdb');

async function main() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  fs.mkdirSync(DB_PATH, { recursive: true });

  const mongod = await MongoMemoryServer.create({
    instance: { port: DB_PORT, dbPath: DB_PATH, dbName: 'sahajanand', storageEngine: 'wiredTiger' },
  });

  // Only fill in what the developer has not set themselves
  const defaults = {
    NODE_ENV: 'development',
    PORT: '5000',
    CLIENT_URLS: 'http://localhost:5173,http://127.0.0.1:5173',
    MONGODB_URI: mongod.getUri('sahajanand'),
    FIREBASE_PROJECT_ID: 'demo-sahajanand',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key]) process.env[key] = value;
  }

  console.log(`Local MongoDB on port ${DB_PORT} (data in backend/.localdb)`);
  console.log(`Firebase Auth emulator expected at ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);

  // Load the catalogue (with a few units of stock so checkout can be tried)
  const mongoose = require('mongoose');
  process.argv.push('--demo');
  const { seed } = require('./seed');
  await mongoose.connect(process.env.MONGODB_URI);
  await seed();
  await mongoose.disconnect();

  const stop = async () => { await mongod.stop({ doCleanup: false }); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  require('../src/server');
}

main().catch((err) => {
  console.error('Could not start the local stack:', err);
  process.exit(1);
});
