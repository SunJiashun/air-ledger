import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { useTheme } from '../theme/ThemeProvider';
import { formatAmount } from '../utils/formatters';

export interface DonutChartItem {
  value: number;
  color: string;
  text: string;
  icon: string;
}

interface DonutChartProps {
  data: DonutChartItem[];
  centerText: string;
}

export default function DonutChart({ data, centerText }: DonutChartProps) {
  const { colors } = useTheme();

  if (data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          暂无数据
        </Text>
      </View>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);

  const pieData = data.map((item) => ({
    value: item.value,
    color: item.color,
    text: item.text,
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.chartWrapper}>
        <PieChart
          data={pieData}
          donut
          radius={90}
          innerRadius={60}
          innerCircleColor={colors.card}
          centerLabelComponent={() => (
            <View style={styles.centerLabel}>
              <Text style={[styles.centerAmount, { color: colors.text }]}>
                {centerText}
              </Text>
              <Text style={[styles.centerTitle, { color: colors.textSecondary }]}>
                总支出
              </Text>
            </View>
          )}
          isAnimated
          animationDuration={600}
        />
      </View>
      <View style={styles.legend}>
        {data.map((item, index) => {
          const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0';
          return (
            <View key={index} style={styles.legendItem}>
              <View style={styles.legendLeft}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={styles.legendIcon}>{item.icon}</Text>
                <Text
                  style={[styles.legendText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.text}
                </Text>
              </View>
              <View style={styles.legendRight}>
                <Text style={[styles.legendPercent, { color: colors.textSecondary }]}>
                  {percentage}%
                </Text>
                <Text style={[styles.legendAmount, { color: colors.text }]}>
                  {formatAmount(item.value)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  emptyContainer: {
    borderRadius: 16,
    padding: 40,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
  chartWrapper: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  centerLabel: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  centerTitle: {
    fontSize: 11,
    marginTop: 2,
  },
  legend: {
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  legendText: {
    fontSize: 14,
    flex: 1,
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendPercent: {
    fontSize: 13,
    marginRight: 12,
    width: 48,
    textAlign: 'right',
  },
  legendAmount: {
    fontSize: 14,
    fontWeight: '600',
    width: 80,
    textAlign: 'right',
  },
});
