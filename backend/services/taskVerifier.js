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
      // For now, we trust the user clicked the link
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
    console.log(`📋 Chat member status for user ${userId} in ${channelId}: ${chatMember.status}`);
    const validStatuses = ['member', 'administrator', 'creator'];
    return validStatuses.includes(chatMember.status);
  } catch (error) {
    console.error(`❌ Verification failed for user ${userId} in ${channelId}:`, error.message);
    
    // If bot is not admin in channel or channel not found — auto-approve
    if (error.message.includes('not enough rights') || 
        error.message.includes('chat not found') ||
        error.message.includes('CHAT_ADMIN_REQUIRED') ||
        error.message.includes('Bad Request') ||
        error.message.includes('403')) {
      console.log(`⚠️ Bot cannot check channel "${channelId}" — auto-approving`);
      return true;
    }
    
    return false;
  }
}

module.exports = { verifyTask };
