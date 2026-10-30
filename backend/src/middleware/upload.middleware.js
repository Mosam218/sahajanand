const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
// Extension and MIME type must agree; SVG and other active content is refused.
const ALLOWED = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(16).toString('hex');
    cb(null, `${name}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimes = ALLOWED[ext];

  if (mimes && mimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(ApiError.badRequest('Only jpg, jpeg, png and webp images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 8 },
});

/**
 * If the request ends in an error (validation, missing product, ...), remove
 * the files it uploaded so rejected requests cannot fill the disk.
 */
const discardOnFailure = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 400) return;
    const files = [req.file, ...(Array.isArray(req.files) ? req.files : [])].filter(Boolean);
    for (const file of files) {
      fs.unlink(file.path, () => {}); // already gone is fine
    }
  });
  next();
};

// Leading bytes of each accepted format. The declared type and the file name
// come from the client; this checks what was actually uploaded.
const SIGNATURES = {
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.webp': (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

const verifyImageContent = async (req, _res, next) => {
  try {
    const files = [req.file, ...(Array.isArray(req.files) ? req.files : [])].filter(Boolean);
    for (const file of files) {
      const handle = await fs.promises.open(file.path, 'r');
      const head = Buffer.alloc(12);
      try {
        await handle.read(head, 0, 12, 0);
      } finally {
        await handle.close();
      }
      const matches = SIGNATURES[path.extname(file.path).toLowerCase()];
      if (!matches || !matches(head)) {
        // discardOnFailure removes the files once the 400 has been sent
        return next(ApiError.badRequest('One of the files is not a valid jpg, png or webp image'));
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Upload single image middleware.
 * @param {string} fieldName - The form field name
 */
const uploadSingle = (fieldName) => [discardOnFailure, upload.single(fieldName), verifyImageContent];

/**
 * Upload multiple images middleware.
 * @param {string} fieldName - The form field name
 * @param {number} maxCount - Maximum number of files
 */
const uploadMultiple = (fieldName, maxCount = 8) => [
  discardOnFailure,
  upload.array(fieldName, maxCount),
  verifyImageContent,
];

module.exports = { uploadSingle, uploadMultiple, UPLOADS_DIR };
