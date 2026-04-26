const express = require('express');
const { getDb } = require('../database');
const { adminMiddleware } = require('../middleware/auth');
const { runCheckNow } = require('../services/subscriptionChecker');

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

    // Penalty stats
    const penaltyStats = await db.get(`
      SELECT 
        COUNT(*) as total_penalties,
        COALESCE(SUM(penalty_applied), 0) as total_penalty_amount
      FROM subscription_checks 
      WHERE status = 'penalized'
    `);
    const pendingChecks = await db.get("SELECT COUNT(*) as count FROM subscription_checks WHERE status = 'pending'");
    const todayPenalties = await db.get(`
      SELECT COUNT(*) as count, COALESCE(SUM(penalty_applied), 0) as amount
      FROM subscription_checks 
      WHERE status = 'penalized' AND checked_at >= ?
    `, today);

    res.json({
      users: parseInt(userCount.count),
      active_tasks: parseInt(taskCount.count),
      total_completions: parseInt(completionCount.count),
      total_paid: parseFloat(totalPaid.total),
      today_users: parseInt(todayUsers.count),
      today_completions: parseInt(todayCompletions.count),
      penalties: {
        total_count: parseInt(penaltyStats.total_penalties),
        total_amount: parseFloat(penaltyStats.total_penalty_amount),
        pending_checks: parseInt(pendingChecks.count),
        today_count: parseInt(todayPenalties.count),
        today_amount: parseFloat(todayPenalties.amount),
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/admin/tasks
 * Все задания — и админские и рекламодателей
 */
router.get('/tasks', async (req, res) => {
  try {
    const db = getDb();
    
    // Admin tasks
    const adminTasks = await db.all(`
      SELECT t.*, 'admin' as source, NULL as advertiser_name
      FROM tasks t
      ORDER BY t.created_at DESC
    `);

    // Advertiser tasks
    const adTasks = await db.all(`
      SELECT at2.id, at2.type, at2.title, at2.description, at2.reward,
        at2.url as target_url, at2.max_completions, at2.current_completions,
        at2.status, at2.created_at, at2.image_url, at2.advertiser_id,
        'ad' as source,
        COALESCE(u.first_name, u.username, CAST(u.id AS TEXT)) as advertiser_name,
        CASE WHEN at2.status = 'active' THEN 1 ELSE 0 END as is_active
      FROM ad_tasks at2
      LEFT JOIN users u ON u.id = at2.advertiser_id
      WHERE at2.status != 'deleted'
      ORDER BY at2.created_at DESC
    `);

    // Combine and sort by date
    const all = [...adminTasks, ...adTasks].sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    );

    res.json({ tasks: all });
  } catch (error) {
    console.error('Admin get tasks error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
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
      return res.status(400).json({ error: 'Тип, название и URL обязательны' });
    }
    if (!max_completions || max_completions < 1) {
      return res.status(400).json({ error: 'Выберите кол-во выполнений' });
    }

    const validTypes = ['subscribe_channel', 'start_bot', 'visit_link'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be: ${validTypes.join(', ')}` });
    }

    // Get ad_price from settings for cost calculation
    const priceRow = await db.get("SELECT value FROM settings WHERE key = 'ad_price'");
    const adPrice = parseFloat(priceRow?.value) || 0.002;
    const totalCost = adPrice * parseInt(max_completions);

    // Deduct from system balance (allow negative)
    await db.run(
      "UPDATE settings SET value = CAST(CAST(value AS NUMERIC) - ? AS TEXT) WHERE key = 'admin_balance'",
      totalCost
    );

    const result = await db.get(`
      INSERT INTO tasks (type, title, description, reward, target_url, target_id, icon, sort_order, max_completions, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `,
      type,
      title,
      description || '',
      adPrice,
      target_url,
      target_id || '',
      icon || '📋',
      sort_order || 0,
      max_completions,
      image_url || null
    );

    const balRow = await db.get("SELECT value FROM settings WHERE key = 'admin_balance'");
    res.json({ task: result, admin_balance: parseFloat(balRow?.value || 0) });
  } catch (error) {
    console.error('Admin create task error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
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
      return res.status(404).json({ error: 'Задание не найдено' });
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
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
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
        const priceRow = await db.get("SELECT value FROM settings WHERE key = 'ad_price'");
        const adPrice = parseFloat(priceRow?.value) || 0.002;
        const refund = remaining * adPrice;
        await db.run(
          "UPDATE settings SET value = CAST(CAST(value AS NUMERIC) + ? AS TEXT) WHERE key = 'admin_balance'",
          refund
        );
      }
    }

    await db.run("DELETE FROM subscription_checks WHERE task_id = ? AND task_type = 'admin'", taskId);
    await db.run('DELETE FROM task_completions WHERE task_id = ?', taskId);
    await db.run('DELETE FROM tasks WHERE id = ?', taskId);

    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete task error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/admin/users
 * Список пользователей с расширенной информацией
 */
router.get('/users', async (req, res) => {
  try {
    const db = getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const sort = req.query.sort || 'date';

    const sortMap = {
      date: 'u.created_at DESC',
      balance: 'u.balance DESC',
      karma: 'u.karma ASC',
      earned: 'u.total_earned DESC',
      tasks: 'u.tasks_completed DESC',
      ad_balance: 'u.ad_balance DESC',
      penalties: 'penalty_count DESC',
    };
    const orderBy = sortMap[sort] || sortMap.date;

    const users = await db.all(`
      SELECT u.*, 
        (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as referral_count,
        (SELECT COUNT(*) FROM subscription_checks WHERE user_id = u.id AND status = 'penalized') as penalty_count,
        (SELECT COALESCE(SUM(penalty_applied), 0) FROM subscription_checks WHERE user_id = u.id AND status = 'penalized') as penalty_amount
      FROM users u
      ORDER BY ${orderBy}
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
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/admin/users/:id/block
 * Заблокировать / разблокировать пользователя
 */
router.post('/users/:id/block', async (req, res) => {
  try {
    const db = getDb();
    const userId = parseInt(req.params.id);
    const user = await db.get('SELECT id, is_blocked FROM users WHERE id = ?', userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const newStatus = user.is_blocked ? 0 : 1;
    await db.run('UPDATE users SET is_blocked = ?, updated_at = NOW() WHERE id = ?', newStatus, userId);

    res.json({ success: true, is_blocked: newStatus });
  } catch (error) {
    console.error('Admin block user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Удалить пользователя (с PIN-кодом)
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = parseInt(req.params.id);
    const { pin } = req.body;
    const correctPin = process.env.ADMIN_PIN || '1234';

    if (!pin || String(pin) !== String(correctPin)) {
      return res.status(403).json({ error: 'Неверный PIN-код' });
    }

    const user = await db.get('SELECT id FROM users WHERE id = ?', userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // Delete user data in correct order
    await db.run("DELETE FROM subscription_checks WHERE user_id = ?", userId);
    await db.run("DELETE FROM ad_task_completions WHERE user_id = ?", userId);
    await db.run("DELETE FROM ad_transactions WHERE user_id = ?", userId);
    await db.run("DELETE FROM ad_deposits WHERE user_id = ?", userId);
    await db.run("DELETE FROM ad_tasks WHERE advertiser_id = ?", userId);
    await db.run("DELETE FROM task_completions WHERE user_id = ?", userId);
    await db.run("DELETE FROM daily_bonuses WHERE user_id = ?", userId);
    await db.run("DELETE FROM referrals WHERE referrer_id = ? OR referred_id = ?", userId, userId);
    await db.run("DELETE FROM users WHERE id = ?", userId);

    console.log(`⚠️ User ${userId} deleted by admin`);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
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
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * PUT /api/admin/settings
 * Обновить настройки
 */
router.put('/settings', async (req, res) => {
  try {
    const db = getDb();
    const fields = ['ad_price', 'ad_user_reward', 'ad_ref_reward', 'ad_commission', 'sub_check_hours', 'unsub_penalty', 'unsub_check_interval', 'referral_bonus', 'daily_bonus'];

    // If admin_balance is being changed, require PIN
    if (req.body.admin_balance !== undefined) {
      const pin = req.body.pin;
      const correctPin = process.env.ADMIN_PIN || '1234';
      if (!pin || String(pin) !== String(correctPin)) {
        return res.status(403).json({ error: 'Неверный PIN-код' });
      }
      const val = parseFloat(req.body.admin_balance);
      if (val >= 0 && val <= 999999999) {
        await db.run(
          "INSERT INTO settings (key, value) VALUES ('admin_balance', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
          String(val)
        );
      }
    }

    for (const key of fields) {
      if (req.body[key] !== undefined) {
        const val = parseFloat(req.body[key]);
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
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/admin/check-subscriptions
 * Запустить проверку подписок вручную (проверяет ВСЕ pending, игнорируя check_after)
 */
router.post('/check-subscriptions', async (req, res) => {
  try {
    const db = getDb();
    
    // Show what we have before checking
    const beforeCount = await db.get("SELECT COUNT(*) as count FROM subscription_checks WHERE status = 'pending'");
    console.log(`🔍 [Admin] Manual check triggered. Pending checks before: ${beforeCount.count}`);
    
    const result = await runCheckNow();
    res.json({ 
      success: true, 
      message: `Проверено: ${result.passed} ок, ${result.failed} штрафов, ${result.expired || 0} истекло`,
      pending_before: parseInt(beforeCount.count),
      ...result 
    });
  } catch (error) {
    console.error('Manual subscription check error:', error);
    res.status(500).json({ error: 'Ошибка проверки подписок' });
  }
});

/**
 * GET /api/admin/subscription-checks
 * Просмотр всех записей subscription_checks (для отладки)
 */
router.get('/subscription-checks', async (req, res) => {
  try {
    const db = getDb();
    const checks = await db.all(`
      SELECT sc.*, u.first_name, u.username
      FROM subscription_checks sc
      LEFT JOIN users u ON u.id = sc.user_id
      ORDER BY sc.created_at DESC
      LIMIT 100
    `);
    const stats = await db.all(`
      SELECT status, COUNT(*) as count 
      FROM subscription_checks 
      GROUP BY status
    `);
    res.json({ checks, stats });
  } catch (error) {
    console.error('Admin subscription-checks error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/**
 * POST /api/admin/reset
 * Удалить все данные из базы (кроме настроек). Требуется PIN.
 */
router.post('/reset', async (req, res) => {
  try {
    const db = getDb();
    const { pin, password } = req.body;
    const correctPin = process.env.ADMIN_PIN || '1234';
    const correctPassword = process.env.ADMIN_PASSWORD || 'deleteall';

    if (!pin || String(pin) !== String(correctPin)) {
      return res.status(403).json({ error: 'Неверный PIN-код' });
    }
    if (!password || String(password) !== String(correctPassword)) {
      return res.status(403).json({ error: 'Неверный пароль' });
    }

    // Delete all data in correct order (foreign keys)
    await db.run('DELETE FROM subscription_checks');
    await db.run('DELETE FROM ad_task_completions');
    await db.run('DELETE FROM ad_transactions');
    await db.run('DELETE FROM ad_deposits');
    await db.run('DELETE FROM ad_tasks');
    await db.run('DELETE FROM task_completions');
    await db.run('DELETE FROM tasks');
    await db.run('DELETE FROM daily_bonuses');
    await db.run('DELETE FROM referrals');
    await db.run('DELETE FROM users');

    console.log('⚠️ DATABASE RESET by admin');
    res.json({ success: true, message: 'Все данные удалены' });
  } catch (error) {
    console.error('Admin reset error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
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
    totals.forEach(r => { byType[r.type] = { total: parseFloat(r.total), count: parseInt(r.count) }; });

    // Today's revenue
    const today = new Date().toISOString().split('T')[0];
    const todayTotals = await db.all(`
      SELECT type, COALESCE(SUM(amount), 0) as total
      FROM ad_transactions
      WHERE created_at >= ?
      GROUP BY type
    `, today);

    const todayByType = {};
    todayTotals.forEach(r => { todayByType[r.type] = parseFloat(r.total); });

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
      admin_balance: parseFloat(adminBal?.value || '0'),
      task_expenses: parseFloat(taskExpenses.total),
      commission: byType.commission || { total: 0, count: 0 },
      user_rewards: byType.user_reward || { total: 0, count: 0 },
      ref_rewards: byType.ref_reward || { total: 0, count: 0 },
      today: {
        commission: todayByType.commission || 0,
        user_rewards: todayByType.user_reward || 0,
        ref_rewards: todayByType.ref_reward || 0,
      },
      total_deposited: parseFloat(totalDeposited.total),
      top_users: topUsers,
      top_refs: topRefs,
    });
  } catch (error) {
    console.error('Admin ad-revenue error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/admin/wallet
 * Get current project wallet address.
 */
router.get('/wallet', async (req, res) => {
  try {
    const db = getDb();
    const row = await db.get("SELECT value FROM settings WHERE key = 'project_wallet'");
    res.json({ wallet: row?.value || process.env.PROJECT_WALLET || '' });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/admin/wallet
 * Update project wallet address.
 */
router.put('/wallet', async (req, res) => {
  try {
    const db = getDb();
    const { wallet } = req.body;

    if (!wallet || wallet.length < 10) {
      return res.status(400).json({ error: 'Некорректный адрес кошелька' });
    }

    await db.run(
      "INSERT INTO settings (key, value) VALUES ('project_wallet', ?) ON CONFLICT (key) DO UPDATE SET value = ?",
      wallet, wallet
    );

    console.log(`💰 [Admin] Wallet updated to: ${wallet}`);
    res.json({ success: true, wallet });
  } catch (error) {
    console.error('Update wallet error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
