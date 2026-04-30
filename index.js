const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

// Routes

app.use('/api/users', require('./routes/users'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});