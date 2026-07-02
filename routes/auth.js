const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const UserChat = require('../models/UserChat');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { ok: false, error: 'Too many login attempts, try again later' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max:      5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { ok: false, error: 'Too many accounts created from this IP, try again later' },
});
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[auth] JWT_SECRET env var je obavezan');
}

// Javni podaci usera koje šaljemo klijentu
function publicUser(user) {
  return {
    username:       user.username,
    email:          user.email,
    phone:          user.phone,
    avatar:         user.avatar,
    name:           user.name,
    createdAt:      user.createdAt,
    showLastSeen:   user.showLastSeen,
    allowStrangers: user.allowStrangers,
    notificationsEnabled: user.notificationsEnabled,
    theme: user.theme,
    blockedUsers: user.blockedUsers || [],
  };
}

// POST /api/auth/register
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', registerLimiter, async (req, res) => {
  const { username, email, password, phone } = req.body;
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  if (!username || !email || !password) {
    return res.status(400).json({ ok: false, error: 'Username, email and password are required' });
  }

  if (!EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address' });
  }

  try {
    const existing = await User.findOne({
      $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
    });
    if (existing) {
      const field = existing.username === normalizedUsername ? 'Username' : 'Email';
      return res.status(400).json({ ok: false, error: `${field} is already taken` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      phone: phone || '',
    });

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({ ok: true, token, user: publicUser(user) });
  } catch (err) {
    console.error('[auth] Register error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { identifier, password } = req.body; // identifier = username ili email

  if (!identifier || !password) {
    return res.status(400).json({ ok: false, error: 'All fields are required' });
  }

  const normalized = identifier.trim().toLowerCase();

  try {
    const user = await User.findOne({
      $or: [{ username: normalized }, { email: normalized }],
    });

    if (!user || user.deleted) {
      return res.status(400).json({ ok: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ ok: false, error: 'Invalid credentials' });
    }

    user.lastSeen = new Date();
    await user.save();

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({ ok: true, token, user: publicUser(user) });
  } catch (err) {
    console.error('[auth] Login error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// GET /api/auth/me — profil trenutnog usera
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ ok: false, error: 'User nije pronađen' });

    return res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    console.error('[auth] GET /me error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});
router.patch('/me', authMiddleware, async (req, res) => {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (req.body.email !== undefined && !EMAIL_REGEX.test(req.body.email.trim())) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address' });
  }

  const allowed = ['name', 'email', 'phone', 'avatar', 'showLastSeen', 'allowStrangers', 'notificationsEnabled', 'theme'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  // Normaliziraj email ako se mijenja
  if (updates.email) updates.email = updates.email.trim().toLowerCase();

  try {
    // Provjeri da novi email već nije zauzet od strane drugog usera
    if (updates.email) {
      const clash = await User.findOne({
        email:    updates.email,
        username: { $ne: req.user.username },
      });
      if (clash) {
        return res.status(400).json({ ok: false, error: 'Email je već zauzet' });
      }
    }

    const user = await User.findOneAndUpdate(
      { username: req.user.username },
      { $set: updates },
      { new: true }
    );
    if (!user) return res.status(404).json({ ok: false, error: 'User nije pronađen' });

    return res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    console.error('[auth] PATCH /me error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// PATCH /api/auth/password — promjena passworda
router.patch('/password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: 'Oba passworda su obavezna' });
  }

  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ ok: false, error: 'User nije pronađen' });

    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) return res.status(400).json({ ok: false, error: 'Stari password je netočan' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth] PATCH /password error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// POST /api/auth/block — blokiraj ili odblokiraj usera
router.post('/block', authMiddleware, async (req, res) => {
  const { username, block } = req.body; // block: true = blokiraj, false = odblokiraj
  if (!username) return res.status(400).json({ ok: false, error: 'username je obavezan' });

  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ ok: false, error: 'User nije pronađen' });

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

// DELETE /api/auth/me — soft-delete usera i oslobađanje usernamea
router.delete('/me', authMiddleware, async (req, res) => {
  try {
    const me   = req.user.username;
    const user = await User.findOne({ username: me });
    if (!user) return res.status(404).json({ ok: false, error: 'User nije pronađen' });
    if (user.deleted) return res.json({ ok: true }); // idempotentno

    const tombstone = `deleted_${user._id}`;

    // Prebaci vlasništvo grupa, ili izbriši ako je user jedini član
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

    // Zamijeni username u svim referencama
    await Chat.updateMany(
      { members: me },
      { $set: { 'members.$[el]': tombstone } },
      { arrayFilters: [{ el: me }] },
    );
    await Chat.updateMany({ ownerId: me }, { $set: { ownerId: tombstone } });
    await Message.updateMany({ sender: me }, { $set: { sender: tombstone } });
    await UserChat.updateMany({ username: me }, { $set: { username: tombstone } });
    await User.updateMany({ blockedUsers: me }, { $pull: { blockedUsers: me } });

    user.username       = tombstone;
    user.deleted        = true;
    user.name           = 'Deleted user';
    user.email          = `deleted_${user._id}@deleted.local`;
    user.phone          = '';
    user.avatar         = '';
    user.password       = 'deleted';
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

module.exports = router;