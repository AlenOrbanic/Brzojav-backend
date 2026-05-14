const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

async function connect() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[db] Connected to MongoDB');
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    process.exit(1); // stop the server if db is unreachable
  }
}

module.exports = { connect };