import { supabase } from './supabaseClient';
import { getDatabase } from '../db/database';
import * as syncQueueDao from '../db/syncQueueDao';
import { useSyncStore } from '../stores/syncStore';
import { useAuthStore } from '../stores/authStore';
import { isEmailApproved } from '../utils/whitelist';
import NetInfo, { NetInfoSubscription } from '@react-native-community/netinfo';
import { RealtimeChannel } from '@supabase/supabase-js';

let netInfoUnsubscribe: NetInfoSubscription | null = null;
let realtimeChannel: RealtimeChannel | null = null;

export async function pushChanges(): Promise<void> {
  const { isLoggedIn, email, userId } = useAuthStore.getState();
  if (!isLoggedIn) return;
  if (email && !(await isEmailApproved(email))) return;

  const store = useSyncStore.getState();
  if (store.isSyncing) return;
  store.setSyncing(true);

  try {
    // Migration: rewrite local-user bills/categories to current authenticated user
    // so they can sync to cloud (RLS requires user_id = auth.uid())
    if (userId && userId !== 'local-user') {
      const db = await getDatabase();
      await db.runAsync(
        "UPDATE bills SET user_id = ?, updated_at = ? WHERE user_id = 'local-user'",
        userId, new Date().toISOString()
      );
      await db.runAsync(
        "UPDATE categories SET user_id = ?, updated_at = ? WHERE user_id = 'local-user' AND is_custom = 1",
        userId, new Date().toISOString()
      );
      // Re-queue all bills that were created as local-user (if not already in queue)
      const orphanBills = await db.getAllAsync<any>(
        `SELECT b.* FROM bills b
         WHERE b.user_id = ? AND b.is_deleted = 0
           AND NOT EXISTS (
             SELECT 1 FROM sync_queue q WHERE q.table_name = 'bills' AND q.record_id = b.id AND q.status IN ('pending','synced')
           )`,
        userId
      );
      for (const b of orphanBills) {
        await db.runAsync(
          'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
          'bills', b.id, 'insert', JSON.stringify({
            id: b.id, amount: b.amount, type: b.type, category_id: b.category_id,
            date: b.date, note: b.note || '', user_id: userId, ledger_id: b.ledger_id || 'default-ledger',
            created_at: b.created_at, updated_at: b.updated_at,
          })
        );
      }
    }

    const pendingItems = await syncQueueDao.getPendingItems();
    if (pendingItems.length === 0) {
      store.setSyncing(false);
      return;
    }

    const syncedIds: number[] = [];
    const failedIds: number[] = [];

    for (const item of pendingItems) {
      try {
        const payload = JSON.parse(item.payload);
        const table = item.tableName;

        if (item.operation === 'insert' || item.operation === 'update') {
          const record = toSnakeCase(payload);
          // Each table has different conflict keys
          const conflictKey = table === 'ledger_members' ? 'ledger_id,user_id' : 'id';
          const { error } = await supabase.from(table).upsert(record, { onConflict: conflictKey });
          if (error) {
            console.warn(`Sync error for ${table}:`, error.message);
            failedIds.push(item.id);
          } else {
            syncedIds.push(item.id);
          }
        } else if (item.operation === 'delete') {
          const record = toSnakeCase(payload);
          if (record.id) {
            const { error } = await supabase.from(table).update({ is_deleted: true }).eq('id', record.id);
            if (error) {
              failedIds.push(item.id);
            } else {
              syncedIds.push(item.id);
            }
          } else {
            syncedIds.push(item.id);
          }
        }
      } catch (e) {
        console.error('Sync item error:', e);
        failedIds.push(item.id);
      }
    }

    if (syncedIds.length > 0) await syncQueueDao.markSynced(syncedIds);
    if (failedIds.length > 0) await syncQueueDao.markFailed(failedIds);

    const remaining = await syncQueueDao.getPendingCount();
    store.setPendingCount(remaining);
    store.setLastSync(new Date().toISOString());
  } catch (e) {
    console.error('Push changes error:', e);
  } finally {
    store.setSyncing(false);
  }
}

export async function pullChanges(): Promise<void> {
  const { isLoggedIn, userId, email } = useAuthStore.getState();
  if (!isLoggedIn) return;
  if (email && !(await isEmailApproved(email))) return;

  const store = useSyncStore.getState();

  try {
    const db = await getDatabase();

    // Pull all ledgers user has access to (RLS handles filtering)
    const { data: ledgers, error: ledgersErr } = await supabase
      .from('ledgers')
      .select('*');

    if (ledgers && !ledgersErr) {
      for (const l of ledgers) {
        await db.runAsync(
          `INSERT OR REPLACE INTO ledgers (id, name, invite_code, owner_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          l.id, l.name, l.invite_code || '', l.owner_id || '', l.created_at || new Date().toISOString()
        );
      }
    }

    // Pull all ledger_members for ledgers user can see
    const { data: members, error: membersErr } = await supabase
      .from('ledger_members')
      .select('*');

    if (members && !membersErr) {
      for (const m of members) {
        await db.runAsync(
          `INSERT OR REPLACE INTO ledger_members (ledger_id, user_id, email, role, joined_at)
           VALUES (?, ?, ?, ?, ?)`,
          m.ledger_id, m.user_id, m.email || '', m.role || 'member', m.joined_at || new Date().toISOString()
        );
      }
    }

    // Pull all bills (RLS allows seeing bills in user's ledgers)
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('*');

    if (bills && !billsError) {
      for (const bill of bills) {
        await db.runAsync(
          `INSERT OR REPLACE INTO bills (id, amount, type, category_id, date, note, user_id, ledger_id, created_at, updated_at, is_deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bill.id, bill.amount, bill.type, bill.category_id, bill.date, bill.note || '',
          bill.user_id || '', bill.ledger_id || '', bill.created_at, bill.updated_at, bill.is_deleted ? 1 : 0
        );
      }
    }

    // Pull categories
    const { data: categories, error: catsError } = await supabase
      .from('categories')
      .select('*');

    if (categories && !catsError) {
      for (const cat of categories) {
        await db.runAsync(
          `INSERT OR REPLACE INTO categories (id, name, icon, type, color, sort_order, is_custom, user_id, ledger_id, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          cat.id, cat.name, cat.icon, cat.type, cat.color, cat.sort_order,
          cat.is_custom ? 1 : 0, cat.user_id || '', cat.ledger_id || '', cat.is_deleted ? 1 : 0,
          cat.created_at, cat.updated_at
        );
      }
    }

    store.setLastSync(new Date().toISOString());
  } catch (e) {
    console.error('Pull changes error:', e);
  }
}

export async function fullSync(): Promise<void> {
  await pushChanges();
  await pullChanges();
}

export function startNetworkListener(): void {
  if (netInfoUnsubscribe) return;
  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const isOnline = !!state.isConnected && !!state.isInternetReachable;
    const store = useSyncStore.getState();
    const wasOffline = !store.isOnline;
    store.setOnline(isOnline);

    if (isOnline && wasOffline) {
      fullSync().catch(console.error);
    }
  });
}

export function stopNetworkListener(): void {
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
}

export function startRealtimeSync(ledgerId: string): void {
  stopRealtimeSync();
  realtimeChannel = supabase
    .channel(`ledger-${ledgerId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: `ledger_id=eq.${ledgerId}` },
      async (payload) => {
        if (payload.new) {
          const bill = payload.new as any;
          const db = await getDatabase();
          await db.runAsync(
            `INSERT OR REPLACE INTO bills (id, amount, type, category_id, date, note, user_id, ledger_id, created_at, updated_at, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [bill.id, bill.amount, bill.type, bill.category_id, bill.date, bill.note,
             bill.user_id, bill.ledger_id, bill.created_at, bill.updated_at, bill.is_deleted ? 1 : 0]
          );
        }
      }
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `ledger_id=eq.${ledgerId}` },
      async (payload) => {
        if (payload.new) {
          const cat = payload.new as any;
          const db = await getDatabase();
          await db.runAsync(
            `INSERT OR REPLACE INTO categories (id, name, icon, type, color, sort_order, is_custom, user_id, ledger_id, is_deleted, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cat.id, cat.name, cat.icon, cat.type, cat.color, cat.sort_order,
             cat.is_custom ? 1 : 0, cat.user_id, cat.ledger_id, cat.is_deleted ? 1 : 0,
             cat.created_at, cat.updated_at]
          );
        }
      }
    )
    .subscribe();
}

export function stopRealtimeSync(): void {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in obj) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = obj[key];
  }
  return result;
}
