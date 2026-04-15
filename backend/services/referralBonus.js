const { getDb } = require('../database');
const { getBot } = require('./bot');

/**
 * Check and pay referral bonus on first activity.
 * Called after a user completes their first task.
 * Bonus is paid to both referrer and referred user, deducted from admin_balance.
 */
async function checkAndPayReferralBonus(userId) {
  const db = getDb();

  try {
    console.log(`🔍 [RefBonus] Checking referral bonus for user ${userId}`);

    // Check if user has a referrer
    const user = await db.get('SELECT referred_by FROM users WHERE id = ?', userId);
    if (!user || !user.referred_by) {
      console.log(`🔍 [RefBonus] User ${userId} has no referrer, skipping`);
      return;
    }

    console.log(`🔍 [RefBonus] User ${userId} referred by ${user.referred_by}`);

    // Check if bonus already paid (referral record with bonus > 0)
    const existingRef = await db.get(
      'SELECT * FROM referrals WHERE referred_id = ?',
      userId
    );

    console.log(`🔍 [RefBonus] Existing referral record:`, JSON.stringify(existingRef));

    if (existingRef && parseFloat(existingRef.bonus) > 0) {
      console.log(`🔍 [RefBonus] Bonus already paid (${existingRef.bonus}), skipping`);
      return;
    }

    // Get bonus setting
    const bonusRow = await db.get("SELECT value FROM settings WHERE key = 'referral_bonus'");
    const bonus = parseFloat(bonusRow?.value) || 100;
    console.log(`🔍 [RefBonus] Bonus amount from settings: ${bonus}`);

    if (bonus <= 0) {
      console.log(`🔍 [RefBonus] Bonus is 0 or negative, skipping`);
      return;
    }

    // Check admin balance (allow negative)
    const balRow = await db.get("SELECT value FROM settings WHERE key = 'admin_balance'");
    const adminBalance = parseFloat(balRow?.value) || 0;
    const totalCost = bonus * 2;

    console.log(`🔍 [RefBonus] Admin balance: ${adminBalance}, will deduct: ${totalCost}`);

    const referrerId = user.referred_by;

    // Pay bonus in transaction
    await db.transaction(async (tx) => {
      // Credit referrer
      await tx.run(
        'UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, updated_at = NOW() WHERE id = ?',
        bonus, bonus, referrerId
      );

      // Credit referred user
      await tx.run(
        'UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, updated_at = NOW() WHERE id = ?',
        bonus, userId
      );

      // Update or create referral record with bonus amount
      if (existingRef) {
        await tx.run(
          'UPDATE referrals SET bonus = ? WHERE referred_id = ?',
          bonus, userId
        );
      } else {
        await tx.run(
          'INSERT INTO referrals (referrer_id, referred_id, bonus) VALUES (?, ?, ?)',
          referrerId, userId, bonus
        );
      }

      // Deduct from admin balance (bonus × 2 for both users)
      await tx.run(
        "UPDATE settings SET value = CAST(CAST(value AS NUMERIC) - ? AS TEXT) WHERE key = 'admin_balance'",
        totalCost
      );
    });

    console.log(`🎁 [RefBonus] SUCCESS! Paid ${bonus} TON to referrer ${referrerId} and user ${userId}`);

    // Notify referrer via bot
    const bot = getBot();
    if (bot) {
      try {
        const referredUser = await db.get('SELECT first_name FROM users WHERE id = ?', userId);
        const name = referredUser?.first_name || 'Пользователь';
        bot.sendMessage(referrerId,
          `🎉 Реферальный бонус!\n\n` +
          `${name} выполнил первое задание.\n` +
          `Вам начислено: +${bonus} TON 💎`
        );
      } catch (e) {
        console.error('[RefBonus] Failed to notify referrer:', e);
      }
    }
  } catch (error) {
    console.error('[RefBonus] ERROR:', error);
  }
}

module.exports = { checkAndPayReferralBonus };
