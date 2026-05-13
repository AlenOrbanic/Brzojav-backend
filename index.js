const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ID = process.env.NODE_ID || `node-${PORT}`;

app.use(cors());
app.use(express.json());

// Attach node identity to every request handler
app.set('nodeId', NODE_ID);
app.set('port', PORT);

// Routes
app.use('/api/users',   require('./routes/users'));
app.use('/api/lookup',  require('./routes/lookup'));
app.use('/api/sync',    require('./routes/sync'));

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

app.listen(PORT, () => {
  console.log(`[${NODE_ID}] Seed node running on port ${PORT}`);
  setTimeout(() => require('./gossip').gossipRound(), 1500); // Sinkroniziramo nodeove odmah nakon pokretanja, ne čekamo prvi interval
});
