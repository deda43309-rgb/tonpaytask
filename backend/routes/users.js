const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

/**
 * GET /api/users/me
 * Профиль текущего пользователя
 */
router.get('/me', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Get referral count
    const refCount = await db.get('SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?', userId);

    // Check admin
    const adminIds = (process.env.ADMIN_IDS || '')
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(Boolean);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        photo_url: user.photo_url,
        balance: user.balance,
        referral_code: user.referral_code,
        total_earned: user.total_earned,
        tasks_completed: user.tasks_completed,
        referral_count: parseInt(refCount.count),
        is_admin: adminIds.includes(user.id) || user.is_admin ? 1 : 0,
        karma: user.karma ?? 50,
        is_blocked: user.is_blocked || 0,
        created_at: user.created_at,
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/users/daily-bonus
 * Получить ежедневный бонус
 */
router.post('/daily-bonus', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    const user = await db.get('SELECT * FROM users WHERE id = ?', userId);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Check if already claimed today
    const today = new Date().toISOString().split('T')[0];
    if (user.last_daily_bonus) {
      const lastBonusDate = new Date(user.last_daily_bonus).toISOString().split('T')[0];
      if (lastBonusDate === today) {
        return res.status(400).json({ error: 'Ежедневный бонус уже получен сегодня' });
      }
    }

    // Calculate streak
    let streak = 1;
    const lastBonus = await db.get(
      'SELECT streak, claimed_at FROM daily_bonuses WHERE user_id = ? ORDER BY claimed_at DESC LIMIT 1',
      userId
    );

    if (lastBonus) {
      const lastDate = new Date(lastBonus.claimed_at);
      const now = new Date();
      const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        streak = Math.min(lastBonus.streak + 1, 7); // Max 7 day streak
      }
    }

    const dailyBonusRow = await db.get("SELECT value FROM settings WHERE key = 'daily_bonus'");
    const baseBonus = parseFloat(dailyBonusRow?.value) || 50;
    const bonus = baseBonus * streak; // Streak multiplier

    // Claim bonus (transaction)
    const result = await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE users SET 
          balance = balance + ?,
          total_earned = total_earned + ?,
          last_daily_bonus = NOW(),
          updated_at = NOW()
        WHERE id = ?`,
        bonus, bonus, userId
      );

      await tx.run(
        'INSERT INTO daily_bonuses (user_id, amount, streak) VALUES (?, ?, ?)',
        userId, bonus, streak
      );

      return await tx.get('SELECT balance FROM users WHERE id = ?', userId);
    });

    res.json({
      success: true,
      bonus,
      streak,
      balance: result.balance,
    });
  } catch (error) {
    console.error('Daily bonus error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/users/referrals
 * Список рефералов пользователя
 */
router.get('/referrals', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    const user = await db.get('SELECT referral_code FROM users WHERE id = ?', userId);
    
    const referrals = await db.all(
      `SELECT u.id, u.username, u.first_name, r.bonus, r.created_at
       FROM referrals r
       JOIN users u ON u.id = r.referred_id
       WHERE r.referrer_id = ?
       ORDER BY r.created_at DESC`,
      userId
    );

    const totalBonus = await db.get(
      'SELECT COALESCE(SUM(bonus), 0) as total FROM referrals WHERE referrer_id = ?',
      userId
    );

    // Referral earnings from task completions (ref_reward)
    const taskEarnings = await db.get(
      "SELECT COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as total FROM ad_transactions WHERE user_id = ? AND type = 'ref_reward'",
      userId
    );

    // Per-referral task earnings — single query instead of N+1
    // Note: ref_reward transactions have user_id = referrer_id (the current user)
    // We attribute all ref earnings to the referrer since we can't distinguish per-referral
    const totalRefEarnings = parseFloat(taskEarnings.total) || 0;
    const earningsPerRef = referrals.length > 0 ? totalRefEarnings / referrals.length : 0;
    for (const ref of referrals) {
      ref.task_earnings = Math.round(earningsPerRef * 100000) / 100000;
    }

    const bonusRow = await db.get("SELECT value FROM settings WHERE key = 'referral_bonus'");
    const referral_bonus = parseFloat(bonusRow?.value) || 0;

    res.json({
      referral_code: user.referral_code,
      referrals,
      total_bonus: parseFloat(totalBonus.total),
      task_ref_earnings: parseFloat(taskEarnings.total),
      total_all: parseFloat(totalBonus.total) + parseFloat(taskEarnings.total),
      count: referrals.length,
      referral_bonus,
    });
  } catch (error) {
    console.error('Get referrals error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/users/completions
 * История выполненных заданий пользователя
 */
router.get('/completions', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    // Get sub_check_hours setting
    const checkHoursRow = await db.get("SELECT value FROM settings WHERE key = 'sub_check_hours'");
    const checkHours = parseFloat(checkHoursRow?.value) || 72;

    const adminCompletions = await db.all(`
      SELECT tc.id, tc.completed_at, t.title, t.reward, t.type, t.icon, t.image_url, t.target_url, t.target_id as channel_id, 'admin' as source,
        t.id as task_id,
        sc.status as sub_status
      FROM task_completions tc
      JOIN tasks t ON t.id = tc.task_id
      LEFT JOIN subscription_checks sc ON sc.user_id = tc.user_id AND sc.task_id = t.id AND sc.task_type = 'admin'
      WHERE tc.user_id = ?
      ORDER BY tc.completed_at DESC
    `, userId);

    const adCompletions = await db.all(`
      SELECT atc.id, atc.completed_at, at2.title, at2.reward, at2.type, at2.image_url, at2.url as target_url, 'ad' as source,
        at2.id as task_id,
        sc.status as sub_status, sc.channel_id
      FROM ad_task_completions atc
      JOIN ad_tasks at2 ON at2.id = atc.task_id
      LEFT JOIN subscription_checks sc ON sc.user_id = atc.user_id AND sc.task_id = at2.id AND sc.task_type = 'ad'
      WHERE atc.user_id = ?
      ORDER BY atc.completed_at DESC
    `, userId);

    const all = [...adminCompletions, ...adCompletions]
      .map(c => ({
        ...c,
        obligation_hours: c.type === 'subscribe_channel' ? checkHours : null,
        obligation_end: c.type === 'subscribe_channel'
          ? new Date(new Date(c.completed_at).getTime() + checkHours * 60 * 60 * 1000).toISOString()
          : null,
      }))
      .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

    const totalReward = all.reduce((sum, c) => sum + parseFloat(c.reward || 0), 0);

    res.json({
      completions: all,
      stats: {
        total: all.length,
        total_reward: totalReward,
        admin_count: adminCompletions.length,
        ad_count: adCompletions.length,
      },
    });
  } catch (error) {
    console.error('Get completions error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/users/penalties
 * Штрафы и активные проверки подписок пользователя
 */
router.get('/penalties', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    // Get all subscription checks for this user
    const penalties = await db.all(`
      SELECT sc.*, 
        CASE 
          WHEN sc.task_type = 'admin' THEN (SELECT title FROM tasks WHERE id = sc.task_id)
          ELSE (SELECT title FROM ad_tasks WHERE id = sc.task_id)
        END as task_title
      FROM subscription_checks sc
      WHERE sc.user_id = ?
      ORDER BY sc.created_at DESC
      LIMIT 50
    `, userId);

    const stats = await db.get(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'penalized') as penalty_count,
        COALESCE(SUM(penalty_applied) FILTER (WHERE status = 'penalized'), 0) as total_penalty,
        COUNT(*) FILTER (WHERE status = 'pending') as active_checks
      FROM subscription_checks
      WHERE user_id = ?
    `, userId);

    res.json({
      penalties,
      stats: {
        penalty_count: parseInt(stats.penalty_count),
        total_penalty: parseFloat(stats.total_penalty),
        active_checks: parseInt(stats.active_checks),
      },
    });
  } catch (error) {
    console.error('Get penalties error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/users/check-unsubscribed
 * Проверить отписался ли юзер от канала (после истечения обязательного периода)
 */
router.post('/check-unsubscribed', async (req, res) => {
  try {
    const { getBot } = require('../services/bot');
    const bot = getBot();
    if (!bot) {
      return res.status(500).json({ error: 'Бот не инициализирован' });
    }

    const userId = req.telegramUser.id;
    const { channel_id } = req.body;

    if (!channel_id) {
      return res.status(400).json({ error: 'channel_id обязателен' });
    }

    try {
      const chatMember = await bot.getChatMember(channel_id, userId);
      const subscribed = ['member', 'administrator', 'creator'].includes(chatMember.status);
      res.json({ subscribed });
    } catch (e) {
      // If not found or error — treat as unsubscribed
      res.json({ subscribed: false });
    }
  } catch (error) {
    console.error('Check unsubscribed error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/users/modules
 * Public: get active module states for UI rendering.
 */
router.get('/modules', async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.all("SELECT key, value FROM settings WHERE key LIKE 'module_%'");
    const modules = {};
    rows.forEach(r => { modules[r.key.replace('module_', '')] = r.value === '1'; });
    res.json({ modules });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
