import type { SQLiteDatabase } from 'expo-sqlite';
import { financesRepository } from '../data/financesRepository';
import { EXPENSE_CATEGORIES } from '../domain/types';
import type {
  DailyExpenseSummary,
  EconomicReport,
  ExpenseDefinition,
  ExpenseHistoryPeriod,
  ExpenseHistorySummary,
  ExpensePeriodSummary,
  ExpenseTransaction,
} from '../domain/types';

export async function createExpenseUseCase(
  db: SQLiteDatabase,
  amount: number,
  note: string,
  categoryId: string = EXPENSE_CATEGORIES[3].id
): Promise<void> {
  return financesRepository.createExpense(db, amount, note, categoryId);
}

export async function listTodayExpensesUseCase(db: SQLiteDatabase): Promise<ExpenseTransaction[]> {
  return financesRepository.listTodayExpenses(db);
}

export async function listExpenseTransactionsUseCase(
  db: SQLiteDatabase,
  period: ExpenseHistoryPeriod = 90
): Promise<ExpenseTransaction[]> {
  return financesRepository.listExpenseTransactions(db, period);
}

export async function cancelExpenseUseCase(db: SQLiteDatabase, id: string): Promise<void> {
  return financesRepository.cancelExpense(db, id);
}

export async function getExpenseTotalUseCase(db: SQLiteDatabase): Promise<number> {
  return financesRepository.getExpenseTotal(db);
}

export async function getExpensePeriodSummaryUseCase(
  db: SQLiteDatabase,
  days: number
): Promise<ExpensePeriodSummary> {
  return financesRepository.getExpensePeriodSummary(db, days);
}

export async function listDailyExpenseSummaryUseCase(
  db: SQLiteDatabase,
  days = 7
): Promise<DailyExpenseSummary[]> {
  return financesRepository.listDailyExpenseSummary(db, days);
}

export async function listExpenseHistorySummaryUseCase(
  db: SQLiteDatabase,
  days = 30
): Promise<ExpenseHistorySummary[]> {
  return financesRepository.listExpenseHistorySummary(db, days);
}

export async function getEconomicReportUseCase(db: SQLiteDatabase): Promise<EconomicReport> {
  return financesRepository.getEconomicReport(db);
}

export async function listExpenseDefinitionsUseCase(db: SQLiteDatabase): Promise<ExpenseDefinition[]> {
  return financesRepository.listExpenseDefinitions(db);
}

export async function saveExpenseDefinitionUseCase(
  db: SQLiteDatabase,
  name: string,
  amount: number,
  recurrence: string,
  categoryId: string = EXPENSE_CATEGORIES[3].id
): Promise<void> {
  return financesRepository.saveExpenseDefinition(db, name, amount, recurrence, categoryId);
}

export async function useExpenseDefinitionUseCase(db: SQLiteDatabase, id: string): Promise<void> {
  return financesRepository.useExpenseDefinition(db, id);
}

export async function saveMonthlyBudgetUseCase(db: SQLiteDatabase, amount: number): Promise<void> {
  return financesRepository.saveMonthlyBudget(db, amount);
}
