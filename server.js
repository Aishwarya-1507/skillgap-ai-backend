require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Security Headers
app.use(helmet());

// CORS & Middleware
app.use(cors());
app.use(express.json());

// Global Rate Limiting: max 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Health Check Endpoint (For Render ping tests)
app.get('/', (req, res) => {
  res.send('🚀 SkillGap AI Backend is Live!');
});

// Mount Routes
const apiRouter = require('./routes/api');
app.use('/api', apiRouter);

// 404 Handler for Unknown Routes
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Bind to process.env.PORT and 0.0.0.0 for Render compatibility
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SkillGap Backend running on port ${PORT}`);
});