const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, default: 'Brzojav User' },
  username: { type: String, required: true, unique: true, lowercase: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true }, // hash
  phone: { type: String, default: '' },
  avatar: { type: String, default: '' }, // url
  lastSeen: { type: Date, default: Date.now },
  showLastSeen: { type: Boolean, default: true },
  allowStrangers: { type: Boolean, default: true },
  blockedUsers: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);