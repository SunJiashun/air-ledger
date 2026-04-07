import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useBillStore } from '../../src/stores/billStore';
import { useCategoryStore } from '../../src/stores/categoryStore';
import MonthSwitcher from '../../src/components/MonthSwitcher';
import BillItem from '../../src/components/BillItem';
import FilterSheet, { type FilterCriteria } from '../../src/components/FilterSheet';
import type { BillWithCategory } from '../../src/db/billDao';

interface BillSection {
  title: string;
  data: BillWithCategory[];
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const {
    bills,
    currentYear,
    currentMonth,
    totalIncome,
    totalExpense,
    isLoading,
    loadBills,
    deleteBill,
    nextMonth,
    prevMonth,
  } = useBillStore();

  const { expenseCategories, incomeCategories, loadCategories } = useCategoryStore();
  const allCategories = useMemo(
    () => [...expenseCategories, ...incomeCategories],
    [expenseCategories, incomeCategories],
  );

  const [filterVisible, setFilterVisible] = useState(false);
  const [filterCriteria, setFilterCriteria] = useState<FilterCriteria | null>(null);

  // Reload data every time this tab becomes focused (e.g. after adding a bill)
  useFocusEffect(
    useCallback(() => {
      loadBills();
      loadCategories();
    }, [])
  );

  // Build filtered + grouped sections
  const sections: BillSection[] = useMemo(() => {
    let filtered = bills;

    if (filterCriteria) {
      const { amountMin, amountMax, categoryIds } = filterCriteria;
      if (amountMin !== undefined && !isNaN(amountMin)) {
        filtered = filtered.filter((b) => b.amount >= amountMin);
      }
      if (amountMax !== undefined && !isNaN(amountMax)) {
        filtered = filtered.filter((b) => b.amount <= amountMax);
      }
      if (categoryIds.length > 0) {
        const idSet = new Set(categoryIds);
        filtered = filtered.filter((b) => idSet.has(b.categoryId));
      }
    }

    // Group by date
    const groups = new Map<string, BillWithCategory[]>();
    for (const bill of filtered) {
      const dateKey = bill.date;
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(bill);
    }

    // Sort date keys descending and build sections
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, data]) => ({
        title: formatSectionDate(dateKey),
        data,
      }));
  }, [bills, filterCriteria]);

  const hasActiveFilter = useMemo(() => {
    if (!filterCriteria) return false;
    const { amountMin, amountMax, categoryIds } = filterCriteria;
    return (
      (amountMin !== undefined && !isNaN(amountMin)) ||
      (amountMax !== undefined && !isNaN(amountMax)) ||
      categoryIds.length > 0
    );
  }, [filterCriteria]);

  const handleApplyFilter = useCallback((criteria: FilterCriteria) => {
    const isEmpty =
      (criteria.amountMin === undefined || isNaN(criteria.amountMin)) &&
      (criteria.amountMax === undefined || isNaN(criteria.amountMax)) &&
      criteria.categoryIds.length === 0;
    setFilterCriteria(isEmpty ? null : criteria);
  }, []);

  const handleDeleteBill = useCallback(
    (id: string) => {
      deleteBill(id);
    },
    [deleteBill],
  );

  const handleRefresh = useCallback(() => {
    loadBills();
  }, [loadBills]);

  const renderSectionHeader = ({ section }: { section: BillSection }) => (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
        {section.title}
      </Text>
    </View>
  );

  const handleEditBill = useCallback((bill: BillWithCategory) => {
    router.push({
      pathname: '/add-bill',
      params: {
        editId: bill.id,
        editAmount: String(bill.amount),
        editType: bill.type,
        editCategoryId: bill.categoryId,
        editDate: bill.date,
        editNote: bill.note || '',
      },
    });
  }, [router]);

  const renderItem = ({ item }: { item: BillWithCategory }) => (
    <BillItem bill={item} onEdit={handleEditBill} onDelete={handleDeleteBill} />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        暂无账单记录
      </Text>
      <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
        点击右下角 + 记一笔
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Month Switcher */}
        <MonthSwitcher
          year={currentYear}
          month={currentMonth}
          onPrev={prevMonth}
          onNext={nextMonth}
        />

        {/* Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>收入</Text>
            <Text style={[styles.summaryAmount, { color: colors.income }]}>
              {'\u00A5'}{totalIncome.toFixed(2)}
            </Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>支出</Text>
            <Text style={[styles.summaryAmount, { color: colors.expense }]}>
              {'\u00A5'}{totalExpense.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Filter Button */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              {
                backgroundColor: hasActiveFilter ? colors.primary : colors.card,
                borderColor: hasActiveFilter ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setFilterVisible(true)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterButtonText,
                { color: hasActiveFilter ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              筛选{hasActiveFilter ? ' ●' : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bill List */}
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={sections.length === 0 ? styles.emptyListContent : undefined}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          )}
          style={styles.list}
        />

        {/* FAB */}
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/add-bill')}
          activeOpacity={0.8}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>

        {/* Filter Sheet */}
        <FilterSheet
          visible={filterVisible}
          onClose={() => setFilterVisible(false)}
          onApply={handleApplyFilter}
          categories={allCategories}
          initialCriteria={filterCriteria ?? undefined}
        />
      </View>
    </SafeAreaView>
  );
}

function formatSectionDate(dateStr: string): string {
  const d = dayjs(dateStr);
  const today = dayjs();
  const yesterday = today.subtract(1, 'day');

  if (d.isSame(today, 'day')) return '今天';
  if (d.isSame(yesterday, 'day')) return '昨天';
  return d.format('M月D日 ddd');
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  summaryCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 20,
    fontWeight: '700',
  },
  summaryDivider: {
    width: 1,
    height: 36,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    flex: 1,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '500',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 6,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 30,
  },
});
