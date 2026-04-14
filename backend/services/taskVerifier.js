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
    console.error('Bot not initialized');
    return false;
  }

  try {
    const chatMember = await bot.getChatMember(channelId, userId);
    const validStatuses = ['member', 'administrator', 'creator'];
    return validStatuses.includes(chatMember.status);
  } catch (error) {
    console.error(`Failed to verify subscription for user ${userId} in ${channelId}:`, error.message);
    return false;
  }
}

module.exports = { verifyTask };
