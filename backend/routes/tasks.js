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

    const tasks = db.prepare(`
      SELECT t.*, 
        CASE WHEN tc.id IS NOT NULL THEN 1 ELSE 0 END as is_completed
      FROM tasks t
      LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
      WHERE t.is_active = 1
      ORDER BY t.sort_order ASC, t.created_at DESC
    `).all(userId);

    res.json({ tasks });
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

module.exports = router;
