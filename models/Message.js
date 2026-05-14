const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  sender:   { type: String, required: true },
  text:     { type: String, default: '' },
  files:    [{
    fileType: { type: String },
    url:      { type: String },
    name:     { type: String },
  }],
  replyTo:  {
    sender:   { type: String },
    text:     { type: String },
    fileType: { type: String },
  },
  reactions: [{ emoji: String, sender: String }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Message', messageSchema);