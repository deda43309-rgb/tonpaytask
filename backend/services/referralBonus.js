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
    // Check if user has a referrer and bonus not yet paid
    const referral = await db.get(
      'SELECT * FROM referrals WHERE referred_id = ? AND bonus = 0',
      userId
    );

    if (!referral) return; // No unpaid referral

    // Get bonus setting
    const bonusRow = await db.get("SELECT value FROM settings WHERE key = 'referral_bonus'");
    const bonus = parseFloat(bonusRow?.value) || 100;

    if (bonus <= 0) return;

    // Check admin balance
    const balRow = await db.get("SELECT value FROM settings WHERE key = 'admin_balance'");
    const adminBalance = parseFloat(balRow?.value) || 0;
    const totalCost = bonus * 2; // Both users get bonus

    if (adminBalance < totalCost) {
      console.log(`⚠️ Referral bonus skipped — admin balance (${adminBalance}) < cost (${totalCost})`);
      return;
    }

    // Pay bonus in transaction
    await db.transaction(async (tx) => {
      // Credit referrer
      await tx.run(
        'UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, updated_at = NOW() WHERE id = ?',
        bonus, bonus, referral.referrer_id
      );

      // Credit referred user
      await tx.run(
        'UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, updated_at = NOW() WHERE id = ?',
        bonus, userId
      );

      // Update referral record with bonus amount
      await tx.run(
        'UPDATE referrals SET bonus = ? WHERE referred_id = ?',
        bonus, userId
      );

      // Deduct from admin balance (bonus × 2 for both users)
      await tx.run(
        "UPDATE settings SET value = CAST(CAST(value AS NUMERIC) - ? AS TEXT) WHERE key = 'admin_balance'",
        totalCost
      );
    });

    console.log(`🎁 Referral bonus paid: ${bonus} TON to user ${referral.referrer_id} and ${userId}`);

    // Notify referrer via bot
    const bot = getBot();
    if (bot) {
      try {
        const referredUser = await db.get('SELECT first_name FROM users WHERE id = ?', userId);
        const name = referredUser?.first_name || 'Пользователь';
        bot.sendMessage(referral.referrer_id,
          `🎉 Реферальный бонус!\n\n` +
          `${name} выполнил первое задание.\n` +
          `Вам начислено: +${bonus} TON 💎`
        );
      } catch (e) {
        console.error('Failed to notify referrer about bonus:', e);
      }
    }
  } catch (error) {
    console.error('Referral bonus check error:', error);
  }
}

module.exports = { checkAndPayReferralBonus };
