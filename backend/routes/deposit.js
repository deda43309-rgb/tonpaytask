const express = require('express');
const { getDb } = require('../database');
const { generateMemo, checkSingleDeposit } = require('../services/depositChecker');
const { getProjectWallet } = require('../services/wallet');

const router = express.Router();

/**
 * POST /api/deposit/create
 * Create a pending deposit with unique memo. User has 1 hour to send TON.
 */
router.post('/create', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const { amount } = req.body;

    if (!amount || amount <= 0 || amount > 100000) {
      return res.status(400).json({ error: 'Неверная сумма (0.01 — 100,000 TON)' });
    }

    // Check min deposit
    const minRow = await db.get("SELECT value FROM settings WHERE key = 'min_deposit'");
    const minDeposit = parseFloat(minRow?.value) || 0.1;
    if (amount < minDeposit) {
      return res.status(400).json({ error: `Минимальный депозит: ${minDeposit} TON` });
    }

    // Check for existing pending deposit
    const existing = await db.get(
      "SELECT * FROM pending_deposits WHERE user_id = ? AND status = 'pending' AND expires_at > NOW()",
      userId
    );
    if (existing) {
      return res.json({
        success: true,
        deposit: existing,
      wallet: await getProjectWallet(),
        message: 'У вас уже есть активный депозит',
      });
    }

    const memo = generateMemo();

    await db.run(
      `INSERT INTO pending_deposits (user_id, amount, memo, expires_at)
       VALUES (?, ?, ?, NOW() + INTERVAL '1 hour')`,
      userId, amount, memo
    );

    const deposit = await db.get(
      "SELECT * FROM pending_deposits WHERE user_id = ? AND memo = ?",
      userId, memo
    );

    console.log(`📝 [Deposit] Created: ${memo} for ${amount} TON → balance (user ${userId})`);

    res.json({
      success: true,
      deposit,
      wallet: process.env.PROJECT_WALLET || '',
    });
  } catch (error) {
    console.error('Create deposit error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/deposit/check/:id
 * Manually check a pending deposit against TON blockchain.
 */
router.post('/check/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const depositId = parseInt(req.params.id);

    const dep = await db.get(
      'SELECT * FROM pending_deposits WHERE id = ? AND user_id = ?',
      depositId, userId
    );
    if (!dep) {
      return res.status(404).json({ error: 'Депозит не найден' });
    }

    const result = await checkSingleDeposit(depositId);

    let balance;
    if (result.status === 'confirmed') {
      const user = await db.get('SELECT balance FROM users WHERE id = ?', userId);
      balance = user?.balance;
    }

    const updated = await db.get('SELECT * FROM pending_deposits WHERE id = ?', depositId);

    res.json({ ...result, deposit: updated, balance });
  } catch (error) {
    console.error('Check deposit error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/deposit/history
 * User's deposit history.
 */
router.get('/history', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    const deposits = await db.all(
      'SELECT * FROM pending_deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      userId
    );

    const minRow = await db.get("SELECT value FROM settings WHERE key = 'min_deposit'");
    const minDeposit = parseFloat(minRow?.value) || 0.1;

    res.json({ deposits, wallet: process.env.PROJECT_WALLET || '', min_deposit: minDeposit });
  } catch (error) {
    console.error('Deposit history error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
