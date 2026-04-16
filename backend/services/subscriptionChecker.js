const { getDb } = require('../database');
const { getBot } = require('./bot');

let checkInterval = null;

/**
 * Start periodic subscription checker
 * Reads interval from settings (default 30 min)
 */
function startSubscriptionChecker() {
  console.log('🔍 Subscription checker started');
  
  // Run immediately on start, then schedule
  setTimeout(() => scheduleNextCheck(), 10000); // initial delay 10s
}

async function scheduleNextCheck() {
  try {
    await runCheck(false); // automatic — only overdue checks
  } catch (e) {
    console.error('Subscription check error:', e);
  }

  // Read interval from settings (default 30 min)
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
 * Run check manually (for admin button)
 * forceAll = true — checks ALL pending records regardless of check_after time
 */
async function runCheckNow() {
  return await runCheck(true); // manual — check ALL pending
}

/**
 * @param {boolean} forceAll - if true, check all pending (manual mode). If false, only overdue (automatic mode).
 */
async function runCheck(forceAll = false) {
  const bot = getBot();
  if (!bot) {
    console.log('🔍 Subscription check skipped — bot not initialized');
    return { passed: 0, failed: 0 };
  }

  const db = getDb();

  try {
    // Manual mode: check ALL pending records
    // Automatic mode: only check records where check_after has passed
    let query;
    if (forceAll) {
      query = `
        SELECT * FROM subscription_checks 
        WHERE status = 'pending'
        ORDER BY check_after ASC
        LIMIT 200
      `;
    } else {
      query = `
        SELECT * FROM subscription_checks 
        WHERE status = 'pending' AND check_after <= NOW()
        ORDER BY check_after ASC
        LIMIT 100
      `;
    }

    const pendingChecks = await db.all(query);

    console.log(`🔍 [SubCheck] Mode: ${forceAll ? 'MANUAL (all pending)' : 'AUTO (overdue only)'}. Found ${pendingChecks.length} checks to process.`);

    if (pendingChecks.length === 0) return { passed: 0, failed: 0 };

    // Get penalty setting
    const penaltyRow = await db.get("SELECT value FROM settings WHERE key = 'unsub_penalty'");
    const penalty = parseFloat(penaltyRow?.value) || 50;

    let passed = 0;
    let failed = 0;

    for (const check of pendingChecks) {
      try {
        console.log(`🔍 [SubCheck] Checking user ${check.user_id} in channel "${check.channel_id}" (task_type=${check.task_type}, task_id=${check.task_id})`);
        
        const isSubscribed = await verifySubscription(bot, check.channel_id, check.user_id);

        console.log(`🔍 [SubCheck] User ${check.user_id} in "${check.channel_id}" => ${isSubscribed ? 'SUBSCRIBED ✅' : 'NOT SUBSCRIBED ❌'}`);

        if (isSubscribed) {
          // User is still subscribed — mark as passed
          await db.run(
            "UPDATE subscription_checks SET status = 'passed', checked_at = NOW() WHERE id = ?",
            check.id
          );
          passed++;
        } else {
          // User unsubscribed — apply penalty
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
              // Ad task — return to advertiser's ad_balance
              const adTask = await tx.get('SELECT advertiser_id FROM ad_tasks WHERE id = ?', check.task_id);
              if (adTask) {
                await tx.run(
                  'UPDATE users SET ad_balance = ad_balance + ?, updated_at = NOW() WHERE id = ?',
                  penalty, adTask.advertiser_id
                );
              }
            } else {
              // Admin task — return to system balance
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

            bot.sendMessage(check.user_id,
              `⚠️ *Штраф за отписку!*\n\n` +
              `Вы отписались от канала после выполнения задания "${taskTitle}".\n` +
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
        // If we can't check (channel might be deleted etc), mark as passed
        await db.run(
          "UPDATE subscription_checks SET status = 'passed', checked_at = NOW() WHERE id = ?",
          check.id
        );
      }
    }

    console.log(`🔍 [SubCheck] Done: ${passed} passed, ${failed} penalized`);
    return { passed, failed };
  } catch (error) {
    console.error('Subscription checker error:', error);
    return { passed: 0, failed: 0 };
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
    // "left" or "kicked" status means user is not subscribed
    // "user not found" or "CHAT_ADMIN_REQUIRED" also means not subscribed
    if (error.message && (
      error.message.includes('user not found') || 
      error.message.includes('CHAT_ADMIN_REQUIRED') ||
      error.message.includes('chat not found') ||
      error.message.includes('member list is inaccessible')
    )) {
      return false;
    }
    throw error; // rethrow unexpected errors
  }
}

module.exports = { startSubscriptionChecker, stopSubscriptionChecker, runCheckNow };
