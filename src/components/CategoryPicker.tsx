import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { Category } from '../db/categoryDao';

interface CategoryPickerProps {
  type: 'income' | 'expense';
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddCustom?: () => void;
}

const NUM_COLUMNS = 4;
const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 16;
const ITEM_GAP = 12;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - ITEM_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

export default function CategoryPicker({
  categories,
  selectedId,
  onSelect,
  onAddCustom,
}: CategoryPickerProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.grid}>
      {categories.map((cat) => {
        const isSelected = cat.id === selectedId;
        return (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.item,
              {
                backgroundColor: isSelected ? colors.primary : colors.card,
                borderColor: isSelected ? colors.primary : colors.border,
              },
            ]}
            onPress={() => onSelect(cat.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.itemIcon}>{cat.icon}</Text>
            <Text
              style={[
                styles.itemName,
                { color: isSelected ? '#FFFFFF' : colors.text },
              ]}
              numberOfLines={1}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        );
      })}
      {onAddCustom && (
        <TouchableOpacity
          style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={onAddCustom}
          activeOpacity={0.7}
        >
          <Text style={styles.itemIcon}>+</Text>
          <Text style={[styles.itemName, { color: colors.textSecondary }]}>添加</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    gap: ITEM_GAP,
  },
  item: {
    width: ITEM_WIDTH,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  itemName: {
    fontSize: 12,
    fontWeight: '500',
  },
});
