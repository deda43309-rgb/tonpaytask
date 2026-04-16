const { getDb } = require('../database');
const { getBot } = require('./bot');

let checkInterval = null;

/**
 * Subscription checker logic:
 * 
 * - `sub_check_hours` (default 72) = how many hours user MUST stay subscribed after completing task
 * - `unsub_check_interval` (default 30 min) = how often auto-checks run
 * 
 * For each pending subscription check:
 *   1. If obligation period expired (completed_at + sub_check_hours has passed) → mark as "passed"
 *   2. If still within obligation period → verify subscription:
 *      - If subscribed → do nothing, keep as pending (will be checked again next cycle)
 *      - If NOT subscribed → penalize immediately
 */

function startSubscriptionChecker() {
  console.log('🔍 Subscription checker started');
  setTimeout(() => scheduleNextCheck(), 10000);
}

async function scheduleNextCheck() {
  try {
    await runCheck();
  } catch (e) {
    console.error('Subscription check error:', e);
  }

  let intervalMinutes = 30;
  try {
    const db = getDb();
    const row = await db.get("SELECT value FROM settings WHERE key = 'unsub_check_interval'");
    if (row && parseFloat(row.value) > 0) {
      intervalMinutes = parseFloat(row.value);
    }
  } catch (e) {}

  console.log(`🔍 Next subscription check in ${intervalMinutes} min`);
  
  if (checkInterval) clearTimeout(checkInterval);
  checkInterval = setTimeout(() => scheduleNextCheck(), intervalMinutes * 60 * 1000);
}

function stopSubscriptionChecker() {
  if (checkInterval) {
    clearTimeout(checkInterval);
    checkInterval = null;
  }
}

/**
 * Run check manually (for admin button) — same logic, just triggered manually
 */
async function runCheckNow() {
  return await runCheck();
}

async function runCheck() {
  const bot = getBot();
  if (!bot) {
    console.log('🔍 Subscription check skipped — bot not initialized');
    return { passed: 0, failed: 0, expired: 0 };
  }

  const db = getDb();

  try {
    // Get ALL pending checks (no time filter — we check every cycle)
    const pendingChecks = await db.all(`
      SELECT * FROM subscription_checks 
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 200
    `);

    console.log(`🔍 [SubCheck] Found ${pendingChecks.length} pending checks to process`);

    if (pendingChecks.length === 0) return { passed: 0, failed: 0, expired: 0 };

    // Get settings
    const penaltyRow = await db.get("SELECT value FROM settings WHERE key = 'unsub_penalty'");
    const penalty = parseFloat(penaltyRow?.value) || 50;

    const checkHoursRow = await db.get("SELECT value FROM settings WHERE key = 'sub_check_hours'");
    const checkHours = parseFloat(checkHoursRow?.value) || 72;

    let passed = 0; // still subscribed within obligation
    let failed = 0; // unsubscribed within obligation → penalized
    let expired = 0; // obligation period ended → free to unsubscribe

    for (const check of pendingChecks) {
      try {
        // Calculate if obligation period has expired
        const completedAt = new Date(check.completed_at);
        const obligationEnd = new Date(completedAt.getTime() + checkHours * 60 * 60 * 1000);
        const now = new Date();

        console.log(`🔍 [SubCheck] User ${check.user_id} | channel "${check.channel_id}" | completed: ${completedAt.toISOString()} | obligation ends: ${obligationEnd.toISOString()} | now: ${now.toISOString()}`);

        if (now >= obligationEnd) {
          // Obligation period expired — user fulfilled their requirement, mark as passed
          await db.run(
            "UPDATE subscription_checks SET status = 'passed', checked_at = NOW() WHERE id = ?",
            check.id
          );
          console.log(`✅ [SubCheck] User ${check.user_id} — obligation expired, marked as PASSED`);
          expired++;
          continue;
        }

        // Still within obligation period — check if user is subscribed
        const isSubscribed = await verifySubscription(bot, check.channel_id, check.user_id);

        console.log(`🔍 [SubCheck] User ${check.user_id} in "${check.channel_id}" => ${isSubscribed ? 'SUBSCRIBED ✅' : 'NOT SUBSCRIBED ❌'}`);

        if (isSubscribed) {
          // User is still subscribed — keep as pending, will be checked again next cycle
          passed++;
          console.log(`✅ [SubCheck] User ${check.user_id} — still subscribed, keeping pending`);
        } else {
          // User unsubscribed within obligation period — PENALIZE
          await db.transaction(async (tx) => {
            // Mark check as penalized
            await tx.run(
              "UPDATE subscription_checks SET status = 'penalized', checked_at = NOW(), penalty_applied = ? WHERE id = ?",
              penalty, check.id
            );

            // Deduct penalty from user balance
            await tx.run(
              "UPDATE users SET balance = balance - ?, updated_at = NOW() WHERE id = ?",
              penalty, check.user_id
            );

            // Return penalty to task creator as compensation
            if (check.task_type === 'ad') {
              const adTask = await tx.get('SELECT advertiser_id FROM ad_tasks WHERE id = ?', check.task_id);
              if (adTask) {
                await tx.run(
                  'UPDATE users SET ad_balance = ad_balance + ?, updated_at = NOW() WHERE id = ?',
                  penalty, adTask.advertiser_id
                );
              }
            } else {
              await tx.run(
                "UPDATE settings SET value = CAST(CAST(value AS NUMERIC) + ? AS TEXT) WHERE key = 'admin_balance'",
                penalty
              );
            }
          });

          // Send notification to user via bot
          try {
            const taskInfo = check.task_type === 'admin'
              ? await db.get('SELECT title FROM tasks WHERE id = ?', check.task_id)
              : await db.get('SELECT title FROM ad_tasks WHERE id = ?', check.task_id);

            const taskTitle = taskInfo?.title || `#${check.task_id}`;
            const hoursLeft = Math.ceil((obligationEnd - now) / (1000 * 60 * 60));

            bot.sendMessage(check.user_id,
              `⚠️ *Штраф за отписку!*\n\n` +
              `Вы отписались от канала после выполнения задания "${taskTitle}".\n` +
              `Вы должны были оставаться подписаны ещё ${hoursLeft} ч.\n` +
              `С вашего баланса списано: *-${penalty} TON*\n\n` +
              `Пожалуйста, не отписывайтесь от каналов после выполнения заданий.`,
              { parse_mode: 'Markdown' }
            );
          } catch (notifyErr) {
            console.error(`Failed to notify user ${check.user_id}:`, notifyErr.message);
          }

          console.log(`⚠️ [SubCheck] PENALIZED user ${check.user_id}: -${penalty} TON for unsubscribing from "${check.channel_id}"`);
          failed++;
        }
      } catch (checkErr) {
        console.error(`Subscription check error for id=${check.id}, channel="${check.channel_id}", user=${check.user_id}:`, checkErr.message);
        // If we can't check (bot not admin in channel, channel deleted etc), skip for now
        // Don't mark as passed — try again next cycle
      }
    }

    console.log(`🔍 [SubCheck] Done: ${passed} still subscribed, ${failed} penalized, ${expired} obligation expired`);
    return { passed, failed, expired };
  } catch (error) {
    console.error('Subscription checker error:', error);
    return { passed: 0, failed: 0, expired: 0 };
  }
}

/**
 * Check if user is subscribed to a channel
 */
async function verifySubscription(bot, channelId, userId) {
  try {
    console.log(`🔍 [SubCheck] getChatMember("${channelId}", ${userId})`);
    const chatMember = await bot.getChatMember(channelId, userId);
    console.log(`🔍 [SubCheck] getChatMember result: status="${chatMember.status}"`);
    const validStatuses = ['member', 'administrator', 'creator'];
    return validStatuses.includes(chatMember.status);
  } catch (error) {
    console.log(`🔍 [SubCheck] getChatMember error: ${error.message}`);
    if (error.message && (
      error.message.includes('user not found') || 
      error.message.includes('CHAT_ADMIN_REQUIRED') ||
      error.message.includes('chat not found') ||
      error.message.includes('member list is inaccessible')
    )) {
      return false;
    }
    throw error;
  }
}

module.exports = { startSubscriptionChecker, stopSubscriptionChecker, runCheckNow };
