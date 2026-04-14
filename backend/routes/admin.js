const express = require('express');
const { getDb } = require('../database');
const { adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin access
router.use(adminMiddleware);

/**
 * GET /api/admin/stats
 * Общая статистика
 */
router.get('/stats', (req, res) => {
  try {
    const db = getDb();

    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE is_active = 1').get();
    const completionCount = db.prepare('SELECT COUNT(*) as count FROM task_completions').get();
    const totalPaid = db.prepare('SELECT COALESCE(SUM(total_earned), 0) as total FROM users').get();

    // Today's stats
    const today = new Date().toISOString().split('T')[0];
    const todayUsers = db.prepare(
      "SELECT COUNT(*) as count FROM users WHERE created_at >= ?"
    ).get(today);
    const todayCompletions = db.prepare(
      "SELECT COUNT(*) as count FROM task_completions WHERE completed_at >= ?"
    ).get(today);

    res.json({
      users: userCount.count,
      active_tasks: taskCount.count,
      total_completions: completionCount.count,
      total_paid: totalPaid.total,
      today_users: todayUsers.count,
      today_completions: todayCompletions.count,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/tasks
 * Все задания (включая неактивные)
 */
router.get('/tasks', (req, res) => {
  try {
    const db = getDb();
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY sort_order ASC, created_at DESC').all();
    res.json({ tasks });
  } catch (error) {
    console.error('Admin get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/tasks
 * Создать задание
 */
router.post('/tasks', (req, res) => {
  try {
    const db = getDb();
    const { type, title, description, reward, target_url, target_id, icon, sort_order, max_completions } = req.body;

    if (!type || !title || !target_url) {
      return res.status(400).json({ error: 'type, title, and target_url are required' });
    }

    const validTypes = ['subscribe_channel', 'start_bot', 'visit_link'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be: ${validTypes.join(', ')}` });
    }

    const result = db.prepare(`
      INSERT INTO tasks (type, title, description, reward, target_url, target_id, icon, sort_order, max_completions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      type,
      title,
      description || '',
      reward || 0,
      target_url,
      target_id || '',
      icon || '📋',
      sort_order || 0,
      max_completions || 0
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    res.json({ task });
  } catch (error) {
    console.error('Admin create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/tasks/:id
 * Обновить задание
 */
router.put('/tasks/:id', (req, res) => {
  try {
    const db = getDb();
    const taskId = parseInt(req.params.id);
    const { type, title, description, reward, target_url, target_id, icon, sort_order, is_active, max_completions } = req.body;

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    db.prepare(`
      UPDATE tasks SET
        type = ?, title = ?, description = ?, reward = ?,
        target_url = ?, target_id = ?, icon = ?,
        sort_order = ?, is_active = ?, max_completions = ?
      WHERE id = ?
    `).run(
      type ?? existing.type,
      title ?? existing.title,
      description ?? existing.description,
      reward ?? existing.reward,
      target_url ?? existing.target_url,
      target_id ?? existing.target_id,
      icon ?? existing.icon,
      sort_order ?? existing.sort_order,
      is_active ?? existing.is_active,
      max_completions ?? existing.max_completions,
      taskId
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    res.json({ task });
  } catch (error) {
    console.error('Admin update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/tasks/:id
 * Удалить задание
 */
router.delete('/tasks/:id', (req, res) => {
  try {
    const db = getDb();
    const taskId = parseInt(req.params.id);

    db.prepare('DELETE FROM task_completions WHERE task_id = ?').run(taskId);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/users
 * Список пользователей
 */
router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const users = db.prepare(`
      SELECT u.*, 
        (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referral_count
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM users').get();

    res.json({
      users,
      total: total.count,
      page,
      pages: Math.ceil(total.count / limit),
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
