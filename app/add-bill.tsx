import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';
import { useTheme } from '../src/theme/ThemeProvider';
import { useBillStore } from '../src/stores/billStore';
import { useCategoryStore } from '../src/stores/categoryStore';
import CategoryPicker from '../src/components/CategoryPicker';

type BillType = 'expense' | 'income';

const KEYPAD_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

export default function AddBillScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    editId?: string;
    editAmount?: string;
    editType?: string;
    editCategoryId?: string;
    editDate?: string;
    editNote?: string;
  }>();
  const isEditMode = !!params.editId;

  const addBill = useBillStore((s) => s.addBill);
  const updateBill = useBillStore((s) => s.updateBill);
  const { expenseCategories, incomeCategories, loadCategories } = useCategoryStore();

  const [billType, setBillType] = useState<BillType>((params.editType as BillType) || 'expense');
  const [amountStr, setAmountStr] = useState(params.editAmount || '0');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(params.editCategoryId || null);
  const [date, setDate] = useState(params.editDate || dayjs().format('YYYY-MM-DD'));
  const [note, setNote] = useState(params.editNote || '');
  const [isSaving, setIsSaving] = useState(false);
  const [keypadVisible, setKeypadVisible] = useState(true);

  const categories = billType === 'expense' ? expenseCategories : incomeCategories;

  useEffect(() => {
    loadCategories();
  }, []);

  // Auto-select first category when type changes or categories load
  useEffect(() => {
    if (categories.length > 0 && !categories.find((c) => c.id === selectedCategoryId)) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, billType]);

  const amountDisplay = useMemo(() => {
    return `\u00A5 ${amountStr}`;
  }, [amountStr]);

  const handleKeyPress = useCallback((key: string) => {
    setAmountStr((prev) => {
      if (key === '⌫') {
        if (prev.length <= 1) return '0';
        return prev.slice(0, -1);
      }

      if (key === '.') {
        // Already has decimal point
        if (prev.includes('.')) return prev;
        return prev + '.';
      }

      // Limit to 2 decimal places
      const dotIndex = prev.indexOf('.');
      if (dotIndex !== -1 && prev.length - dotIndex > 2) {
        return prev;
      }

      // Limit integer part to reasonable length
      if (dotIndex === -1 && prev.length >= 9) return prev;

      // Replace leading zero
      if (prev === '0' && key !== '.') {
        return key;
      }

      return prev + key;
    });
  }, []);

  const handleSave = useCallback(async () => {
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;
    if (!selectedCategoryId) return;
    if (isSaving) return;

    setIsSaving(true);
    try {
      if (isEditMode && params.editId) {
        await updateBill(params.editId, {
          amount,
          type: billType,
          categoryId: selectedCategoryId,
          date,
          note: note.trim() || '',
        });
      } else {
        await addBill({
          amount,
          type: billType,
          categoryId: selectedCategoryId,
          date,
          note: note.trim() || undefined,
        });
      }
      router.replace('/');
    } catch (e) {
      console.error('Failed to save bill:', e);
      setIsSaving(false);
    }
  }, [amountStr, billType, selectedCategoryId, date, note, addBill, router, isSaving]);

  const canSave = useMemo(() => {
    const amount = parseFloat(amountStr);
    return amount > 0 && selectedCategoryId !== null && !isSaving;
  }, [amountStr, selectedCategoryId, isSaving]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header with close */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, { color: colors.textSecondary }]}>取消</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{isEditMode ? '编辑账单' : '记一笔'}</Text>
          <View style={styles.closeBtn} />
        </View>

        {/* Type toggle */}
        <View style={[styles.typeRow, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[
              styles.typeTab,
              billType === 'expense' && { backgroundColor: colors.expense },
            ]}
            onPress={() => setBillType('expense')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.typeTabText,
                { color: billType === 'expense' ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              支出
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.typeTab,
              billType === 'income' && { backgroundColor: colors.income },
            ]}
            onPress={() => setBillType('income')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.typeTabText,
                { color: billType === 'income' ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              收入
            </Text>
          </TouchableOpacity>
        </View>

        {/* Amount display — tap to toggle keypad */}
        <TouchableOpacity
          style={styles.amountContainer}
          activeOpacity={0.7}
          onPress={() => setKeypadVisible((v) => !v)}
        >
          <Text
            style={[
              styles.amountText,
              { color: billType === 'expense' ? colors.expense : colors.income },
            ]}
          >
            {amountDisplay}
          </Text>
          <Text style={[styles.keypadHint, { color: colors.textSecondary }]}>
            {keypadVisible ? '点击收起键盘 ▼' : '点击展开键盘 ▲'}
          </Text>
        </TouchableOpacity>

        <ScrollView style={styles.flex} showsVerticalScrollIndicator={false}>
          {/* Category Picker */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>选择分类</Text>
          <CategoryPicker
            type={billType}
            categories={categories}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            onAddCustom={() => router.push('/category-manage')}
          />

          {/* Date row */}
          <View style={[styles.fieldRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>日期</Text>
            <Text style={[styles.fieldValue, { color: colors.textSecondary }]}>
              {dayjs(date).format('YYYY年M月D日')}
            </Text>
          </View>

          {/* Note input */}
          <View style={[styles.fieldRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>备注</Text>
            <TextInput
              style={[styles.noteInput, { color: colors.text }]}
              placeholder="添加备注..."
              placeholderTextColor={colors.textSecondary}
              value={note}
              onChangeText={setNote}
              maxLength={100}
              returnKeyType="done"
            />
          </View>
        </ScrollView>

        {/* Save button — always visible */}
        {!keypadVisible && (
          <View style={[styles.bottomSaveBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: canSave ? colors.primary : colors.border }]}
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.8}
            >
              <Text style={[styles.saveButtonText, { color: canSave ? '#FFFFFF' : colors.textSecondary }]}>保存</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Custom number pad — collapsible */}
        {keypadVisible && (
          <View style={[styles.keypad, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            {KEYPAD_KEYS.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.keypadRow}>
                {row.map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.keypadKey, { backgroundColor: colors.background }]}
                    onPress={() => handleKeyPress(key)}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.keypadKeyText, { color: colors.text }]}>{key}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            {/* Save button row */}
            <View style={styles.keypadRow}>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: canSave ? colors.primary : colors.border }]}
                onPress={handleSave}
                disabled={!canSave}
                activeOpacity={0.8}
              >
                <Text style={[styles.saveButtonText, { color: canSave ? '#FFFFFF' : colors.textSecondary }]}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const KEY_GAP = 8;
const KEY_H_PADDING = 12;
const KEY_WIDTH = (SCREEN_WIDTH - KEY_H_PADDING * 2 - KEY_GAP * 2) / 3;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 50,
  },
  closeBtnText: {
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  typeRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 10,
    padding: 3,
  },
  typeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeTabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  amountContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  amountText: {
    fontSize: 36,
    fontWeight: '700',
  },
  keypadHint: {
    fontSize: 12,
    marginTop: 4,
  },
  bottomSaveBar: {
    paddingHorizontal: KEY_H_PADDING,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '500',
    width: 50,
  },
  fieldValue: {
    fontSize: 15,
    flex: 1,
    textAlign: 'right',
  },
  noteInput: {
    flex: 1,
    fontSize: 15,
    textAlign: 'right',
    padding: 0,
  },
  keypad: {
    paddingHorizontal: KEY_H_PADDING,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: KEY_GAP,
    marginBottom: KEY_GAP,
  },
  keypadKey: {
    width: KEY_WIDTH,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadKeyText: {
    fontSize: 22,
    fontWeight: '500',
  },
  saveButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
  },
});
