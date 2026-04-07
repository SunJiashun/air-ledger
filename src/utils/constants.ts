export interface DefaultCategory {
  id: string;
  name: string;
  icon: string;
  type: 'income' | 'expense';
  color: string;
  sortOrder: number;
}

export const DEFAULT_EXPENSE_CATEGORIES: DefaultCategory[] = [
  { id: 'cat-food', name: '餐饮', icon: '🍜', type: 'expense', color: '#C4A882', sortOrder: 0 },
  { id: 'cat-transport', name: '交通', icon: '🚇', type: 'expense', color: '#A0917E', sortOrder: 1 },
  { id: 'cat-shopping', name: '购物', icon: '🛍️', type: 'expense', color: '#8BA89D', sortOrder: 2 },
  { id: 'cat-entertainment', name: '娱乐', icon: '🎮', type: 'expense', color: '#B5A0C4', sortOrder: 3 },
  { id: 'cat-housing', name: '居住', icon: '🏠', type: 'expense', color: '#C49BA0', sortOrder: 4 },
  { id: 'cat-medical', name: '医疗', icon: '💊', type: 'expense', color: '#8BA4B5', sortOrder: 5 },
  { id: 'cat-education', name: '教育', icon: '📚', type: 'expense', color: '#D4A574', sortOrder: 6 },
];

export const DEFAULT_INCOME_CATEGORIES: DefaultCategory[] = [
  { id: 'cat-salary', name: '工资', icon: '💰', type: 'income', color: '#8BA89D', sortOrder: 0 },
  { id: 'cat-bonus', name: '奖金', icon: '🎁', type: 'income', color: '#4ECDC4', sortOrder: 1 },
  { id: 'cat-other-income', name: '其他', icon: '📥', type: 'income', color: '#45B7D1', sortOrder: 2 },
];

export const ALL_DEFAULT_CATEGORIES = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];
