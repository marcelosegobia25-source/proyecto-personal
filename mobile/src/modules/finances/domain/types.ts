export const EXPENSE_CATEGORIES = [
  { id: '90000000-0000-0000-0000-000000000011', name: 'Desayuno' },
  { id: '90000000-0000-0000-0000-000000000012', name: 'Almuerzo' },
  { id: '90000000-0000-0000-0000-000000000013', name: 'Cena' },
  { id: '90000000-0000-0000-0000-000000000014', name: 'Otro' },
] as const;

export type ExpenseTransaction = {
  id: string;
  amount: number;
  note: string | null;
  occurred_at: string;
  category_name: string;
};

export type ExpenseHistoryPeriod = 'week' | 30 | 90 | 365;

export type ExpensePeriodSummary = {
  total: number;
  top_name: string | null;
  top_count: number;
};

export type DailyExpenseSummary = {
  day: string;
  total: number;
  count: number;
};

export type ExpenseHistorySummary = {
  day: string;
  name: string;
  total: number;
  count: number;
};

export type ExpenseCategorySummary = {
  name: string;
  color: string;
  total: number;
  count: number;
};

export type EconomicReport = {
  monthTotal: number;
  budget: number | null;
  remaining: number | null;
  dailyAverage: number;
  projectedTotal: number;
  transactionCount: number;
  categories: ExpenseCategorySummary[];
};

export type ExpenseDefinition = {
  id: string;
  name: string;
  amount: number;
  recurrence: string;
  category_id: string;
};
