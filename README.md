# TonPayTask 💎

Telegram Mini App для заработка за выполнение заданий.

## Возможности

- 🔔 **Подписка на каналы** — проверка через Bot API
- 🤖 **Запуск ботов** — переход и верификация
- 🔗 **Посещение ссылок** — с таймером 10 сек
- 🎁 **Ежедневный бонус** — со streak множителем (до x7)
- 👥 **Реферальная система** — бонус обоим (+100 Points)
- ⚙️ **Админ-панель** — CRUD заданий, статистика, пользователи

## Tech Stack

| Компонент | Технология |
|-----------|-----------|
| Frontend | Vite + React 18 |
| Стили | Vanilla CSS (dark theme, glassmorphism) |
| Backend | Node.js + Express |
| Database | SQLite (sql.js) |
| Bot | node-telegram-bot-api |
| Auth | Telegram initData (HMAC-SHA256) |

## Запуск

### Backend
```bash
cd backend
npm install
cp .env.example .env  # настроить BOT_TOKEN, ADMIN_IDS
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Откройте `http://localhost:5173`

## Настройка .env

```env
BOT_TOKEN=your_bot_token
PORT=3001
FRONTEND_URL=http://localhost:5173
REFERRAL_BONUS=100
DAILY_BONUS=50
ADMIN_IDS=your_telegram_id
NODE_ENV=development
```

## Деплой

1. Получите BOT_TOKEN у [@BotFather](https://t.me/BotFather)
2. Настройте HTTPS (обязательно для Mini App)
3. Зарегистрируйте Mini App: BotFather → /newapp
4. Обновите FRONTEND_URL на продакшн URL
