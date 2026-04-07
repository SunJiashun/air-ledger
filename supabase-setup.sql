-- ============================================
-- 极简账单 Supabase 建表 + RLS 策略
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 账本表
CREATE TABLE IF NOT EXISTS ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 账本成员表
CREATE TABLE IF NOT EXISTS ledger_members (
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ledger_id, user_id)
);

-- 3. 分类表
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  user_id UUID REFERENCES auth.users(id),
  ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. 账单表
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount DOUBLE PRECISION NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id UUID NOT NULL REFERENCES categories(id),
  date DATE NOT NULL,
  note TEXT,
  user_id UUID REFERENCES auth.users(id),
  ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

-- 5. 索引
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
CREATE INDEX IF NOT EXISTS idx_bills_ledger ON bills(ledger_id);
CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_ledger ON categories(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_invite ON ledgers(invite_code);

-- ============================================
-- RLS 策略 (行级安全)
-- ============================================

-- 启用 RLS
ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

-- ledgers: 成员可读，owner 可改
CREATE POLICY "Members can view ledgers" ON ledgers
  FOR SELECT USING (
    id IN (SELECT ledger_id FROM ledger_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Anyone can view ledger by invite code" ON ledgers
  FOR SELECT USING (invite_code IS NOT NULL);

CREATE POLICY "Authenticated users can create ledgers" ON ledgers
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner can update ledger" ON ledgers
  FOR UPDATE USING (owner_id = auth.uid());

-- ledger_members: 成员可读，可加入/退出
CREATE POLICY "Members can view members" ON ledger_members
  FOR SELECT USING (
    ledger_id IN (SELECT ledger_id FROM ledger_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can join ledgers" ON ledger_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave ledgers" ON ledger_members
  FOR DELETE USING (auth.uid() = user_id);

-- bills: 账本成员可读写
CREATE POLICY "Members can view bills" ON bills
  FOR SELECT USING (
    ledger_id IN (SELECT ledger_id FROM ledger_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Members can insert bills" ON bills
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    ledger_id IN (SELECT ledger_id FROM ledger_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own bills" ON bills
  FOR UPDATE USING (user_id = auth.uid());

-- categories: 预设可读，自定义按账本权限
CREATE POLICY "Anyone can view preset categories" ON categories
  FOR SELECT USING (is_custom = false);

CREATE POLICY "Members can view custom categories" ON categories
  FOR SELECT USING (
    is_custom = true AND (
      user_id = auth.uid() OR
      ledger_id IN (SELECT ledger_id FROM ledger_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert categories" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories" ON categories
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================
-- 用户注册审核表
-- ============================================
CREATE TABLE IF NOT EXISTS pending_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_reg_status ON pending_registrations(status);
CREATE INDEX IF NOT EXISTS idx_pending_reg_email ON pending_registrations(email);

ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

-- 用户可以查看自己的注册状态
CREATE POLICY "Users can view own registration" ON pending_registrations
  FOR SELECT USING (lower(email) = lower(auth.jwt()->>'email'));

-- 管理员可以查看所有注册
CREATE POLICY "Admin can view all registrations" ON pending_registrations
  FOR SELECT USING (auth.jwt()->>'email' = '316218906@qq.com');

-- 任何已认证用户可以提交注册申请（signUp 后 JWT 中 email 可能为空，放宽限制）
CREATE POLICY "Authenticated users can create registration" ON pending_registrations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 只有管理员可以审核（更新状态）
CREATE POLICY "Admin can update registrations" ON pending_registrations
  FOR UPDATE USING (auth.jwt()->>'email' = '316218906@qq.com');

-- 只有管理员可以删除用户
CREATE POLICY "Admin can delete registrations" ON pending_registrations
  FOR DELETE USING (auth.jwt()->>'email' = '316218906@qq.com');

-- 一次性迁移：为已有用户添加 approved 记录
INSERT INTO pending_registrations (email, status, requested_at, reviewed_at)
VALUES ('316218906@qq.com', 'approved', now(), now())
ON CONFLICT (email) DO NOTHING;

INSERT INTO pending_registrations (email, status, requested_at, reviewed_at)
VALUES ('973690291@qq.com', 'approved', now(), now())
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- 启用 Realtime
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE bills;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
