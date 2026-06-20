const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, default: 'Brzojav User' },
  username: { type: String, required: true, unique: true, lowercase: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true }, // hash
  phone: { type: String, default: '' },
  avatar: { type: String, default: 'https://i.pinimg.com/1200x/c5/ab/41/c5ab41e3f9766798af79b40d535f45e0.jpg' },
  lastSeen: { type: Date, default: Date.now },
  showLastSeen: { type: Boolean, default: true },
  allowStrangers: { type: Boolean, default: true },
  notificationsEnabled: { type: Boolean, default: true },
  blockedUsers: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false },
});

module.exports = mongoose.model('User', userSchema);