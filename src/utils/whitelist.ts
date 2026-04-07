/**
 * 用户注册审核模块
 * 管理员邮箱可直接登录，其他用户需要通过审核
 */
import { supabase } from '../sync/supabaseClient';

export const ADMIN_EMAIL = '316218906@qq.com';

export function isAdmin(email: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/**
 * 检查邮箱是否已通过审核（管理员永远返回 true）
 */
export async function isEmailApproved(email: string): Promise<boolean> {
  if (isAdmin(email)) return true;
  try {
    const { data } = await supabase
      .from('pending_registrations')
      .select('status')
      .eq('email', email.toLowerCase())
      .single();
    return data?.status === 'approved';
  } catch {
    return false;
  }
}

/**
 * 获取注册状态
 */
export async function getRegistrationStatus(
  email: string
): Promise<'approved' | 'pending' | 'rejected' | 'not_found'> {
  if (isAdmin(email)) return 'approved';
  try {
    const { data, error } = await supabase
      .from('pending_registrations')
      .select('status')
      .eq('email', email.toLowerCase())
      .single();
    if (error || !data) return 'not_found';
    return data.status as 'approved' | 'pending' | 'rejected';
  } catch {
    return 'not_found';
  }
}

/**
 * 提交注册申请
 * 先尝试用当前 session 插入（RLS），如果失败则用 RPC 函数
 * 最终兜底：直接 upsert（需要 Supabase 有对应的 permissive policy）
 */
export async function createRegistration(email: string): Promise<{ success: boolean }> {
  const lowerEmail = email.toLowerCase();

  // Attempt 1: Direct upsert with current user session
  const { error } = await supabase.from('pending_registrations').upsert(
    {
      email: lowerEmail,
      status: 'pending',
      requested_at: new Date().toISOString(),
      reviewed_at: null,
    },
    { onConflict: 'email' }
  );

  if (!error) return { success: true };

  // Attempt 2: Try insert instead of upsert
  const { error: insertError } = await supabase.from('pending_registrations').insert({
    email: lowerEmail,
    status: 'pending',
    requested_at: new Date().toISOString(),
  });

  if (!insertError) return { success: true };

  console.warn('createRegistration failed:', error?.message, insertError?.message);
  return { success: false };
}
