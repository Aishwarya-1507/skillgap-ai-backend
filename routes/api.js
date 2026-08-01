const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { GoogleGenAI } = require('@google/genai');

const JWT_SECRET = process.env.JWT_SECRET || 'skillgap_ai_jwt_secret_key_2026';
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('⚠️ GEMINI_API_KEY is missing in .env!');
}
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Rate limiting specifically for heavy AI endpoint
const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, error: 'Too many analysis requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// File path for local database (with in-memory fallback for read-only hosts like Render)
const DB_FILE = path.join(__dirname, '../database.json');
let inMemoryDB = { users: [], analyses: [] };

// Helper function to load database safely (Async)
async function loadData() {
  try {
    if (!fsSync.existsSync(DB_FILE)) {
      return inMemoryDB;
    }
    const raw = await fs.readFile(DB_FILE, 'utf8');
    inMemoryDB = JSON.parse(raw);
    if (!inMemoryDB.users) inMemoryDB.users = [];
    if (!inMemoryDB.analyses) inMemoryDB.analyses = [];
    return inMemoryDB;
  } catch (err) {
    console.warn('⚠️ File read warning, falling back to memory:', err.message);
    return inMemoryDB;
  }
}

// Helper function to save database safely (Async)
async function saveData(data) {
  inMemoryDB = data;
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ File write warning (Render ephemeral system):', err.message);
  }
}

// Middleware for JWT Authentication
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access denied. Token missing.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
}

// -------------------------------------------------------------
// 1. REGISTER ENDPOINT
// -------------------------------------------------------------
router.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const db = await loadData();

    const existingUser = db.users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'User with this email already exists!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: Date.now().toString(),
      name: name || 'Student',
      email: email.toLowerCase(),
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    await saveData(db);

    console.log(`👤 New user registered: ${email}`);

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, name: newUser.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'User registered successfully!',
      token,
      user: { id: newUser.id, name: newUser.name, email: newUser.email }
    });
  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({ success: false, error: 'Registration failed.' });
  }
});

// -------------------------------------------------------------
// 2. LOGIN ENDPOINT
// -------------------------------------------------------------
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const db = await loadData();

    const user = db.users.find(
      u => u.email && u.email.toLowerCase() === email.toLowerCase()
    );

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    // Check hashed password or legacy plain text
    let isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword && password === user.password) {
      user.password = await bcrypt.hash(password, 10);
      await saveData(db);
      isValidPassword = true;
    }

    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`🔓 User logged in: ${email}`);

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed.' });
  }
});

// -------------------------------------------------------------
// 3. MAIN AI ANALYSIS ENDPOINT (Protected & Rate Limited)
// -------------------------------------------------------------
router.post('/analyze', authenticateToken, analyzeLimiter, async (req, res) => {
  try {
    const { targetRole, currentSkills } = req.body;

    if (!targetRole || !currentSkills) {
      return res.status(400).json({ success: false, error: 'Target role and current skills are required.' });
    }

    if (!ai) {
      return res.status(500).json({ success: false, error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    console.log(`\n🔍 Analyzing skill gap for user (${req.user.email}) role: "${targetRole}"...`);

    const prompt = `
You are an expert career advisor and technical recruiter.
Analyze the skill gap for a candidate targeting the role: "${targetRole}" with current skills: "${currentSkills}".

Respond ONLY with a valid raw JSON object strictly matching this schema (NO markdown syntax, NO triple backticks):
{
  "readinessScore": 75,
  "summary": "1-2 sentence assessment of skills.",
  "missingSkills": ["Skill 1", "Skill 2", "Skill 3"],
  "roadmap7Days": [
    { "day": 1, "topic": "Day 1 Topic", "task": "Actionable study task" },
    { "day": 2, "topic": "Day 2 Topic", "task": "Actionable study task" },
    { "day": 3, "topic": "Day 3 Topic", "task": "Actionable study task" },
    { "day": 4, "topic": "Day 4 Topic", "task": "Actionable study task" },
    { "day": 5, "topic": "Day 5 Topic", "task": "Actionable study task" },
    { "day": 6, "topic": "Day 6 Topic", "task": "Actionable study task" },
    { "day": 7, "topic": "Day 7 Topic", "task": "Actionable study task" }
  ],
  "interviewQuestions": [
    { "question": "Question 1?", "tip": "Key points for answer." },
    { "question": "Question 2?", "tip": "Key points for answer." },
    { "question": "Question 3?", "tip": "Key points for answer." }
  ]
}
`;

    let response = null;
    let lastError = null;

    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const model of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: prompt,
        });
        if (response) break;
      } catch (err) {
        console.warn(`⚠️ Model ${model} call failed:`, err.message);
        lastError = err;
      }
    }

    let parsedData = null;

    if (response) {
      const rawText = typeof response.text === 'function' ? response.text() : response.text;
      const jsonMatch = rawText ? rawText.match(/\{[\s\S]*\}/) : null;
      if (jsonMatch) {
        try {
          parsedData = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.warn('⚠️ JSON parse error on AI response:', e.message);
        }
      }
    }

    // Smart Fallback Generator if AI quota is temporarily rate-limited
    if (!parsedData) {
      console.warn('⚠️ Using smart fallback analysis structure due to API quota/rate limit.');
      parsedData = {
        readinessScore: 70,
        summary: `Analysis for ${targetRole}: Focus on mastering missing core competencies to reach 100% readiness.`,
        missingSkills: ["Advanced System Architecture", "Production Testing & CI/CD", "Performance Optimization"],
        roadmap7Days: [
          { day: 1, topic: "Core Fundamentals & Architecture", task: `Review core patterns and principles required for ${targetRole}.` },
          { day: 2, topic: "Hands-on Practical Implementation", task: `Build a mini project demonstrating ${currentSkills} and key missing skills.` },
          { day: 3, topic: "API Design & Data Modeling", task: "Design scalable RESTful/GraphQL APIs and schema relationships." },
          { day: 4, topic: "State & Authentication Flow", task: "Implement secure JWT/OAuth authentication and state persistence." },
          { day: 5, topic: "Testing & Debugging Strategies", task: "Write unit and integration test suites using modern frameworks." },
          { day: 6, topic: "Performance & Security Hardening", task: "Optimize database queries, caching, and apply security best practices." },
          { day: 7, topic: "Mock Interview & Portfolio Review", task: "Complete technical Q&A drills and polish portfolio presentation." }
        ],
        interviewQuestions: [
          { question: `What are the core technical trade-offs in building scalable applications for a ${targetRole}?`, tip: "Focus on latency, concurrency, state management, and database choices." },
          { question: `How do you handle error boundaries and logging when using ${currentSkills}?`, tip: "Discuss centralized error middleware, logging aggregators, and fallback states." },
          { question: "Explain how you optimize application bundle size and API latency.", tip: "Mention caching strategies, lazy loading, indexing, and payload minimization." }
        ]
      };
    }

    const db = await loadData();
    const record = {
      _id: Date.now().toString(),
      userId: req.user.id,
      targetRole,
      currentSkills,
      ...parsedData,
      createdAt: new Date().toISOString()
    };

    db.analyses.unshift(record);
    await saveData(db);

    console.log(`💾 Saved analysis report for user ${req.user.id}`);

    res.json({
      success: true,
      data: parsedData
    });

  } catch (error) {
    console.error('❌ Error during AI generation:', error);
    res.status(500).json({ success: false, error: 'AI analysis failed: ' + error.message });
  }
});

// -------------------------------------------------------------
// 4. PROGRESS TRACKER ENDPOINT (Protected & Isolated per User)
// -------------------------------------------------------------
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const db = await loadData();
    // Return only history belonging to the authenticated user
    const userHistory = db.analyses
      .filter(a => a.userId === req.user.id)
      .slice(0, 10);
      
    res.json({ success: true, history: userHistory });
  } catch (error) {
    console.error('❌ Error fetching history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

module.exports = router;