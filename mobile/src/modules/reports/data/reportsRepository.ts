import type { SQLiteDatabase } from 'expo-sqlite';
import { DEMO_USER_ID, todayBounds } from '@core/database/types';
import type {
  ActivityOutcomeDetail,
  ActivityOutcomeReport,
  DailyReport,
  WeeklySummary,
  SuspensionReasonSummary,
} from '../domain/types';

export const reportsRepository = {
  async getDailyReport(db: SQLiteDatabase): Promise<DailyReport> {
    const [start, end] = todayBounds();
    const row = await db.getFirstAsync<Omit<DailyReport, 'adherence_percent'>>(
      `WITH daily_blocks AS (
         SELECT pb.id,
                pb.status,
                (julianday(pb.ends_at) - julianday(pb.starts_at)) * 1440 AS duration_min,
                COALESCE(av.shortened_minutes, 0) AS shortened_min,
                (SELECT SUM(ts.elapsed_seconds) FROM time_sessions ts WHERE ts.planned_block_id = pb.id AND ts.deleted_at IS NULL) AS ts_seconds
         FROM planned_blocks pb
         LEFT JOIN activity_verifications av ON av.planned_block_id = pb.id AND av.deleted_at IS NULL
         WHERE pb.user_id = ? AND pb.starts_at >= ? AND pb.starts_at < ? AND pb.deleted_at IS NULL AND pb.status <> 'cancelled'
       )
       SELECT COUNT(*) planned_count,
              COUNT(CASE WHEN status IN ('completed','partial') THEN 1 END) performed_count,
              COALESCE(CAST(ROUND(SUM(duration_min)) AS INTEGER), 0) planned_minutes,
              COALESCE(CAST(ROUND(SUM(
                CASE
                  WHEN ts_seconds IS NOT NULL AND ts_seconds > 0 THEN ts_seconds / 60.0
                  WHEN status = 'completed' THEN duration_min
                  WHEN status = 'partial' THEN MAX(0, duration_min - shortened_min)
                  ELSE 0
                END
              )) AS INTEGER), 0)
              + COALESCE((SELECT CAST(SUM(ss.elapsed_seconds)/60 AS INTEGER) FROM study_sessions ss JOIN study_request_sessions srs ON srs.session_id=ss.id JOIN study_requests sr ON sr.id=srs.request_id JOIN planned_blocks spb ON spb.id=sr.planned_block_id WHERE spb.user_id=? AND spb.starts_at>=? AND spb.starts_at<? AND ss.ended_at IS NOT NULL),0) actual_minutes
       FROM daily_blocks`,
      DEMO_USER_ID,
      start,
      end,
      DEMO_USER_ID,
      start,
      end
    );
    const base = row ?? { planned_count: 0, performed_count: 0, planned_minutes: 0, actual_minutes: 0 };
    return {
      ...base,
      adherence_percent: base.planned_minutes
        ? Math.min(100, Math.round((base.actual_minutes / base.planned_minutes) * 100))
        : 0,
    };
  },

  async getWeeklySummary(db: SQLiteDatabase): Promise<WeeklySummary> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    return db.getFirstAsync<{
      planned: number;
      performed: number;
      minutes: number;
      expenses: number;
      recoveries: number;
      topics: string | null;
    }>(
      `WITH weekly_blocks AS (
         SELECT pb.id,
                pb.status,
                (julianday(pb.ends_at) - julianday(pb.starts_at)) * 1440 AS duration_min,
                COALESCE(av.shortened_minutes, 0) AS shortened_min,
                (SELECT SUM(ts.elapsed_seconds) FROM time_sessions ts WHERE ts.planned_block_id = pb.id AND ts.deleted_at IS NULL) AS ts_seconds
         FROM planned_blocks pb
         LEFT JOIN activity_verifications av ON av.planned_block_id = pb.id AND av.deleted_at IS NULL
         WHERE pb.user_id = ? AND pb.starts_at >= ? AND pb.deleted_at IS NULL AND pb.status <> 'cancelled'
       )
       SELECT COUNT(*) planned,
              COUNT(CASE WHEN status IN ('completed','partial') THEN 1 END) performed,
              COALESCE(CAST(ROUND(SUM(
                CASE
                  WHEN ts_seconds IS NOT NULL AND ts_seconds > 0 THEN ts_seconds / 60.0
                  WHEN status = 'completed' THEN duration_min
                  WHEN status = 'partial' THEN MAX(0, duration_min - shortened_min)
                  ELSE 0
                END
              )) AS INTEGER), 0)
              + COALESCE((SELECT CAST(SUM(ss.elapsed_seconds)/60 AS INTEGER) FROM study_sessions ss WHERE ss.user_id=? AND ss.started_at>=? AND ss.ended_at IS NOT NULL), 0) minutes,
              (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id=? AND occurred_at>=? AND kind='expense') expenses,
              (SELECT COUNT(*) FROM recovery_links WHERE created_at>=?) recoveries,
              (SELECT GROUP_CONCAT(DISTINCT topic) FROM progress_entries WHERE created_at>=? AND topic IS NOT NULL) topics
       FROM weekly_blocks`,
      DEMO_USER_ID,
      since,
      DEMO_USER_ID,
      since,
      DEMO_USER_ID,
      since,
      since,
      since
    );
  },

  async getActivityOutcomeReport(db: SQLiteDatabase): Promise<ActivityOutcomeReport[]> {
    return db.getAllAsync<ActivityOutcomeReport>(
      `WITH unique_blocks AS (
         SELECT DISTINCT pb.id,pb.activity_id,pb.status
         FROM planned_blocks pb
         WHERE pb.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id)
       )
       SELECT lower(trim(a.title)) group_key,
              MIN(trim(a.title)) title,
              COALESCE(MAX(ao.color),'#3157D5') color,
              COUNT(ub.id) total,
              COALESCE(SUM(CASE WHEN ub.status='completed' THEN 1 ELSE 0 END),0) completed,
              COALESCE(SUM(CASE WHEN ub.status='partial' THEN 1 ELSE 0 END),0) partial,
              COALESCE(SUM(CASE WHEN ub.status='skipped' THEN 1 ELSE 0 END),0) skipped,
              COALESCE(SUM(CASE WHEN ub.status NOT IN('completed','partial','skipped','cancelled','rescheduled') THEN 1 ELSE 0 END),0) pending
       FROM activities a
       LEFT JOIN activity_options ao ON ao.activity_id=a.id AND ao.deleted_at IS NULL
       JOIN unique_blocks ub ON ub.activity_id=a.id
       WHERE a.user_id=? AND a.deleted_at IS NULL
       GROUP BY lower(trim(a.title)) HAVING COUNT(ub.id)>0
       ORDER BY MIN(trim(a.title))`,
      DEMO_USER_ID
    );
  },

  async getActivityOutcomeDetails(db: SQLiteDatabase): Promise<ActivityOutcomeDetail[]> {
    return db.getAllAsync<ActivityOutcomeDetail>(
      `SELECT pb.id,lower(trim(a.title)) group_key,pb.starts_at,pb.status
       FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id
       WHERE a.user_id=? AND a.deleted_at IS NULL AND pb.deleted_at IS NULL
         AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id)
       ORDER BY pb.starts_at DESC`,
      DEMO_USER_ID
    );
  },

  async getSuspensionReasonsSummary(db: SQLiteDatabase): Promise<SuspensionReasonSummary[]> {
    return db.getAllAsync<SuspensionReasonSummary>(
      `SELECT COALESCE(av.reason, 'Sin motivo especificado') AS reason,
              COUNT(av.id) AS count
       FROM activity_verifications av
       JOIN planned_blocks pb ON pb.id = av.planned_block_id
       WHERE av.user_id = ? AND av.deleted_at IS NULL
         AND (av.result IN ('skipped', 'cancelled') OR (av.result = 'partial' AND av.reason IS NOT NULL))
       GROUP BY COALESCE(av.reason, 'Sin motivo especificado')
       ORDER BY count DESC`,
      DEMO_USER_ID
    );
  },
};
