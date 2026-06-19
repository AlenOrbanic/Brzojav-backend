const mongoose = require('mongoose');

async function connect() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error('[db] MONGODB_URI env var je obavezan');
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('[db] Connected to MongoDB');
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    process.exit(1); // stop the server if db is unreachable
  }
}

module.exports = { connect };