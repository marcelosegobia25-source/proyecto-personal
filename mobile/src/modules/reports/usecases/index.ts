import type { SQLiteDatabase } from 'expo-sqlite';
import { reportsRepository } from '../data/reportsRepository';
import type {
  ActivityOutcomeDetail,
  ActivityOutcomeReport,
  DailyReport,
  WeeklySummary,
  SuspensionReasonSummary,
} from '../domain/types';

export async function getDailyReportUseCase(db: SQLiteDatabase): Promise<DailyReport> {
  return reportsRepository.getDailyReport(db);
}

export async function getWeeklySummaryUseCase(db: SQLiteDatabase): Promise<WeeklySummary> {
  return reportsRepository.getWeeklySummary(db);
}

export async function getActivityOutcomeReportUseCase(
  db: SQLiteDatabase
): Promise<ActivityOutcomeReport[]> {
  return reportsRepository.getActivityOutcomeReport(db);
}

export async function getActivityOutcomeDetailsUseCase(
  db: SQLiteDatabase
): Promise<ActivityOutcomeDetail[]> {
  return reportsRepository.getActivityOutcomeDetails(db);
}

export async function getSuspensionReasonsSummaryUseCase(
  db: SQLiteDatabase
): Promise<SuspensionReasonSummary[]> {
  return reportsRepository.getSuspensionReasonsSummary(db);
}

export type { SuspensionReasonSummary };
