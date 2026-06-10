const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' }
});

const PORT   = process.env.PORT || 3000;
const NODE_ID = process.env.NODE_ID || `node-${PORT}`;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

//node id za svaki request handler
app.set('nodeId', NODE_ID);
app.set('port', PORT);
app.set('io', io);

// Track username -> socket id
const onlineUsers = new Map();

io.on('connection', (socket) => {
  socket.on('register', (username) => {
    onlineUsers.set(username, socket.id);
    socket.username = username;
  });

  socket.on('disconnect', () => {
    if (socket.username) onlineUsers.delete(socket.username);
  });
});

app.set('onlineUsers', onlineUsers);

// Routes
const authMiddleware = require('./middleware/auth');
app.use('/api/users',    require('./routes/users'));
app.use('/api/lookup',   require('./routes/lookup'));
app.use('/api/sync',     require('./routes/sync'));
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/links', authMiddleware, require('./routes/links'));

// Zahtjevaju autentikaciju (token)
app.use('/api/messages', authMiddleware, require('./routes/messages'));
app.use('/api/chats',    authMiddleware, require('./routes/chats'));
// Health check
app.get('/', (req, res) => {
  const registry = require('./registry');
  res.json({
    message:  'Brzojav seed node running',
    nodeId:   NODE_ID,
    port:     PORT,
    users:    registry.count(),
    peers:    require('./peers').list().length,
  });
});

require('./db').connect().then(() => {
  server.listen(PORT, () => {  // use server.listen not app.listen
    console.log(`[${NODE_ID}] Seed node running on port ${PORT}`);
    setTimeout(() => require('./gossip').gossipRound(), 1500);
  });
});