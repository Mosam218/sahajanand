const fs = require('fs');
const path = require('path');
const cloudinary = require('../../config/cloudinary');
const config = require('../../config/env');
const logger = require('../../utils/logger');
const { UPLOADS_DIR } = require('../../middleware/upload.middleware');

// Images go to Cloudinary when it is configured. Without it they stay in the
// local uploads directory and are served from /uploads (fine for development;
// use Cloudinary on hosts with an ephemeral disk).
const LOCAL_PREFIX = 'local:';

/**
 * Store an uploaded image.
 * @param {string} filePath - Local file path written by multer
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<{url: string, publicId: string}>}
 */
async function uploadImage(filePath, folder = 'sahajanand') {
  if (!config.cloudinary.enabled) {
    const name = path.basename(filePath);
    return { url: `${config.publicApiUrl}/uploads/${name}`, publicId: `${LOCAL_PREFIX}${name}` };
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'image',
      transformation: [
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });

    // Delete temp file
    deleteTempFile(filePath);

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (err) {
    // Always clean up temp file, even on error
    deleteTempFile(filePath);
    logger.error(`Cloudinary upload failed: ${err.message}`);
    throw err;
  }
}

/**
 * Upload multiple files.
 * @param {string[]} filePaths - Array of local file paths
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<Array<{url: string, publicId: string}>>}
 */
async function uploadMultipleImages(filePaths, folder = 'sahajanand') {
  const results = [];
  for (const filePath of filePaths) {
    const result = await uploadImage(filePath, folder);
    results.push(result);
  }
  return results;
}

/**
 * Delete a stored image by public ID. Images without a public ID (catalogue
 * images referenced by URL) have nothing to delete.
 * @param {string} publicId
 */
async function deleteImage(publicId) {
  if (!publicId) return;

  if (publicId.startsWith(LOCAL_PREFIX)) {
    // basename() keeps the delete inside the uploads directory
    deleteTempFile(path.join(UPLOADS_DIR, path.basename(publicId.slice(LOCAL_PREFIX.length))));
    return;
  }

  if (!config.cloudinary.enabled) return;

  try {
    await cloudinary.uploader.destroy(publicId);
    logger.info(`Cloudinary image deleted: ${publicId}`);
  } catch (err) {
    logger.error(`Cloudinary delete failed for ${publicId}: ${err.message}`);
  }
}

/**
 * Delete multiple images.
 * @param {string[]} publicIds
 */
async function deleteMultipleImages(publicIds) {
  for (const publicId of publicIds) {
    await deleteImage(publicId);
  }
}

/**
 * Test connectivity and credentials with Cloudinary API.
 * @returns {Promise<object>}
 */
async function ping() {
  try {
    return await cloudinary.api.ping();
  } catch (err) {
    const errorMsg = err.message || err.error?.message || err.error || JSON.stringify(err);
    logger.error(`Cloudinary ping failed: ${errorMsg}`);
    throw new Error(errorMsg);
  }
}

/**
 * Upload an image buffer directly to Cloudinary.
 * @param {Buffer} buffer - Image buffer
 * @param {string} folder - Cloudinary folder
 * @param {object} [options={}] - Additional upload options
 * @returns {Promise<{url: string, publicId: string}>}
 */
async function uploadFromBuffer(buffer, folder = 'sahajanand', options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        ...options,
      },
      (error, result) => {
        if (error) {
          logger.error(`Cloudinary stream upload failed: ${error.message}`);
          return reject(error);
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );
    uploadStream.end(buffer);
  });
}

/**
 * Generate an optimized Cloudinary delivery URL with transformations.
 * @param {string} publicId - Cloudinary public ID
 * @param {object} [options={}] - Transformations (e.g. width, height, crop)
 * @returns {string} Optimized URL
 */
function getOptimizedUrl(publicId, options = {}) {
  return cloudinary.url(publicId, {
    fetch_format: 'auto',
    quality: 'auto',
    secure: true,
    ...options,
  });
}

/**
 * Delete a temp file from disk (non-blocking, never throws).
 * @param {string} filePath
 */
function deleteTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logger.warn(`Failed to delete temp file ${filePath}: ${err.message}`);
  }
}

module.exports = {
  ping,
  uploadImage,
  uploadMultipleImages,
  uploadFromBuffer,
  getOptimizedUrl,
  deleteImage,
  deleteMultipleImages,
  deleteTempFile,
};
