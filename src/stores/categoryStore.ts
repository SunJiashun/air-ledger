import { create } from 'zustand';
import * as categoryDao from '../db/categoryDao';
import { useBillStore } from './billStore';

interface CategoryState {
  expenseCategories: categoryDao.Category[];
  incomeCategories: categoryDao.Category[];
  isLoading: boolean;
  loadCategories: () => Promise<void>;
  addCategory: (category: { name: string; icon: string; type: 'income' | 'expense'; color: string }) => Promise<void>;
  updateCategory: (id: string, updates: { name?: string; icon?: string; color?: string }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  expenseCategories: [],
  incomeCategories: [],
  isLoading: false,

  loadCategories: async () => {
    set({ isLoading: true });
    try {
      const ledgerId = useBillStore.getState().currentLedgerId;
      const [expense, income] = await Promise.all([
        categoryDao.getAllCategories('expense', ledgerId),
        categoryDao.getAllCategories('income', ledgerId),
      ]);
      set({ expenseCategories: expense, incomeCategories: income, isLoading: false });
    } catch (e) {
      console.error('Failed to load categories:', e);
      set({ isLoading: false });
    }
  },

  addCategory: async (category) => {
    const ledgerId = useBillStore.getState().currentLedgerId;
    await categoryDao.insertCategory({ ...category, ledgerId });
    await get().loadCategories();
  },

  updateCategory: async (id, updates) => {
    await categoryDao.updateCategory(id, updates);
    await get().loadCategories();
  },

  deleteCategory: async (id) => {
    await categoryDao.softDeleteCategory(id);
    await get().loadCategories();
  },
}));
