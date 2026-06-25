const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const jwt        = require('jsonwebtoken');
const helmet     = require('helmet');
const { Server } = require('socket.io');
require('dotenv').config();

const registry = require('./registry');
const peers    = require('./peers');
const gossip   = require('./gossip');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' }
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

app.use(cors());
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
    socket.username = payload.username;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  onlineUsers.set(socket.username, socket.id);

  // Klijenti razmjenjuju SDP/ICE preko ovog kanala da bi otvorili DataChannel.
  // Server samo prosljedjuje paket - ne čita ni ne sprema sadrzaj.
  socket.on('webrtc-signal', ({ to, data }) => {
    if (!to) return;
    const targetSocketId = onlineUsers.get(to);
    if (!targetSocketId) return; // peer offline, klijent ce fallbackati na server
    io.to(targetSocketId).emit('webrtc-signal', {
      from: socket.username,
      data,
    });
  });

  socket.on('disconnect', () => {
    if (socket.username) onlineUsers.delete(socket.username);
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
app.use('/api/links', authMiddleware, require('./routes/links'));

// Zahtjevaju autentikaciju (token)
app.use('/api/Messages', authMiddleware, require('./routes/messages'));
app.use('/api/Chats',    authMiddleware, require('./routes/chats'));
// Health check
app.get('/', (req, res) => {
  res.json({
    message:  'Brzojav seed node running',
    nodeId:   NODE_ID,
    port:     PORT,
    users:    registry.count(),
    peers:    peers.list().length,
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
