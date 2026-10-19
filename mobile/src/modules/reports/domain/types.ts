import type { BlockStatus } from '@modules/activities/domain/types';

export type DailyReport = {
  planned_count: number;
  performed_count: number;
  planned_minutes: number;
  actual_minutes: number;
  adherence_percent: number;
};

export type WeeklySummary = {
  planned: number;
  performed: number;
  minutes: number;
  expenses: number;
  recoveries: number;
  topics: string | null;
} | null;

export type ActivityOutcomeReport = {
  group_key: string;
  title: string;
  color: string;
  total: number;
  completed: number;
  partial: number;
  skipped: number;
  pending: number;
};

export type ActivityOutcomeDetail = {
  id: string;
  group_key: string;
  starts_at: string;
  status: BlockStatus;
};

export type SuspensionReasonSummary = {
  reason: string;
  count: number;
};
