import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://ucidluagcjqheyqzatsb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_G9D_okegnYy1hBAhEMw00w_TnetBF3i';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
