const express = require('express');
const { getDb, generateReferralCode } = require('../database');

const router = express.Router();

/**
 * POST /api/auth/login
 * Создаёт или обновляет пользователя при входе в Mini App
 */
router.post('/login', async (req, res) => {
  try {
    const db = getDb();
    const user = req.telegramUser;

    if (!user || !user.id) {
      return res.status(400).json({ error: 'Invalid user data' });
    }

    // Check if user exists
    let dbUser = await db.get('SELECT * FROM users WHERE id = ?', user.id);

    if (!dbUser) {
      // Create new user
      const refCode = generateReferralCode();
      await db.run(
        `INSERT INTO users (id, username, first_name, last_name, photo_url, referral_code)
         VALUES (?, ?, ?, ?, ?, ?)`,
        user.id,
        user.username || '',
        user.first_name || '',
        user.last_name || '',
        user.photo_url || '',
        refCode
      );
      dbUser = await db.get('SELECT * FROM users WHERE id = ?', user.id);

      // Process referral from startParam
      const startParam = req.body.startParam;
      if (startParam && startParam.startsWith('ref_')) {
        const referrerCode = startParam.replace('ref_', '');
        const referrer = await db.get('SELECT * FROM users WHERE referral_code = ?', referrerCode);

        if (referrer && referrer.id !== user.id) {
          const bonusRow = await db.get("SELECT value FROM settings WHERE key = 'referral_bonus'");
          const bonus = parseFloat(bonusRow?.value) || 100;

          await db.run('UPDATE users SET referred_by = ? WHERE id = ?', referrer.id, user.id);
          await db.run('UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?', bonus, bonus, referrer.id);
          await db.run('UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?', bonus, bonus, user.id);

          await db.run(
            `INSERT INTO referrals (referrer_id, referred_id, bonus)
             VALUES (?, ?, ?) ON CONFLICT (referred_id) DO NOTHING`,
            referrer.id, user.id, bonus
          );

          dbUser = await db.get('SELECT * FROM users WHERE id = ?', user.id);
        }
      }
    } else {
      // Update user info
      await db.run(
        `UPDATE users SET 
          username = ?, first_name = ?, last_name = ?, photo_url = ?, updated_at = NOW()
        WHERE id = ?`,
        user.username || '',
        user.first_name || '',
        user.last_name || '',
        user.photo_url || '',
        user.id
      );
      dbUser = await db.get('SELECT * FROM users WHERE id = ?', user.id);
    }

    // Check admin status
    const adminIds = (process.env.ADMIN_IDS || '')
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(Boolean);

    const isAdmin = adminIds.includes(user.id) || dbUser.is_admin;

    res.json({
      user: {
        id: dbUser.id,
        username: dbUser.username,
        first_name: dbUser.first_name,
        last_name: dbUser.last_name,
        photo_url: dbUser.photo_url,
        balance: dbUser.balance,
        referral_code: dbUser.referral_code,
        total_earned: dbUser.total_earned,
        tasks_completed: dbUser.tasks_completed,
        is_admin: isAdmin ? 1 : 0,
        created_at: dbUser.created_at,
      }
    });
  } catch (error) {
    console.error('Auth login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
