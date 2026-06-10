const multer      = require('multer');
const streamifier = require('streamifier');
const cloudinary  = require('../cloudinary');

// Store files in memory so we can stream to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  preservePath: true,
});

// Upload a buffer to Cloudinary and return the result
function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

module.exports = { upload, uploadToCloudinary };