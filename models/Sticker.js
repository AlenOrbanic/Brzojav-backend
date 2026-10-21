const mongoose = require('mongoose');

const stickerSchema = new mongoose.Schema({
  owner:     { type: String, required: true, index: true }, // username
  url:       { type: String, required: true },              // Cloudinary secure_url
  publicId:  { type: String, default: '' },                 // Cloudinary public_id
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Sticker', stickerSchema);
