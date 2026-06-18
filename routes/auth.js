const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const UserChat = require('../models/UserChat');
const JWT_SECRET = process.env.JWT_SECRET;

router.post('/register', async (req, res) => {
  const { username, email, password, phone } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ ok: false, error: 'Username, email and password are required' });
  }

  try {
    // Provjeri ako vec postoji
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      const field = existing.username === username.toLowerCase() ? 'Username' : 'Email';
      return res.status(400).json({ ok: false, error: `${field} is already taken` });
    }

    // Hashiramo password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      phone: phone || '',
    });

    // Create token
    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      ok: true,
      token,
      user: {
        username: user.username,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        name: user.name,
      },
    });
  } catch (err) {
    console.error('[auth] Register error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body; // identifier = username ili email

  if (!identifier || !password) {
    return res.status(400).json({ ok: false, error: 'All fields are required' });
  }

  try {
    const user = await User.findOne({
      $or: [
        { username: identifier.toLowerCase() },
        { email: identifier.toLowerCase() },
      ],
    });

    if (!user) {
      return res.status(400).json({ ok: false, error: 'Invalid credentials' });
    }
    if (user.deleted) {
      return res.status(400).json({ ok: false, error: 'Invalid credentials' });
    }
    // Check password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ ok: false, error: 'Invalid credentials' });
    }

    // Update lastSeen
    user.lastSeen = new Date();
    await user.save();

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      ok: true,
      token,
      user: {
        username: user.username,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        name: user.name,
      },
    });
  } catch (err) {
    console.error('[auth] Login error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

const authMiddleware = require('../middleware/auth'); //Register i login moraju biti bez tokena dok me ruta ga mora imati

// GET /api/auth/me — dohvati profil trenutnog usera
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    return res.json({
      ok: true,
      user: {
        username: user.username,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        name: user.name,
        createdAt: user.createdAt,
        showLastSeen: user.showLastSeen,
        allowStrangers: user.allowStrangers,
      },
    });
  } catch (err) {
    console.error('[auth] GET /me error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});
// PATCH /api/auth/me — update profil trenutnog usera
router.patch('/me', authMiddleware, async (req, res) => {
  const { name, username, email, phone, avatar } = req.body;

  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;
    if (username !== undefined) user.username = username;
    if (req.body.showLastSeen !== undefined) user.showLastSeen = req.body.showLastSeen;
    if (req.body.allowStrangers !== undefined) user.allowStrangers = req.body.allowStrangers;
    await user.save();

    return res.json({ ok: true, user: {
      username: user.username,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      name: user.name,
    }});
  } catch (err) {
    console.error('[auth] PATCH /me error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/auth/block
router.post('/block', authMiddleware, async (req, res) => {
  const { username, block } = req.body; // block: true = block, false = unblock
  if (!username) return res.status(400).json({ ok: false, error: 'username is required' });
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    if (block) {
      if (!user.blockedUsers.includes(username)) user.blockedUsers.push(username);
    } else {
      user.blockedUsers = user.blockedUsers.filter(u => u !== username);
    }
    await user.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth] POST /block error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});
//Change password
router.patch('/password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: 'Both passwords are required' });
  }
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) return res.status(400).json({ ok: false, error: 'Old password is incorrect' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth] PATCH /password error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});
// DELETE /api/auth/me — soft-delete current account + free up the username
router.delete('/me', authMiddleware, async (req, res) => {
  try {
    const me = req.user.username;
    const user = await User.findOne({ username: me });
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    if (user.deleted) return res.json({ ok: true }); // idempotent

    const tombstone = `deleted_${user._id}`;

    //Transfer ownership grupe
    const ownedGroups = await Chat.find({ isGroup: true, ownerId: me });
    for (const g of ownedGroups) {
      const others = g.members.filter(m => m !== me);
      if (others.length === 0) {
        await g.deleteOne();
      } else {
        g.ownerId = others[0];
        await g.save();
      }
    }

    // Rewriteaj username u svim chatovima gdje se pojavljuje
    await Chat.updateMany(
      { members: me },
      { $set: { 'members.$[el]': tombstone } },
      { arrayFilters: [{ el: me }] }
    );

    await Chat.updateMany({ ownerId: me }, { $set: { ownerId: tombstone } });
    await Message.updateMany({ sender: me }, { $set: { sender: tombstone } });
    await UserChat.updateMany({ username: me }, { $set: { username: tombstone } });
    await User.updateMany(
      { blockedUsers: me },
      { $pull: { blockedUsers: me } }
    );
    
    user.username       = tombstone;
    user.deleted        = true;
    user.name           = 'Deleted user';
    user.email          = `deleted_${user._id}@deleted.local`; // keeps unique-index happy
    user.phone          = '';
    user.avatar         = '';
    user.password       = 'deleted';      // bcrypt.compare against this will always fail
    user.blockedUsers   = [];
    user.allowStrangers = false;
    user.showLastSeen   = false;
    user.lastSeen       = null;
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth] DELETE /me error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});
// PATCH /api/auth/me — update profile settings
router.patch('/me', authMiddleware, async (req, res) => {
  try {
    const allowed = ['name', 'username', 'email', 'phone', 'avatar', 'showLastSeen', 'allowStrangers', 'blockedUsers'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const user = await User.findOneAndUpdate(
      { username: req.user.username },
      { $set: updates },
      { new: true }
    );
    return res.json({ ok: true, user });
  } catch (err) {
    console.error('[auth] PATCH /me error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});
module.exports = router;