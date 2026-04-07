# 极简账单 (Minimalist Ledger) — 设计文档

## 1. 产品概述

一款极简主义记账 APP，支持 iOS 和 Android。核心理念：3 步记账、离线优先、多人共享。

**目标用户：** 希望快速记账并与家人/伙伴共享账本的个人用户。

## 2. 功能需求

### 2.1 极速记账
- 首页右下角浮动"+"按钮，点击后底部弹出记账面板
- 记录流程（≤ 3 步）：输入金额 → 选择分类 → 保存
- 支持收入和支出两种类型，顶部 Tab 切换
- 字段：金额（必填，数字键盘）、分类（必填，图标选择）、日期（默认当天，可选）、备注（可选）

### 2.2 账单列表
- 按月份展示，支持左右切换月份
- 顶部显示当月收支汇总（总支出、总收入）
- 筛选器：按金额区间、按支出分类进行二次过滤
- 左滑删除账单条目（需确认）

### 2.3 分类管理
- 预设支出分类：餐饮🍜、交通🚇、购物🛍️、娱乐🎮、居住🏠、医疗💊、教育📚
- 预设收入分类：工资💰、奖金🎁、其他📥
- 用户可自定义分类（添加/编辑/删除），自定义分类永久保存
- 自定义分类关联到账本，账本内所有成员共享

### 2.4 可视化统计
- 周/月/年三个维度，顶部 Tab 切换
- 环形图：各分类支出占比
- 柱状图：该周期内每日（周视图）/每周（月视图）/每月（年视图）的支出趋势
- 点击环形图某分类可查看该分类明细

### 2.5 多人共享账本
- 用户默认有一个"个人账本"
- 可创建"共享账本"，通过邀请码邀请其他用户加入
- 共享账本中所有成员的记账数据互相可见
- 自定义分类在账本范围内共享

### 2.6 设置
- 主题切换：莫兰迪色系 / 深色模式
- 分类管理：添加、编辑、删除自定义分类
- 共享账本管理：创建、加入、退出账本
- 同步状态：显示最后同步时间、待同步条数
- 数据管理：按月查看云端存储用量，可按月删除云端数据（仅删云端 / 同时删除本地）
- 账户：登录/注册/退出
- 关于：版本信息

## 3. 技术架构

### 3.1 技术栈

| 层级 | 技术选型 |
|------|---------|
| 框架 | Expo SDK 52 + Expo Router v4（文件路由） |
| 语言 | TypeScript |
| 状态管理 | Zustand |
| 本地数据库 | expo-sqlite |
| 云端服务 | Supabase（Auth + PostgreSQL + Realtime） |
| 图表 | react-native-gifted-charts |
| 动画 | react-native-reanimated 3 + react-native-gesture-handler |
| 网络检测 | @react-native-community/netinfo |

### 3.2 分层架构

```
┌─────────────────────────────────────────┐
│  UI 层                                   │
│  Expo Router + Theme Provider + Charts  │
├─────────────────────────────────────────┤
│  状态层                                  │
│  Zustand Stores (bill, category,        │
│  theme, sync, auth)                     │
├─────────────────────────────────────────┤
│  数据层                                  │
│  expo-sqlite (本地) + sync_queue        │
├─────────────────────────────────────────┤
│  同步层                                  │
│  Supabase (Auth + DB + Realtime + RLS)  │
└─────────────────────────────────────────┘
```

### 3.3 离线优先同步流程

1. **写入本地**：所有增/删/改操作先写入本地 SQLite
2. **入队**：操作记录写入 `sync_queue` 表，标记 `pending`
3. **网络检测**：NetInfo 监听网络状态变化
4. **批量上传**：网络恢复时，按时间顺序批量同步到 Supabase
5. **确认清除**：同步成功后标记 `sync_queue` 为 `synced`
6. **拉取更新**：通过 Supabase Realtime 订阅接收其他成员的变更

**冲突策略：** Last Write Wins（以 `updated_at` 时间戳为准）。共享账本中每条记录带 `user_id`，不同用户的记录不会冲突。

## 4. 数据模型

### 4.1 bills（账单）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键，客户端生成 |
| amount | REAL | 金额 |
| type | TEXT | 'income' \| 'expense' |
| category_id | TEXT (UUID) | 分类 FK |
| date | TEXT | 日期 YYYY-MM-DD |
| note | TEXT | 备注（可选） |
| user_id | TEXT (UUID) | 记录者 |
| ledger_id | TEXT (UUID) | 所属账本 |
| created_at | TEXT | 创建时间 ISO8601 |
| updated_at | TEXT | 修改时间 ISO8601 |
| is_deleted | INTEGER | 软删除 0/1 |

### 4.2 categories（分类）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| name | TEXT | 分类名称 |
| icon | TEXT | emoji 图标 |
| type | TEXT | 'income' \| 'expense' |
| color | TEXT | 图表颜色 hex |
| sort_order | INTEGER | 排序 |
| is_custom | INTEGER | 是否自定义 0/1 |
| user_id | TEXT (UUID) | 创建者 |
| ledger_id | TEXT (UUID) | 所属账本（NULL 为个人分类） |
| is_deleted | INTEGER | 软删除 0/1 |

### 4.3 ledgers（账本）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT (UUID) | 主键 |
| name | TEXT | 账本名称 |
| invite_code | TEXT | 邀请码（6位） |
| owner_id | TEXT (UUID) | 创建者 |
| created_at | TEXT | 创建时间 |

### 4.4 ledger_members（账本成员）

| 字段 | 类型 | 说明 |
|------|------|------|
| ledger_id | TEXT (UUID) | 账本 FK |
| user_id | TEXT (UUID) | 用户 FK |
| role | TEXT | 'owner' \| 'member' |
| joined_at | TEXT | 加入时间 |

### 4.5 sync_queue（同步队列，仅本地）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 自增主键 |
| table_name | TEXT | 目标表名 |
| record_id | TEXT (UUID) | 记录 ID |
| operation | TEXT | 'insert' \| 'update' \| 'delete' |
| payload | TEXT | JSON 数据 |
| status | TEXT | 'pending' \| 'synced' \| 'failed' |
| created_at | TEXT | 创建时间 |

## 5. 页面结构

```
app/
├── (tabs)/
│   ├── index.tsx          # 首页（账单列表）
│   ├── stats.tsx          # 统计页
│   └── settings.tsx       # 设置页
├── add-bill.tsx           # 记账弹窗（Modal）
├── category-manage.tsx    # 分类管理页
├── ledger-manage.tsx      # 账本管理页
├── data-manage.tsx        # 数据管理页（按月删除）
├── login.tsx              # 登录/注册
└── _layout.tsx            # 根布局
```

底部导航 3 个 Tab：首页、统计、设置。

## 6. 视觉设计

### 6.1 莫兰迪色系（浅色主题）
- 背景：`#F5F0EB`
- 卡片：`#FFFFFF`
- 主色：`#C4A882`（暖棕）
- 文字主色：`#5B5248`
- 文字次色：`#9B8E82`
- 分类色板：`#C4A882` `#A0917E` `#8BA89D` `#B5A0C4` `#C49BA0` `#8BA4B5`

### 6.2 深色主题
- 背景：`#1A1A2E`
- 卡片：`#16213E`
- 主色：`#6C63FF`（紫蓝）
- 文字主色：`#E0E0E0`
- 文字次色：`#8888AA`
- 分类色板：`#FF6B6B` `#4ECDC4` `#45B7D1` `#6C63FF` `#F9CA24` `#A29BFE`

### 6.3 交互动效
- 记账面板：底部弹出（spring 动画）
- 列表项：左滑显示删除按钮（Gesture Handler）
- 月份切换：水平滑动过渡
- 图表：数据加载时的渐入动画
- 主题切换：颜色渐变过渡

## 7. Supabase 配置

### 7.1 认证
- 支持邮箱/密码注册登录
- Supabase Auth 管理用户会话

### 7.2 RLS（行级安全策略）
- bills：用户只能读写自己所属账本的数据
- categories：预设分类所有人可读；自定义分类仅账本成员可读写
- ledgers：仅成员可读，仅 owner 可改
- ledger_members：仅账本成员可读

## 8. 测试方式

1. 开发环境运行 `npx expo start`
2. 手机安装 Expo Go App
3. 扫描终端中的 QR 码
4. 在手机上实时预览和测试
