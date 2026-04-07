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
  const { isLoggedIn, email } = useAuthStore.getState();
  if (!isLoggedIn) return;
  if (email && !(await isEmailApproved(email))) return;

  const store = useSyncStore.getState();
  if (store.isSyncing) return;
  store.setSyncing(true);

  try {
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
  const lastSync = store.lastSyncAt || '1970-01-01T00:00:00Z';

  try {
    const db = await getDatabase();

    // Pull bills
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('*')
      .gt('updated_at', lastSync);

    if (bills && !billsError) {
      for (const bill of bills) {
        await db.runAsync(
          `INSERT OR REPLACE INTO bills (id, amount, type, category_id, date, note, user_id, ledger_id, created_at, updated_at, is_deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [bill.id, bill.amount, bill.type, bill.category_id, bill.date, bill.note,
           bill.user_id, bill.ledger_id, bill.created_at, bill.updated_at, bill.is_deleted ? 1 : 0]
        );
      }
    }

    // Pull categories
    const { data: categories, error: catsError } = await supabase
      .from('categories')
      .select('*')
      .gt('updated_at', lastSync);

    if (categories && !catsError) {
      for (const cat of categories) {
        await db.runAsync(
          `INSERT OR REPLACE INTO categories (id, name, icon, type, color, sort_order, is_custom, user_id, ledger_id, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cat.id, cat.name, cat.icon, cat.type, cat.color, cat.sort_order,
           cat.is_custom ? 1 : 0, cat.user_id, cat.ledger_id, cat.is_deleted ? 1 : 0,
           cat.created_at, cat.updated_at]
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
