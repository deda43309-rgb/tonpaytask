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
router.get('/stats', async (req, res) => {
  try {
    const db = getDb();

    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    const taskCount = await db.get('SELECT COUNT(*) as count FROM tasks WHERE is_active = 1');
    const completionCount = await db.get('SELECT COUNT(*) as count FROM task_completions');
    const totalPaid = await db.get('SELECT COALESCE(SUM(total_earned), 0) as total FROM users');

    // Today's stats
    const today = new Date().toISOString().split('T')[0];
    const todayUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE created_at >= ?", today);
    const todayCompletions = await db.get("SELECT COUNT(*) as count FROM task_completions WHERE completed_at >= ?", today);

    res.json({
      users: parseInt(userCount.count),
      active_tasks: parseInt(taskCount.count),
      total_completions: parseInt(completionCount.count),
      total_paid: parseInt(totalPaid.total),
      today_users: parseInt(todayUsers.count),
      today_completions: parseInt(todayCompletions.count),
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
router.get('/tasks', async (req, res) => {
  try {
    const db = getDb();
    const tasks = await db.all('SELECT * FROM tasks ORDER BY sort_order ASC, created_at DESC');
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
router.post('/tasks', async (req, res) => {
  try {
    const db = getDb();
    const { type, title, description, reward, target_url, target_id, icon, sort_order, max_completions, image_url } = req.body;

    if (!type || !title || !target_url) {
      return res.status(400).json({ error: 'type, title, and target_url are required' });
    }
    if (!max_completions || max_completions < 1) {
      return res.status(400).json({ error: 'Выберите кол-во выполнений' });
    }

    const validTypes = ['subscribe_channel', 'start_bot', 'visit_link'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be: ${validTypes.join(', ')}` });
    }

    const taskReward = parseInt(reward) || 0;
    const totalCost = taskReward * parseInt(max_completions);

    // Check system balance
    const balRow = await db.get("SELECT value FROM settings WHERE key = 'system_balance'");
    const systemBalance = parseInt(balRow?.value) || 0;

    if (totalCost > systemBalance) {
      return res.status(400).json({ error: `Недостаточно баланса системы. Нужно: ${totalCost}, доступно: ${systemBalance}` });
    }

    // Deduct from system balance
    await db.run("UPDATE settings SET value = ? WHERE key = 'system_balance'", String(systemBalance - totalCost));

    const result = await db.get(`
      INSERT INTO tasks (type, title, description, reward, target_url, target_id, icon, sort_order, max_completions, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `,
      type,
      title,
      description || '',
      taskReward,
      target_url,
      target_id || '',
      icon || '📋',
      sort_order || 0,
      max_completions,
      image_url || null
    );

    res.json({ task: result, system_balance: systemBalance - totalCost });
  } catch (error) {
    console.error('Admin create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/tasks/:id
 * Обновить задание
 */
router.put('/tasks/:id', async (req, res) => {
  try {
    const db = getDb();
    const taskId = parseInt(req.params.id);
    const { type, title, description, reward, target_url, target_id, icon, sort_order, is_active, max_completions, image_url } = req.body;

    const existing = await db.get('SELECT * FROM tasks WHERE id = ?', taskId);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await db.run(`
      UPDATE tasks SET
        type = ?, title = ?, description = ?, reward = ?,
        target_url = ?, target_id = ?, icon = ?,
        sort_order = ?, is_active = ?, max_completions = ?, image_url = ?
      WHERE id = ?
    `,
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
      image_url ?? existing.image_url,
      taskId
    );

    const task = await db.get('SELECT * FROM tasks WHERE id = ?', taskId);
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
router.delete('/tasks/:id', async (req, res) => {
  try {
    const db = getDb();
    const taskId = parseInt(req.params.id);

    // Get task to calculate refund
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', taskId);
    if (task && task.max_completions > 0) {
      const remaining = task.max_completions - (task.current_completions || 0);
      if (remaining > 0) {
        const refund = remaining * (task.reward || 0);
        await db.run(
          "UPDATE settings SET value = CAST(CAST(value AS INTEGER) + ? AS TEXT) WHERE key = 'system_balance'",
          refund
        );
      }
    }

    await db.run('DELETE FROM task_completions WHERE task_id = ?', taskId);
    await db.run('DELETE FROM tasks WHERE id = ?', taskId);

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
router.get('/users', async (req, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const users = await db.all(`
      SELECT u.*, 
        (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referral_count
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, limit, offset);

    const total = await db.get('SELECT COUNT(*) as count FROM users');

    res.json({
      users,
      total: parseInt(total.count),
      page,
      pages: Math.ceil(parseInt(total.count) / limit),
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/settings
 * Получить настройки
 */
router.get('/settings', async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.all('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ settings });
  } catch (error) {
    console.error('Admin get settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/settings
 * Обновить настройки
 */
router.put('/settings', async (req, res) => {
  try {
    const db = getDb();
    const fields = ['ad_price', 'ad_user_reward', 'ad_ref_reward', 'ad_commission'];

    for (const key of fields) {
      if (req.body[key] !== undefined) {
        const val = parseInt(req.body[key]);
        if (val >= 0 && val <= 1000000) {
          await db.run(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            key, String(val)
          );
        }
      }
    }

    const rows = await db.all('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Admin update settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/ad-revenue
 * Статистика доходов рекламной системы
 */
router.get('/ad-revenue', async (req, res) => {
  try {
    const db = getDb();

    // Total by type
    const totals = await db.all(`
      SELECT type, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM ad_transactions
      GROUP BY type
    `);

    const byType = {};
    totals.forEach(r => { byType[r.type] = { total: parseInt(r.total), count: parseInt(r.count) }; });

    // Today's revenue
    const today = new Date().toISOString().split('T')[0];
    const todayTotals = await db.all(`
      SELECT type, COALESCE(SUM(amount), 0) as total
      FROM ad_transactions
      WHERE created_at >= ?
      GROUP BY type
    `, today);

    const todayByType = {};
    todayTotals.forEach(r => { todayByType[r.type] = parseInt(r.total); });

    // Top earners (users)
    const topUsers = await db.all(`
      SELECT t.user_id, u.first_name, u.username, SUM(t.amount) as total_earned
      FROM ad_transactions t
      JOIN users u ON u.id = t.user_id
      WHERE t.type = 'user_reward'
      GROUP BY t.user_id, u.first_name, u.username
      ORDER BY total_earned DESC
      LIMIT 10
    `);

    // Top referrers
    const topRefs = await db.all(`
      SELECT t.user_id, u.first_name, u.username, SUM(t.amount) as total_earned
      FROM ad_transactions t
      JOIN users u ON u.id = t.user_id
      WHERE t.type = 'ref_reward'
      GROUP BY t.user_id, u.first_name, u.username
      ORDER BY total_earned DESC
      LIMIT 10
    `);

    // Total deposited by advertisers
    const totalDeposited = await db.get('SELECT COALESCE(SUM(amount), 0) as total FROM ad_deposits');

    // Admin balance
    const adminBal = await db.get("SELECT value FROM settings WHERE key = 'admin_balance'");
    
    // Total spent on admin tasks
    const taskExpenses = await db.get(`
      SELECT COALESCE(SUM(t.reward * t.current_completions), 0) as total
      FROM tasks t
    `);

    res.json({
      admin_balance: parseInt(adminBal?.value || '0'),
      task_expenses: parseInt(taskExpenses.total),
      commission: byType.commission || { total: 0, count: 0 },
      user_rewards: byType.user_reward || { total: 0, count: 0 },
      ref_rewards: byType.ref_reward || { total: 0, count: 0 },
      today: {
        commission: todayByType.commission || 0,
        user_rewards: todayByType.user_reward || 0,
        ref_rewards: todayByType.ref_reward || 0,
      },
      total_deposited: parseInt(totalDeposited.total),
      top_users: topUsers,
      top_refs: topRefs,
    });
  } catch (error) {
    console.error('Admin ad-revenue error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
