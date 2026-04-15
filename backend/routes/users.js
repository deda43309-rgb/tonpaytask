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
      return res.status(404).json({ error: 'User not found' });
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
        created_at: user.created_at,
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already claimed today
    const today = new Date().toISOString().split('T')[0];
    if (user.last_daily_bonus) {
      const lastBonusDate = new Date(user.last_daily_bonus).toISOString().split('T')[0];
      if (lastBonusDate === today) {
        return res.status(400).json({ error: 'Daily bonus already claimed today' });
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

    const baseBonus = parseInt(process.env.DAILY_BONUS) || 50;
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
    res.status(500).json({ error: 'Internal server error' });
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

    res.json({
      referral_code: user.referral_code,
      referrals,
      total_bonus: parseFloat(totalBonus.total),
      count: referrals.length,
    });
  } catch (error) {
    console.error('Get referrals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
