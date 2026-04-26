const { getDb } = require('../database');
const { checkAndPayReferralBonus } = require('./referralBonus');

/**
 * Shared task completion logic used by both admin tasks and ad tasks.
 */
async function completeTaskTransaction({
  userId, taskId, taskType, taskReward,
  taskChannelType, channelId,
}) {
  const db = getDb();

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

    // Credit user balance
    await tx.run(`
      UPDATE users SET 
        balance = balance + ?,
        total_earned = total_earned + ?,
        tasks_completed = tasks_completed + 1,
        updated_at = NOW()
      WHERE id = ?
    `, userReward, userReward, userId);

    // Log user reward transaction
    await tx.run(
      'INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)',
      taskId, userId, 'user_reward', userReward
    );

    // Credit referrer bonus
    const executor = await tx.get('SELECT referred_by FROM users WHERE id = ?', userId);
    let actualCommission = taskReward - userReward;

    if (executor && executor.referred_by && refReward > 0) {
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
      await tx.run(
        "UPDATE settings SET value = CAST(CAST(value AS NUMERIC) - ? AS TEXT) WHERE key = 'admin_balance'",
        taskReward
      );
    }

    // Log system commission
    if (actualCommission > 0) {
      await tx.run(
        'INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)',
        taskId, null, 'commission', actualCommission
      );
      await tx.run(
        "UPDATE settings SET value = CAST(CAST(value AS NUMERIC) + ? AS TEXT) WHERE key = 'admin_balance'",
        actualCommission
      );
    }

    // Update task completion count
    if (taskType === 'admin') {
      await tx.run('UPDATE tasks SET current_completions = current_completions + 1 WHERE id = ?', taskId);
    } else {
      await tx.run('UPDATE ad_tasks SET current_completions = current_completions + 1 WHERE id = ?', taskId);
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
      'SELECT balance, total_earned, tasks_completed FROM users WHERE id = ?',
      userId
    );

    userAfter._actualReward = userReward;
    return userAfter;
  });

  checkAndPayReferralBonus(userId);

  return updatedUser;
}

module.exports = { completeTaskTransaction };
