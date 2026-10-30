const app = require('../src/app');
const { connectDB } = require('../src/config/db');

// Do not make this handler async. Vercel treats a resolved promise as a
// finished invocation, and Express answers the request after this returns.
module.exports = (req, res) => {
  connectDB()
    .then(() => app(req, res))
    .catch((err) => {
      console.error('API startup failed:', err);
      if (res.headersSent) return;
      const origin = req.headers.origin;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, message: 'API failed to start' }));
    });
};
