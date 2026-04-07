import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BarChart as GiftedBarChart } from 'react-native-gifted-charts';
import { useTheme } from '../theme/ThemeProvider';

export interface BarChartItem {
  value: number;
  label: string;
  frontColor: string;
}

interface BarChartProps {
  data: BarChartItem[];
  xAxisLabel?: string;
}

export default function BarChartComponent({ data, xAxisLabel }: BarChartProps) {
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

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const ceilMax = Math.ceil(maxValue / 100) * 100 || 100;
  const noOfSections = 4;

  const barData = data.map((item) => ({
    value: item.value,
    label: item.label,
    frontColor: item.frontColor,
    topLabelComponent: () => (
      <Text style={[styles.topLabel, { color: colors.textSecondary }]}>
        {item.value > 0 ? (item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : Math.round(item.value).toString()) : ''}
      </Text>
    ),
  }));

  const barWidth = data.length <= 7 ? 28 : data.length <= 12 ? 20 : 16;
  const spacing = data.length <= 7 ? 20 : data.length <= 12 ? 14 : 10;

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {xAxisLabel ? (
        <Text style={[styles.axisLabel, { color: colors.textSecondary }]}>
          {xAxisLabel}
        </Text>
      ) : null}
      <View style={styles.chartWrapper}>
        <GiftedBarChart
          data={barData}
          barWidth={barWidth}
          spacing={spacing}
          noOfSections={noOfSections}
          maxValue={ceilMax}
          yAxisThickness={0}
          xAxisThickness={1}
          xAxisColor={colors.border}
          yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
          hideRules
          isAnimated
          animationDuration={500}
          barBorderRadius={4}
          disablePress
        />
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
    paddingTop: 8,
    overflow: 'hidden',
  },
  axisLabel: {
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'right',
  },
  topLabel: {
    fontSize: 9,
    marginBottom: 4,
    textAlign: 'center',
  },
});
