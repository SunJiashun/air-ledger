import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as billDao from '../db/billDao';
import { useAuthStore } from './authStore';
import dayjs from 'dayjs';

interface BillState {
  bills: billDao.BillWithCategory[];
  currentYear: number;
  currentMonth: number;
  totalIncome: number;
  totalExpense: number;
  isLoading: boolean;
  currentLedgerId: string;
  setLedger: (ledgerId: string) => void;
  loadBills: () => Promise<void>;
  addBill: (bill: { amount: number; type: 'income' | 'expense'; categoryId: string; date: string; note?: string }) => Promise<void>;
  updateBill: (id: string, updates: { amount?: number; type?: 'income' | 'expense'; categoryId?: string; date?: string; note?: string }) => Promise<void>;
  deleteBill: (id: string) => Promise<void>;
  setMonth: (year: number, month: number) => void;
  nextMonth: () => void;
  prevMonth: () => void;
}

export const useBillStore = create<BillState>()(
  persist(
    (set, get) => ({
      bills: [],
      currentYear: dayjs().year(),
      currentMonth: dayjs().month(),
      totalIncome: 0,
      totalExpense: 0,
      isLoading: false,
      currentLedgerId: 'default-ledger',

      setLedger: (ledgerId) => {
        set({ currentLedgerId: ledgerId });
        get().loadBills();
      },

      loadBills: async () => {
        const { currentYear, currentMonth, currentLedgerId } = get();
        set({ isLoading: true });
        try {
          const [bills, summary] = await Promise.all([
            billDao.getBillsByMonth(currentYear, currentMonth, currentLedgerId),
            billDao.getMonthSummary(currentYear, currentMonth, currentLedgerId),
          ]);
          set({ bills, totalIncome: summary.totalIncome, totalExpense: summary.totalExpense, isLoading: false });
        } catch (e) {
          console.error('Failed to load bills:', e);
          set({ isLoading: false });
        }
      },

      addBill: async (bill) => {
        const { currentLedgerId } = get();
        const { userId, isLoggedIn } = useAuthStore.getState();
        // Use Supabase auth uid when logged in, otherwise local-user
        const effectiveUserId = isLoggedIn && userId !== 'local-user' ? userId : 'local-user';
        await billDao.insertBill({ ...bill, ledgerId: currentLedgerId, userId: effectiveUserId });
        await get().loadBills();
      },

      updateBill: async (id, updates) => {
        await billDao.updateBill(id, updates);
        await get().loadBills();
      },

      deleteBill: async (id) => {
        await billDao.softDeleteBill(id);
        await get().loadBills();
      },

      setMonth: (year, month) => {
        set({ currentYear: year, currentMonth: month });
        get().loadBills();
      },

      nextMonth: () => {
        const { currentYear, currentMonth } = get();
        if (currentMonth === 11) {
          set({ currentYear: currentYear + 1, currentMonth: 0 });
        } else {
          set({ currentMonth: currentMonth + 1 });
        }
        get().loadBills();
      },

      prevMonth: () => {
        const { currentYear, currentMonth } = get();
        if (currentMonth === 0) {
          set({ currentYear: currentYear - 1, currentMonth: 11 });
        } else {
          set({ currentMonth: currentMonth - 1 });
        }
        get().loadBills();
      },
    }),
    {
      name: 'bill-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ currentLedgerId: state.currentLedgerId }),
    }
  )
);
