import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../sync/supabaseClient';
import { isAdmin, isEmailApproved, getRegistrationStatus, createRegistration } from '../utils/whitelist';

type RegistrationStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface AuthState {
  userId: string;
  email: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  registrationStatus: RegistrationStatus;
  signUp: (email: string, password: string) => Promise<{ error?: string; status?: RegistrationStatus }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      userId: 'local-user',
      email: null,
      isLoggedIn: false,
      isLoading: false,
      registrationStatus: 'none',

      signUp: async (email, password) => {
        set({ isLoading: true });
        try {
          // Create Supabase auth user
          const { data, error } = await supabase.auth.signUp({ email, password });
          if (error) {
            set({ isLoading: false });
            return { error: error.message };
          }

          // Submit registration for approval
          try {
            await createRegistration(email);
          } catch {
            // If pending_registrations insert fails, still allow auth user to be created
          }

          set({ isLoading: false, registrationStatus: 'pending' });

          if (isAdmin(email) && data.user) {
            // Admin auto-approved
            set({ userId: data.user.id, email: data.user.email || email, isLoggedIn: true, registrationStatus: 'approved' });
            return { status: 'approved' };
          }

          return { status: 'pending' };
        } catch (e: any) {
          set({ isLoading: false });
          return { error: e.message || '注册失败' };
        }
      },

      signIn: async (email, password) => {
        set({ isLoading: true });
        try {
          // Step 1: Try to sign in first (need JWT to query pending_registrations)
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) {
            set({ isLoading: false });
            return { error: error.message };
          }

          // Step 2: Now we have a session — check approval status
          if (!isAdmin(email)) {
            const status = await getRegistrationStatus(email);

            if (status === 'pending') {
              await supabase.auth.signOut();
              set({ isLoading: false, registrationStatus: 'pending' });
              return { error: '您的注册申请正在审核中，请等待管理员审批' };
            }
            if (status === 'rejected') {
              // Re-submit as pending so user can re-apply
              try { await createRegistration(email); } catch {}
              await supabase.auth.signOut();
              set({ isLoading: false, registrationStatus: 'pending' });
              return { error: '您的注册申请已重新提交，请等待管理员审批' };
            }
            if (status === 'not_found') {
              // Has Supabase auth but no registration record — create one
              try { await createRegistration(email); } catch {}
              await supabase.auth.signOut();
              set({ isLoading: false, registrationStatus: 'pending' });
              return { error: '您的注册申请已提交，请等待管理员审批' };
            }
          }

          // Step 3: Approved or admin — complete login
          if (data.user) {
            set({
              userId: data.user.id,
              email: data.user.email || email,
              isLoggedIn: true,
              isLoading: false,
              registrationStatus: 'approved',
            });
          }
          return {};
        } catch (e: any) {
          set({ isLoading: false });
          return { error: e.message || '登录失败' };
        }
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ userId: 'local-user', email: null, isLoggedIn: false, registrationStatus: 'none' });
      },

      restoreSession: async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const email = session.user.email || null;
            // Check if still approved
            if (email && !isAdmin(email)) {
              const approved = await isEmailApproved(email);
              if (!approved) {
                await supabase.auth.signOut();
                set({ userId: 'local-user', email: null, isLoggedIn: false });
                return;
              }
            }
            set({ userId: session.user.id, email, isLoggedIn: true, registrationStatus: 'approved' });
          }
        } catch (e) {
          console.log('No session to restore');
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ userId: state.userId, email: state.email, isLoggedIn: state.isLoggedIn }),
    }
  )
);
