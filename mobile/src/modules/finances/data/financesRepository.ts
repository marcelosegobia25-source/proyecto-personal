import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DEMO_USER_ID, nowIso, todayBounds } from '@core/database/types';
import type {
  DailyExpenseSummary,
  EconomicReport,
  ExpenseCategorySummary,
  ExpenseDefinition,
  ExpenseHistoryPeriod,
  ExpenseHistorySummary,
  ExpensePeriodSummary,
  ExpenseTransaction,
} from '../domain/types';
import { EXPENSE_CATEGORIES } from '../domain/types';

export const financesRepository = {
  async createExpense(
    db: SQLiteDatabase,
    amount: number,
    note: string,
    categoryId: string = EXPENSE_CATEGORIES[3].id
  ): Promise<void> {
    const timestamp = nowIso();
    const id = Crypto.randomUUID();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO transactions(id,user_id,account_id,category_id,kind,amount,currency_code,occurred_at,note,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        DEMO_USER_ID,
        '80000000-0000-0000-0000-000000000001',
        categoryId,
        'expense',
        amount,
        'BOB',
        timestamp,
        note.trim(),
        timestamp,
        timestamp
      );
      await tx.runAsync(
        `INSERT INTO sync_outbox(operation_id,entity,entity_id,operation,payload,created_at) VALUES(?,?,?,?,?,?)`,
        Crypto.randomUUID(),
        'transactions',
        id,
        'insert',
        JSON.stringify({ id, amount, note }),
        timestamp
      );
    });
  },

  async listTodayExpenses(db: SQLiteDatabase): Promise<ExpenseTransaction[]> {
    const [start, end] = todayBounds();
    return db.getAllAsync<ExpenseTransaction>(
      `SELECT t.id,t.amount,t.note,t.occurred_at,COALESCE(fc.name,'Otro') category_name
       FROM transactions t LEFT JOIN financial_categories fc ON fc.id=t.category_id
       WHERE t.user_id=? AND t.kind='expense' AND t.occurred_at>=? AND t.occurred_at<? AND t.deleted_at IS NULL
       ORDER BY t.occurred_at DESC`,
      DEMO_USER_ID,
      start,
      end
    );
  },

  async listExpenseTransactions(
    db: SQLiteDatabase,
    period: ExpenseHistoryPeriod = 90
  ): Promise<ExpenseTransaction[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (period === 'week') {
      const weekday = start.getDay();
      start.setDate(start.getDate() - (weekday === 0 ? 6 : weekday - 1));
    } else {
      start.setDate(start.getDate() - period + 1);
    }
    return db.getAllAsync<ExpenseTransaction>(
      `SELECT t.id,t.amount,t.note,t.occurred_at,COALESCE(fc.name,'Otro') category_name
       FROM transactions t LEFT JOIN financial_categories fc ON fc.id=t.category_id
       WHERE t.user_id=? AND t.kind='expense' AND t.occurred_at>=? AND t.deleted_at IS NULL
       ORDER BY t.occurred_at DESC`,
      DEMO_USER_ID,
      start.toISOString()
    );
  },

  async cancelExpense(db: SQLiteDatabase, id: string): Promise<void> {
    const timestamp = nowIso();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'UPDATE transactions SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND user_id=?',
        timestamp,
        timestamp,
        id,
        DEMO_USER_ID
      );
      await tx.runAsync(
        `INSERT INTO sync_outbox(operation_id,entity,entity_id,operation,payload,created_at) VALUES(?,?,?,?,?,?)`,
        Crypto.randomUUID(),
        'transactions',
        id,
        'delete',
        JSON.stringify({ id }),
        timestamp
      );
    });
  },

  async getExpenseTotal(db: SQLiteDatabase): Promise<number> {
    const [start, end] = todayBounds();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount),0) total FROM transactions
       WHERE user_id=? AND kind='expense' AND occurred_at>=? AND occurred_at<? AND deleted_at IS NULL`,
      DEMO_USER_ID,
      start,
      end
    );
    return row?.total ?? 0;
  },

  async getExpensePeriodSummary(db: SQLiteDatabase, days: number): Promise<ExpensePeriodSummary> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days + 1);
    const end = new Date();
    end.setHours(24, 0, 0, 0);
    const total = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(amount),0) total FROM transactions
       WHERE user_id=? AND kind='expense' AND occurred_at>=? AND occurred_at<? AND deleted_at IS NULL`,
      DEMO_USER_ID,
      start.toISOString(),
      end.toISOString()
    );
    const top = await db.getFirstAsync<{ name: string; count: number }>(
      `SELECT COALESCE(NULLIF(note,''),'Otro') name,COUNT(*) count
       FROM transactions
       WHERE user_id=? AND kind='expense' AND occurred_at>=? AND occurred_at<? AND deleted_at IS NULL
       GROUP BY COALESCE(NULLIF(note,''),'Otro')
       ORDER BY count DESC, SUM(amount) DESC LIMIT 1`,
      DEMO_USER_ID,
      start.toISOString(),
      end.toISOString()
    );
    return {
      total: total?.total ?? 0,
      top_name: top?.name ?? null,
      top_count: top?.count ?? 0,
    };
  },

  async listDailyExpenseSummary(db: SQLiteDatabase, days = 7): Promise<DailyExpenseSummary[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days + 1);
    return db.getAllAsync<DailyExpenseSummary>(
      `SELECT substr(occurred_at,1,10) day,COALESCE(SUM(amount),0) total,COUNT(*) count
       FROM transactions
       WHERE user_id=? AND kind='expense' AND occurred_at>=? AND deleted_at IS NULL
       GROUP BY substr(occurred_at,1,10) ORDER BY day DESC`,
      DEMO_USER_ID,
      start.toISOString()
    );
  },

  async listExpenseHistorySummary(db: SQLiteDatabase, days = 30): Promise<ExpenseHistorySummary[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days + 1);
    return db.getAllAsync<ExpenseHistorySummary>(
      `SELECT substr(t.occurred_at,1,10) day,COALESCE(NULLIF(TRIM(t.note),''),fc.name,'Otro') name,
              COALESCE(SUM(t.amount),0) total,COUNT(*) count
       FROM transactions t LEFT JOIN financial_categories fc ON fc.id=t.category_id
       WHERE t.user_id=? AND t.kind='expense' AND t.occurred_at>=? AND t.deleted_at IS NULL
       GROUP BY substr(t.occurred_at,1,10),COALESCE(NULLIF(TRIM(t.note),''),fc.name,'Otro')
       ORDER BY day DESC,total DESC`,
      DEMO_USER_ID,
      start.toISOString()
    );
  },

  async getEconomicReport(db: SQLiteDatabase): Promise<EconomicReport> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysElapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const totals = await db.getFirstAsync<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(amount),0) total,COUNT(*) count
       FROM transactions
       WHERE user_id=? AND kind='expense' AND occurred_at>=? AND occurred_at<? AND deleted_at IS NULL`,
      DEMO_USER_ID,
      start.toISOString(),
      end.toISOString()
    );
    const budget = await db.getFirstAsync<{ amount: number }>(
      `SELECT amount FROM budgets
       WHERE user_id=? AND period_start<=? AND period_end>=?
       ORDER BY amount DESC LIMIT 1`,
      DEMO_USER_ID,
      now.toISOString().slice(0, 10),
      now.toISOString().slice(0, 10)
    );
    const categories = await db.getAllAsync<ExpenseCategorySummary>(
      `SELECT COALESCE(NULLIF(TRIM(t.note),''),fc.name,'Otro') name,
              COALESCE(MAX(fc.color),'#64748B') color,
              COALESCE(SUM(t.amount),0) total,
              COUNT(*) count
       FROM transactions t LEFT JOIN financial_categories fc ON fc.id=t.category_id
       WHERE t.user_id=? AND t.kind='expense' AND t.occurred_at>=? AND t.occurred_at<? AND t.deleted_at IS NULL
       GROUP BY COALESCE(NULLIF(TRIM(t.note),''),fc.name,'Otro')
       ORDER BY total DESC`,
      DEMO_USER_ID,
      start.toISOString(),
      end.toISOString()
    );
    const monthTotal = totals?.total ?? 0;
    const dailyAverage = monthTotal / daysElapsed;
    return {
      monthTotal,
      budget: budget?.amount ?? null,
      remaining: budget ? budget.amount - monthTotal : null,
      dailyAverage,
      projectedTotal: dailyAverage * daysInMonth,
      transactionCount: totals?.count ?? 0,
      categories,
    };
  },

  async listExpenseDefinitions(db: SQLiteDatabase): Promise<ExpenseDefinition[]> {
    return db.getAllAsync<ExpenseDefinition>(
      'SELECT id,name,amount,recurrence,category_id FROM expense_definitions WHERE user_id=? AND is_active=1 ORDER BY name',
      DEMO_USER_ID
    );
  },

  async saveExpenseDefinition(
    db: SQLiteDatabase,
    name: string,
    amount: number,
    recurrence: string,
    categoryId: string = EXPENSE_CATEGORIES[3].id
  ): Promise<void> {
    const timestamp = nowIso();
    await db.runAsync(
      `INSERT INTO expense_definitions(id,user_id,name,amount,category_id,account_id,recurrence,is_active,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id,name) DO UPDATE SET amount=excluded.amount,category_id=excluded.category_id,recurrence=excluded.recurrence,is_active=1,updated_at=excluded.updated_at`,
      Crypto.randomUUID(),
      DEMO_USER_ID,
      name.trim(),
      amount,
      categoryId,
      '80000000-0000-0000-0000-000000000001',
      recurrence,
      1,
      timestamp,
      timestamp
    );
  },

  async useExpenseDefinition(db: SQLiteDatabase, id: string): Promise<void> {
    const item = await db.getFirstAsync<ExpenseDefinition>(
      'SELECT id,name,amount,recurrence,category_id FROM expense_definitions WHERE id=? AND is_active=1',
      id
    );
    if (item) {
      await this.createExpense(db, item.amount, item.name, item.category_id);
    }
  },

  async saveMonthlyBudget(db: SQLiteDatabase, amount: number): Promise<void> {
    const date = new Date();
    const start = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(
      endDate.getDate()
    ).padStart(2, '0')}`;
    await db.runAsync(
      `INSERT INTO budgets VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(user_id,category_id,period_start,period_end) DO UPDATE SET amount=excluded.amount`,
      Crypto.randomUUID(),
      DEMO_USER_ID,
      '90000000-0000-0000-0000-000000000001',
      start,
      end,
      amount,
      'BOB'
    );
  },
};
