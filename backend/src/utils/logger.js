const winston = require('winston');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
  defaultMeta: { service: 'sahajanand-api' },
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
});

// File logs are for a normal server with a writable disk. On Vercel the
// filesystem is read-only, and the file transport creates its directory
// while this module loads — that throws and the function dies before it
// can send a response (FUNCTION_INVOCATION_FAILED, which the browser
// reports as a CORS error). Vercel already keeps the console output.
const serverless = Boolean(process.env.VERCEL);
if (process.env.NODE_ENV === 'production' && !serverless) {
  try {
    logger.add(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );
    logger.add(
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880,
        maxFiles: 5,
      })
    );
  } catch (err) {
    // A read-only disk must not stop the API from answering.
    console.error('File logging disabled:', err.message);
  }
}

/**
 * Morgan stream adapter for winston.
 * Usage: morgan('combined', { stream: logger.stream })
 */
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = logger;
