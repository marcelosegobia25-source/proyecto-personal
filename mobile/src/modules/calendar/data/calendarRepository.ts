import type { SQLiteDatabase } from 'expo-sqlite';
import { DEMO_USER_ID } from '@core/database/types';
import type { DailyScheduleItem, SchedulePreferences } from '../domain/types';
import { DEFAULT_SCHEDULE_PREFERENCES } from '../domain/types';

export const calendarRepository = {
  async listBlocksForDate(db: SQLiteDatabase, date: Date): Promise<DailyScheduleItem[]> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return db.getAllAsync<DailyScheduleItem>(
      `SELECT pb.id,pb.activity_id,a.title,COALESCE(ad.description,'') description,pb.starts_at,
              CASE WHEN av.actual_end_at IS NOT NULL THEN av.actual_end_at ELSE pb.ends_at END ends_at,
              pb.ends_at scheduled_ends_at,pb.status,COALESCE(av.shortened_minutes,0) shortened_minutes,
              COALESCE(ao.priority,'normal') priority,COALESCE(ao.color,'#2563EB') color,
              NULL elapsed_seconds,NULL active_started_at,
              CASE WHEN a.title IN('Desayuno','Almuerzo','Cena') THEN 'meal'
                   ELSE 'activity' END kind,
              av.reason AS reason
       FROM planned_blocks pb
       JOIN activities a ON a.id=pb.activity_id
       LEFT JOIN activity_details ad ON ad.activity_id=a.id
       LEFT JOIN activity_options ao ON ao.activity_id=a.id
       LEFT JOIN activity_verifications av ON av.planned_block_id=pb.id AND av.deleted_at IS NULL
       WHERE pb.user_id=? AND pb.starts_at<? AND pb.ends_at>? AND pb.deleted_at IS NULL
         AND COALESCE(ao.is_paused,0)=0 AND ao.deleted_at IS NULL
         AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id)
         AND lower(a.title) NOT LIKE 'traslado%'
         AND lower(a.title) NOT LIKE 'regreso de%'
       ORDER BY pb.starts_at,pb.ends_at`,
      DEMO_USER_ID,
      end.toISOString(),
      start.toISOString()
    );
  },

  async countScheduleConflicts(
    db: SQLiteDatabase,
    input: {
      startsAt: Date;
      endsOn: Date;
      durationMinutes: number;
      recurrence: 'once' | 'daily' | 'weekly';
      weekdays: number[];
    }
  ): Promise<number> {
    const existing = await db.getAllAsync<{ starts_at: string; ends_at: string }>(
      'SELECT starts_at,ends_at FROM planned_blocks WHERE user_id=? AND deleted_at IS NULL AND starts_at<=? AND ends_at>=?',
      DEMO_USER_ID,
      input.endsOn.toISOString(),
      input.startsAt.toISOString()
    );
    let count = 0;
    for (
      let cursor = new Date(input.startsAt), guard = 0;
      cursor <= input.endsOn && guard++ < 400;
      cursor = new Date(cursor.getTime() + 24 * 60 * 60_000)
    ) {
      if (input.recurrence !== 'once' && !input.weekdays.includes(cursor.getDay())) continue;
      const end = cursor.getTime() + input.durationMinutes * 60_000;
      if (
        existing.some((x) => new Date(x.starts_at).getTime() < end && new Date(x.ends_at).getTime() > cursor.getTime())
      ) {
        count++;
      }
      if (input.recurrence === 'once') break;
    }
    return count;
  },

  async getSchedulePreferences(db: SQLiteDatabase): Promise<SchedulePreferences> {
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      `SELECT key,value FROM app_preferences WHERE key LIKE 'schedule_%'`
    );
    const map = Object.fromEntries(rows.map((x) => [x.key, x.value]));
    return {
      dayStart: map.schedule_day_start ?? DEFAULT_SCHEDULE_PREFERENCES.dayStart,
      dayEnd: map.schedule_day_end ?? DEFAULT_SCHEDULE_PREFERENCES.dayEnd,
      slotMinutes: Number(map.schedule_slot_minutes || 30) as 15 | 30 | 60,
      hidePast: (map.schedule_hide_past ?? '1') === '1',
      minFreeMinutes: Number(map.schedule_min_free || 15),
      showWeekends: (map.schedule_weekends ?? '1') === '1',
      initialView: (map.schedule_initial_view ?? 'day') as 'day' | 'week',
    };
  },

  async saveSchedulePreferences(db: SQLiteDatabase, p: SchedulePreferences): Promise<void> {
    const values = [
      ['schedule_day_start', p.dayStart],
      ['schedule_day_end', p.dayEnd],
      ['schedule_slot_minutes', String(p.slotMinutes)],
      ['schedule_hide_past', p.hidePast ? '1' : '0'],
      ['schedule_min_free', String(p.minFreeMinutes)],
      ['schedule_weekends', p.showWeekends ? '1' : '0'],
      ['schedule_initial_view', p.initialView],
    ];
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const [key, value] of values) {
        await tx.runAsync(
          `INSERT INTO app_preferences(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
          key,
          value
        );
      }
    });
  },
};
