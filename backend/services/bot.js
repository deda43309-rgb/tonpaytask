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

          if (referrer && referrer.id !== BigInt(userId) && referrer.id != userId) {
            const bonus = parseInt(process.env.REFERRAL_BONUS) || 100;

            await db.run('UPDATE users SET referred_by = ? WHERE id = ?', referrer.id, userId);
            await db.run('UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?', bonus, bonus, referrer.id);
            await db.run('UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?', bonus, bonus, userId);

            await db.run(
              `INSERT INTO referrals (referrer_id, referred_id, bonus)
               VALUES (?, ?, ?)`,
              referrer.id, userId, bonus
            );

            // Notify referrer
            try {
              bot.sendMessage(referrer.id,
                `🎉 Новый реферал! ${msg.from.first_name} присоединился по вашей ссылке.\n+${bonus} Points!`
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
      `Выполняй простые задания и зарабатывай Points:\n` +
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
          `💰 Ваш баланс: *${user.balance} Points*\n` +
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

  console.log('🤖 Telegram Bot started');
  return bot;
}

function getBot() {
  return bot;
}

module.exports = { initBot, getBot };
