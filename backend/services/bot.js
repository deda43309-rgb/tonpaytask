const TelegramBot = require('node-telegram-bot-api');
const { getDb, generateReferralCode } = require('../database');

let bot;

function initBot(token) {
  bot = new TelegramBot(token, { polling: true });

  // /start command with optional referral code
  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const startParam = match[1]?.trim();
    const db = getDb();

    try {
      // Create or get user
      let user = await db.get('SELECT * FROM users WHERE id = ?', userId);

      if (!user) {
        const refCode = generateReferralCode();
        await db.run(
          `INSERT INTO users (id, username, first_name, last_name, referral_code)
           VALUES (?, ?, ?, ?, ?)`,
          userId,
          msg.from.username || '',
          msg.from.first_name || '',
          msg.from.last_name || '',
          refCode
        );
        user = await db.get('SELECT * FROM users WHERE id = ?', userId);

        // Process referral
        if (startParam && startParam.startsWith('ref_')) {
          const referrerCode = startParam.replace('ref_', '');
          const referrer = await db.get('SELECT * FROM users WHERE referral_code = ?', referrerCode);

          if (referrer && Number(referrer.id) !== Number(userId)) {
            // Only save referral link — bonus is paid on first activity
            await db.run('UPDATE users SET referred_by = ? WHERE id = ?', referrer.id, userId);
            await db.run(
              `INSERT INTO referrals (referrer_id, referred_id, bonus)
               VALUES (?, ?, 0)`,
              referrer.id, userId
            );

            // Notify referrer
            try {
              bot.sendMessage(referrer.id,
                `👤 Новый реферал! ${msg.from.first_name} присоединился по вашей ссылке.\nБонус будет начислен после первой активности.`
              );
            } catch (e) {
              console.error('Failed to notify referrer:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('Bot /start error:', err);
    }

    // Welcome message with Mini App button
    const webAppUrl = process.env.WEBAPP_URL || process.env.FRONTEND_URL || 'https://tonpaytask-production.up.railway.app';

    bot.sendMessage(chatId,
      `👋 Привет, ${msg.from.first_name}!\n\n` +
      `💰 Добро пожаловать в *TonPayTask*!\n\n` +
      `Выполняй простые задания и зарабатывай TON:\n` +
      `🔔 Подписывайся на каналы\n` +
      `🤖 Запускай ботов\n` +
      `🔗 Переходи по ссылкам\n` +
      `👥 Приглашай друзей\n\n` +
      `Нажми кнопку ниже чтобы начать! 👇`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Открыть приложение', web_app: { url: webAppUrl } }]
          ]
        }
      }
    );
  });

  // /balance command
  bot.onText(/\/balance/, async (msg) => {
    const db = getDb();
    try {
      const user = await db.get('SELECT balance, tasks_completed FROM users WHERE id = ?', msg.from.id);

      if (user) {
        bot.sendMessage(msg.chat.id,
          `💰 Ваш баланс: *${user.balance} TON*\n` +
          `✅ Заданий выполнено: ${user.tasks_completed}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        bot.sendMessage(msg.chat.id, 'Пожалуйста, нажмите /start чтобы зарегистрироваться.');
      }
    } catch (err) {
      console.error('Bot /balance error:', err);
    }
  });

  // /referral command
  bot.onText(/\/referral/, async (msg) => {
    const db = getDb();
    try {
      const user = await db.get('SELECT referral_code FROM users WHERE id = ?', msg.from.id);

      if (user) {
        const botUsername = bot.options?.username || 'TonPayTaskBot';
        const refLink = `https://t.me/${botUsername}?start=ref_${user.referral_code}`;

        bot.sendMessage(msg.chat.id,
          `👥 Ваша реферальная ссылка:\n\n` +
          `\`${refLink}\`\n\n` +
          `Поделитесь с друзьями и получите бонус!`,
          { parse_mode: 'Markdown' }
        );
      }
    } catch (err) {
      console.error('Bot /referral error:', err);
    }
  });

  // Handle moderation callback buttons
  bot.on('callback_query', async (query) => {
    const data = query.data;
    if (!data.startsWith('mod_')) return;

    const [action, taskId] = data.split('_').slice(0);
    const id = parseInt(data.split('_')[2]);
    const isApprove = data.startsWith('mod_approve_');

    try {
      const db = getDb();
      const task = await db.get("SELECT * FROM ad_tasks WHERE id = ? AND status = 'pending_review'", id);
      
      if (!task) {
        return bot.answerCallbackQuery(query.id, { text: '❌ Задание не найдено или уже обработано' });
      }

      if (isApprove) {
        await db.run("UPDATE ad_tasks SET status = 'active' WHERE id = ?", id);
        bot.answerCallbackQuery(query.id, { text: '✅ Задание одобрено!' });
        bot.editMessageText(
          query.message.text + '\n\n✅ <b>ОДОБРЕНО</b>',
          { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'HTML' }
        ).catch(() => {});
        console.log(`✅ [Moderation Bot] Approved task #${id}`);
      } else {
        const refund = task.reward * task.max_completions;
        await db.run("UPDATE ad_tasks SET status = 'rejected' WHERE id = ?", id);
        await db.run("UPDATE users SET ad_balance = ad_balance + ? WHERE id = ?", refund, task.advertiser_id);
        bot.answerCallbackQuery(query.id, { text: `❌ Отклонено, возврат ${refund} TON` });
        bot.editMessageText(
          query.message.text + `\n\n❌ <b>ОТКЛОНЕНО</b> (возврат ${refund} TON)`,
          { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'HTML' }
        ).catch(() => {});
        console.log(`❌ [Moderation Bot] Rejected task #${id}, refund ${refund}`);
      }
    } catch (e) {
      console.error('Moderation callback error:', e);
      bot.answerCallbackQuery(query.id, { text: '⚠️ Ошибка: ' + e.message });
    }
  });

  // Handle polling errors to prevent crashes
  bot.on('polling_error', (error) => {
    console.error('🤖 Bot polling error:', error.code, error.message);
  });

  console.log('🤖 Telegram Bot started');
  return bot;
}

function getBot() {
  return bot;
}

/**
 * Send a notification to all admins
 */
function notifyAdmins(text, options = {}) {
  if (!bot) return;
  const adminIds = (process.env.ADMIN_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  
  for (const adminId of adminIds) {
    console.log(`[Notify] Sending to admin ${adminId}`);
    bot.sendMessage(adminId, text, { parse_mode: 'HTML', ...options }).catch(e => {
      console.error(`Failed to notify admin ${adminId}:`, e.message);
    });
  }
}

module.exports = { initBot, getBot, notifyAdmins };

