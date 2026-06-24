const mongoose = require('mongoose');

// User settings za pojedinačni chat
// Spremljeni odvojeno tako da svaki user ima svoje postavke nadimka, pinanja, mutea
const userChatSchema = new mongoose.Schema({
  username: { type: String, required: true }, // kojem useru pripadaju ove postavke
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
  nickname: { type: String, default: '' }, // nadimak za chat (vidi se samo toj osobi)
  pinned: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  lastReadAt: { type: Date, default: null }, // kada je user zadnji put otvorio chat
});

// svaki user može imati samo jedne settinge po chatId-u
userChatSchema.index({ username: 1, chatId: 1 }, { unique: true });

module.exports = mongoose.model('UserChat', userChatSchema);