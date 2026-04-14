const express = require('express');
const { getDb } = require('../database');
const { verifyTask } = require('../services/taskVerifier');

const router = express.Router();

/**
 * GET /api/tasks
 * Список доступных заданий для пользователя
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    // Regular admin tasks
    const tasks = db.prepare(`
      SELECT t.*, 
        CASE WHEN tc.id IS NOT NULL THEN 1 ELSE 0 END as is_completed,
        0 as is_ad
      FROM tasks t
      LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
      WHERE t.is_active = 1
      ORDER BY t.sort_order ASC, t.created_at DESC
    `).all(userId);

    // Advertiser tasks (active, not own, not completed, not maxed out)
    const adTasks = db.prepare(`
      SELECT at2.id, at2.type, at2.title, at2.description, at2.reward, 
        at2.url as target_url, at2.url as target_id,
        '📢' as icon, 999 as sort_order, 1 as is_active,
        at2.max_completions, at2.current_completions, at2.created_at,
        at2.image_url,
        CASE WHEN atc.id IS NOT NULL THEN 1 ELSE 0 END as is_completed,
        1 as is_ad, at2.advertiser_id
      FROM ad_tasks at2
      LEFT JOIN ad_task_completions atc ON atc.task_id = at2.id AND atc.user_id = ?
      WHERE at2.status = 'active' 
        AND at2.advertiser_id != ?
        AND at2.current_completions < at2.max_completions
      ORDER BY at2.created_at DESC
    `).all(userId, userId);

    res.json({ tasks: [...tasks, ...adTasks] });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/tasks/:id
 * Одно задание
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);

    const task = db.prepare(`
      SELECT t.*, 
        CASE WHEN tc.id IS NOT NULL THEN 1 ELSE 0 END as is_completed
      FROM tasks t
      LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
      WHERE t.id = ?
    `).get(userId, taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND is_active = 1').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or inactive' });
    }

    // Check if already completed
    const existing = db.prepare('SELECT id FROM task_completions WHERE user_id = ? AND task_id = ?').get(userId, taskId);
    if (existing) {
      return res.status(400).json({ error: 'Task already completed' });
    }

    // Check max completions
    if (task.max_completions > 0 && task.current_completions >= task.max_completions) {
      return res.status(400).json({ error: 'Task completion limit reached' });
    }

    // Verify task completion
    const verified = await verifyTask(task, userId);
    if (!verified) {
      return res.status(400).json({ error: 'Task verification failed. Please complete the task first.' });
    }

    // Complete the task (transaction)
    const completeTask = db.transaction(() => {
      // Add completion
      db.prepare('INSERT INTO task_completions (user_id, task_id) VALUES (?, ?)').run(userId, taskId);

      // Update user balance
      db.prepare(`
        UPDATE users SET 
          balance = balance + ?,
          total_earned = total_earned + ?,
          tasks_completed = tasks_completed + 1,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(task.reward, task.reward, userId);

      // Update task completion count
      db.prepare('UPDATE tasks SET current_completions = current_completions + 1 WHERE id = ?').run(taskId);

      // Get updated user
      return db.prepare('SELECT balance, total_earned, tasks_completed FROM users WHERE id = ?').get(userId);
    });

    const updatedUser = completeTask();

    res.json({
      success: true,
      reward: task.reward,
      balance: updatedUser.balance,
      total_earned: updatedUser.total_earned,
      tasks_completed: updatedUser.tasks_completed,
    });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
    const task = db.prepare("SELECT * FROM ad_tasks WHERE id = ? AND status = 'active'").get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Ad task not found or inactive' });
    }

    // Cannot complete own task
    if (task.advertiser_id === userId) {
      return res.status(400).json({ error: 'Cannot complete your own task' });
    }

    // Check if already completed
    const existing = db.prepare('SELECT id FROM ad_task_completions WHERE user_id = ? AND task_id = ?').get(userId, taskId);
    if (existing) {
      return res.status(400).json({ error: 'Task already completed' });
    }

    // Check max completions
    if (task.current_completions >= task.max_completions) {
      return res.status(400).json({ error: 'Task completion limit reached' });
    }

    // Verify task completion (reuse verifier with adapted fields)
    const verifyData = { type: task.type, target_url: task.url, target_id: task.url };
    const verified = await verifyTask(verifyData, userId);
    if (!verified) {
      return res.status(400).json({ error: 'Task verification failed. Please complete the task first.' });
    }

    // Get pricing settings
    const pricingRows = db.prepare("SELECT key, value FROM settings WHERE key IN ('ad_user_reward','ad_ref_reward')").all();
    const ps = {};
    pricingRows.forEach(r => { ps[r.key] = parseInt(r.value); });
    const userReward = ps.ad_user_reward || 10;
    const refReward = ps.ad_ref_reward || 2;

    // Complete the ad task (transaction)
    const completeAdTask = db.transaction(() => {
      // Add completion
      db.prepare('INSERT INTO ad_task_completions (task_id, user_id) VALUES (?, ?)').run(taskId, userId);

      // Credit user balance (ad_user_reward)
      db.prepare(`
        UPDATE users SET 
          balance = balance + ?,
          total_earned = total_earned + ?,
          tasks_completed = tasks_completed + 1,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(userReward, userReward, userId);

      // Credit referrer bonus (ad_ref_reward)
      const executor = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(userId);
      if (executor && executor.referred_by && refReward > 0) {
        db.prepare(`
          UPDATE users SET 
            balance = balance + ?,
            total_earned = total_earned + ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(refReward, refReward, executor.referred_by);
      }

      // Update ad task completion count
      db.prepare('UPDATE ad_tasks SET current_completions = current_completions + 1 WHERE id = ?').run(taskId);

      // Check if task is now fully completed
      const updated = db.prepare('SELECT * FROM ad_tasks WHERE id = ?').get(taskId);
      if (updated.current_completions >= updated.max_completions) {
        db.prepare("UPDATE ad_tasks SET status = 'completed' WHERE id = ?").run(taskId);
      }

      return db.prepare('SELECT balance, total_earned, tasks_completed FROM users WHERE id = ?').get(userId);
    });

    const updatedUser = completeAdTask();

    res.json({
      success: true,
      reward: userReward,
      balance: updatedUser.balance,
      total_earned: updatedUser.total_earned,
      tasks_completed: updatedUser.tasks_completed,
    });
  } catch (error) {
    console.error('Complete ad task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
