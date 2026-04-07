import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useTheme } from '../../src/theme/ThemeProvider';
import { formatAmount } from '../../src/utils/formatters';
import {
  getCategoryExpenseSummary,
  getDailyExpenseSummary,
  getBillsByDateRange,
} from '../../src/db/billDao';
import DonutChart, { DonutChartItem } from '../../src/components/DonutChart';
import BarChartComponent, { BarChartItem } from '../../src/components/BarChart';

dayjs.extend(isoWeek);

type Period = 'week' | 'month' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  week: '周',
  month: '月',
  year: '年',
};

function getDateRange(period: Period, offset: number): { start: string; end: string } {
  const base = dayjs().add(offset, period === 'week' ? 'week' : period === 'month' ? 'month' : 'year');
  switch (period) {
    case 'week':
      return {
        start: base.startOf('isoWeek').format('YYYY-MM-DD'),
        end: base.endOf('isoWeek').format('YYYY-MM-DD'),
      };
    case 'month':
      return {
        start: base.startOf('month').format('YYYY-MM-DD'),
        end: base.endOf('month').format('YYYY-MM-DD'),
      };
    case 'year':
      return {
        start: base.startOf('year').format('YYYY-MM-DD'),
        end: base.endOf('year').format('YYYY-MM-DD'),
      };
  }
}

function getPeriodTitle(period: Period, offset: number): string {
  const base = dayjs().add(offset, period === 'week' ? 'week' : period === 'month' ? 'month' : 'year');
  switch (period) {
    case 'week': {
      const start = base.startOf('isoWeek');
      const end = base.endOf('isoWeek');
      if (offset === 0) return `本周 ${start.format('M.D')} - ${end.format('M.D')}`;
      if (offset === -1) return `上周 ${start.format('M.D')} - ${end.format('M.D')}`;
      return `${start.format('M.D')} - ${end.format('M.D')}`;
    }
    case 'month':
      if (offset === 0) return `本月 ${base.format('YYYY年M月')}`;
      return base.format('YYYY年M月');
    case 'year':
      if (offset === 0) return `今年 ${base.format('YYYY年')}`;
      return base.format('YYYY年');
  }
}

export default function StatsScreen() {
  const { colors } = useTheme();
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [donutData, setDonutData] = useState<DonutChartItem[]>([]);
  const [barData, setBarData] = useState<BarChartItem[]>([]);
  const [totalExpense, setTotalExpense] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Generate picker options based on period type
  const pickerOptions = useMemo(() => {
    const options: { label: string; offset: number }[] = [];
    const count = period === 'week' ? 26 : period === 'month' ? 24 : 10;
    for (let i = 0; i >= -count; i--) {
      const base = dayjs().add(i, period === 'week' ? 'week' : period === 'month' ? 'month' : 'year');
      let label = '';
      if (period === 'week') {
        const s = base.startOf('isoWeek');
        const e = base.endOf('isoWeek');
        const prefix = i === 0 ? '本周  ' : i === -1 ? '上周  ' : '';
        label = `${prefix}${s.format('YYYY.M.D')} - ${e.format('M.D')}`;
      } else if (period === 'month') {
        const prefix = i === 0 ? '本月  ' : i === -1 ? '上月  ' : '';
        label = `${prefix}${base.format('YYYY年M月')}`;
      } else {
        const prefix = i === 0 ? '今年  ' : '';
        label = `${prefix}${base.format('YYYY年')}`;
      }
      options.push({ label, offset: i });
    }
    return options;
  }, [period]);

  // Reset offset when switching period type
  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
    setOffset(0);
  }, []);

  const goBack = useCallback(() => setOffset((o) => o - 1), []);
  const goForward = useCallback(() => setOffset((o) => Math.min(o + 1, 0)), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(period, offset);

      // Load category breakdown for donut chart
      const categorySummary = await getCategoryExpenseSummary(start, end);
      const catTotal = categorySummary.reduce((sum, c) => sum + c.total, 0);
      setTotalExpense(catTotal);

      const donutItems: DonutChartItem[] = categorySummary.map((cat, index) => ({
        value: cat.total,
        color: cat.categoryColor || colors.categoryColors[index % colors.categoryColors.length],
        text: cat.categoryName || '未分类',
        icon: cat.categoryIcon || '📦',
      }));
      setDonutData(donutItems);

      // Load bar chart data based on period
      if (period === 'week') {
        const dailySummary = await getDailyExpenseSummary(start, end);
        const weekStart = dayjs(start);
        const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
        const weekBarData: BarChartItem[] = [];
        for (let i = 0; i < 7; i++) {
          const dateStr = weekStart.add(i, 'day').format('YYYY-MM-DD');
          const found = dailySummary.find((d) => d.date === dateStr);
          weekBarData.push({
            value: found ? found.total : 0,
            label: dayLabels[i],
            frontColor: colors.primary,
          });
        }
        setBarData(weekBarData);
      } else if (period === 'month') {
        const dailySummary = await getDailyExpenseSummary(start, end);
        const monthStart = dayjs(start);
        const monthEnd = dayjs(end);
        const totalWeeks = Math.ceil(monthEnd.diff(monthStart, 'day') / 7);
        const weekMap: Record<number, number> = {};
        for (let i = 0; i < totalWeeks; i++) weekMap[i] = 0;
        dailySummary.forEach((d) => {
          const dayOffset = dayjs(d.date).diff(monthStart, 'day');
          const weekIndex = Math.min(Math.floor(dayOffset / 7), totalWeeks - 1);
          weekMap[weekIndex] = (weekMap[weekIndex] || 0) + d.total;
        });
        const monthBarData: BarChartItem[] = Object.keys(weekMap).map((key) => ({
          value: weekMap[Number(key)],
          label: `第${Number(key) + 1}周`,
          frontColor: colors.primary,
        }));
        setBarData(monthBarData);
      } else {
        const bills = await getBillsByDateRange(start, end);
        const monthMap: Record<number, number> = {};
        for (let i = 0; i < 12; i++) monthMap[i] = 0;
        bills.forEach((bill) => {
          if (bill.type === 'expense') {
            monthMap[dayjs(bill.date).month()] += bill.amount;
          }
        });
        const monthLabels = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
        const yearBarData: BarChartItem[] = monthLabels.map((label, index) => ({
          value: monthMap[index],
          label,
          frontColor: colors.primary,
        }));
        setBarData(yearBarData);
      }
    } catch (error) {
      console.warn('Failed to load stats:', error);
      setDonutData([]);
      setBarData([]);
      setTotalExpense(0);
    } finally {
      setLoading(false);
    }
  }, [period, offset, colors]);

  // Reload data every time this tab becomes focused
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const xAxisLabel = period === 'week' ? '日期' : period === 'month' ? '周' : '月';
  const isCurrentPeriod = offset === 0;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <Text style={[styles.title, { color: colors.text }]}>统计</Text>

      {/* Period type selector */}
      <View style={[styles.tabRow, { backgroundColor: colors.card }]}>
        {(['week', 'month', 'year'] as Period[]).map((p) => {
          const isActive = period === p;
          return (
            <TouchableOpacity
              key={p}
              style={[styles.tabButton, isActive && { backgroundColor: colors.primary }]}
              onPress={() => handlePeriodChange(p)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, { color: isActive ? '#FFFFFF' : colors.textSecondary }]}>
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Period navigator: ◀ title ▶ 📅 */}
      <View style={styles.periodNav}>
        <TouchableOpacity onPress={goBack} style={styles.navArrow} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setOffset(0)} activeOpacity={0.6}>
          <Text style={[styles.periodTitle, { color: colors.text }]}>
            {getPeriodTitle(period, offset)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={goForward}
          style={styles.navArrow}
          disabled={isCurrentPeriod}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-forward" size={22} color={isCurrentPeriod ? colors.border : colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setPickerVisible(true)}
          style={styles.calendarBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Date picker modal */}
      <Modal visible={pickerVisible} animationType="slide" transparent>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setPickerVisible(false)} />
        <View style={[styles.pickerContent, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              选择{PERIOD_LABELS[period]}
            </Text>
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={pickerOptions}
            keyExtractor={(item) => String(item.offset)}
            renderItem={({ item }) => {
              const isSelected = item.offset === offset;
              return (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    { borderBottomColor: colors.border },
                    isSelected && { backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => {
                    setOffset(item.offset);
                    setPickerVisible(false);
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={[
                    styles.pickerItemText,
                    { color: isSelected ? colors.primary : colors.text },
                    isSelected && { fontWeight: '700' },
                  ]}>
                    {item.label}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Donut chart */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>支出分类</Text>
          <DonutChart data={donutData} centerText={formatAmount(totalExpense)} />

          {/* Bar chart */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>支出趋势</Text>
          <BarChartComponent data={barData} xAxisLabel={xAxisLabel} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  navArrow: {
    padding: 4,
  },
  calendarBtn: {
    padding: 4,
    marginLeft: 4,
  },
  periodTitle: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 140,
    textAlign: 'center',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerContent: {
    maxHeight: '55%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerItemText: {
    fontSize: 15,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
  },
});
