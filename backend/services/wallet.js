const { getDb } = require('../database');

/**
 * Get project wallet address.
 * Priority: settings table → environment variable.
 */
async function getProjectWallet() {
  try {
    const db = getDb();
    const row = await db.get("SELECT value FROM settings WHERE key = 'project_wallet'");
    if (row && row.value) return row.value;
  } catch (e) {}
  return process.env.PROJECT_WALLET || '';
}

module.exports = { getProjectWallet };
