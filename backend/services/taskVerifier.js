const { getBot } = require('./bot');

/**
 * Verify that a user has completed a task
 */
async function verifyTask(task, userId) {
  switch (task.type) {
    case 'subscribe_channel':
      return await verifyChannelSubscription(task.target_id, userId);
    
    case 'start_bot':
      // Bot start verification is manual or via callback
      return true;
    
    case 'visit_link':
      // Link visit is verified by frontend timer
      return true;
    
    default:
      return false;
  }
}

/**
 * Check if user is subscribed to a Telegram channel
 */
async function verifyChannelSubscription(channelId, userId) {
  const bot = getBot();
  if (!bot) {
    console.error('Bot not initialized for verification');
    return true; // Allow if bot is not available
  }

  // Skip verification for private invite links (t.me/+xxx or t.me/joinchat/xxx)
  if (!channelId || channelId.includes('+') || channelId.includes('joinchat')) {
    console.log(`⚠️ Cannot verify private channel "${channelId}" — auto-approving`);
    return true;
  }

  try {
    console.log(`🔍 Checking subscription: user=${userId}, channel=${channelId}`);
    const chatMember = await bot.getChatMember(channelId, userId);
    console.log(`📋 Status: ${chatMember.status}`);
    const validStatuses = ['member', 'administrator', 'creator'];
    return validStatuses.includes(chatMember.status);
  } catch (error) {
    console.error(`❌ Verification error for user ${userId} in ${channelId}:`, error.message);
    
    // Only auto-approve if bot is NOT an admin in the channel (can't check)
    if (error.message.includes('CHAT_ADMIN_REQUIRED') || 
        error.message.includes('not enough rights')) {
      console.log(`⚠️ Bot is not admin in "${channelId}" — auto-approving`);
      return true;
    }
    
    // User not found in chat = not subscribed
    if (error.message.includes('user not found') ||
        error.message.includes('USER_NOT_PARTICIPANT')) {
      console.log(`❌ User ${userId} is NOT subscribed to ${channelId}`);
      return false;
    }
    
    // Chat not found = wrong channel ID, reject
    if (error.message.includes('chat not found')) {
      console.log(`❌ Channel ${channelId} not found`);
      return false;
    }
    
    return false;
  }
}

/**
 * Validate that URL matches task type
 */
function validateTaskUrl(type, url) {
  if (!url) return { valid: false, error: 'URL обязателен' };
  
  const tmeMatch = url.match(/t\.me\/([^/?]+)/);
  const username = tmeMatch ? tmeMatch[1] : null;
  
  switch (type) {
    case 'subscribe_channel':
      // Channel URLs: t.me/channelname (not a bot)
      if (!tmeMatch) return { valid: false, error: 'Укажите ссылку t.me/имя_канала' };
      if (username.toLowerCase().endsWith('bot')) {
        return { valid: false, error: 'Это ссылка на бота, а не на канал. Выберите тип "Бот"' };
      }
      // Allow invite links
      if (username.startsWith('+') || username === 'joinchat') {
        return { valid: true };
      }
      return { valid: true };
      
    case 'start_bot':
      // Bot URLs: t.me/botname (usually ends with 'bot')
      if (!tmeMatch) return { valid: false, error: 'Укажите ссылку t.me/имя_бота' };
      if (!username.toLowerCase().endsWith('bot') && !username.startsWith('+')) {
        return { valid: false, error: 'Это похоже на канал, а не на бота. Выберите тип "Подписка"' };
      }
      return { valid: true };
      
    case 'visit_link':
      // Any URL is fine
      if (!url.startsWith('http')) return { valid: false, error: 'URL должен начинаться с http:// или https://' };
      return { valid: true };
      
    default:
      return { valid: true };
  }
}

module.exports = { verifyTask, validateTaskUrl };
