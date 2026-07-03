import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database file path
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create database instance
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Initialize database schema
export function initDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT UNIQUE NOT NULL,
      is_vip INTEGER DEFAULT 0,
      vip_level INTEGER DEFAULT 0,
      vip_expiry TEXT,
      tft_balance REAL DEFAULT 0,
      usdt_balance REAL DEFAULT 0,
      lp_balance REAL DEFAULT 0,
      total_value_usd REAL DEFAULT 0,
      inviter_address TEXT,
      invite_code TEXT UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Predictions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount REAL NOT NULL,
      odds REAL NOT NULL,
      potential_payout REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      result TEXT,
      payout REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      FOREIGN KEY (user_address) REFERENCES users(address)
    )
  `);

  // Nodes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT UNIQUE NOT NULL,
      active_nodes INTEGER DEFAULT 0,
      max_nodes INTEGER DEFAULT 0,
      pending_usdt REAL DEFAULT 0,
      pending_tft REAL DEFAULT 0,
      claimed_usdt REAL DEFAULT 0,
      claimed_tft REAL DEFAULT 0,
      lp_locked REAL DEFAULT 0,
      lp_unlocked REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_address) REFERENCES users(address)
    )
  `);

  // Transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      token TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      tx_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_address) REFERENCES users(address)
    )
  `);

  // Reward history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      token TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      claimed_at TEXT,
      FOREIGN KEY (user_address) REFERENCES users(address)
    )
  `);

  // Team members table
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      member_address TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      prediction_amount REAL DEFAULT 0,
      contribution REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_address) REFERENCES users(address)
    )
  `);

  // Insert default user if not exists
  const defaultUser = db.prepare('SELECT * FROM users WHERE address = ?').get('0x7a3B8cDeF9a1B2c3D4e5F6a7B8c9D0e1F2a3B4c5');
  if (!defaultUser) {
    db.prepare(`
      INSERT INTO users (address, is_vip, vip_level, tft_balance, usdt_balance, lp_balance, total_value_usd, invite_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '0x7a3B8cDeF9a1B2c3D4e5F6a7B8c9D0e1F2a3B4c5',
      1,
      3,
      12345.67,
      8765.43,
      1234.56,
      18234.50,
      'TF2A8K9X'
    );
  }

  console.log('Database initialized successfully');
}

// Helper functions
export function getUser(address: string) {
  return db.prepare('SELECT * FROM users WHERE address = ?').get(address);
}

export function createUser(address: string, inviteCode: string) {
  return db.prepare(`
    INSERT INTO users (address, invite_code) VALUES (?, ?)
  `).run(address, inviteCode);
}

export function updateUser(address: string, data: Record<string, unknown>) {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map(key => `${key} = ?`).join(', ');
  return db.prepare(`UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE address = ?`).run(...values, address);
}

// Get database instance
export function getDb() {
  return db;
}

export default db;
