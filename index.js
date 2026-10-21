const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const jwt        = require('jsonwebtoken');
const helmet     = require('helmet');
const { Server } = require('socket.io');
const User = require('./models/User');
require('dotenv').config();

const registry = require('./registry');
const peers    = require('./peers');
const gossip   = require('./gossip');

const app    = express();
const server = http.createServer(app);
app.set('trust proxy', 1);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket'],
  pingInterval: 25000,
  pingTimeout: 20000,
  perMessageDeflate: false,
});

const PORT    = parseInt(process.env.PORT, 10) || 3000;
const NODE_ID = process.env.NODE_ID || `node-${PORT}`;

// Security headers
app.use(helmet());

// NoSQL injection guard
function stripMongoOperators(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      stripMongoOperators(obj[key]);
    }
  }
}
app.use((req, res, next) => {
  stripMongoOperators(req.body);
  stripMongoOperators(req.params);
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Node-Secret'],
  maxAge: 86400
}));
app.use(express.json({ limit: '10mb' }));

//node id za svaki request handler
app.set('nodeId', NODE_ID);
app.set('port', PORT);
app.set('io', io);

// Track username -> socket id
const onlineUsers = new Map();
app.set('onlineUsers', onlineUsers);

// Socket.IO auth — username dolazi iz tokena
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.username = String(payload.username || '').toLowerCase();
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});
// --- Presence ---
// "online" = has a live socket AND sent an activity ping recently.
// The client pings every ~25s while the tab is visible and the user is active,
// so a forgotten open tab or a sleeping laptop goes "inactive" after ~70s.
const socketsByUser = new Map();   // username -> Set<socketId> (multi-tab safe)
const offlineTimers = new Map();   // grace period so page refreshes don't flicker
const lastPing      = new Map();   // username -> ms timestamp of last activity ping
const announced     = new Map();   // username -> last online state pushed to subscribers
const GRACE_MS      = 5000;
const ONLINE_TTL_MS = 100000;
const SWEEP_MS      = 20000;
const MAX_SUBS      = 500;

const isConnected = (u) => (socketsByUser.get(u)?.size ?? 0) > 0;
const isOnline    = (u) => isConnected(u) && (Date.now() - (lastPing.get(u) || 0)) < ONLINE_TTL_MS;

async function getStatuses(usernames) {
  if (!usernames.length) return [];
  // Raw driver on purpose: Mongoose's sanitizeFilter (if enabled in db.js) rewrites
  // $in/$ne into harmless $eq matches, which made this query return nothing.
  const all = await User.collection
    .find({ username: { $in: usernames } }, { projection: { username: 1, lastSeen: 1, showLastSeen: 1, deleted: 1 } })
    .toArray();
  const docs = all.filter(d => d.deleted !== true);
  return docs.map(d => {
    const hidden = d.showLastSeen === false;
    // newest known activity wins (the DB value can lag behind the in-memory ping)
    let lastSeen = d.lastSeen;
    const lp = lastPing.get(d.username);
    if (lp && (!lastSeen || lp > new Date(lastSeen).getTime())) lastSeen = new Date(lp);
    return {
      username: d.username,
      hidden,
      online:   hidden ? false : isOnline(d.username),
      lastSeen: hidden ? null  : lastSeen,
    };
  });
}

async function broadcastPresence(username) {
  try {
    const [status] = await getStatuses([username]);
    if (status) io.to(`presence:${username}`).emit('presence', status);
  } catch (e) {
    console.warn('[presence] broadcast failed:', e.message);
  }
}

// Recompute the user's state and push it to subscribers only if it changed.
async function syncPresence(u) {
  const now = isOnline(u);
  if (announced.get(u) === now) return;
  announced.set(u, now);
  console.log(`[presence] ${u} -> ${now ? 'online' : 'inactive'}`);
  if (!now && lastPing.has(u)) {
    // went inactive: remember the moment of their last real activity
    await User.updateOne({ username: u }, { lastSeen: new Date(lastPing.get(u)) }).catch(() => {});
  }
  broadcastPresence(u);
}

// Catch users whose pings stopped (tab hidden, idle, laptop asleep) while the socket is still open.
setInterval(() => {
  for (const [u, wasOnline] of announced) {
    if (wasOnline && isConnected(u) && !isOnline(u)) syncPresence(u);
  }
}, SWEEP_MS);

io.on('connection', (socket) => {
  const u = socket.username;
  onlineUsers.set(u, socket.id);

  // presence: track socket
  let set = socketsByUser.get(u);
  if (!set) { set = new Set(); socketsByUser.set(u, set); }
  set.add(socket.id);
  clearTimeout(offlineTimers.get(u));
  offlineTimers.delete(u);
  lastPing.set(u, Date.now());
  syncPresence(u);

  socket.on('presence-subscribe', async (usernames, ack) => {
    if (!Array.isArray(usernames)) return;
    const list = [...new Set(
      usernames.filter(x => typeof x === 'string').map(x => x.toLowerCase())
    )].slice(0, MAX_SUBS);
    list.forEach(name => socket.join(`presence:${name}`));
    try {
      const statuses = await getStatuses(list);
      console.log(`[presence] ${u} subscribed to ${list.length} users, found ${statuses.length}`);
      if (typeof ack === 'function') ack(statuses);
    } catch (e) {
      console.warn('[presence] subscribe failed:', e.message);
    }
  });

  // activity heartbeat from the client (tab visible + user active)
  socket.on('presence-ping', () => {
    lastPing.set(u, Date.now());
    syncPresence(u);
  });

  // client calls this after changing the "last seen" privacy setting
  socket.on('presence-refresh', () => broadcastPresence(u));

  // WebRTC signaling
  socket.on('webrtc-signal', ({ to, data }) => {
    if (!to || typeof to !== 'string') return;
    const targetSocketId = onlineUsers.get(to.toLowerCase());
    if (!targetSocketId) return;
    io.to(targetSocketId).emit('webrtc-signal', {
      from: u,
      data,
    });
  });

  socket.on('disconnect', () => {
    const s = socketsByUser.get(u);
    if (s) s.delete(socket.id);

    // keep onlineUsers pointing at a live socket if the user has another tab open
    if (onlineUsers.get(u) === socket.id) {
      const remaining = s && s.size > 0 ? s.values().next().value : null;
      if (remaining) onlineUsers.set(u, remaining);
      else onlineUsers.delete(u);
    }

    if (!s || s.size > 0) return;
    socketsByUser.delete(u);

    offlineTimers.set(u, setTimeout(async () => {
      offlineTimers.delete(u);
      if (isConnected(u)) return;   // came back within the grace period
      // if they were active right up to the disconnect, "now" is accurate;
      // otherwise use the time of their last ping
      const last = lastPing.get(u) || 0;
      const when = (Date.now() - last) < ONLINE_TTL_MS ? Date.now() : (last || Date.now());
      lastPing.delete(u);
      announced.set(u, false);
      await User.updateOne({ username: u }, { lastSeen: new Date(when) }).catch(() => {});
      broadcastPresence(u);
    }, GRACE_MS));
  });
});

// Shared secret middleware za inter-node rute (gossip sync)
function requireNodeSecret(req, res, next) {
  const expected = process.env.NODE_SECRET;
  if (!expected) {
    // FAIL CLOSED — bez NODE_SECRET-a /api/sync mora biti odbijen,
    // inače bilo tko s interneta moze pushati lažne registry zapise.
    console.error('[security] NODE_SECRET nije postavljen — /api/sync odbijen.');
    return res.status(500).json({ ok: false, error: 'NODE_SECRET not configured' });
  }
  if (req.get('X-Node-Secret') !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

// Routes
const authMiddleware = require('./middleware/auth');
app.use('/api/users',    require('./routes/users'));
app.use('/api/lookup',   require('./routes/lookup'));
app.use('/api/sync',     requireNodeSecret, require('./routes/sync'));
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/auth',     require('./routes/passwordReset'));
app.use('/api/links', authMiddleware, require('./routes/links'));
app.use('/api/stickers', authMiddleware, require('./routes/stickers'));
// Zahtjevaju autentikaciju (token)
app.use('/api/Messages', authMiddleware, require('./routes/messages'));
app.use('/api/Chats',    authMiddleware, require('./routes/chats'));

//Health check za uptime
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});
// Health check
app.get('/', (req, res) => {
  res.json({
    message:  'Brzojav seed node running',
    nodeId:   NODE_ID,
    port:     PORT,
    users:    registry.count(),
    peers:    peers.list().length,
    commit:   process.env.RENDER_GIT_COMMIT || 'local',
    presence: 'v2',
    message:  'Brzojav seed node running',
  });
});

// 404 — sve nepoznate rute
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

// Global Express error handler - hvata sve sto je throw-ano u rutama
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err);
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: 'Server error' });
});

// sve što se baci izvan request konteksta
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

require('./db').connect().then(() => {
  server.listen(PORT, () => {  // use server.listen not app.listen
    console.log(`[${NODE_ID}] Seed node running on port ${PORT}`);
    setTimeout(() => {
      gossip.gossipRound();
      gossip.start();
      registry.start();
    }, 1500);
  });
});