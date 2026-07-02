// Koristi middleware(autentikaciju), treba nam validan token da pristupimo ovim endpointima

const router             = require('express').Router();
const Message            = require('../models/Message');
const Chat               = require('../models/Chat');
const UserChat           = require('../models/UserChat');
const { upload, uploadToCloudinary } = require('../middleware/upload');

// Ovo nam treba nakon brisanja poruke, inače moze stari message ostati kao preview
async function refreshLastMessage(chat) {
  const latest = await Message.findOne({ chatId: chat._id }).sort({ createdAt: -1 });
  chat.lastMessage   = latest
    ? (latest.text || (latest.files?.length ? '📎 File' : ''))
    : '';
  chat.lastMessageSender = latest ? latest.sender : '';
  chat.lastMessageAt = latest ? latest.createdAt : chat.createdAt;
  await chat.save();
  return chat;
}

// GET /api/messages/:chatId — uhvati poruke iz chata
router.get('/:chatId', async (req, res) => {
  const me     = req.user.username;
  const chatId = req.params.chatId;
  const limit  = parseInt(req.query.limit, 10) || 50;
  const before = req.query.before;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.members.includes(me)) {
      return res.status(404).json({ ok: false, error: 'Chat not found' });
    }

    const query = { chatId };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    // Od najstarije poruke
    return res.json({ ok: true, messages: messages.reverse() });
  } catch (err) {
    console.error('[messages] GET error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

router.post('/:chatId', upload.array('files', 10), async (req, res) => {
  const me = req.user.username;
  const chatId = req.params.chatId;
  const text = req.body.text || '';
  // Client ID — koristi se za deduplikaciju ako je poruka već stigla preko P2P DataChannela
  const clientId = req.body.clientId || null;

  let replyTo = null;
  if (req.body.replyTo) {
    try { replyTo = JSON.parse(req.body.replyTo); }
    catch { return res.status(400).json({ ok: false, error: 'Invalid replyTo' }); }
  }

  if (!text.trim() && (!req.files || req.files.length === 0)) {
    return res.status(400).json({ ok: false, error: 'Message cannot be empty' });
  }

  try {
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.members.includes(me)) {
      return res.status(404).json({ ok: false, error: 'Chat not found' });
    }

    // Upload svaki fajl na Cloudinary i spremi URL
    const files = await Promise.all((req.files || []).map(async file => {
      const isVideo = file.mimetype.startsWith('video');
      const isImage = file.mimetype.startsWith('image');
      const resourceType = isVideo ? 'video' : isImage ? 'image' : 'raw';

      const result = await uploadToCloudinary(file.buffer, {
        folder:          'brzojav',
        resource_type:   resourceType,
        access_mode:     'public',
        type:            'upload',
        use_filename:    true,
        unique_filename: true,
      });

      return {
        fileType: isVideo ? 'video' : isImage ? 'image' : 'file',
        url:      result.secure_url,
        name:     file.originalname,
      };
    }));

    const message = await Message.create({
      chatId,
      sender: me,
      text,
      files,
      replyTo,
    });

    // Update lastMessage preview na chat menuu
    chat.lastMessage   = text || (files.length ? '📎 File' : '');
    chat.lastMessageSender = me;
    chat.lastMessageAt = new Date();
    await chat.save();
    
    await UserChat.findOneAndUpdate(
      { username: me, chatId },
      { $set: { lastReadAt: new Date() } },
      { upsert: true }
    );

    // Svim drugim chat memberima pošalji novu poruku
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');

    // koristi isključivo za signaling + notifikacije, ne kao message relay.
    for (const member of chat.members) {
      if (member === me) continue;
      const socketId = onlineUsers?.get(member);
      if (!socketId) continue;

      io.to(socketId).emit('new_message', {
        chatId:    chatId.toString(),
        messageId: message._id.toString(),
        clientId,  // za dedupe ako je P2P već dostavio
        sender:    me,
      });

      // Refresh chat sidebar
      io.to(socketId).emit('chat_updated', {
        chatId:      chatId.toString(),
        lastMessage: chat.lastMessage,
        lastMessageSender: me,
      });
    }

    return res.status(201).json({ ok: true, message, clientId });
  } catch (err) {
    console.error('[messages] POST error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// DELETE /api/messages/:messageId — izbriši poruku
router.delete('/:messageId', async (req, res) => {
  const me        = req.user.username;
  const messageId = req.params.messageId;

  try {
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ ok: false, error: 'Message not found' });
    if (message.sender !== me) return res.status(403).json({ ok: false, error: 'Not your message' });

    const chat = await Chat.findById(message.chatId);
    await message.deleteOne();

    const io          = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');

    // Ako je obrisana poruka bila pinana, makni pin i obavijesti sve članove
    if (chat && chat.pinnedMessageId &&
        chat.pinnedMessageId.toString() === messageId.toString()) {
      chat.pinnedMessageId = null;
      chat.pinnedBy = '';
      await chat.save();
      for (const member of chat.members) {
        const socketId = onlineUsers?.get(member);
        if (socketId) {
          io.to(socketId).emit('chat_pinned', {
            chatId:    chat._id.toString(),
            messageId: null,
          });
        }
      }
    }

    // moze ostati stara poruka kao preview u sidebaru
    if (chat && chat.lastMessageAt && message.createdAt &&
        chat.lastMessageAt.getTime() === message.createdAt.getTime()) {
      await refreshLastMessage(chat);

      // Sidebar update ostalim clanovima
      for (const member of chat.members) {
        if (member === me) continue;
        const socketId = onlineUsers?.get(member);
        if (socketId) {
          io.to(socketId).emit('chat_updated', {
            chatId:      chat._id.toString(),
            lastMessage: chat.lastMessage,
            lastMessageSender: chat.lastMessageSender,
          });
        }
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[messages] DELETE error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// Pokazi novi reaction svim drugim članovima chata
async function broadcastReactions(req, message) {
  const chat = await Chat.findById(message.chatId);
  if (!chat) return;
  const io          = req.app.get('io');
  const onlineUsers = req.app.get('onlineUsers');
  const me          = req.user.username;

  for (const member of chat.members) {
    if (member === me) continue;
    const socketId = onlineUsers?.get(member);
    if (socketId) {
      io.to(socketId).emit('reactions_updated', {
        chatId:    chat._id.toString(),
        messageId: message._id.toString(),
      });
    }
  }
}

// POST /api/messages/:messageId/react — dodaj emoji
router.post('/:messageId/react', async (req, res) => {
  const me        = req.user.username;
  const messageId = req.params.messageId;
  const { emoji } = req.body;

  if (!emoji) return res.status(400).json({ ok: false, error: 'emoji is required' });

  try {
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ ok: false, error: 'Message not found' });

    // Zamjeni emoji s postojecim
    message.reactions = message.reactions.filter(r => r.sender !== me);
    message.reactions.push({ emoji, sender: me });
    await message.save();

    await broadcastReactions(req, message);

    return res.json({ ok: true, reactions: message.reactions });
  } catch (err) {
    console.error('[messages] POST /react error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// DELETE /api/messages/:messageId/react — removeamo reaction
router.delete('/:messageId/react', async (req, res) => {
  const me        = req.user.username;
  const messageId = req.params.messageId;

  try {
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ ok: false, error: 'Message not found' });

    message.reactions = message.reactions.filter(r => r.sender !== me);
    await message.save();

    await broadcastReactions(req, message);

    return res.json({ ok: true, reactions: message.reactions });
  } catch (err) {
    console.error('[messages] DELETE /react error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
