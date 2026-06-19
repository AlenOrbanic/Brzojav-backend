const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[auth-middleware] JWT_SECRET env var je obavezan');
}

module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const [scheme, token] = (authHeader || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'No token, access denied' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next(); // token je validan, nastavi
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      ok:    false,
      error: expired ? 'Session expired' : 'Invalid token',
    });
  }
};