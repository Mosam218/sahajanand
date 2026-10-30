// Export the Express app itself. Vercel keeps the invocation open for an app
// with listen(). A wrapper that returns before the response is sent is
// reported as FUNCTION_INVOCATION_FAILED.
let app;
try {
  app = require('../src/app');
} catch (err) {
  console.error(err);
  const message = err && err.message ? err.message : 'API failed to start';
  // Do not require Express here. If startup failed because a module is
  // missing, that require would throw again and Vercel would hide the reason.
  app = (req, res) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const origin = req.headers && req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.end(JSON.stringify({ success: false, message }));
  };
}

module.exports = app;
