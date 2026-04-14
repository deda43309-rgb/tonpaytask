const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'tonpaytask.db');

let db;

/**
 * Wrapper class that gives sql.js a better-sqlite3-like API
 * so existing routes don't need to change.
 * 
 * Key: uses prepared statements (prepare/bind/step/free) for ALL writes
 * because sql.js db.run() auto-commits and breaks explicit transactions.
 */
class DbWrapper {
  constructor(sqlDb) {
    this._db = sqlDb;
    this._inTransaction = false;
  }

  prepare(sql) {
    const self = this;
    return {
      run(...params) {
        const stmt = self._db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        stmt.step();
        stmt.free();
        if (!self._inTransaction) {
          self._save();
        }
        return {
          changes: self._db.getRowsModified(),
          lastInsertRowid: self._getLastInsertRowid(),
        };
      },
      get(...params) {
        try {
          const stmt = self._db.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return undefined;
        } catch (e) {
          console.error('DB get error:', sql, e.message);
          return undefined;
        }
      },
      all(...params) {
        try {
          const results = [];
          const stmt = self._db.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        } catch (e) {
          console.error('DB all error:', sql, e.message);
          return [];
        }
      },
    };
  }

  exec(sql) {
    this._db.exec(sql);
    if (!this._inTransaction) {
      this._save();
    }
  }

  pragma(pragmaStr) {
    try {
      this._db.exec(`PRAGMA ${pragmaStr}`);
    } catch (e) {
      // Some pragmas may not be supported in sql.js
    }
  }

  transaction(fn) {
    const self = this;
    return function (...args) {
      self._inTransaction = true;
      self._db.exec('BEGIN');
      try {
        const result = fn(...args);
        self._db.exec('COMMIT');
        self._inTransaction = false;
        self._save();
        return result;
      } catch (e) {
        self._inTransaction = false;
        try { self._db.exec('ROLLBACK'); } catch (_) {}
        throw e;
      }
    };
  }

  _getLastInsertRowid() {
    const stmt = this._db.prepare('SELECT last_insert_rowid() as id');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return row.id;
  }

  _save() {
    try {
      const data = this._db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
      console.error('Failed to save database:', e);
    }
  }
}

async function initDatabase() {
  if (db) return db;

  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  db = new DbWrapper(sqlDb);
  db.pragma('foreign_keys = ON');
  initTables();

  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      photo_url TEXT,
      balance INTEGER DEFAULT 0,
      referral_code TEXT UNIQUE,
      referred_by INTEGER,
      is_admin INTEGER DEFAULT 0,
      last_daily_bonus TEXT,
      total_earned INTEGER DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (referred_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      completed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      UNIQUE(user_id, task_id)
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL,
      referred_id INTEGER NOT NULL,
      bonus INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (referrer_id) REFERENCES users(id),
      FOREIGN KEY (referred_id) REFERENCES users(id),
      UNIQUE(referred_id)
    );

    CREATE TABLE IF NOT EXISTS daily_bonuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      streak INTEGER DEFAULT 1,
      claimed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  try { db.exec('CREATE INDEX IF NOT EXISTS idx_task_completions_user ON task_completions(user_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_task_completions_task ON task_completions(task_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)'); } catch(e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_daily_bonuses_user ON daily_bonuses(user_id)'); } catch(e) {}

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
