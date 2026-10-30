const mongoose = require('mongoose');
const config = require('./env');
const logger = require('../utils/logger');

let isConnected = false;

/**
 * Connect to MongoDB with retry logic.
 * Caches the connection for serverless environments.
 * @returns {Promise<typeof mongoose>}
 */
async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  if (isConnected) {
    logger.info('Using existing MongoDB connection');
    return mongoose;
  }

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const conn = await mongoose.connect(config.mongo.uri, {
        maxPoolSize: 10,
      });

      isConnected = true;
      logger.info(`MongoDB connected: ${conn.connection.host}`);

      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', err);
        isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        isConnected = false;
      });

      return mongoose;
    } catch (err) {
      logger.error(
        `MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`
      );
      if (attempt === MAX_RETRIES) {
        logger.error('All MongoDB connection attempts failed. Exiting.');
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

/**
 * Gracefully close the MongoDB connection.
 */
async function disconnectDB() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected gracefully');
  }
}

module.exports = { connectDB, disconnectDB };
