import type { SQLiteDatabase } from 'expo-sqlite';
import type { PlannedBlock } from '@modules/activities/domain/types';
import type { StudyRequest } from '@modules/study/domain/types';
import { calendarRepository } from '../data/calendarRepository';
import type {
  DailyScheduleItem,
  FreeTimeCalculation,
  SchedulePreferences,
  TimelineItem,
} from '../domain/types';

export async function listBlocksForDateUseCase(
  db: SQLiteDatabase,
  date: Date
): Promise<DailyScheduleItem[]> {
  return calendarRepository.listBlocksForDate(db, date);
}

export async function countScheduleConflictsUseCase(
  db: SQLiteDatabase,
  input: {
    startsAt: Date;
    endsOn: Date;
    durationMinutes: number;
    recurrence: 'once' | 'daily' | 'weekly';
    weekdays: number[];
  }
): Promise<number> {
  return calendarRepository.countScheduleConflicts(db, input);
}

export async function getSchedulePreferencesUseCase(
  db: SQLiteDatabase
): Promise<SchedulePreferences> {
  return calendarRepository.getSchedulePreferences(db);
}

export async function saveSchedulePreferencesUseCase(
  db: SQLiteDatabase,
  preferences: SchedulePreferences
): Promise<void> {
  return calendarRepository.saveSchedulePreferences(db, preferences);
}

export function calculateFreeTimeUseCase(
  blocks: PlannedBlock[],
  schedule: SchedulePreferences
): FreeTimeCalculation {
  const dayStart = new Date();
  dayStart.setHours(Number(schedule.dayStart.slice(0, 2)), Number(schedule.dayStart.slice(3)), 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(Number(schedule.dayEnd.slice(0, 2)), Number(schedule.dayEnd.slice(3)), 0, 0);

  const ranges = blocks
    .filter((x) => !['cancelled', 'rescheduled'].includes(x.status))
    .map(
      (x) =>
        [
          Math.max(dayStart.getTime(), new Date(x.starts_at).getTime()),
          Math.min(dayEnd.getTime(), new Date(x.ends_at).getTime()),
        ] as const
    )
    .filter((x) => x[1] > x[0])
    .sort((a, b) => a[0] - b[0]);

  const merged: { start: number; end: number }[] = [];
  let conflicts = 0;
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last.end) {
      if (start < last.end) conflicts++;
      last.end = Math.max(last.end, end);
    } else {
      merged.push({ start, end });
    }
  }

  let cursor = dayStart.getTime();
  const gaps: { start: number; end: number }[] = [];
  for (const range of merged) {
    if (range.start - cursor >= schedule.minFreeMinutes * 60_000) {
      gaps.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  }
  if (dayEnd.getTime() - cursor >= schedule.minFreeMinutes * 60_000) {
    gaps.push({ start: cursor, end: dayEnd.getTime() });
  }

  return {
    gaps,
    totalMinutes: gaps.reduce((sum, x) => sum + Math.round((x.end - x.start) / 60_000), 0),
    conflicts,
  };
}

export function calculateTimelineUseCase(
  blocks: PlannedBlock[],
  freeGaps: { start: number; end: number }[],
  minFreeMinutes: number,
  studyRequests: StudyRequest[]
): TimelineItem[] {
  const result: TimelineItem[] = blocks
    .filter((x) => !['cancelled', 'rescheduled'].includes(x.status))
    .map((block) => ({
      key: block.id,
      start: new Date(block.starts_at).getTime(),
      end: new Date(block.ends_at).getTime(),
      block,
    }));

  const remaining = new Map(studyRequests.map((x) => [x.id, x.remaining_minutes]));
  const today = new Date().toISOString().slice(0, 10);

  for (const gap of freeGaps) {
    let cursor = Math.max(gap.start, Date.now());
    for (const request of studyRequests) {
      const pending = remaining.get(request.id) ?? 0;
      if (pending <= 0 || (request.preferred_date && request.preferred_date !== today)) continue;
      if (request.preferred_time) {
        const candidate = new Date();
        candidate.setHours(
          Number(request.preferred_time.slice(0, 2)),
          Number(request.preferred_time.slice(3)),
          0,
          0
        );
        cursor = Math.max(cursor, candidate.getTime());
        if (cursor !== candidate.getTime() || cursor >= gap.end) continue;
      }
      const available = Math.floor((gap.end - cursor) / 60000);
      if (available < minFreeMinutes) continue;
      const proposed = Math.min(pending, available);
      result.push({
        key: `proposal-${request.id}-${cursor}`,
        start: cursor,
        end: cursor + proposed * 60000,
        request,
        proposedMinutes: proposed,
      });
      remaining.set(request.id, pending - proposed);
      cursor += proposed * 60000;
      if (cursor >= gap.end) break;
    }
    if (gap.end - cursor >= minFreeMinutes * 60000) {
      result.push({
        key: `free-${cursor}`,
        start: cursor,
        end: gap.end,
      });
    }
  }

  return result.sort((a, b) => a.start - b.start);
}
