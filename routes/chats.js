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

    // Blokirani useri gledatelja — njihove poruke ne smiju biti u previewu
    const meUser  = await User.findOne({ username: me }, 'blockedUsers');
    const blocked = new Set(meUser?.blockedUsers || []);

    // Ako je zadnju poruku poslao blokirani user, nadji zadnju poruku
    // koju NIJE poslao blokirani user — ona ide u preview umjesto nje.
    const previewOverride = {};
    if (blocked.size) {
      const blockedArr = Array.from(blocked);
      for (const c of chats) {
        if (c.lastMessageSender && blocked.has(c.lastMessageSender)) {
          const alt = await Message.findOne({
            chatId: c._id,
            sender: { $nin: blockedArr },
          }).sort({ createdAt: -1 });
          previewOverride[c._id.toString()] = alt
            ? { text: alt.text || (alt.files?.length ? '📎 File' : ''), sender: alt.sender }
            : { text: '', sender: '' };
        }
      }
    }

    // Resolve dijeljene pinane poruke (jedna po chatu)
    const pinnedIds = chats.map(c => c.pinnedMessageId).filter(Boolean);
    const pinnedMap = {};
    if (pinnedIds.length) {
      const pinnedMsgs = await Message.find({ _id: { $in: pinnedIds } });
      for (const m of pinnedMsgs) pinnedMap[m._id.toString()] = m;
    }

    const dmUsernames = chats
      .filter(c => !c.isGroup)
      .flatMap(c => c.members.filter(m => m !== me));

    const uniqueUsernames = [...new Set(dmUsernames)];
    const profiles = await User.find(
      { username: { $in: uniqueUsernames } },
      'username name avatar lastSeen showLastSeen phone deleted'
    );
    const profileMap = {};
    for (const p of profiles) profileMap[p.username] = p;

    const groupChats = chats.filter(c => c.isGroup);
    const allGroupMemberUsernames = [...new Set(groupChats.flatMap(c => c.members))];
    const groupMemberProfiles = await User.find(
      { username: { $in: allGroupMemberUsernames } },
      'username name avatar lastSeen showLastSeen deleted'
    );

    const memberMap = {};
    for (const p of groupMemberProfiles) memberMap[p.username] = p;

    const result = chats.map(chat => {
      const settings = settingsMap[chat._id.toString()] || {};
      const ov = previewOverride[chat._id.toString()];
      const pinnedMsg = chat.pinnedMessageId ? pinnedMap[chat.pinnedMessageId.toString()] : null;
      const base = {
        id: chat._id,
        isGroup: chat.isGroup,
        members: chat.members,
        lastMessage: ov ? ov.text : chat.lastMessage,
        lastMessageSender: ov ? ov.sender : (chat.lastMessageSender || ''),
        lastMessageAt: chat.lastMessageAt,
        pinned: settings.pinned || false,
        muted: settings.muted || false,
        nickname: settings.nickname || '',
        lastReadAt: settings.lastReadAt || null,
        pinnedMessageId: chat.pinnedMessageId ? chat.pinnedMessageId.toString() : null,
        pinnedMessage: pinnedMsg ? {
          id:       pinnedMsg._id.toString(),
          text:     pinnedMsg.text || (pinnedMsg.files?.length ? '📎 File' : ''),
          sender:   pinnedMsg.sender,
          pinnedBy: chat.pinnedBy || '',
        } : null,
      };

      if (chat.isGroup) {
        return {
          ...base,
          name: chat.name,
          avatar: chat.avatar,
          ownerId: chat.ownerId,
          members: chat.members.map(username => {
            const profile = memberMap[username];
            const isDeleted = profile?.deleted === true;
            return {
              username,
              name: isDeleted ? 'Deleted user' : (profile?.name || username),
              avatar: isDeleted ? '' : (profile?.avatar || ''),
              lastSeen: isDeleted ? null : (profile?.showLastSeen === false ? null : (profile?.lastSeen || null)),
              isOwner: username === chat.ownerId,
              isMe: username === me,
              deleted: isDeleted,
            };
          }),
        };
      }

      const otherUsername = chat.members.find(m => m !== me);
      const otherProfile  = profileMap[otherUsername];
      const otherDeleted  = otherProfile?.deleted === true;
      return {
        ...base,
        otherUser: otherProfile ? {
          username: otherProfile.username,
          name:     otherDeleted ? 'Deleted user' : otherProfile.name,
          avatar:   otherDeleted ? '' : otherProfile.avatar,
          lastSeen: otherDeleted ? null : (otherProfile.showLastSeen === false ? null : (otherProfile.lastSeen || null)),
          phone:    otherDeleted ? '' : (otherProfile.phone || ''),
          deleted:  otherDeleted,
        } : null,
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
    if (other.deleted) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    if (!other.allowStrangers) {
      return res.status(403).json({ ok: false, error: 'This user does not accept messages from strangers' });
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
    // Provjeri membere u bazi, ignoriraj one koji su obrisani ili ne postoje
    const requested = [...new Set(members.filter(u => u && u !== me))];
    const validUsers = await User.find(
      { username: { $in: requested }, deleted: { $ne: true } },
      'username'
    );
    const validUsernames = validUsers.map(u => u.username);

    if (validUsernames.length < 2) {
      return res.status(400).json({ ok: false, error: 'Need at least 2 valid members' });
    }

    const allMembers = [...new Set([me, ...validUsernames])];
    const chat = await Chat.create({
      members: allMembers,
      isGroup: true,
      name,
      ownerId: me,
    });

    //Obavijesti sve članove osim ownera da im se sidebar updatea
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
    if (!chat.members.includes(username)) {
      return res.status(404).json({ ok: false, error: 'User is not in this chat' });
    }
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

// POST /api/chats/:id/read — označi chat kao pročitan (postavi lastReadAt = now)
router.post('/:id/read', async (req, res) => {
  const me = req.user.username;
  const chatId = req.params.id;
  try {
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.members.includes(me)) {
      return res.status(404).json({ ok: false, error: 'Chat not found' });
    }
    const now = new Date();
    await UserChat.findOneAndUpdate(
      { username: me, chatId },
      { $set: { lastReadAt: now } },
      { upsert: true, new: true }
    );
    return res.json({ ok: true, lastReadAt: now });
  } catch (err) {
    console.error('[chats] POST /:id/read error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/chats/:id/pin-message — pinaj/odpinaj poruku (dijeljeno za sve članove)
router.post('/:id/pin-message', async (req, res) => {
  const me = req.user.username;
  const chatId = req.params.id;
  const { messageId } = req.body; // messageId za pin, null/prazno za unpin

  try {
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.members.includes(me)) {
      return res.status(404).json({ ok: false, error: 'Chat not found' });
    }

    let snapshot = null;
    if (messageId) {
      const msg = await Message.findById(messageId);
      if (!msg || msg.chatId.toString() !== chatId.toString()) {
        return res.status(404).json({ ok: false, error: 'Message not found in this chat' });
      }
      chat.pinnedMessageId = msg._id;
      chat.pinnedBy = me;
      snapshot = {
        id:       msg._id.toString(),
        text:     msg.text || (msg.files?.length ? '📎 File' : ''),
        sender:   msg.sender,
        pinnedBy: me,
      };
    } else {
      chat.pinnedMessageId = null;
      chat.pinnedBy = '';
    }
    await chat.save();

    // Obavijesti sve druge članove u realnom vremenu
    const io          = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    for (const member of chat.members) {
      if (member === me) continue;
      const socketId = onlineUsers?.get(member);
      if (socketId) {
        io.to(socketId).emit('chat_pinned', {
          chatId:    chatId.toString(),
          messageId: messageId || null,
          text:      snapshot ? snapshot.text : '',
          sender:    snapshot ? snapshot.sender : '',
          by:        snapshot ? me : '',
        });
      }
    }

    return res.json({ ok: true, pinnedMessage: snapshot });
  } catch (err) {
    console.error('[chats] POST /:id/pin-message error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;
