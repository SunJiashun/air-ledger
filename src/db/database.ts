import * as SQLite from 'expo-sqlite';
import { ALL_DEFAULT_CATEGORIES } from '../utils/constants';
import { uuidv4 } from '../utils/uuid';

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const database = await SQLite.openDatabaseAsync('minimalist_ledger.db');
    await initDatabase(database);
    db = database;
    return database;
  })();
  return initPromise;
}

async function initDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  // Execute each statement separately for expo-sqlite v16 compatibility
  await database.execAsync('PRAGMA journal_mode = WAL');
  await database.execAsync('PRAGMA foreign_keys = ON');

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS ledgers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code TEXT,
      owner_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS ledger_members (
      ledger_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (ledger_id, user_id),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id)
    )
  `);

  // Migration: add email column to existing ledger_members table
  try {
    await database.execAsync('ALTER TABLE ledger_members ADD COLUMN email TEXT');
  } catch {
    // column already exists
  }

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_custom INTEGER NOT NULL DEFAULT 0,
      user_id TEXT,
      ledger_id TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id)
    )
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      category_id TEXT NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      user_id TEXT,
      ledger_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id)
    )
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('insert', 'update', 'delete')),
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'synced', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await database.execAsync('CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS idx_bills_ledger ON bills(ledger_id)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS idx_bills_type ON bills(type)');
  await database.execAsync('CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)');

  // Migrate: assign orphan custom categories to default ledger
  await database.runAsync(
    "UPDATE categories SET ledger_id = 'default-ledger' WHERE is_custom = 1 AND ledger_id IS NULL"
  );

  await seedDefaultData(database);
}

async function seedDefaultData(database: SQLite.SQLiteDatabase): Promise<void> {
  const result = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if (result && result.count > 0) return;

  // Create default personal ledger
  await database.runAsync(
    'INSERT OR IGNORE INTO ledgers (id, name, owner_id) VALUES (?, ?, ?)',
    'default-ledger', '个人账本', 'local-user'
  );

  // Seed default categories
  for (const cat of ALL_DEFAULT_CATEGORIES) {
    await database.runAsync(
      'INSERT OR IGNORE INTO categories (id, name, icon, type, color, sort_order, is_custom, user_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      cat.id, cat.name, cat.icon, cat.type, cat.color, cat.sortOrder, 'local-user'
    );
  }
}
