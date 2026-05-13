/**
Lista hardkodiranih nodeova
 */

const SEED_NODES = [
  { id: 'seed-1', url: process.env.SEED_1_URL || 'http://localhost:3001' },
  { id: 'seed-2', url: process.env.SEED_2_URL || 'http://localhost:3002' },
  { id: 'seed-3', url: process.env.SEED_3_URL || 'http://localhost:3003' },
];

const peers = new Map(); // id -> { id, url, lastSeen, healthy }

for (const s of SEED_NODES) {
  peers.set(s.id, { ...s, lastSeen: null, healthy: null });
}

function list() {
  return Array.from(peers.values());
}

function healthy() {
  return list().filter(p => p.healthy !== false);
}

function setHealth(id, status) {
  const p = peers.get(id);
  if (p) {
    p.healthy  = status;
    p.lastSeen = Date.now();
  }
}

function othersExcept(selfUrl) {
  return healthy().filter(p => p.url !== selfUrl);
}

module.exports = { SEED_NODES, list, healthy, setHealth, othersExcept };
