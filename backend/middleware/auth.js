const crypto = require('crypto');

/**
 * Validates Telegram WebApp initData
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    // Sort parameters alphabetically
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Create HMAC
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return computedHash === hash;
  } catch (error) {
    console.error('InitData validation error:', error);
    return false;
  }
}

/**
 * Express middleware for Telegram auth
 */
function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];

  if (!initData) {
    // Development mode — allow without auth
    if (process.env.NODE_ENV === 'development') {
      req.telegramUser = {
        id: 12345,
        username: 'dev_user',
        first_name: 'Developer',
        last_name: '',
      };
      return next();
    }
    return res.status(401).json({ error: 'No initData provided' });
  }

  const isValid = validateInitData(initData, process.env.BOT_TOKEN);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid initData' });
  }

  // Extract user data
  try {
    const params = new URLSearchParams(initData);
    const userData = JSON.parse(params.get('user'));
    req.telegramUser = userData;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Failed to parse user data' });
  }
}

/**
 * Admin check middleware
 */
async function adminMiddleware(req, res, next) {
  const { getDb } = require('../database');
  const db = getDb();

  const userId = req.telegramUser?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check admin IDs from env
  const adminIds = (process.env.ADMIN_IDS || '')
    .split(',')
    .map(id => parseInt(id.trim()))
    .filter(Boolean);

  // Check DB or env
  const user = await db.get('SELECT is_admin FROM users WHERE id = ?', userId);
  
  if (adminIds.includes(userId) || user?.is_admin) {
    return next();
  }

  return res.status(403).json({ error: 'Forbidden: admin access required' });
}

module.exports = { authMiddleware, adminMiddleware, validateInitData };
