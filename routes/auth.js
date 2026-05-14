const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const User     = require('../models/User');

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
        email:    user.email,
        phone:    user.phone,
        avatar:   user.avatar,
        name:     user.name,
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
        { email:    identifier.toLowerCase() },
      ],
    });

    if (!user) {
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
        email:    user.email,
        phone:    user.phone,
        avatar:   user.avatar,
        name:     user.name,
      },
    });
  } catch (err) {
    console.error('[auth] Login error:', err.message);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

module.exports = router;