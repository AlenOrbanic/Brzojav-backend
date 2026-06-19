/**
 * registry.js
 *
 * In-memory lookup table: username -> { ip, port, lastSeen, nodeId }
 * Svaki seed node drži svoju kopiju. Nodeovi međusobno "gossipaju" tako da svaki node
 * ima potpunu sliku nodeova.
 */

const store = new Map(); // Map<username, UserRecord>

function register(username, ip, p2pPort, nodeId) {
  const record = {
    username,
    ip,
    p2pPort: p2pPort || 9000,
    nodeId:  nodeId  || 'unknown',
    lastSeen: Date.now(),
  };
  store.set(username.toLowerCase(), record);
  return record;
}

function lookup(username) {
  return store.get(username.toLowerCase()) || null;
}

// Logouot/ttl expiry/delete account
function remove(username) {
  store.delete(username.toLowerCase());
}

//Vraća sve zapise kao array radi synca između nodeova
function all() {
  return Array.from(store.values());
}

function merge(records) {
  let updated = 0;
  for (const incoming of records) {
    if (!incoming.username) continue;
    const key = incoming.username.toLowerCase();
    const existing = store.get(key);

    if (!existing) {
      // node si dodaje novog usera
      store.set(key, { ...incoming, username: key });
      updated++;
    } else if (incoming.lastSeen > existing.lastSeen &&
               (incoming.ip !== existing.ip || incoming.p2pPort !== existing.p2pPort)) {
      // noviji zapis s drugacijim IP-em/portom — updateamo usera
      store.set(key, { ...incoming, username: key });
      updated++;
    } else if (incoming.lastSeen > existing.lastSeen) {
      // samo se last seen promjenio, updateamo timestamp bez povećavanja broja mergeanih zapisa
      existing.lastSeen = incoming.lastSeen;
    }
    // stariji zapis — ignoriramo (LWW)
  }
  return updated;
}

// TTL expiry timing, briše zapise koji nisu ažurirani duže od ttlMs
function purgeStale(ttlMs = 5 * 60 * 1000) {
  const cutoff = Date.now() - ttlMs;
  let removed = 0;
  for (const [key, record] of store.entries()) {
    if (record.lastSeen < cutoff) {
      store.delete(key);
      removed++;
    }
  }
  return removed;
}

/** Total number of registered users on this node */
function count() {
  return store.size;
}

// Svake dvije minute provjeri ttl
function start() {
  setInterval(() => {
    const n = purgeStale();
    if (n > 0) console.log(`[registry] Purged ${n} stale record(s)`);
  }, 2 * 60 * 1000);
}

module.exports = { register, lookup, remove, all, merge, count, purgeStale, start };