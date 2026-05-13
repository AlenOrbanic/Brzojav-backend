/**
 * Svakih GOSSIP_INTERVAL nodeovi šalju svoje podatke drugim nodeovima te se mergeaju/ažuriraju zapisi.
 */

const fetch    = require('node-fetch'); // HTTP requests to other nodes
const registry = require('./registry');
const peers    = require('./peers');

const GOSSIP_INTERVAL = parseInt(process.env.GOSSIP_INTERVAL_MS) || 30_000;
const SELF_URL = process.env.SELF_URL || `http://localhost:${process.env.PORT || 3000}`;
const NODE_ID = process.env.NODE_ID  || `node-${process.env.PORT || 3000}`;
const REQUEST_TIMEOUT = 5_000; // 5 s per peer

async function syncToPeer(peer) {
  const body = {
    fromNode: NODE_ID,
    fromUrl:  SELF_URL,
    records:  registry.all(),
  };

  // Cancela fetch request kojemu treba predugo
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(`${peer.url}/api/sync`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    peers.setHealth(peer.id, res.ok);
    if (res.ok) {
      // Peer sends back its own records — merge them too
      const data = await res.json();
      if (Array.isArray(data.records)) {
        const n = registry.merge(data.records);
        if (n > 0) {
          console.log(`[gossip] Merged ${n} record(s) from ${peer.id}`);
        }
      }
    }
  } catch (err) {
    peers.setHealth(peer.id, false);
    if (err.name !== 'AbortError') {
      console.warn(`[gossip] Could not reach ${peer.id} (${peer.url}): ${err.message}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function gossipRound() {
  const targets = peers.othersExcept(SELF_URL);
  if (targets.length === 0) return;

  console.log(`[gossip] Syncing with ${targets.length} peer(s)…`);
  await Promise.allSettled(targets.map(syncToPeer));
}

// Synca sve peerove odjednom
setInterval(gossipRound, GOSSIP_INTERVAL);

module.exports = { gossipRound, syncToPeer };
