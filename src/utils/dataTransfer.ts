/**
 * 本地数据导出/导入
 * 用于用户换手机时迁移数据
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getDatabase } from '../db/database';
import dayjs from 'dayjs';

export interface ExportData {
  version: number;
  exportedAt: string;
  appName: string;
  ledgers: any[];
  ledgerMembers: any[];
  categories: any[];
  bills: any[];
}

const EXPORT_VERSION = 1;
const APP_NAME = 'minimalist-ledger';

/**
 * 导出所有本地数据为 JSON
 */
export async function exportData(): Promise<ExportData> {
  const db = await getDatabase();

  const ledgers = await db.getAllAsync('SELECT * FROM ledgers');
  const ledgerMembers = await db.getAllAsync('SELECT * FROM ledger_members');
  const categories = await db.getAllAsync('SELECT * FROM categories WHERE is_custom = 1 AND is_deleted = 0');
  const bills = await db.getAllAsync('SELECT * FROM bills WHERE is_deleted = 0');

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    appName: APP_NAME,
    ledgers: ledgers as any[],
    ledgerMembers: ledgerMembers as any[],
    categories: categories as any[],
    bills: bills as any[],
  };
}

/**
 * 导出并保存/分享文件
 * - Mobile: 保存到临时目录并调用系统分享
 * - Web: 触发浏览器下载
 */
export async function exportAndShare(): Promise<{ success: boolean; message: string }> {
  try {
    const data = await exportData();
    const json = JSON.stringify(data, null, 2);
    const filename = `minimalist-ledger-${dayjs().format('YYYYMMDD-HHmmss')}.json`;

    if (Platform.OS === 'web') {
      // Web: trigger browser download
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return {
        success: true,
        message: `已导出 ${data.bills.length} 条账单、${data.categories.length} 个自定义分类、${data.ledgers.length} 个账本`,
      };
    }

    // Mobile: write to cache dir and share
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: '导出极简账单数据',
        UTI: 'public.json',
      });
    }

    return {
      success: true,
      message: `已导出 ${data.bills.length} 条账单、${data.categories.length} 个自定义分类、${data.ledgers.length} 个账本`,
    };
  } catch (e: any) {
    return { success: false, message: e.message || '导出失败' };
  }
}

/**
 * 从文件导入数据
 * 合并策略：
 *   - 账单：按 ID 去重，存在的跳过
 *   - 自定义分类：按 ID 去重，存在的跳过
 *   - 账本：按 ID 去重，存在的跳过
 */
export async function importFromFile(): Promise<{
  success: boolean;
  message: string;
  imported?: { bills: number; categories: number; ledgers: number };
}> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, message: '已取消' };
    }

    const file = result.assets[0];
    let jsonText: string;

    if (Platform.OS === 'web') {
      // Web: read from blob
      const response = await fetch(file.uri);
      jsonText = await response.text();
    } else {
      // Mobile: read via FileSystem
      jsonText = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    const data: ExportData = JSON.parse(jsonText);

    // Validate
    if (data.appName !== APP_NAME) {
      return { success: false, message: '文件格式不正确，不是极简账单的导出文件' };
    }
    if (!data.version || data.version > EXPORT_VERSION) {
      return { success: false, message: `不支持的文件版本 ${data.version}` };
    }

    const db = await getDatabase();
    let billsCount = 0;
    let categoriesCount = 0;
    let ledgersCount = 0;

    // Import ledgers (skip default-ledger and existing)
    for (const l of data.ledgers || []) {
      if (l.id === 'default-ledger') continue;
      const existing = await db.getFirstAsync<any>('SELECT id FROM ledgers WHERE id = ?', l.id);
      if (existing) continue;
      await db.runAsync(
        'INSERT INTO ledgers (id, name, invite_code, owner_id, created_at) VALUES (?, ?, ?, ?, ?)',
        l.id, l.name, l.invite_code || '', l.owner_id || 'local-user', l.created_at || new Date().toISOString()
      );
      ledgersCount++;
    }

    // Import ledger members
    for (const m of data.ledgerMembers || []) {
      const existing = await db.getFirstAsync<any>(
        'SELECT * FROM ledger_members WHERE ledger_id = ? AND user_id = ?',
        m.ledger_id, m.user_id
      );
      if (existing) continue;
      await db.runAsync(
        'INSERT INTO ledger_members (ledger_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
        m.ledger_id, m.user_id, m.role || 'member', m.joined_at || new Date().toISOString()
      );
    }

    // Import custom categories
    for (const c of data.categories || []) {
      const existing = await db.getFirstAsync<any>('SELECT id FROM categories WHERE id = ?', c.id);
      if (existing) continue;
      await db.runAsync(
        'INSERT INTO categories (id, name, icon, type, color, sort_order, is_custom, user_id, ledger_id, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?)',
        c.id, c.name, c.icon, c.type, c.color, c.sort_order || 0, c.user_id || 'local-user',
        c.ledger_id || 'default-ledger', c.created_at || new Date().toISOString(), c.updated_at || new Date().toISOString()
      );
      categoriesCount++;
    }

    // Import bills
    for (const b of data.bills || []) {
      const existing = await db.getFirstAsync<any>('SELECT id FROM bills WHERE id = ?', b.id);
      if (existing) continue;
      await db.runAsync(
        'INSERT INTO bills (id, amount, type, category_id, date, note, user_id, ledger_id, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
        b.id, b.amount, b.type, b.category_id, b.date, b.note || '',
        b.user_id || 'local-user', b.ledger_id || 'default-ledger',
        b.created_at || new Date().toISOString(), b.updated_at || new Date().toISOString()
      );
      billsCount++;
    }

    return {
      success: true,
      message: `导入成功！新增 ${billsCount} 条账单、${categoriesCount} 个分类、${ledgersCount} 个账本`,
      imported: { bills: billsCount, categories: categoriesCount, ledgers: ledgersCount },
    };
  } catch (e: any) {
    return { success: false, message: e.message || '导入失败，请检查文件格式' };
  }
}
