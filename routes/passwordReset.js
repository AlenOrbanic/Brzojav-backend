const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const User = require('../models/User'); // adjust the path if your model lives elsewhere

const router = express.Router();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again later.' },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Please try again later.' },
});

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  // Same response every time so attackers can't discover which accounts exist
  const genericResponse = {
    ok: true,
    message: 'If an account with that email or username exists, a reset link has been sent.',
  };

  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== 'string') {
      return res.status(400).json({ ok: false, error: 'Email or username is required' });
    }

    // username and email are stored lowercase in the schema
    const id = identifier.trim().toLowerCase();

    const user = await User.findOne({
      deleted: { $ne: true },
      $or: [{ email: id }, { username: id }],
    });

    if (user && user.email) {
      const rawToken = crypto.randomBytes(32).toString('hex');

      user.resetPasswordToken = hashToken(rawToken);
      user.resetPasswordExpires = new Date(Date.now() + TOKEN_TTL_MS);
      await user.save();

      const link = `${FRONTEND_URL}/reset-password?token=${rawToken}`;

      // Not awaited on purpose: the response time stays the same whether or not the account exists
      transporter
        .sendMail({
          from: process.env.MAIL_FROM || process.env.SMTP_USER,
          to: user.email,
          subject: 'Brzojav password reset',
          text: `You requested a password reset.\n\nOpen this link to choose a new password (valid for 1 hour):\n${link}\n\nIf you didn't request this, you can ignore this email.`,
          html: `
            <p>You requested a password reset.</p>
            <p><a href="${link}">Click here to choose a new password</a> (valid for 1 hour).</p>
            <p>If you didn't request this, you can ignore this email.</p>
          `,
        })
        .catch((err) => console.error('[forgot-password] mail error:', err.message));
    }

    return res.json(genericResponse);
  } catch (err) {
    console.error('[forgot-password] error:', err);
    return res.json(genericResponse);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', resetLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ ok: false, error: 'Token and new password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({
      deleted: { $ne: true },
      resetPasswordToken: hashToken(token),
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ ok: false, error: 'Reset link is invalid or has expired' });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.json({ ok: true, message: 'Password has been reset' });
  } catch (err) {
    console.error('[reset-password] error:', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong' });
  }
});

module.exports = router;