const { getDb } = require('../database');
const { checkAndPayReferralBonus } = require('./referralBonus');

/**
 * Shared task completion logic used by both admin tasks and ad tasks.
 * Eliminates code duplication between tasks.js complete and complete-ad handlers.
 *
 * @param {object} options
 * @param {number} options.userId - Telegram user ID
 * @param {number} options.taskId - Task ID
 * @param {string} options.taskType - 'admin' or 'ad'
 * @param {number} options.taskReward - Full price per completion (ad_price)
 * @param {string} options.taskChannelType - 'subscribe_channel' | 'start_bot' | 'visit_link'
 * @param {string|null} options.channelId - Channel identifier for subscription check
 * @returns {Promise<object>} - Updated user data with reward info
 */
async function completeTaskTransaction({
  userId, taskId, taskType, taskReward,
  taskChannelType, channelId,
}) {
  const db = getDb();

  // Get pricing settings
  const pricingRows = await db.all(
    "SELECT key, value FROM settings WHERE key IN ('ad_user_reward','ad_ref_reward','sub_check_hours')"
  );
  const ps = {};
  pricingRows.forEach(r => { ps[r.key] = parseFloat(r.value); });
  const userReward = ps.ad_user_reward || 10;
  const refReward = ps.ad_ref_reward || 2;
  const checkHours = ps.sub_check_hours || 72;

  const updatedUser = await db.transaction(async (tx) => {
    // Add completion record
    if (taskType === 'admin') {
      await tx.run('INSERT INTO task_completions (user_id, task_id) VALUES (?, ?)', userId, taskId);
    } else {
      await tx.run('INSERT INTO ad_task_completions (task_id, user_id) VALUES (?, ?)', taskId, userId);
    }

    // Karma reward modifier
    const userKarmaRow = await tx.get('SELECT karma FROM users WHERE id = ?', userId);
    const karma = userKarmaRow?.karma ?? 50;
    const karmaSettings = await tx.all(
      "SELECT key, value FROM settings WHERE key IN ('karma_bonus_high','karma_penalty_low','karma_penalty_critical')"
    );
    const ks = {};
    karmaSettings.forEach(r => { ks[r.key] = parseFloat(r.value) || 0; });

    let karmaModifier = 0;
    if (karma >= 80) karmaModifier = (ks.karma_bonus_high || 5) / 100;
    else if (karma >= 20 && karma < 50) karmaModifier = -(ks.karma_penalty_low || 10) / 100;
    else if (karma < 20) karmaModifier = -(ks.karma_penalty_critical || 15) / 100;

    const karmaAdjust = Math.round(userReward * Math.abs(karmaModifier) * 1000000) / 1000000;
    const actualUserReward = karmaModifier >= 0
      ? userReward + karmaAdjust
      : userReward - karmaAdjust;

    // Credit user balance
    await tx.run(`
      UPDATE users SET 
        balance = balance + ?,
        total_earned = total_earned + ?,
        tasks_completed = tasks_completed + 1,
        updated_at = NOW()
      WHERE id = ?
    `, actualUserReward, actualUserReward, userId);

    // Log user reward transaction
    await tx.run(
      'INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)',
      taskId, userId, 'user_reward', userReward
    );

    // Credit referrer bonus — only if referred user has non-critical karma
    const executor = await tx.get('SELECT referred_by FROM users WHERE id = ?', userId);
    let actualCommission = taskReward - userReward;

    if (executor && executor.referred_by && refReward > 0 && karma >= 20) {
      await tx.run(`
        UPDATE users SET 
          balance = balance + ?,
          total_earned = total_earned + ?,
          updated_at = NOW()
        WHERE id = ?
      `, refReward, refReward, executor.referred_by);

      await tx.run(
        'INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)',
        taskId, executor.referred_by, 'ref_reward', refReward
      );
      actualCommission = taskReward - userReward - refReward;
    }

    // Handle balance & commission based on task type
    if (taskType === 'admin') {
      // Deduct full task price from admin balance
      await tx.run(
        "UPDATE settings SET value = CAST(CAST(value AS NUMERIC) - ? AS TEXT) WHERE key = 'admin_balance'",
        taskReward
      );
    }

    // Log system commission
    const totalCommission = actualCommission + (karmaModifier < 0 ? karmaAdjust : -karmaAdjust);
    if (totalCommission > 0) {
      await tx.run(
        'INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)',
        taskId, null, 'commission', totalCommission
      );
      await tx.run(
        "UPDATE settings SET value = CAST(CAST(value AS NUMERIC) + ? AS TEXT) WHERE key = 'admin_balance'",
        totalCommission
      );
    }

    // Update task completion count
    if (taskType === 'admin') {
      await tx.run('UPDATE tasks SET current_completions = current_completions + 1 WHERE id = ?', taskId);
    } else {
      await tx.run('UPDATE ad_tasks SET current_completions = current_completions + 1 WHERE id = ?', taskId);
      // Check if ad task is now fully completed
      const updated = await tx.get('SELECT * FROM ad_tasks WHERE id = ?', taskId);
      if (updated.current_completions >= updated.max_completions) {
        await tx.run("UPDATE ad_tasks SET status = 'completed' WHERE id = ?", taskId);
      }
    }

    // Schedule subscription check for subscribe_channel tasks
    if (taskChannelType === 'subscribe_channel' && channelId) {
      const taskTypeLabel = taskType === 'admin' ? 'admin' : 'ad';
      await tx.run(
        `INSERT INTO subscription_checks (user_id, task_id, task_type, channel_id, completed_at, check_after)
         VALUES (?, ?, ?, ?, NOW(), NOW() + INTERVAL '1 hour' * ?)`,
        userId, taskId, taskTypeLabel, channelId, checkHours
      );
    }

    // Get updated user
    const userAfter = await tx.get(
      'SELECT balance, total_earned, tasks_completed, karma FROM users WHERE id = ?',
      userId
    );

    // +1 karma every 10 tasks (cap at 100)
    if (userAfter.tasks_completed > 0 && userAfter.tasks_completed % 10 === 0) {
      await tx.run("UPDATE users SET karma = LEAST(100, COALESCE(karma, 50) + 1) WHERE id = ?", userId);
      userAfter.karma = Math.min(100, (userAfter.karma || 50) + 1);
    }

    userAfter._actualReward = actualUserReward;
    return userAfter;
  });

  // Check referral bonus on first activity (async, non-blocking)
  checkAndPayReferralBonus(userId);

  return updatedUser;
}

module.exports = { completeTaskTransaction };
