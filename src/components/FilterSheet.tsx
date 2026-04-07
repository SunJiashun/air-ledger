import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { Category } from '../db/categoryDao';

export interface FilterCriteria {
  amountMin?: number;
  amountMax?: number;
  categoryIds: string[];
}

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  onApply: (criteria: FilterCriteria) => void;
  categories: Category[];
  initialCriteria?: FilterCriteria;
}

const EMPTY_CRITERIA: FilterCriteria = { amountMin: undefined, amountMax: undefined, categoryIds: [] };

export default function FilterSheet({
  visible,
  onClose,
  onApply,
  categories,
  initialCriteria,
}: FilterSheetProps) {
  const { colors } = useTheme();
  const [amountMin, setAmountMin] = useState(initialCriteria?.amountMin?.toString() ?? '');
  const [amountMax, setAmountMax] = useState(initialCriteria?.amountMax?.toString() ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialCriteria?.categoryIds ?? []),
  );

  const toggleCategory = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleApply = () => {
    const criteria: FilterCriteria = {
      amountMin: amountMin ? parseFloat(amountMin) : undefined,
      amountMax: amountMax ? parseFloat(amountMax) : undefined,
      categoryIds: Array.from(selectedIds),
    };
    onApply(criteria);
    onClose();
  };

  const handleReset = () => {
    setAmountMin('');
    setAmountMax('');
    setSelectedIds(new Set());
    onApply(EMPTY_CRITERIA);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        <View style={styles.handle}>
          <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>筛选</Text>

        {/* Amount range */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>金额范围</Text>
        <View style={styles.amountRow}>
          <TextInput
            style={[styles.amountInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            placeholder="最小金额"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            value={amountMin}
            onChangeText={setAmountMin}
          />
          <Text style={[styles.amountDash, { color: colors.textSecondary }]}>-</Text>
          <TextInput
            style={[styles.amountInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            placeholder="最大金额"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            value={amountMax}
            onChangeText={setAmountMax}
          />
        </View>

        {/* Category chips */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>分类</Text>
        <ScrollView style={styles.chipScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.chipContainer}>
            {categories.map((cat) => {
              const isSelected = selectedIds.has(cat.id);
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.background,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => toggleCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipIcon}>{cat.icon}</Text>
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.resetButton, { borderColor: colors.border }]}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, { color: colors.textSecondary }]}>重置</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.applyButton, { backgroundColor: colors.primary }]}
            onPress={handleApply}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>应用</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_HEIGHT * 0.65,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  handle: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  amountInput: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  amountDash: {
    marginHorizontal: 8,
    fontSize: 16,
  },
  chipScroll: {
    maxHeight: 160,
    marginBottom: 16,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButton: {
    borderWidth: 1,
  },
  applyButton: {},
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
