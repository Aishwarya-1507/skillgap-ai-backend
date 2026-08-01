require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health Check Endpoint (For Render ping tests)
app.get('/', (req, res) => {
  res.send('🚀 SkillGap AI Backend is Live!');
});

// Mount Routes
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

// Bind to process.env.PORT and 0.0.0.0 for Render compatibility
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SkillGap Backend running on port ${PORT}`);
});