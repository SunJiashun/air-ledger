import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import dayjs from 'dayjs';
import { useTheme } from '../theme/ThemeProvider';

interface MonthSwitcherProps {
  year: number;
  month: number; // 0-indexed
  onPrev: () => void;
  onNext: () => void;
}

export default function MonthSwitcher({ year, month, onPrev, onNext }: MonthSwitcherProps) {
  const { colors } = useTheme();
  const label = dayjs().year(year).month(month).format('YYYY年M月');

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <TouchableOpacity onPress={onPrev} style={styles.arrowBtn} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
        <Text style={[styles.arrow, { color: colors.text }]}>{'◀'}</Text>
      </TouchableOpacity>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TouchableOpacity onPress={onNext} style={styles.arrowBtn} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
        <Text style={[styles.arrow, { color: colors.text }]}>{'▶'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
  },
  arrowBtn: {
    padding: 8,
  },
  arrow: {
    fontSize: 14,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    marginHorizontal: 20,
  },
});
