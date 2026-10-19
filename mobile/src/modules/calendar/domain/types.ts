import type { PlannedBlock } from '@modules/activities/domain/types';

export type SchedulePreferences = {
  dayStart: string;
  dayEnd: string;
  slotMinutes: 15 | 30 | 60;
  hidePast: boolean;
  minFreeMinutes: number;
  showWeekends: boolean;
  initialView: 'day' | 'week';
};

export const DEFAULT_SCHEDULE_PREFERENCES: SchedulePreferences = {
  dayStart: '06:00',
  dayEnd: '22:00',
  slotMinutes: 30,
  hidePast: true,
  minFreeMinutes: 15,
  showWeekends: true,
  initialView: 'day',
};

export type DailyScheduleItem = PlannedBlock & {
  description: string;
  kind: 'activity' | 'travel' | 'preparation' | 'buffer' | 'return' | 'meal';
  color: string;
};

export type TimeGap = {
  start: number;
  end: number;
};

export type FreeTimeCalculation = {
  gaps: TimeGap[];
  totalMinutes: number;
  conflicts: number;
};

export type TimelineItem = {
  key: string;
  start: number;
  end: number;
  block?: PlannedBlock;
  request?: any; // StudyRequest
  proposedMinutes?: number;
};
