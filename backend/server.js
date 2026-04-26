require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { initDatabase } = require('./database');
const { authMiddleware } = require('./middleware/auth');
const { initBot, getBot } = require('./services/bot');
const { startSubscriptionChecker, stopSubscriptionChecker } = require('./services/subscriptionChecker');

const app = express();
const PORT = process.env.PORT || 3001;

// Access logging
app.use(morgan(':method :url :status :response-time ms — :remote-addr'));

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json());

// Rate limiting — global
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Подождите минуту.' },
});
app.use('/api/', globalLimiter);

// Strict rate limit for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много запросов. Подождите минуту.' },
});
app.use('/api/auth/login', strictLimiter);
app.use('/api/users/daily-bonus', strictLimiter);
app.use('/api/admin/reset', strictLimiter);
app.use('/api/advertiser/deposit', strictLimiter);

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

// Graceful shutdown
let server;

function gracefulShutdown(signal) {
  console.log(`\n⚠️ ${signal} received — shutting down gracefully...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed');
    });
  }

  // Stop subscription checker
  stopSubscriptionChecker();
  console.log('✅ Subscription checker stopped');

  // Stop bot polling
  const bot = getBot();
  if (bot) {
    bot.stopPolling();
    console.log('✅ Bot polling stopped');
  }

  // Close DB pool
  const { closePool } = require('./database');
  closePool().then(() => {
    console.log('✅ Database pool closed');
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function start() {
  // Initialize database first (async for sql.js)
  await initDatabase();
  console.log('✅ Database ready');

  server = app.listen(PORT, () => {
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
