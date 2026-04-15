const express = require('express');
const { getDb } = require('../database');
const { getBot } = require('../services/bot');
const { validateTaskUrl } = require('../services/taskVerifier');

const router = express.Router();

/**
 * POST /api/advertiser/resolve-url
 * Резолв Telegram URL → название, аватарка канала/бота
 */
router.post('/resolve-url', async (req, res) => {
  try {
    const { url, type } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const bot = getBot();
    if (!bot) return res.status(500).json({ error: 'Bot not initialized' });

    // Extract username — handles t.me/username, t.me/username?start=xxx, t.me/+code
    const match = url.trim().match(/t\.me\/([^/?]+)/);
    if (!match) {
      return res.json({ success: true, title: url.trim(), description: '', image_url: null, username: '', members_count: null });
    }
    const username = match[1];

    // Public userpic URL (works for any public channel/bot — same as tonera)
    const photo = `https://t.me/i/userpic/320/${username}.jpg`;

    // Get bot info for admin check
    let botUsername = '';
    try {
      const botInfo = await bot.getMe();
      botUsername = botInfo.username || '';
    } catch (e) {}

    try {
      const chat = await bot.getChat('@' + username);
      const memberCount = await bot.getChatMemberCount('@' + username).catch(() => 0);

      // Check if bot is admin (only for channels)
      let botIsAdmin = null;
      if (type === 'subscribe_channel' && !username.startsWith('+') && username !== 'joinchat') {
        try {
          const botInfo = await bot.getMe();
          const member = await bot.getChatMember('@' + username, botInfo.id);
          botIsAdmin = ['administrator', 'creator'].includes(member.status);
        } catch (e) {
          botIsAdmin = false;
        }
      }

      res.json({
        success: true,
        title: chat.title || chat.first_name || username,
        description: chat.description || chat.bio || '',
        image_url: photo,
        username: chat.username || username,
        members_count: memberCount || null,
        bot_is_admin: botIsAdmin,
        bot_username: botUsername,
      });
    } catch (e) {
      // getChat failed — still return photo via public URL
      res.json({
        success: true,
        title: username,
        description: '',
        username: username,
        image_url: photo,
        members_count: null,
        bot_is_admin: null,
        bot_username: botUsername,
      });
    }
  } catch (error) {
    console.error('Resolve URL error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/advertiser/reward-price
 * Получить все цены за выполнение
 */
router.get('/reward-price', async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.all("SELECT key, value FROM settings WHERE key IN ('ad_price','ad_user_reward','ad_ref_reward','ad_commission')");
    const s = {};
    rows.forEach(r => { s[r.key] = parseFloat(r.value); });
    res.json({
      ad_price: s.ad_price || 20,
      ad_user_reward: s.ad_user_reward || 10,
      ad_ref_reward: s.ad_ref_reward || 2,
      ad_commission: s.ad_commission || 8,
    });
  } catch (error) {
    console.error('Get reward price error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/advertiser/balance
 * Рекламный баланс пользователя
 */
router.get('/balance', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const user = await db.get('SELECT ad_balance FROM users WHERE id = ?', userId);
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
router.post('/deposit', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const { amount } = req.body;

    if (!amount || amount <= 0 || amount > 1000000) {
      return res.status(400).json({ error: 'Invalid amount (1 — 1,000,000)' });
    }

    const result = await db.transaction(async (tx) => {
      await tx.run(
        'INSERT INTO ad_deposits (user_id, amount, method, status) VALUES (?, ?, ?, ?)',
        userId, amount, 'manual', 'completed'
      );

      await tx.run(
        'UPDATE users SET ad_balance = ad_balance + ?, updated_at = NOW() WHERE id = ?',
        amount, userId
      );

      return await tx.get('SELECT ad_balance FROM users WHERE id = ?', userId);
    });

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
router.get('/tasks', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    const tasks = await db.all(`
      SELECT * FROM ad_tasks 
      WHERE advertiser_id = ? AND status != 'deleted'
      ORDER BY created_at DESC
    `, userId);

    res.json({ tasks });
  } catch (error) {
    console.error('Get ad tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/advertiser/tasks
 * Создать рекламное задание (списание adPrice × max_completions с ad_balance)
 */
router.post('/tasks', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const { title, description, url, type, max_completions, image_url } = req.body;

    // Get pricing from settings
    const pricingRows = await db.all("SELECT key, value FROM settings WHERE key IN ('ad_price','ad_user_reward')");
    const ps = {};
    pricingRows.forEach(r => { ps[r.key] = parseFloat(r.value); });
    const adPrice = ps.ad_price || 20;
    const reward = ps.ad_user_reward || 10;

    // Validation
    if (!title || !url || !type || !max_completions) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const validTypes = ['subscribe_channel', 'start_bot', 'visit_link'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid task type' });
    }

    // Validate URL matches task type
    const urlCheck = validateTaskUrl(type, url);
    if (!urlCheck.valid) {
      return res.status(400).json({ error: urlCheck.error });
    }

    // For subscribe_channel — check bot is admin in the channel
    if (type === 'subscribe_channel') {
      const bot = getBot();
      if (bot) {
        const tmeMatch = url.trim().match(/t\.me\/([^/?]+)/);
        const username = tmeMatch ? tmeMatch[1] : null;
        if (username && !username.startsWith('+') && username !== 'joinchat') {
          try {
            const botInfo = await bot.getMe();
            const member = await bot.getChatMember('@' + username, botInfo.id);
            if (!['administrator', 'creator'].includes(member.status)) {
              return res.status(400).json({ 
                error: '🤖 Бот должен быть администратором канала!\n\n' +
                  '📋 Как добавить:\n' +
                  '1. Откройте канал @' + username + '\n' +
                  '2. Настройки → Администраторы → Добавить администратора\n' +
                  '3. Найдите бота @' + botInfo.username + '\n' +
                  '4. Дайте минимальные права и сохраните\n' +
                  '5. Попробуйте создать задание снова'
              });
            }
          } catch (e) {
            return res.status(400).json({ 
              error: '❌ Не удалось проверить канал @' + username + '.\n\n' +
                '🤖 Убедитесь что бот добавлен как администратор:\n' +
                '1. Откройте канал → Настройки → Администраторы\n' +
                '2. Добавьте бота как администратора\n' +
                '3. Попробуйте снова'
            });
          }
        }
      }
    }

    if (max_completions < 1 || max_completions > 100000) {
      return res.status(400).json({ error: 'Max completions must be 1–100,000' });
    }

    const totalCost = adPrice * max_completions;

    try {
      const result = await db.transaction(async (tx) => {
        // Check balance
        const user = await tx.get('SELECT ad_balance FROM users WHERE id = ?', userId);
        if (!user || user.ad_balance < totalCost) {
          throw new Error(`Недостаточно средств. Нужно: ${totalCost}, доступно: ${user?.ad_balance || 0}`);
        }

        // Deduct from ad_balance
        await tx.run(
          'UPDATE users SET ad_balance = ad_balance - ?, updated_at = NOW() WHERE id = ?',
          totalCost, userId
        );

        // Create task
        const newTask = await tx.get(`
          INSERT INTO ad_tasks (advertiser_id, title, description, url, type, reward, max_completions, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *
        `, userId, title, description || '', url, type, reward, max_completions, image_url || null);

        const updatedUser = await tx.get('SELECT ad_balance FROM users WHERE id = ?', userId);

        return { task: newTask, ad_balance: updatedUser.ad_balance };
      });

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
router.put('/tasks/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);
    const { status } = req.body;

    const task = await db.get('SELECT * FROM ad_tasks WHERE id = ? AND advertiser_id = ?', taskId, userId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!['active', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or paused' });
    }

    await db.run('UPDATE ad_tasks SET status = ? WHERE id = ?', status, taskId);
    const updated = await db.get('SELECT * FROM ad_tasks WHERE id = ?', taskId);

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
router.delete('/tasks/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);

    const task = await db.get('SELECT * FROM ad_tasks WHERE id = ? AND advertiser_id = ?', taskId, userId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const remaining = (task.max_completions - task.current_completions) * task.reward;

    const result = await db.transaction(async (tx) => {
      if (remaining > 0) {
        await tx.run(
          'UPDATE users SET ad_balance = ad_balance + ?, updated_at = NOW() WHERE id = ?',
          remaining, userId
        );
      }

      await tx.run("UPDATE ad_tasks SET status = 'deleted' WHERE id = ?", taskId);

      return await tx.get('SELECT ad_balance FROM users WHERE id = ?', userId);
    });

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
router.get('/stats', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    const totalTasks = await db.get(
      "SELECT COUNT(*) as count FROM ad_tasks WHERE advertiser_id = ? AND status != 'deleted'",
      userId
    );

    const totalCompletions = await db.get(`
      SELECT COUNT(*) as count FROM ad_task_completions atc
      JOIN ad_tasks at2 ON at2.id = atc.task_id
      WHERE at2.advertiser_id = ?
    `, userId);

    const totalSpent = await db.get(`
      SELECT COALESCE(SUM(at2.reward), 0) as total FROM ad_task_completions atc
      JOIN ad_tasks at2 ON at2.id = atc.task_id
      WHERE at2.advertiser_id = ?
    `, userId);

    const activeTasks = await db.get(
      "SELECT COUNT(*) as count FROM ad_tasks WHERE advertiser_id = ? AND status = 'active'",
      userId
    );

    const deposits = await db.get(
      "SELECT COALESCE(SUM(amount), 0) as total FROM ad_deposits WHERE user_id = ? AND status = 'completed'",
      userId
    );

    res.json({
      total_tasks: parseInt(totalTasks?.count || 0),
      active_tasks: parseInt(activeTasks?.count || 0),
      total_completions: parseInt(totalCompletions?.count || 0),
      total_spent: parseFloat(totalSpent?.total || 0),
      total_deposited: parseFloat(deposits?.total || 0),
    });
  } catch (error) {
    console.error('Get ad stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
/**
 * DELETE /api/advertiser/tasks/:id
 * Удалить рекламное задание + вернуть баланс за неиспользованные выполнения
 */
router.delete('/tasks/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);

    const task = await db.get('SELECT * FROM ad_tasks WHERE id = ? AND advertiser_id = ?', taskId, userId);
    if (!task) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    // Calculate refund: remaining completions × ad_price
    const remaining = task.max_completions - task.current_completions;
    let refund = 0;

    if (remaining > 0) {
      const priceRow = await db.get("SELECT value FROM settings WHERE key = 'ad_price'");
      const adPrice = parseFloat(priceRow?.value) || 20;
      refund = remaining * adPrice;

      await db.run(
        'UPDATE users SET ad_balance = ad_balance + ? WHERE id = ?',
        refund, userId
      );
    }

    // Mark as deleted
    await db.run("UPDATE ad_tasks SET status = 'deleted' WHERE id = ?", taskId);

    const user = await db.get('SELECT ad_balance FROM users WHERE id = ?', userId);

    res.json({ success: true, refund, ad_balance: user.ad_balance });
  } catch (error) {
    console.error('Delete ad task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
