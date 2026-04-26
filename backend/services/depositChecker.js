const { getDb } = require('../database');

const TON_API_BASE = 'https://toncenter.com/api/v2';
let checkInterval = null;

/**
 * Generate a unique 8-character memo for deposit identification.
 */
function generateMemo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let memo = 'TP-';
  for (let i = 0; i < 8; i++) {
    memo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return memo;
}

/**
 * Check TON blockchain for incoming transactions matching pending deposits.
 * Uses TonCenter API to scan recent transactions on the project wallet.
 */
async function checkPendingDeposits() {
  const wallet = process.env.PROJECT_WALLET;
  const apiKey = process.env.TONCENTER_API_KEY || '';

  if (!wallet) {
    return { checked: 0, confirmed: 0, expired: 0, error: 'PROJECT_WALLET not set' };
  }

  const db = getDb();
  let confirmed = 0;
  let expired = 0;

  try {
    // 1. Expire old pending deposits (> 1 hour)
    const expiredRows = await db.all(
      "SELECT id, user_id, amount, memo FROM pending_deposits WHERE status = 'pending' AND expires_at < NOW()"
    );
    for (const dep of expiredRows) {
      await db.run("UPDATE pending_deposits SET status = 'expired' WHERE id = ?", dep.id);
      expired++;
      console.log(`⏰ [Deposit] Expired: ${dep.memo} (${dep.amount} TON) for user ${dep.user_id}`);
    }

    // 2. Get pending deposits that haven't expired yet
    const pending = await db.all(
      "SELECT * FROM pending_deposits WHERE status = 'pending' AND expires_at >= NOW() ORDER BY created_at ASC LIMIT 50"
    );

    if (pending.length === 0) {
      return { checked: 0, confirmed, expired };
    }

    // 3. Fetch recent transactions from TON blockchain
    const url = `${TON_API_BASE}/getTransactions?address=${encodeURIComponent(wallet)}&limit=100${apiKey ? '&api_key=' + apiKey : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`❌ [DepositChecker] TON API error: ${response.status}`);
      return { checked: pending.length, confirmed, expired, error: `API ${response.status}` };
    }

    const data = await response.json();
    if (!data.ok || !data.result) {
      console.error('❌ [DepositChecker] Invalid TON API response');
      return { checked: pending.length, confirmed, expired, error: 'Invalid response' };
    }

    const transactions = data.result;

    // 4. Match transactions to pending deposits by memo
    for (const dep of pending) {
      const match = transactions.find(tx => {
        // Only incoming transactions
        if (!tx.in_msg || !tx.in_msg.value) return false;
        const value = parseInt(tx.in_msg.value) / 1e9; // nanoTON → TON

        // Check amount matches (±5% tolerance for network fees)
        if (Math.abs(value - parseFloat(dep.amount)) > parseFloat(dep.amount) * 0.05) return false;

        // Check memo/comment
        const comment = tx.in_msg.message || '';
        // TON comments can be base64 or text
        let decodedComment = comment;
        try {
          if (comment && !comment.includes('-')) {
            decodedComment = Buffer.from(comment, 'base64').toString('utf8');
          }
        } catch (e) {
          decodedComment = comment;
        }

        return decodedComment.trim().toUpperCase() === dep.memo.toUpperCase();
      });

      if (match) {
        // Confirm deposit!
        const txHash = match.transaction_id?.hash || 'unknown';
        await db.transaction(async (tx) => {
          await tx.run(
            "UPDATE pending_deposits SET status = 'confirmed', tx_hash = ?, confirmed_at = NOW() WHERE id = ?",
            txHash, dep.id
          );
          await tx.run(
            'INSERT INTO ad_deposits (user_id, amount, method, status) VALUES (?, ?, ?, ?)',
            dep.user_id, dep.amount, 'ton_memo', 'completed'
          );
          await tx.run(
            'UPDATE users SET ad_balance = ad_balance + ?, updated_at = NOW() WHERE id = ?',
            dep.amount, dep.user_id
          );
        });

        confirmed++;
        console.log(`✅ [Deposit] Confirmed: ${dep.memo} → ${dep.amount} TON for user ${dep.user_id} (tx: ${txHash})`);
      }
    }

    return { checked: pending.length, confirmed, expired };
  } catch (error) {
    console.error('❌ [DepositChecker] Error:', error.message);
    return { checked: 0, confirmed, expired, error: error.message };
  }
}

/**
 * Manually check a single deposit by its ID.
 */
async function checkSingleDeposit(depositId) {
  const db = getDb();
  const dep = await db.get("SELECT * FROM pending_deposits WHERE id = ?", depositId);
  if (!dep) return { error: 'Deposit not found' };
  if (dep.status !== 'pending') return { error: 'Deposit already processed', status: dep.status };

  // Check expiry
  if (new Date(dep.expires_at) < new Date()) {
    await db.run("UPDATE pending_deposits SET status = 'expired' WHERE id = ?", dep.id);
    return { error: 'Deposit expired', status: 'expired' };
  }

  const wallet = process.env.PROJECT_WALLET;
  const apiKey = process.env.TONCENTER_API_KEY || '';

  if (!wallet) return { error: 'PROJECT_WALLET not set' };

  try {
    const url = `${TON_API_BASE}/getTransactions?address=${encodeURIComponent(wallet)}&limit=100${apiKey ? '&api_key=' + apiKey : ''}`;
    const response = await fetch(url);
    if (!response.ok) return { error: `TON API error: ${response.status}` };

    const data = await response.json();
    if (!data.ok || !data.result) return { error: 'Invalid API response' };

    for (const tx of data.result) {
      if (!tx.in_msg || !tx.in_msg.value) continue;
      const value = parseInt(tx.in_msg.value) / 1e9;
      if (Math.abs(value - parseFloat(dep.amount)) > parseFloat(dep.amount) * 0.05) continue;

      let comment = tx.in_msg.message || '';
      try {
        if (comment && !comment.includes('-')) {
          comment = Buffer.from(comment, 'base64').toString('utf8');
        }
      } catch (e) {}

      if (comment.trim().toUpperCase() === dep.memo.toUpperCase()) {
        const txHash = tx.transaction_id?.hash || 'unknown';
        await db.transaction(async (txDb) => {
          await txDb.run(
            "UPDATE pending_deposits SET status = 'confirmed', tx_hash = ?, confirmed_at = NOW() WHERE id = ?",
            txHash, dep.id
          );
          await txDb.run(
            'INSERT INTO ad_deposits (user_id, amount, method, status) VALUES (?, ?, ?, ?)',
            dep.user_id, dep.amount, 'ton_memo', 'completed'
          );
          await txDb.run(
            'UPDATE users SET ad_balance = ad_balance + ?, updated_at = NOW() WHERE id = ?',
            dep.amount, dep.user_id
          );
        });
        console.log(`✅ [Deposit] Manual confirm: ${dep.memo} → ${dep.amount} TON for user ${dep.user_id}`);
        return { status: 'confirmed', amount: dep.amount, tx_hash: txHash };
      }
    }

    return { status: 'pending', message: 'Transaction not found yet. Try again later.' };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Start the deposit checker cron (every 5 minutes).
 */
function startDepositChecker() {
  if (checkInterval) return;

  console.log('🔄 Deposit checker started (every 5 min)');
  checkInterval = setInterval(async () => {
    try {
      const result = await checkPendingDeposits();
      if (result.confirmed > 0 || result.expired > 0) {
        console.log(`💰 [DepositChecker] Checked: ${result.checked}, Confirmed: ${result.confirmed}, Expired: ${result.expired}`);
      }
    } catch (error) {
      console.error('❌ [DepositChecker] Cron error:', error.message);
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Run immediately on start
  checkPendingDeposits().catch(() => {});
}

function stopDepositChecker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('⏹️ Deposit checker stopped');
  }
}

module.exports = {
  generateMemo,
  checkPendingDeposits,
  checkSingleDeposit,
  startDepositChecker,
  stopDepositChecker,
};
