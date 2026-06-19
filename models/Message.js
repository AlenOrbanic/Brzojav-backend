const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  fileType: { type: String },
  url:      { type: String },
  name:     { type: String, maxlength: 255 },
}, { _id: false });

const reactionSchema = new mongoose.Schema({
  emoji:  { type: String, required: true },
  sender: { type: String, required: true },
}, { _id: false });

const replyToSchema = new mongoose.Schema({
  sender:   { type: String },
  text:     { type: String },
  fileType: { type: String },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  chatId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  sender:    { type: String, required: true },
  text:      { type: String, default: '', maxlength: 5000 },
  files:     [fileSchema],
  replyTo:   { type: replyToSchema, default: null },
  reactions: [reactionSchema],
}, { timestamps: true });

// glavni index — koristi se u getu poruka i sortiranju
messageSchema.index({ chatId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);