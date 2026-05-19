// Koristi middleware(autentikaciju), treba nam validan token da pristupimo ovim endpointima

const router  = require('express').Router();
const Message = require('../models/Message');
const Chat = require('../models/Chat');

// GET /api/messages/:chatId — uhvati poruke iz chata
router.get('/:chatId', async (req, res) => {
  const me = req.user.username;
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

// POST /api/messages/:chatId — slanje poruke
router.post('/:chatId', async (req, res) => {
  const me     = req.user.username;
  const chatId = req.params.chatId;
  const { text = '', replyTo = null, files = [] } = req.body;

  if (!text.trim() && files.length === 0) {
    return res.status(400).json({ ok: false, error: 'Message cannot be empty' });
  }

  try {
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.members.includes(me)) {
      return res.status(404).json({ ok: false, error: 'Chat not found' });
    }

    const message = await Message.create({
      chatId,
      sender: me,
      text,
      files,
      replyTo,
    });

    // Update lastMessage preview na chat menuu
    chat.lastMessage = text || (files.length ? '📎 File' : '');
    chat.lastMessageAt = new Date();
    await chat.save();

    return res.status(201).json({ ok: true, message });
  } catch (err) {
    console.error('[messages] POST error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// DELETE /api/messages/:messageId — izbriši poruku
router.delete('/:messageId', async (req, res) => {
  const me = req.user.username;
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
  const me = req.user.username;
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
  const me = req.user.username;
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