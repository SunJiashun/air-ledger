import { getDatabase } from './database';

export interface SyncQueueItem {
  id: number;
  tableName: string;
  recordId: string;
  operation: 'insert' | 'update' | 'delete';
  payload: string;
  status: 'pending' | 'synced' | 'failed';
  createdAt: string;
}

export async function getPendingItems(): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    'SELECT * FROM sync_queue WHERE status = ? ORDER BY created_at ASC',
    'pending'
  );
  return (rows as any[]).map((r) => ({
    id: r.id,
    tableName: r.table_name,
    recordId: r.record_id,
    operation: r.operation,
    payload: r.payload,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function markSynced(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  for (const id of ids) {
    await db.runAsync("UPDATE sync_queue SET status = 'synced' WHERE id = ?", id);
  }
}

export async function markFailed(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  for (const id of ids) {
    await db.runAsync("UPDATE sync_queue SET status = 'failed' WHERE id = ?", id);
  }
}

export async function getPendingCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'"
  );
  return result?.count || 0;
}

export async function clearSyncedItems(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM sync_queue WHERE status = 'synced'");
}
