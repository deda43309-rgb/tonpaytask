require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');
const { authMiddleware } = require('./middleware/auth');
const { initBot } = require('./services/bot');
const { startSubscriptionChecker } = require('./services/subscriptionChecker');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authMiddleware, require('./routes/auth'));
app.use('/api/tasks', authMiddleware, require('./routes/tasks'));
app.use('/api/users', authMiddleware, require('./routes/users'));
app.use('/api/admin', authMiddleware, require('./routes/admin'));
app.use('/api/advertiser', authMiddleware, require('./routes/advertiser'));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Start server
async function start() {
  // Initialize database first (async for sql.js)
  await initDatabase();
  console.log('✅ Database ready');

  app.listen(PORT, () => {
    console.log(`🚀 TonPayTask server running on port ${PORT}`);
    console.log(`📡 API: http://localhost:${PORT}/api`);
  });

  // Initialize Telegram Bot
  if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
    initBot(process.env.BOT_TOKEN);
    // Start subscription checker (runs every 30 min)
    startSubscriptionChecker();
  } else {
    console.log('⚠️  BOT_TOKEN not set — Telegram Bot disabled');
    console.log('   Set BOT_TOKEN in .env to enable the bot');
  }
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
