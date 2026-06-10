// Koristi middleware(autentikaciju), treba nam validan token da pristupimo ovim endpointima

const router   = require('express').Router();
const Chat     = require('../models/Chat');
const UserChat = require('../models/UserChat');
const User     = require('../models/User');
const Message  = require('../models/Message');

// GET /api/chats — dobijemo sve chatove od usera
router.get('/', async (req, res) => {
  const me = req.user.username;

  try {
    const chats = await Chat.find({ members: me }).sort({ lastMessageAt: -1 });

    const userChats = await UserChat.find({
      username: me,
      chatId: { $in: chats.map(c => c._id) },
    });

    const settingsMap = {};
    for (const uc of userChats) {
      settingsMap[uc.chatId.toString()] = uc;
    }

    const dmUsernames = chats
      .filter(c => !c.isGroup)
      .flatMap(c => c.members.filter(m => m !== me));

    const uniqueUsernames = [...new Set(dmUsernames)];
    const profiles = await User.find(
      { username: { $in: uniqueUsernames } },
      'username name avatar lastSeen'
    );
    const profileMap = {};
    for (const p of profiles) profileMap[p.username] = p;

    const groupChats = chats.filter(c => c.isGroup);
    const allGroupMemberUsernames = [...new Set(groupChats.flatMap(c => c.members))];
    const groupMemberProfiles = await User.find(
      { username: { $in: allGroupMemberUsernames } },
      'username name avatar lastSeen'
    );

    const memberMap = {};
    for (const p of groupMemberProfiles) memberMap[p.username] = p;

    const result = chats.map(chat => {
      const settings = settingsMap[chat._id.toString()] || {};
      const base = {
        id: chat._id,
        isGroup: chat.isGroup,
        members: chat.members,
        lastMessage: chat.lastMessage,
        lastMessageAt: chat.lastMessageAt,
        pinned: settings.pinned || false,
        muted: settings.muted || false,
        nickname: settings.nickname || '',
      };

      if (chat.isGroup) {
        return {
          ...base,
          name: chat.name,
          avatar: chat.avatar,
          ownerId: chat.ownerId,
          members: chat.members.map(username => ({
            username,
            name:     memberMap[username]?.name     || username,
            avatar:   memberMap[username]?.avatar   || '',
            lastSeen: memberMap[username]?.lastSeen || null,
            isOwner:  username === chat.ownerId,
            isMe:     username === me,
          })),
        };
      }

      return {
        ...base,
        otherUser: profileMap[chat.members.find(m => m !== me)] || null,
      };
    });

    return res.json({ ok: true, chats: result });
  } catch (err) {
    console.error('[chats] GET / error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/chats — get or create a DM chat with another user
router.post('/', async (req, res) => {
  const me = req.user.username;
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ ok: false, error: 'username is required' });
  }

  if (username === me) {
    return res.status(400).json({ ok: false, error: 'Cannot chat with yourself' });
  }

  try {
    // Check if the other user exists
    const other = await User.findOne({ username });
    if (!other) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Look for existing DM chat between the two users
    const members = [me, username].sort();
    let chat = await Chat.findOne({ isGroup: false, members: { $all: members, $size: 2 } });
    const isNew = !chat;

    if (!chat) {
      chat = await Chat.create({ members, isGroup: false });
    }

    // Notify the other user in real time so their sidebar updates instantly
    if (isNew) {
      const io          = req.app.get('io');
      const onlineUsers = req.app.get('onlineUsers');
      const socketId    = onlineUsers.get(username);
      if (socketId) {
        io.to(socketId).emit('chat_added');
      }
    }

    return res.json({ ok: true, chat });
  } catch (err) {
    console.error('[chats] POST / error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/chats/group — create a group chat
router.post('/group', async (req, res) => {
  const me = req.user.username;
  const { name, members } = req.body;

  if (!name || !Array.isArray(members) || members.length < 2) {
    return res.status(400).json({ ok: false, error: 'name and at least 2 members are required' });
  }

  try {
    // Always include creator
    const allMembers = [...new Set([me, ...members])];

    const chat = await Chat.create({
      members: allMembers,
      isGroup: true,
      name,
      ownerId: me,
    });

    // Notify all members except creator so their sidebar updates instantly
    const io          = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    for (const member of allMembers) {
      if (member === me) continue;
      const socketId = onlineUsers.get(member);
      if (socketId) {
        io.to(socketId).emit('chat_added');
      }
    }

    return res.status(201).json({ ok: true, chat });
  } catch (err) {
    console.error('[chats] POST /group error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// PATCH /api/chats/:id — update group name/avatar, or personal settings (pin/mute/nickname)
router.patch('/:id', async (req, res) => {
  const me = req.user.username;
  const chatId = req.params.id;
  const { name, avatar, pinned, muted, nickname } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.members.includes(me)) {
      return res.status(404).json({ ok: false, error: 'Chat not found' });
    }

    // Group-level changes (owner only)
    if (chat.isGroup && (name !== undefined || avatar !== undefined)) {
      if (chat.ownerId !== me) {
        return res.status(403).json({ ok: false, error: 'Only the owner can edit group info' });
      }
      if (name !== undefined) chat.name   = name;
      if (avatar !== undefined) chat.avatar = avatar;
      await chat.save();
    }

    // Personal settings (pin, mute, nickname) — stored in UserChat
    if (pinned !== undefined || muted !== undefined || nickname !== undefined) {
      await UserChat.findOneAndUpdate(
        { username: me, chatId },
        { $set: { pinned, muted, nickname } },
        { upsert: true, new: true }
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[chats] PATCH error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/chats/:id/leave — leave or delete a group
router.post('/:id/leave', async (req, res) => {
  const me = req.user.username;
  const chatId = req.params.id;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.members.includes(me)) {
      return res.status(404).json({ ok: false, error: 'Chat not found' });
    }

    if (!chat.isGroup) {
      return res.status(400).json({ ok: false, error: 'Cannot leave a DM chat' });
    }

    if (chat.ownerId === me) {
      // Owner leaving = delete the group entirely
      const io          = req.app.get('io');
      const onlineUsers = req.app.get('onlineUsers');
      for (const member of chat.members) {
        if (member === me) continue;
        const socketId = onlineUsers.get(member);
        if (socketId) {
          io.to(socketId).emit('chat_removed', { chatId: chatId.toString() });
        }
      }
      await Message.deleteMany({ chatId });
      await UserChat.deleteMany({ chatId });
      await chat.deleteOne();
      return res.json({ ok: true, deleted: true });
    }

    // Regular member leaving
    chat.members = chat.members.filter(m => m !== me);
    await chat.save();
    await UserChat.deleteOne({ username: me, chatId });

    return res.json({ ok: true, deleted: false });
  } catch (err) {
    console.error('[chats] POST /leave error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/chats/:id/kick — kick a member (owner only)
router.post('/:id/kick', async (req, res) => {
  const me = req.user.username;
  const chatId = req.params.id;
  const { username } = req.body;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ ok: false, error: 'Chat not found' });
    if (chat.ownerId !== me) return res.status(403).json({ ok: false, error: 'Only the owner can kick members' });
    if (!username || username === me) return res.status(400).json({ ok: false, error: 'Invalid username' });

    chat.members = chat.members.filter(m => m !== username);
    await chat.save();
    await UserChat.deleteOne({ username, chatId });

    const io          = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    const socketId    = onlineUsers.get(username);
    if (socketId) {
      io.to(socketId).emit('chat_removed', { chatId: chatId.toString() });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[chats] POST /kick error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;