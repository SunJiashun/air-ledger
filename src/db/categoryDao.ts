import { getDatabase } from './database';
import { uuidv4 } from '../utils/uuid';

export interface Category {
  id: string;
  name: string;
  icon: string;
  type: 'income' | 'expense';
  color: string;
  sortOrder: number;
  isCustom: number;
  userId: string | null;
  ledgerId: string | null;
  isDeleted: number;
}

function rowToCategory(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    type: row.type,
    color: row.color,
    sortOrder: row.sort_order,
    isCustom: row.is_custom,
    userId: row.user_id,
    ledgerId: row.ledger_id,
    isDeleted: row.is_deleted,
  };
}

/**
 * Get categories for a specific ledger.
 * Returns: preset categories (is_custom=0, no ledger_id) + custom categories belonging to this ledger.
 */
export async function getAllCategories(type?: 'income' | 'expense', ledgerId?: string): Promise<Category[]> {
  const db = await getDatabase();
  const lid = ledgerId || 'default-ledger';

  if (type) {
    const rows = await db.getAllAsync(
      `SELECT * FROM categories
       WHERE is_deleted = 0 AND type = ?
         AND (is_custom = 0 OR ledger_id = ?)
       ORDER BY is_custom ASC, sort_order ASC`,
      type, lid
    );
    return rows.map(rowToCategory);
  }

  const rows = await db.getAllAsync(
    `SELECT * FROM categories
     WHERE is_deleted = 0
       AND (is_custom = 0 OR ledger_id = ?)
     ORDER BY is_custom ASC, sort_order ASC`,
    lid
  );
  return rows.map(rowToCategory);
}

export async function insertCategory(category: {
  name: string;
  icon: string;
  type: 'income' | 'expense';
  color: string;
  ledgerId?: string;
  userId?: string;
}): Promise<string> {
  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const maxOrder = await db.getFirstAsync<{ max_order: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM categories WHERE type = ?',
    category.type
  );

  const sortOrder = (maxOrder?.max_order || 0) + 1;
  const userId = category.userId || 'local-user';
  const ledgerId = category.ledgerId || 'default-ledger';

  await db.runAsync(
    'INSERT INTO categories (id, name, icon, type, color, sort_order, is_custom, user_id, ledger_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
    id, category.name, category.icon, category.type, category.color, sortOrder, userId, ledgerId, now, now
  );

  await db.runAsync(
    'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
    'categories', id, 'insert', JSON.stringify({
      ...category, id, ledger_id: ledgerId, is_custom: 1, created_at: now, updated_at: now,
    })
  );

  return id;
}

export async function updateCategory(id: string, updates: { name?: string; icon?: string; color?: string }): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = ?'];
  const params: any[] = [now];

  if (updates.name !== undefined) { setClauses.push('name = ?'); params.push(updates.name); }
  if (updates.icon !== undefined) { setClauses.push('icon = ?'); params.push(updates.icon); }
  if (updates.color !== undefined) { setClauses.push('color = ?'); params.push(updates.color); }

  params.push(id);
  await db.runAsync(`UPDATE categories SET ${setClauses.join(', ')} WHERE id = ?`, ...params);

  await db.runAsync(
    'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
    'categories', id, 'update', JSON.stringify({ id, ...updates, updated_at: now })
  );
}

export async function softDeleteCategory(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync('UPDATE categories SET is_deleted = 1, updated_at = ? WHERE id = ? AND is_custom = 1', now, id);
  await db.runAsync(
    'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
    'categories', id, 'delete', JSON.stringify({ id, is_deleted: 1, updated_at: now })
  );
}
