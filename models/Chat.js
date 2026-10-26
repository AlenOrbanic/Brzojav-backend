const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  // za direktne chatove: sortirani niz od dva usernamea npr. ['alice', 'bob']
  // za grupne chatove: niz svih članova grupe
  members: { type: [String], required: true },
  isGroup: { type: Boolean, default: false },

  // group only fields
  name: { type: String, default: '' },
  avatar: { type: String, default: 'https://i.imgur.com/d6Q5lgd.png' },
  ownerId: { type: String, default: '' }, // username ownera grupe

  lastMessage: { type: String, default: '' },
  lastMessageSender: { type: String, default: '' }, // username of the last message's sender (for previews)
  lastMessageAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },

  // Shared pinned message for the chat (visible to all members)
  pinnedMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  pinnedBy: { type: String, default: '' }, // username tko je pinao

  // Shared nicknames: one entry per member, visible to EVERYONE in the chat
  nicknames: [{
    _id: false,
    username: { type: String, required: true },
    nickname: { type: String, maxlength: 50 },
  }],
});

module.exports = mongoose.model('Chat', chatSchema);