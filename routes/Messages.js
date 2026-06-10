// Koristi middleware(autentikaciju), treba nam validan token da pristupimo ovim endpointima

const router             = require('express').Router();
const Message            = require('../models/Message');
const Chat               = require('../models/Chat');
const { upload, uploadToCloudinary } = require('../middleware/upload');

// GET /api/messages/:chatId — uhvati poruke iz chata
router.get('/:chatId', async (req, res) => {
  const me     = req.user.username;
  const chatId = req.params.chatId;
  const limit  = parseInt(req.query.limit) || 50;
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
  const me      = req.user.username;
  const chatId  = req.params.chatId;
  const text    = req.body.text || '';
  const replyTo = req.body.replyTo ? JSON.parse(req.body.replyTo) : null;

  if (!text.trim() && (!req.files || req.files.length === 0)) {
    return res.status(400).json({ ok: false, error: 'Message cannot be empty' });
  }

  try {
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.members.includes(me)) {
      return res.status(404).json({ ok: false, error: 'Chat not found' });
    }

    // Upload svaki fajl na Cloudinary i spremi URL
    const files = [];
    for (const file of (req.files || [])) {
      const isVideo  = file.mimetype.startsWith('video');
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

      files.push({
        fileType: isVideo ? 'video' : isImage ? 'image' : 'file',
        url:      result.secure_url,
        name:     file.originalname,
      });
    }

    const message = await Message.create({
      chatId,
      sender: me,
      text,
      files,
      replyTo,
    });

    // Update lastMessage preview na chat menuu
    chat.lastMessage   = text || (files.length ? '📎 File' : '');
    chat.lastMessageAt = new Date();
    await chat.save();

    // Svim drugim chat memberima pošalji novu poruku
    const io          = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');

    for (const member of chat.members) {
      if (member === me) continue;
      const socketId = onlineUsers.get(member);
      if (socketId) {
        io.to(socketId).emit('new_message', {
          chatId:  chatId.toString(),
          message: {
            id:        message._id,
            sender:    me,
            text:      message.text,
            files:     message.files,
            replyTo:   message.replyTo,
            reactions: message.reactions,
            time:      message.createdAt,
          },
        });

        // Refresh chat sidebar
        io.to(socketId).emit('chat_updated', {
          chatId: chatId.toString(),
          lastMessage: chat.lastMessage,
        });
      }
    }

    return res.status(201).json({ ok: true, message });
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

    await message.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[messages] DELETE error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

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

    return res.json({ ok: true, reactions: message.reactions });
  } catch (err) {
    console.error('[messages] DELETE /react error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;