import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeProvider';
import { useCategoryStore } from '../src/stores/categoryStore';
import type { Category } from '../src/db/categoryDao';

const EMOJI_LIST = [
  '🍔', '🍜', '🍰', '☕', '🛒', '🏠', '🚗', '🚌',
  '👕', '💄', '🎮', '📱', '💊', '🏥', '📚', '🎓',
  '✈️', '🎬', '🎵', '🏃', '💰', '🎁', '👶', '🐱',
  '💡', '💧', '📞', '🔧', '✂️', '🧹', '🏦', '📊',
  '💼', '🤝', '📦', '🎯', '🌟', '❤️', '🔔', '📝',
];

type TabType = 'expense' | 'income';

export default function CategoryManageScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    expenseCategories,
    incomeCategories,
    isLoading,
    loadCategories,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useCategoryStore();

  const [activeTab, setActiveTab] = useState<TabType>('expense');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('🍔');
  const [formColor, setFormColor] = useState(colors.categoryColors[0]);

  const categories = activeTab === 'expense' ? expenseCategories : incomeCategories;

  useEffect(() => {
    loadCategories();
  }, []);

  const openAddModal = useCallback(() => {
    setEditingCategory(null);
    setFormName('');
    setFormIcon('🍔');
    setFormColor(colors.categoryColors[0]);
    setModalVisible(true);
  }, [colors.categoryColors]);

  const openEditModal = useCallback((category: Category) => {
    setEditingCategory(category);
    setFormName(category.name);
    setFormIcon(category.icon);
    setFormColor(category.color);
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = formName.trim();
    if (!trimmedName) {
      Alert.alert('提示', '请输入分类名称');
      return;
    }

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, {
          name: trimmedName,
          icon: formIcon,
          color: formColor,
        });
      } else {
        await addCategory({
          name: trimmedName,
          icon: formIcon,
          type: activeTab,
          color: formColor,
        });
      }
      setModalVisible(false);
    } catch (e) {
      Alert.alert('错误', '保存失败，请重试');
    }
  }, [formName, formIcon, formColor, editingCategory, activeTab, updateCategory, addCategory]);

  const handleDelete = useCallback((category: Category) => {
    Alert.alert(
      '确认删除',
      `确定要删除分类"${category.name}"吗？删除后使用该分类的账单不会被删除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => deleteCategory(category.id),
        },
      ]
    );
  }, [deleteCategory]);

  const renderCategoryItem = useCallback(({ item }: { item: Category }) => {
    const isCustom = item.isCustom === 1;
    return (
      <View style={[styles.categoryRow, { backgroundColor: colors.card }]}>
        <View style={styles.categoryLeft}>
          <Text style={styles.categoryIcon}>{item.icon}</Text>
          <Text style={[styles.categoryName, { color: colors.text }]}>{item.name}</Text>
          <View style={[styles.colorDot, { backgroundColor: item.color }]} />
        </View>
        {isCustom && (
          <View style={styles.categoryActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => openEditModal(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleDelete(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }, [colors, openEditModal, handleDelete]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>分类管理</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Tab Toggle */}
      <View style={styles.tabContainer}>
        <View style={[styles.tabBar, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'expense' && { backgroundColor: colors.primary },
            ]}
            activeOpacity={0.7}
            onPress={() => setActiveTab('expense')}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'expense' ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              支出
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'income' && { backgroundColor: colors.primary },
            ]}
            activeOpacity={0.7}
            onPress={() => setActiveTab('income')}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'income' ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              收入
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          renderItem={renderCategoryItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 1 }} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                暂无分类
              </Text>
            </View>
          }
        />
      )}

      {/* Add Button */}
      <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.8}
          onPress={openAddModal}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>添加分类</Text>
        </TouchableOpacity>
      </View>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>取消</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingCategory ? '编辑分类' : '添加分类'}
              </Text>
              <TouchableOpacity onPress={handleSave}>
                <Text style={[styles.modalSave, { color: colors.primary }]}>保存</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              {/* Name Input */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>分类名称</Text>
              <TextInput
                style={[
                  styles.nameInput,
                  { backgroundColor: colors.card, color: colors.text, borderColor: colors.border },
                ]}
                placeholder="输入分类名称"
                placeholderTextColor={colors.textSecondary}
                value={formName}
                onChangeText={setFormName}
                maxLength={10}
              />

              {/* Preview */}
              <View style={styles.previewContainer}>
                <View style={[styles.previewBadge, { backgroundColor: formColor + '20' }]}>
                  <Text style={styles.previewIcon}>{formIcon}</Text>
                  <Text style={[styles.previewName, { color: colors.text }]}>
                    {formName || '预览'}
                  </Text>
                </View>
              </View>

              {/* Emoji Picker */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>选择图标</Text>
              <View style={[styles.pickerGrid, { backgroundColor: colors.card }]}>
                {EMOJI_LIST.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.emojiCell,
                      formIcon === emoji && {
                        backgroundColor: colors.primary + '25',
                        borderColor: colors.primary,
                        borderWidth: 1.5,
                      },
                    ]}
                    onPress={() => setFormIcon(emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Color Picker */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>选择颜色</Text>
              <View style={[styles.colorGrid, { backgroundColor: colors.card }]}>
                {colors.categoryColors.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[styles.colorCell]}
                    onPress={() => setFormColor(color)}
                  >
                    <View
                      style={[
                        styles.colorCircle,
                        { backgroundColor: color },
                        formColor === color && styles.colorCircleSelected,
                      ]}
                    />
                    {formColor === color && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color="#FFFFFF"
                        style={styles.colorCheck}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  headerPlaceholder: {
    width: 40,
  },
  tabContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '400',
    flex: 1,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  categoryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    gap: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    padding: 20,
    paddingBottom: 40,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nameInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 20,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  previewIcon: {
    fontSize: 22,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '500',
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 12,
    padding: 8,
    marginBottom: 24,
  },
  emojiCell: {
    width: '12.5%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  emojiText: {
    fontSize: 22,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  colorCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  colorCheck: {
    position: 'absolute',
  },
});
