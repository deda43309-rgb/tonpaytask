const express = require('express');
const { getDb } = require('../database');
const { verifyTask } = require('../services/taskVerifier');
const { checkAndPayReferralBonus } = require('../services/referralBonus');

const router = express.Router();

/**
 * GET /api/tasks
 * Список доступных заданий для пользователя
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    // Regular admin tasks
    let tasks = await db.all(`
      SELECT t.*, 
        CASE WHEN tc.id IS NOT NULL THEN 1 ELSE 0 END as is_completed,
        0 as is_ad
      FROM tasks t
      LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
      WHERE t.is_active = 1
      ORDER BY t.sort_order ASC, t.created_at DESC
    `, userId);

    // Advertiser tasks (active, not own, not completed, not maxed out)
    let adTasks = [];
    try {
      adTasks = await db.all(`
        SELECT at2.id, at2.type, at2.title, at2.description, at2.reward, 
          at2.url as target_url, at2.url as target_id,
          '📢' as icon, 999 as sort_order, 1 as is_active,
          at2.max_completions, at2.current_completions, at2.created_at,
          at2.image_url,
          CASE WHEN atc.id IS NOT NULL THEN 1 ELSE 0 END as is_completed,
          1 as is_ad, at2.advertiser_id,
          CASE WHEN at2.advertiser_id = ? THEN 1 ELSE 0 END as is_own
        FROM ad_tasks at2
        LEFT JOIN ad_task_completions atc ON atc.task_id = at2.id AND atc.user_id = ?
        WHERE at2.status = 'active' 
          AND at2.current_completions < at2.max_completions
        ORDER BY at2.created_at DESC
      `, userId, userId);
    } catch (adErr) {
      console.error('Ad tasks query error:', adErr);
    }

    console.log(`Tasks for user ${userId}: ${tasks.length} regular, ${adTasks.length} ad`);

    // Override reward for display — all tasks show ad_user_reward (actual user payout)
    const userRewardRow = await db.get("SELECT value FROM settings WHERE key = 'ad_user_reward'");
    const displayReward = parseFloat(userRewardRow?.value) || 10;
    tasks = tasks.map(t => ({ ...t, reward: displayReward }));
    adTasks = adTasks.map(t => ({ ...t, reward: displayReward }));

    // Get penalty and obligation settings
    const penaltyRow = await db.get("SELECT value FROM settings WHERE key = 'unsub_penalty'");
    const unsub_penalty = parseFloat(penaltyRow?.value) || 0;
    const checkHoursRow = await db.get("SELECT value FROM settings WHERE key = 'sub_check_hours'");
    const sub_check_hours = parseFloat(checkHoursRow?.value) || 72;

    res.json({ tasks: [...tasks, ...adTasks], unsub_penalty, sub_check_hours });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/tasks/:id
 * Одно задание
 */
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);

    const task = await db.get(`
      SELECT t.*, 
        CASE WHEN tc.id IS NOT NULL THEN 1 ELSE 0 END as is_completed
      FROM tasks t
      LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
      WHERE t.id = ?
    `, userId, taskId);

    if (!task) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/tasks/:id/complete
 * Выполнить задание
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);

    // Check task exists and is active
    const task = await db.get('SELECT * FROM tasks WHERE id = ? AND is_active = 1', taskId);
    if (!task) {
      return res.status(404).json({ error: 'Задание не найдено или неактивно' });
    }

    // Check if already completed
    const existing = await db.get('SELECT id FROM task_completions WHERE user_id = ? AND task_id = ?', userId, taskId);
    if (existing) {
      return res.status(400).json({ error: 'Задание уже выполнено' });
    }

    // Check max completions
    if (task.max_completions > 0 && task.current_completions >= task.max_completions) {
      return res.status(400).json({ error: 'Лимит выполнений достигнут' });
    }

    // Verify task completion
    const verified = await verifyTask(task, userId);
    if (!verified) {
      return res.status(400).json({ error: 'Проверка не пройдена. Сначала выполните задание.' });
    }

    // Get pricing settings (same as ad tasks)
    const pricingRows = await db.all("SELECT key, value FROM settings WHERE key IN ('ad_user_reward','ad_ref_reward','sub_check_hours')");
    const ps = {};
    pricingRows.forEach(r => { ps[r.key] = parseFloat(r.value); });
    const userReward = ps.ad_user_reward || 10;
    const refReward = ps.ad_ref_reward || 2;

    // Complete the task (transaction)
    const updatedUser = await db.transaction(async (tx) => {
      // Add completion
      await tx.run('INSERT INTO task_completions (user_id, task_id) VALUES (?, ?)', userId, taskId);

      // Karma reward modifier from settings
      const userKarma = await tx.get('SELECT karma FROM users WHERE id = ?', userId);
      const karma = userKarma?.karma ?? 50;
      const karmaSettings = await tx.all("SELECT key, value FROM settings WHERE key IN ('karma_bonus_high','karma_penalty_low','karma_penalty_critical')");
      const ks = {};
      karmaSettings.forEach(r => { ks[r.key] = parseFloat(r.value) || 0; });
      let karmaModifier = 0;
      if (karma >= 80) karmaModifier = (ks.karma_bonus_high || 5) / 100;
      else if (karma >= 20 && karma < 50) karmaModifier = -(ks.karma_penalty_low || 10) / 100;
      else if (karma < 20) karmaModifier = -(ks.karma_penalty_critical || 15) / 100;
      const karmaAdjust = Math.round(userReward * Math.abs(karmaModifier) * 100) / 100;
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
      await tx.run('INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)', taskId, userId, 'user_reward', userReward);

      // Credit referrer bonus (ad_ref_reward) — only if referred user has non-critical karma
      const executor = await tx.get('SELECT referred_by FROM users WHERE id = ?', userId);
      let actualCommission = parseFloat(task.reward) - userReward; // everything left is commission

      if (executor && executor.referred_by && refReward > 0 && karma >= 20) {
        await tx.run(`
          UPDATE users SET 
            balance = balance + ?,
            total_earned = total_earned + ?,
            updated_at = NOW()
          WHERE id = ?
        `, refReward, refReward, executor.referred_by);

        // Log ref reward transaction
        await tx.run('INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)', taskId, executor.referred_by, 'ref_reward', refReward);
        actualCommission = parseFloat(task.reward) - userReward - refReward;
      }

      // Deduct full task price from admin balance
      await tx.run("UPDATE settings SET value = CAST(CAST(value AS NUMERIC) - ? AS TEXT) WHERE key = 'admin_balance'", parseFloat(task.reward));

      // Add commission back to admin balance
      const totalCommission = actualCommission + (karmaModifier < 0 ? karmaAdjust : -karmaAdjust);
      if (totalCommission > 0) {
        await tx.run('INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)', taskId, null, 'commission', totalCommission);
        await tx.run("UPDATE settings SET value = CAST(CAST(value AS NUMERIC) + ? AS TEXT) WHERE key = 'admin_balance'", totalCommission);
      }

      // Update task completion count
      await tx.run('UPDATE tasks SET current_completions = current_completions + 1 WHERE id = ?', taskId);

      // Schedule subscription check for subscribe_channel tasks
      if (task.type === 'subscribe_channel' && task.target_id) {
        const checkHours = ps.sub_check_hours || 72;
        await tx.run(
          `INSERT INTO subscription_checks (user_id, task_id, task_type, channel_id, completed_at, check_after)
           VALUES (?, ?, 'admin', ?, NOW(), NOW() + INTERVAL '1 hour' * ?)`,
          userId, taskId, task.target_id, checkHours
        );
      }

      // Get updated user
      const userAfter = await tx.get('SELECT balance, total_earned, tasks_completed, karma FROM users WHERE id = ?', userId);

      // +1 karma every 10 tasks (cap at 100) — inside transaction to avoid race condition
      if (userAfter.tasks_completed > 0 && userAfter.tasks_completed % 10 === 0) {
        await tx.run("UPDATE users SET karma = LEAST(100, COALESCE(karma, 50) + 1) WHERE id = ?", userId);
        userAfter.karma = Math.min(100, (userAfter.karma || 50) + 1);
      }

      userAfter._actualReward = actualUserReward;
      return userAfter;
    });

    res.json({
      success: true,
      reward: updatedUser._actualReward,
      balance: updatedUser.balance,
      total_earned: updatedUser.total_earned,
      tasks_completed: updatedUser.tasks_completed,
    });

    // Check referral bonus on first activity (async, non-blocking)
    checkAndPayReferralBonus(userId);
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/tasks/:id/complete-ad
 * Выполнить рекламное задание
 */
router.post('/:id/complete-ad', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);

    // Check ad task exists and is active
    const task = await db.get("SELECT * FROM ad_tasks WHERE id = ? AND status = 'active'", taskId);
    if (!task) {
      return res.status(404).json({ error: 'Рекламное задание не найдено или неактивно' });
    }

    // Cannot complete own task
    if (task.advertiser_id === userId) {
      return res.status(400).json({ error: 'Нельзя выполнить своё задание' });
    }

    // Check if already completed
    const existing = await db.get('SELECT id FROM ad_task_completions WHERE user_id = ? AND task_id = ?', userId, taskId);
    if (existing) {
      return res.status(400).json({ error: 'Задание уже выполнено' });
    }

    // Check max completions
    if (task.current_completions >= task.max_completions) {
      return res.status(400).json({ error: 'Лимит выполнений достигнут' });
    }

    // Extract channel identifier from URL for verification
    let channelId = task.url;
    const tmeMatch = task.url.match(/t\.me\/([^/?]+)/);
    if (tmeMatch) {
      channelId = '@' + tmeMatch[1];
    } else if (/^@/.test(task.url)) {
      channelId = task.url;
    }

    // Verify task completion (reuse verifier with adapted fields)
    const verifyData = { type: task.type, target_url: task.url, target_id: channelId };
    const verified = await verifyTask(verifyData, userId);
    if (!verified) {
      return res.status(400).json({ error: 'Проверка не пройдена. Сначала выполните задание.' });
    }

    // Get pricing settings
    const pricingRows = await db.all("SELECT key, value FROM settings WHERE key IN ('ad_user_reward','ad_ref_reward','sub_check_hours')");
    const ps = {};
    pricingRows.forEach(r => { ps[r.key] = parseFloat(r.value); });
    const userReward = ps.ad_user_reward || 10;
    const refReward = ps.ad_ref_reward || 2;
    const checkHours = ps.sub_check_hours || 72;

    // Complete the ad task (transaction)
    const updatedUser = await db.transaction(async (tx) => {
      // Add completion
      await tx.run('INSERT INTO ad_task_completions (task_id, user_id) VALUES (?, ?)', taskId, userId);

      // Karma reward modifier from settings
      const userKarmaRow = await tx.get('SELECT karma FROM users WHERE id = ?', userId);
      const karma = userKarmaRow?.karma ?? 50;
      const karmaSettings = await tx.all("SELECT key, value FROM settings WHERE key IN ('karma_bonus_high','karma_penalty_low','karma_penalty_critical')");
      const ks = {};
      karmaSettings.forEach(r => { ks[r.key] = parseFloat(r.value) || 0; });
      let karmaModifier = 0;
      if (karma >= 80) karmaModifier = (ks.karma_bonus_high || 5) / 100;
      else if (karma >= 20 && karma < 50) karmaModifier = -(ks.karma_penalty_low || 10) / 100;
      else if (karma < 20) karmaModifier = -(ks.karma_penalty_critical || 15) / 100;
      const karmaAdjust = Math.round(userReward * Math.abs(karmaModifier) * 100) / 100;
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
      await tx.run('INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)', taskId, userId, 'user_reward', userReward);

      // Credit referrer bonus (ad_ref_reward) — only if referred user has non-critical karma
      const executor = await tx.get('SELECT referred_by FROM users WHERE id = ?', userId);
      let actualCommission = task.reward - userReward; // everything left is commission

      if (executor && executor.referred_by && refReward > 0 && karma >= 20) {
        await tx.run(`
          UPDATE users SET 
            balance = balance + ?,
            total_earned = total_earned + ?,
            updated_at = NOW()
          WHERE id = ?
        `, refReward, refReward, executor.referred_by);

        // Log ref reward transaction
        await tx.run('INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)', taskId, executor.referred_by, 'ref_reward', refReward);
        actualCommission = task.reward - userReward - refReward;
      }

      // Log system commission (includes unclaimed ref reward if no referrer + karma adjustments)
      const totalCommission = actualCommission + (karmaModifier < 0 ? karmaAdjust : -karmaAdjust);
      if (totalCommission > 0) {
        await tx.run('INSERT INTO ad_transactions (task_id, user_id, type, amount) VALUES (?, ?, ?, ?)', taskId, null, 'commission', totalCommission);
        await tx.run("UPDATE settings SET value = CAST(CAST(value AS NUMERIC) + ? AS TEXT) WHERE key = 'admin_balance'", totalCommission);
      }

      // Update ad task completion count
      await tx.run('UPDATE ad_tasks SET current_completions = current_completions + 1 WHERE id = ?', taskId);

      // Check if task is now fully completed
      const updated = await tx.get('SELECT * FROM ad_tasks WHERE id = ?', taskId);
      if (updated.current_completions >= updated.max_completions) {
        await tx.run("UPDATE ad_tasks SET status = 'completed' WHERE id = ?", taskId);
      }

      // Schedule subscription check for subscribe_channel tasks
      if (task.type === 'subscribe_channel') {
        await tx.run(
          `INSERT INTO subscription_checks (user_id, task_id, task_type, channel_id, completed_at, check_after)
           VALUES (?, ?, 'ad', ?, NOW(), NOW() + INTERVAL '1 hour' * ?)`,
          userId, taskId, channelId, checkHours
        );
      }

      // Get updated user
      const userAfter = await tx.get('SELECT balance, total_earned, tasks_completed, karma FROM users WHERE id = ?', userId);

      // +1 karma every 10 tasks (cap at 50) — inside transaction to avoid race condition
      if (userAfter.tasks_completed > 0 && userAfter.tasks_completed % 10 === 0) {
        await tx.run("UPDATE users SET karma = LEAST(100, COALESCE(karma, 50) + 1) WHERE id = ?", userId);
        userAfter.karma = Math.min(100, (userAfter.karma || 50) + 1);
      }

      userAfter._actualReward = actualUserReward;
      return userAfter;
    });

    res.json({
      success: true,
      reward: updatedUser._actualReward,
      balance: updatedUser.balance,
      total_earned: updatedUser.total_earned,
      tasks_completed: updatedUser.tasks_completed,
    });

    // Check referral bonus on first activity (async, non-blocking)
    checkAndPayReferralBonus(userId);
  } catch (error) {
    console.error('Complete ad task error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
