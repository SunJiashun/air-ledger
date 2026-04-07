import { getDatabase } from './database';
import { uuidv4 } from '../utils/uuid';

export interface Bill {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  categoryId: string;
  date: string;
  note: string | null;
  userId: string;
  ledgerId: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: number;
}

export interface BillWithCategory extends Bill {
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
}

function rowToBill(row: any): Bill {
  return {
    id: row.id,
    amount: row.amount,
    type: row.type,
    categoryId: row.category_id,
    date: row.date,
    note: row.note,
    userId: row.user_id,
    ledgerId: row.ledger_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDeleted: row.is_deleted,
  };
}

function rowToBillWithCategory(row: any): BillWithCategory {
  return {
    ...rowToBill(row),
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
  };
}

export async function insertBill(bill: {
  amount: number;
  type: 'income' | 'expense';
  categoryId: string;
  date: string;
  note?: string;
  userId?: string;
  ledgerId?: string;
}): Promise<string> {
  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();
  const note = bill.note || '';
  const userId = bill.userId || 'local-user';
  const ledgerId = bill.ledgerId || 'default-ledger';

  await db.runAsync(
    'INSERT INTO bills (id, amount, type, category_id, date, note, user_id, ledger_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, bill.amount, bill.type, bill.categoryId, bill.date, note, userId, ledgerId, now, now
  );

  await db.runAsync(
    'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
    'bills', id, 'insert', JSON.stringify({ ...bill, id, created_at: now, updated_at: now })
  );

  return id;
}

export async function getBillsByMonth(year: number, month: number, ledgerId?: string): Promise<BillWithCategory[]> {
  const db = await getDatabase();
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endMonth = month === 11 ? 0 : month + 1;
  const endYear = month === 11 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-01`;

  const lid = ledgerId || 'default-ledger';
  const rows = await db.getAllAsync(
    `SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM bills b LEFT JOIN categories c ON b.category_id = c.id
     WHERE b.date >= ? AND b.date < ? AND b.is_deleted = 0 AND (b.ledger_id = ? OR b.ledger_id IS NULL)
     ORDER BY b.date DESC, b.created_at DESC`,
    startDate, endDate, lid
  );
  return rows.map(rowToBillWithCategory);
}

export async function getBillsByDateRange(startDate: string, endDate: string, ledgerId?: string): Promise<BillWithCategory[]> {
  const db = await getDatabase();
  const lid = ledgerId || 'default-ledger';
  const rows = await db.getAllAsync(
    `SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color
     FROM bills b LEFT JOIN categories c ON b.category_id = c.id
     WHERE b.date >= ? AND b.date <= ? AND b.is_deleted = 0 AND (b.ledger_id = ? OR b.ledger_id IS NULL)
     ORDER BY b.date DESC, b.created_at DESC`,
    startDate, endDate, lid
  );
  return rows.map(rowToBillWithCategory);
}

export async function updateBill(id: string, updates: {
  amount?: number;
  type?: 'income' | 'expense';
  categoryId?: string;
  date?: string;
  note?: string;
}): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = ?'];
  const params: any[] = [now];

  if (updates.amount !== undefined) { setClauses.push('amount = ?'); params.push(updates.amount); }
  if (updates.type !== undefined) { setClauses.push('type = ?'); params.push(updates.type); }
  if (updates.categoryId !== undefined) { setClauses.push('category_id = ?'); params.push(updates.categoryId); }
  if (updates.date !== undefined) { setClauses.push('date = ?'); params.push(updates.date); }
  if (updates.note !== undefined) { setClauses.push('note = ?'); params.push(updates.note); }

  params.push(id);
  await db.runAsync(`UPDATE bills SET ${setClauses.join(', ')} WHERE id = ?`, ...params);

  await db.runAsync(
    'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
    'bills', id, 'update', JSON.stringify({ id, ...updates, updated_at: now })
  );
}

export async function getMonthSummary(year: number, month: number, ledgerId?: string): Promise<{ totalIncome: number; totalExpense: number }> {
  const db = await getDatabase();
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endMonth = month === 11 ? 0 : month + 1;
  const endYear = month === 11 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-01`;

  const lid = ledgerId || 'default-ledger';
  const result = await db.getFirstAsync<{ total_income: number; total_expense: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
     FROM bills WHERE date >= ? AND date < ? AND is_deleted = 0 AND (ledger_id = ? OR ledger_id IS NULL)`,
    startDate, endDate, lid
  );
  return {
    totalIncome: result?.total_income || 0,
    totalExpense: result?.total_expense || 0,
  };
}

export async function softDeleteBill(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync('UPDATE bills SET is_deleted = 1, updated_at = ? WHERE id = ?', now, id);
  await db.runAsync(
    'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
    'bills', id, 'delete', JSON.stringify({ id, is_deleted: 1, updated_at: now })
  );
}

export async function getCategoryExpenseSummary(startDate: string, endDate: string, ledgerId?: string): Promise<Array<{ categoryId: string; categoryName: string; categoryIcon: string; categoryColor: string; total: number }>> {
  const db = await getDatabase();
  const lid = ledgerId || 'default-ledger';
  const rows = await db.getAllAsync(
    `SELECT b.category_id, c.name as category_name, c.icon as category_icon, c.color as category_color, SUM(b.amount) as total
     FROM bills b LEFT JOIN categories c ON b.category_id = c.id
     WHERE b.date >= ? AND b.date <= ? AND b.type = 'expense' AND b.is_deleted = 0 AND (b.ledger_id = ? OR b.ledger_id IS NULL)
     GROUP BY b.category_id
     ORDER BY total DESC`,
    startDate, endDate, lid
  );
  return (rows as any[]).map((r) => ({
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryIcon: r.category_icon,
    categoryColor: r.category_color,
    total: r.total,
  }));
}

export async function getDailyExpenseSummary(startDate: string, endDate: string, ledgerId?: string): Promise<Array<{ date: string; total: number }>> {
  const db = await getDatabase();
  const lid = ledgerId || 'default-ledger';
  const rows = await db.getAllAsync(
    `SELECT date, SUM(amount) as total
     FROM bills WHERE date >= ? AND date <= ? AND type = 'expense' AND is_deleted = 0 AND (ledger_id = ? OR ledger_id IS NULL)
     GROUP BY date ORDER BY date`,
    startDate, endDate, lid
  );
  return (rows as any[]).map((r) => ({ date: r.date, total: r.total }));
}
