import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeProvider';
import { getDatabase } from '../src/db/database';
import { useSyncStore } from '../src/stores/syncStore';
import { exportAndShare, importFromFile } from '../src/utils/dataTransfer';
import { useBillStore } from '../src/stores/billStore';
import { useCategoryStore } from '../src/stores/categoryStore';

interface MonthData {
  month: string; // YYYY-MM
  count: number;
  estimatedSize: number; // bytes
}

const MONTH_NAMES = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
];

function formatMonth(ym: string): string {
  const [year, month] = ym.split('-');
  const monthIndex = parseInt(month, 10) - 1;
  return `${year}年${MONTH_NAMES[monthIndex] || month + '月'}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function DataManageScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const isOnline = useSyncStore((s) => s.isOnline);

  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const loadBills = useBillStore((s) => s.loadBills);
  const loadCategories = useCategoryStore((s) => s.loadCategories);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const db = await getDatabase();

      // Get monthly summary
      const rows = await db.getAllAsync(
        `SELECT strftime('%Y-%m', date) as month, COUNT(*) as count
         FROM bills WHERE is_deleted = 0
         GROUP BY strftime('%Y-%m', date)
         ORDER BY month DESC`
      );

      const data: MonthData[] = (rows as any[]).map((r) => ({
        month: r.month,
        count: r.count,
        estimatedSize: r.count * 100,
      }));

      setMonthlyData(data);

      // Totals
      const total = data.reduce((sum, d) => sum + d.count, 0);
      setTotalRecords(total);
      setTotalSize(total * 100);
    } catch (e) {
      console.error('Failed to load data summary:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteCloudOnly = () => {
    if (!selectedMonth) {
      Alert.alert('提示', '请先选择要删除的月份');
      return;
    }

    if (!isOnline) {
      Alert.alert('提示', '需要联网才能删除云端数据');
      return;
    }

    Alert.alert(
      '确认删除',
      `确定要删除 ${formatMonth(selectedMonth)} 的云端数据吗？本地数据将保留。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const db = await getDatabase();
              const startDate = selectedMonth + '-01';
              const [yearStr, monthStr] = selectedMonth.split('-');
              const year = parseInt(yearStr, 10);
              const month = parseInt(monthStr, 10);
              const endYear = month === 12 ? year + 1 : year;
              const endMonth = month === 12 ? 1 : month + 1;
              const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

              // Get all bill IDs for this month
              const bills = await db.getAllAsync(
                'SELECT id FROM bills WHERE date >= ? AND date < ? AND is_deleted = 0',
                [startDate, endDate]
              );

              // Queue deletions for Supabase sync
              for (const bill of bills as any[]) {
                await db.runAsync(
                  'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
                  ['bills', bill.id, 'delete', JSON.stringify({ id: bill.id, cloud_only: true })]
                );
              }

              Alert.alert('成功', `已将 ${formatMonth(selectedMonth)} 的 ${(bills as any[]).length} 条记录加入云端删除队列，下次同步时将执行删除。`);
              setSelectedMonth(null);
            } catch (e: any) {
              Alert.alert('错误', '操作失败: ' + (e.message || '未知错误'));
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteBoth = () => {
    if (!selectedMonth) {
      Alert.alert('提示', '请先选择要删除的月份');
      return;
    }

    Alert.alert(
      '确认删除',
      `确定要删除 ${formatMonth(selectedMonth)} 的本地和云端数据吗？此操作不可撤销！`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const db = await getDatabase();
              const startDate = selectedMonth + '-01';
              const [yearStr, monthStr] = selectedMonth.split('-');
              const year = parseInt(yearStr, 10);
              const month = parseInt(monthStr, 10);
              const endYear = month === 12 ? year + 1 : year;
              const endMonth = month === 12 ? 1 : month + 1;
              const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

              // Get bill IDs first for sync queue
              const bills = await db.getAllAsync(
                'SELECT id FROM bills WHERE date >= ? AND date < ? AND is_deleted = 0',
                [startDate, endDate]
              );

              const count = (bills as any[]).length;

              // Queue deletions for Supabase
              for (const bill of bills as any[]) {
                await db.runAsync(
                  'INSERT INTO sync_queue (table_name, record_id, operation, payload) VALUES (?, ?, ?, ?)',
                  ['bills', bill.id, 'delete', JSON.stringify({ id: bill.id })]
                );
              }

              // Soft-delete locally
              const now = new Date().toISOString();
              await db.runAsync(
                'UPDATE bills SET is_deleted = 1, updated_at = ? WHERE date >= ? AND date < ? AND is_deleted = 0',
                [now, startDate, endDate]
              );

              Alert.alert('成功', `已删除 ${formatMonth(selectedMonth)} 的 ${count} 条记录。`);
              setSelectedMonth(null);
              await loadData();
            } catch (e: any) {
              Alert.alert('错误', '删除失败: ' + (e.message || '未知错误'));
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    if (isTransferring) return;
    setIsTransferring(true);
    try {
      const result = await exportAndShare();
      if (result.success) {
        Alert.alert('导出成功', result.message);
      } else {
        Alert.alert('导出失败', result.message);
      }
    } finally {
      setIsTransferring(false);
    }
  };

  const handleImport = () => {
    if (isTransferring) return;
    Alert.alert(
      '导入数据',
      '导入会将备份文件中的数据添加到当前账本。已存在的账单和分类将被跳过，不会覆盖现有数据。\n\n是否继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '选择文件',
          onPress: async () => {
            setIsTransferring(true);
            try {
              const result = await importFromFile();
              if (result.success) {
                Alert.alert('导入成功', result.message);
                await loadData();
                await loadBills();
                await loadCategories();
              } else {
                Alert.alert('导入失败', result.message);
              }
            } finally {
              setIsTransferring(false);
            }
          },
        },
      ]
    );
  };

  const renderTransferCard = () => (
    <View style={[styles.transferCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.transferCardHeader}>
        <Ionicons name="swap-horizontal-outline" size={22} color={colors.primary} />
        <Text style={[styles.transferTitle, { color: colors.text }]}>数据迁移</Text>
      </View>
      <Text style={[styles.transferDesc, { color: colors.textSecondary }]}>
        导出个人账本的数据为文件，用于换手机或备份。共享账本的数据请通过云同步迁移。
      </Text>
      <View style={styles.transferButtons}>
        <TouchableOpacity
          style={[styles.transferButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
          onPress={handleExport}
          disabled={isTransferring}
        >
          {isTransferring ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="download-outline" size={18} color="#FFFFFF" />
              <Text style={[styles.transferButtonText, { color: '#FFFFFF' }]}>导出</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.transferButton, { backgroundColor: colors.card, borderColor: colors.primary, borderWidth: 1 }]}
          activeOpacity={0.8}
          onPress={handleImport}
          disabled={isTransferring}
        >
          <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
          <Text style={[styles.transferButtonText, { color: colors.primary }]}>导入</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStorageCard = () => (
    <View style={[styles.storageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.storageCardHeader}>
        <Ionicons name="server-outline" size={22} color={colors.primary} />
        <Text style={[styles.storageTitle, { color: colors.text }]}>本地存储概览</Text>
      </View>
      <View style={styles.storageStats}>
        <View style={styles.storageStat}>
          <Text style={[styles.storageStatValue, { color: colors.text }]}>{totalRecords}</Text>
          <Text style={[styles.storageStatLabel, { color: colors.textSecondary }]}>总记录数</Text>
        </View>
        <View style={[styles.storageDivider, { backgroundColor: colors.border }]} />
        <View style={styles.storageStat}>
          <Text style={[styles.storageStatValue, { color: colors.text }]}>{formatBytes(totalSize)}</Text>
          <Text style={[styles.storageStatLabel, { color: colors.textSecondary }]}>预估大小</Text>
        </View>
        <View style={[styles.storageDivider, { backgroundColor: colors.border }]} />
        <View style={styles.storageStat}>
          <Text style={[styles.storageStatValue, { color: colors.text }]}>{monthlyData.length}</Text>
          <Text style={[styles.storageStatLabel, { color: colors.textSecondary }]}>月份数</Text>
        </View>
      </View>
    </View>
  );

  const renderMonthItem = ({ item }: { item: MonthData }) => {
    const isSelected = item.month === selectedMonth;
    return (
      <TouchableOpacity
        style={[
          styles.monthItem,
          {
            backgroundColor: colors.card,
            borderColor: isSelected ? colors.primary : colors.border,
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
        activeOpacity={0.7}
        onPress={() => setSelectedMonth(isSelected ? null : item.month)}
      >
        <View style={styles.monthItemLeft}>
          <View style={[styles.monthIcon, { backgroundColor: isSelected ? colors.primaryLight : colors.background }]}>
            <Ionicons
              name="calendar-outline"
              size={18}
              color={isSelected ? colors.primary : colors.textSecondary}
            />
          </View>
          <View>
            <Text style={[styles.monthName, { color: colors.text }]}>{formatMonth(item.month)}</Text>
            <Text style={[styles.monthMeta, { color: colors.textSecondary }]}>
              {item.count} 条记录  |  {formatBytes(item.estimatedSize)}
            </Text>
          </View>
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  const renderDeleteSection = () => {
    if (!selectedMonth) return null;

    return (
      <View style={styles.deleteSection}>
        <Text style={[styles.deleteSectionTitle, { color: colors.textSecondary }]}>
          已选择: {formatMonth(selectedMonth)}
        </Text>
        <View style={styles.deleteButtons}>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: colors.card, borderColor: colors.danger, borderWidth: 1 }]}
            activeOpacity={0.8}
            onPress={handleDeleteCloudOnly}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <>
                <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
                <Text style={[styles.deleteButtonText, { color: colors.danger }]}>仅删除云端</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: colors.danger }]}
            activeOpacity={0.8}
            onPress={handleDeleteBoth}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                <Text style={[styles.deleteButtonText, { color: '#FFFFFF' }]}>同时删除本地</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>数据管理</Text>
        <View style={styles.placeholder} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={monthlyData}
          keyExtractor={(item) => item.month}
          renderItem={renderMonthItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {renderStorageCard()}
              {renderTransferCard()}
              {renderDeleteSection()}
              {monthlyData.length > 0 && (
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  按月份浏览 (点击选择)
                </Text>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>暂无账单数据</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    height: 56,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // Storage card
  storageCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  storageCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  storageTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  storageStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storageStat: {
    flex: 1,
    alignItems: 'center',
  },
  storageStatValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  storageStatLabel: {
    fontSize: 12,
  },
  storageDivider: {
    width: 1,
    height: 32,
  },
  // Transfer card
  transferCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  transferCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  transferTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  transferDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  transferButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  transferButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    gap: 6,
  },
  transferButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Section title
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
    paddingLeft: 4,
  },
  // Month items
  monthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  monthItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  monthIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  monthName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  monthMeta: {
    fontSize: 12,
  },
  // Delete section
  deleteSection: {
    marginBottom: 20,
  },
  deleteSectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 10,
    paddingLeft: 4,
  },
  deleteButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    height: 46,
    gap: 6,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
});
