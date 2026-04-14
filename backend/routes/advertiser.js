const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

/**
 * GET /api/advertiser/balance
 * Рекламный баланс пользователя
 */
router.get('/balance', (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const user = db.prepare('SELECT ad_balance FROM users WHERE id = ?').get(userId);
    res.json({ ad_balance: user?.ad_balance || 0 });
  } catch (error) {
    console.error('Get ad balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/advertiser/deposit
 * Пополнение рекламного баланса (заглушка — без реального платежа)
 */
router.post('/deposit', (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const { amount } = req.body;

    if (!amount || amount <= 0 || amount > 1000000) {
      return res.status(400).json({ error: 'Invalid amount (1 — 1,000,000)' });
    }

    const doDeposit = db.transaction(() => {
      // Record deposit
      db.prepare(
        'INSERT INTO ad_deposits (user_id, amount, method, status) VALUES (?, ?, ?, ?)'
      ).run(userId, amount, 'manual', 'completed');

      // Update ad_balance
      db.prepare(
        'UPDATE users SET ad_balance = ad_balance + ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).run(amount, userId);

      return db.prepare('SELECT ad_balance FROM users WHERE id = ?').get(userId);
    });

    const result = doDeposit();
    res.json({ success: true, ad_balance: result.ad_balance });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/advertiser/tasks
 * Мои рекламные задания
 */
router.get('/tasks', (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    const tasks = db.prepare(`
      SELECT * FROM ad_tasks 
      WHERE advertiser_id = ? AND status != 'deleted'
      ORDER BY created_at DESC
    `).all(userId);

    res.json({ tasks });
  } catch (error) {
    console.error('Get ad tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/advertiser/tasks
 * Создать рекламное задание (списание reward × max_completions с ad_balance)
 */
router.post('/tasks', (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const { title, description, url, type, reward, max_completions } = req.body;

    // Validation
    if (!title || !url || !type || !reward || !max_completions) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const validTypes = ['subscribe_channel', 'start_bot', 'visit_link'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid task type' });
    }

    if (reward < 1 || reward > 10000) {
      return res.status(400).json({ error: 'Reward must be 1–10,000' });
    }

    if (max_completions < 1 || max_completions > 100000) {
      return res.status(400).json({ error: 'Max completions must be 1–100,000' });
    }

    const totalCost = reward * max_completions;

    const createTask = db.transaction(() => {
      // Check balance
      const user = db.prepare('SELECT ad_balance FROM users WHERE id = ?').get(userId);
      if (!user || user.ad_balance < totalCost) {
        throw new Error(`Недостаточно средств. Нужно: ${totalCost}, доступно: ${user?.ad_balance || 0}`);
      }

      // Deduct from ad_balance
      db.prepare(
        'UPDATE users SET ad_balance = ad_balance - ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).run(totalCost, userId);

      // Create task
      const result = db.prepare(`
        INSERT INTO ad_tasks (advertiser_id, title, description, url, type, reward, max_completions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, title, description || '', url, type, reward, max_completions);

      const newTask = db.prepare('SELECT * FROM ad_tasks WHERE id = ?').get(result.lastInsertRowid);
      const updatedUser = db.prepare('SELECT ad_balance FROM users WHERE id = ?').get(userId);

      return { task: newTask, ad_balance: updatedUser.ad_balance };
    });

    try {
      const result = createTask();
      res.json({ success: true, ...result });
    } catch (txError) {
      return res.status(400).json({ error: txError.message });
    }
  } catch (error) {
    console.error('Create ad task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/advertiser/tasks/:id
 * Пауза / возобновление задания
 */
router.put('/tasks/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);
    const { status } = req.body;

    const task = db.prepare('SELECT * FROM ad_tasks WHERE id = ? AND advertiser_id = ?').get(taskId, userId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!['active', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or paused' });
    }

    db.prepare('UPDATE ad_tasks SET status = ? WHERE id = ?').run(status, taskId);
    const updated = db.prepare('SELECT * FROM ad_tasks WHERE id = ?').get(taskId);

    res.json({ success: true, task: updated });
  } catch (error) {
    console.error('Update ad task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/advertiser/tasks/:id
 * Удалить задание (возврат остатка на баланс)
 */
router.delete('/tasks/:id', (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);

    const task = db.prepare('SELECT * FROM ad_tasks WHERE id = ? AND advertiser_id = ?').get(taskId, userId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const deleteTask = db.transaction(() => {
      // Refund remaining budget
      const remaining = (task.max_completions - task.current_completions) * task.reward;
      if (remaining > 0) {
        db.prepare(
          'UPDATE users SET ad_balance = ad_balance + ?, updated_at = datetime(\'now\') WHERE id = ?'
        ).run(remaining, userId);
      }

      // Mark as deleted
      db.prepare('UPDATE ad_tasks SET status = \'deleted\' WHERE id = ?').run(taskId);

      return db.prepare('SELECT ad_balance FROM users WHERE id = ?').get(userId);
    });

    const result = deleteTask();
    const remaining = (task.max_completions - task.current_completions) * task.reward;

    res.json({ 
      success: true, 
      refunded: remaining,
      ad_balance: result.ad_balance 
    });
  } catch (error) {
    console.error('Delete ad task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/advertiser/stats
 * Статистика рекламодателя
 */
router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    const totalTasks = db.prepare(
      'SELECT COUNT(*) as count FROM ad_tasks WHERE advertiser_id = ? AND status != \'deleted\''
    ).get(userId);

    const totalCompletions = db.prepare(`
      SELECT COUNT(*) as count FROM ad_task_completions atc
      JOIN ad_tasks at2 ON at2.id = atc.task_id
      WHERE at2.advertiser_id = ?
    `).get(userId);

    const totalSpent = db.prepare(`
      SELECT COALESCE(SUM(at2.reward), 0) as total FROM ad_task_completions atc
      JOIN ad_tasks at2 ON at2.id = atc.task_id
      WHERE at2.advertiser_id = ?
    `).get(userId);

    const activeTasks = db.prepare(
      'SELECT COUNT(*) as count FROM ad_tasks WHERE advertiser_id = ? AND status = \'active\''
    ).get(userId);

    const deposits = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM ad_deposits WHERE user_id = ? AND status = \'completed\''
    ).get(userId);

    res.json({
      total_tasks: totalTasks?.count || 0,
      active_tasks: activeTasks?.count || 0,
      total_completions: totalCompletions?.count || 0,
      total_spent: totalSpent?.total || 0,
      total_deposited: deposits?.total || 0,
    });
  } catch (error) {
    console.error('Get ad stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
