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

  // User metrics table for automatic role eligibility
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT UNIQUE NOT NULL,
      -- Referral metrics
      direct_referrals INTEGER DEFAULT 0,
      total_referral_volume REAL DEFAULT 0,
      referral_earnings REAL DEFAULT 0,
      -- VIP metrics
      vip_activation_earnings REAL DEFAULT 0,
      level_earnings REAL DEFAULT 0,
      -- On-chain metrics
      tft_burned REAL DEFAULT 0,
      lp_added REAL DEFAULT 0,
      -- Role status
      is_market_maker INTEGER DEFAULT 0,
      market_maker_granted_at TEXT,
      market_maker_method TEXT,
      node_count INTEGER DEFAULT 0,
      node_granted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_address) REFERENCES users(address)
    )
  `);

  // Role grant logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_grant_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      role_type TEXT NOT NULL,
      granted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      method TEXT,
      details TEXT,
      auto_granted INTEGER DEFAULT 1,
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

// User metrics helper functions
export function getUserMetrics(userAddress: string) {
  return db.prepare('SELECT * FROM user_metrics WHERE user_address = ?').get(userAddress) as UserMetrics | undefined;
}

export function initUserMetrics(userAddress: string) {
  const existing = getUserMetrics(userAddress);
  if (!existing) {
    db.prepare(`
      INSERT INTO user_metrics (user_address) VALUES (?)
    `).run(userAddress);
  }
  return getUserMetrics(userAddress);
}

export function updateUserMetrics(userAddress: string, data: Partial<UserMetrics>) {
  initUserMetrics(userAddress);
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map(key => `${key} = ?`).join(', ');
  return db.prepare(`UPDATE user_metrics SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE user_address = ?`).run(...values, userAddress);
}

export function incrementUserMetrics(userAddress: string, field: string, amount: number) {
  initUserMetrics(userAddress);
  return db.prepare(`UPDATE user_metrics SET ${field} = ${field} + ?, updated_at = CURRENT_TIMESTAMP WHERE user_address = ?`).run(amount, userAddress);
}

export function logRoleGrant(userAddress: string, roleType: string, method: string, details: string, autoGranted: boolean = true) {
  return db.prepare(`
    INSERT INTO role_grant_logs (user_address, role_type, method, details, auto_granted)
    VALUES (?, ?, ?, ?, ?)
  `).run(userAddress, roleType, method, details, autoGranted ? 1 : 0);
}

export function getRoleGrantLogs(userAddress: string, roleType?: string) {
  if (roleType) {
    return db.prepare('SELECT * FROM role_grant_logs WHERE user_address = ? AND role_type = ? ORDER BY granted_at DESC').all(userAddress, roleType);
  }
  return db.prepare('SELECT * FROM role_grant_logs WHERE user_address = ? ORDER BY granted_at DESC').all(userAddress);
}

export interface UserMetrics {
  id: number;
  user_address: string;
  direct_referrals: number;
  total_referral_volume: number;
  referral_earnings: number;
  vip_activation_earnings: number;
  level_earnings: number;
  tft_burned: number;
  lp_added: number;
  is_market_maker: number;
  market_maker_granted_at: string | null;
  market_maker_method: string | null;
  node_count: number;
  node_granted_at: string | null;
  created_at: string;
  updated_at: string;
}

export default db;
