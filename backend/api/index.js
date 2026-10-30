const app = require('../src/app');
const { connectDB } = require('../src/config/db');

// Serverless function handler for Vercel
module.exports = async (req, res) => {
  await connectDB();
  return app(req, res);
};
