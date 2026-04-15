const { Pool } = require('pg');

let pool;

/**
 * Async wrapper around pg Pool that provides a simple API
 * similar to the previous sql.js wrapper.
 */
class PgDb {
  constructor(pgPool) {
    this._pool = pgPool;
  }

  /**
   * Convert SQLite-style ? params to PostgreSQL $1, $2, ...
   */
  _convertParams(sql, params) {
    let idx = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++idx}`);
    return pgSql;
  }

  /**
   * Get a single row
   */
  async get(sql, ...params) {
    const pgSql = this._convertParams(sql, params);
    const result = await this._pool.query(pgSql, params);
    return result.rows[0] || undefined;
  }

  /**
   * Get all rows
   */
  async all(sql, ...params) {
    const pgSql = this._convertParams(sql, params);
    const result = await this._pool.query(pgSql, params);
    return result.rows;
  }

  /**
   * Run a statement (INSERT/UPDATE/DELETE)
   */
  async run(sql, ...params) {
    const pgSql = this._convertParams(sql, params);
    const result = await this._pool.query(pgSql, params);
    return {
      changes: result.rowCount,
      lastInsertRowid: result.rows?.[0]?.id || null,
    };
  }

  /**
   * Execute raw SQL (for CREATE TABLE etc.)
   */
  async exec(sql) {
    await this._pool.query(sql);
  }

  /**
   * Run a function inside a transaction
   */
  async transaction(fn) {
    const client = await this._pool.connect();
    try {
      await client.query('BEGIN');
      const txDb = new PgTxDb(client);
      const result = await fn(txDb);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

/**
 * Transaction-scoped DB that uses a single client
 */
class PgTxDb {
  constructor(client) {
    this._client = client;
  }

  _convertParams(sql, params) {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  async get(sql, ...params) {
    const pgSql = this._convertParams(sql, params);
    const result = await this._client.query(pgSql, params);
    return result.rows[0] || undefined;
  }

  async all(sql, ...params) {
    const pgSql = this._convertParams(sql, params);
    const result = await this._client.query(pgSql, params);
    return result.rows;
  }

  async run(sql, ...params) {
    const pgSql = this._convertParams(sql, params);
    const result = await this._client.query(pgSql, params);
    return {
      changes: result.rowCount,
      lastInsertRowid: result.rows?.[0]?.id || null,
    };
  }
}

let db;

async function initDatabase() {
  if (db) return db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  // Test connection
  const client = await pool.connect();
  console.log('✅ Connected to PostgreSQL');
  client.release();

  db = new PgDb(pool);
  await initTables();

  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

async function initTables() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      photo_url TEXT,
      balance INTEGER DEFAULT 0,
      referral_code TEXT UNIQUE,
      referred_by BIGINT,
      is_admin INTEGER DEFAULT 0,
      last_daily_bonus TIMESTAMP,
      total_earned INTEGER DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0,
      ad_balance INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('subscribe_channel', 'start_bot', 'visit_link')),
      title TEXT NOT NULL,
      description TEXT,
      reward INTEGER NOT NULL DEFAULT 0,
      target_url TEXT NOT NULL,
      target_id TEXT,
      icon TEXT DEFAULT '📋',
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      max_completions INTEGER DEFAULT 0,
      current_completions INTEGER DEFAULT 0,
      image_url TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  try {
    await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;`);
  } catch (e) {}

  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_completions (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      completed_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, task_id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_id BIGINT NOT NULL REFERENCES users(id),
      referred_id BIGINT NOT NULL REFERENCES users(id),
      bonus INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(referred_id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS daily_bonuses (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      amount INTEGER NOT NULL,
      streak INTEGER DEFAULT 1,
      claimed_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ad_tasks (
      id SERIAL PRIMARY KEY,
      advertiser_id BIGINT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('subscribe_channel', 'start_bot', 'visit_link')),
      reward INTEGER NOT NULL DEFAULT 0,
      max_completions INTEGER NOT NULL DEFAULT 100,
      current_completions INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'deleted')),
      image_url TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ad_task_completions (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES ad_tasks(id),
      user_id BIGINT NOT NULL REFERENCES users(id),
      completed_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, task_id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ad_deposits (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      amount INTEGER NOT NULL,
      method TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ad_transactions (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL,
      user_id BIGINT,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_checks (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      task_id INTEGER NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'admin',
      channel_id TEXT NOT NULL,
      completed_at TIMESTAMP NOT NULL DEFAULT NOW(),
      check_after TIMESTAMP NOT NULL,
      status TEXT DEFAULT 'pending',
      checked_at TIMESTAMP,
      penalty_applied INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_task_completions_user ON task_completions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_task_completions_task ON task_completions(task_id)',
    'CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)',
    'CREATE INDEX IF NOT EXISTS idx_daily_bonuses_user ON daily_bonuses(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ad_tasks_advertiser ON ad_tasks(advertiser_id)',
    'CREATE INDEX IF NOT EXISTS idx_ad_task_completions_user ON ad_task_completions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ad_task_completions_task ON ad_task_completions(task_id)',
    'CREATE INDEX IF NOT EXISTS idx_ad_deposits_user ON ad_deposits(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ad_transactions_type ON ad_transactions(type)',
    'CREATE INDEX IF NOT EXISTS idx_ad_transactions_user ON ad_transactions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_sub_checks_status ON subscription_checks(status)',
    'CREATE INDEX IF NOT EXISTS idx_sub_checks_check_after ON subscription_checks(check_after)',
  ];
  for (const idx of indexes) {
    try { await db.exec(idx); } catch(e) {}
  }

  // Default settings
  const defaults = [
    ['ad_price', '20'],
    ['ad_user_reward', '10'],
    ['ad_ref_reward', '2'],
    ['ad_commission', '8'],
    ['admin_balance', '0'],
    ['sub_check_hours', '72'],
    ['unsub_penalty', '50'],
  ];
  for (const [key, value] of defaults) {
    try {
      await db.run(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING",
        key, value
      );
    } catch(e) {}
  }

  console.log('✅ Database tables initialized');
}

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

module.exports = { initDatabase, getDb, generateReferralCode };
