const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./routes/api');

const app = express();

app.use(cors());
app.use(express.json());

// Health Check
app.get('/', (req, res) => {
  res.send('✅ SkillGap AI Backend Server is running successfully!');
});

// Register API Routes
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 SkillGap Backend running on http://localhost:${PORT}`);
});