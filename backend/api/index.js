// Export the Express app itself. Vercel keeps the invocation open for an app
// with listen(). A wrapper that returns before the response is sent is
// reported as FUNCTION_INVOCATION_FAILED.
let app;
try {
  app = require('../src/app');
} catch (err) {
  console.error(err);
  const express = require('express');
  const fallback = express();
  fallback.use((req, res) => {
    res.status(500).json({
      success: false,
      message: err.message || 'API failed to start',
    });
  });
  app = fallback;
}

module.exports = app;
