/**
 * routes/users.js
 * 
 * POST /api/users/register  — client registers their IP + P2P port
 * POST /api/users/heartbeat — client refreshes their lastSeen (keeps them "online")
 * POST /api/users/logout    — client explicitly goes offline
 */

const router   = require('express').Router();
const registry = require('../registry');
const gossip   = require('../gossip');

const NODE_ID = process.env.NODE_ID || `node-${process.env.PORT || 3000}`;

router.post('/register', (req, res) => {
  const { username, p2pPort } = req.body;

  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ ok: false, error: 'username is required' });
  }

  // 3 Načina da dobijemo IP klijenta
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    req.ip;

  const record = registry.register(
    username.trim().toLowerCase(),
    ip,
    parseInt(p2pPort) || 9000,
    NODE_ID,
  );

  console.log(`[users] Registered: ${record.username} @ ${ip}:${record.p2pPort}`);

  // Odmah nakon registracije šaljemo gossip nodeovima da se ažuriraju
  gossip.gossipRound().catch(() => {});

  return res.json({ ok: true, record });
});

// Klijent šalje heartbeat da ostane "online" (osvježava lastSeen timestamp), inače će biti izbrisan nakon TTL-a
router.post('/heartbeat', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: 'username required' });

  const existing = registry.lookup(username);
  if (!existing) return res.status(404).json({ ok: false, error: 'user not found on this node' });

  const updated = registry.register(
    existing.username,
    existing.ip,
    existing.p2pPort,
    existing.nodeId,
  );

  return res.json({ ok: true, record: updated });
});

router.post('/logout', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false, error: 'username required' });

  registry.remove(username);
  console.log(`[users] Removed: ${username}`);

  return res.json({ ok: true });
});

module.exports = router;
