const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const jwt        = require('jsonwebtoken');
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

  socket.on('disconnect', () => {
    if (socket.username) onlineUsers.delete(socket.username);
  });
});

// Shared secret middleware za inter-node rute (gossip sync)
function requireNodeSecret(req, res, next) {
  const expected = process.env.NODE_SECRET;
  if (!expected) {
    console.warn('[security] NODE_SECRET nije postavljen — /api/sync je otvoren!');
    return next();
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
app.use('/api/messages', authMiddleware, require('./routes/messages'));
app.use('/api/chats',    authMiddleware, require('./routes/chats'));
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