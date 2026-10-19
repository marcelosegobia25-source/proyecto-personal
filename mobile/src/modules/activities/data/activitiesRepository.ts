import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DEMO_USER_ID, nowIso, todayBounds } from '@core/database/types';
import type {
  CreatePlannedActivityInput,
  DayScheduleRule,
  DueActivityPopup,
  FlexibleActivity,
  FocusSchedule,
  OccurrenceEditor,
  PlannedBlock,
  ProgressEntry,
  RecoverableBlock,
  ReminderBlock,
  UpdateOccurrenceInput,
} from '../domain/types';

export const activitiesRepository = {
  async listTodayBlocks(db: SQLiteDatabase): Promise<PlannedBlock[]> {
    await this.purgeTravelBlocks(db);
    const [start, end] = todayBounds();
    const now = nowIso();

    // En caso de no marcar nada, las actividades cuya hora ya concluyó se consideran realizadas con normalidad
    const pastUnmarked = await db.getAllAsync<{ id: string; ends_at: string }>(
      `SELECT id, ends_at FROM planned_blocks
       WHERE user_id=? AND status='planned' AND deleted_at IS NULL
         AND datetime(ends_at) <= datetime(?)`,
      DEMO_USER_ID,
      now
    );
    for (const p of pastUnmarked) {
      await db.runAsync(
        `UPDATE planned_blocks SET status='completed',updated_at=?,version=version+1 WHERE id=?`,
        now,
        p.id
      );
      await db.runAsync(
        `INSERT OR REPLACE INTO activity_verifications
         (id,user_id,planned_block_id,result,completion_percent,reason,actual_end_at,shortened_minutes,verified_at,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        Crypto.randomUUID(),
        DEMO_USER_ID,
        p.id,
        'completed',
        100,
        null,
        p.ends_at,
        0,
        now,
        now,
        now
      );
    }

    // Si la actividad ya comenzó y aún no termina, marcarla como retrasada/pendiente
    await db.runAsync(
      `UPDATE planned_blocks SET status='late',updated_at=?,version=version+1
       WHERE user_id=? AND status='planned' AND deleted_at IS NULL AND id NOT IN(SELECT block_id FROM auxiliary_blocks)
       AND datetime(starts_at) < datetime(?)
       AND ends_at>?`,
      now,
      DEMO_USER_ID,
      now,
      now
    );

    return db.getAllAsync<PlannedBlock>(
      `SELECT pb.id,pb.activity_id,a.title,pb.starts_at,
              CASE WHEN av.actual_end_at IS NOT NULL THEN av.actual_end_at ELSE pb.ends_at END ends_at,
              pb.ends_at scheduled_ends_at,pb.status,COALESCE(av.shortened_minutes,0) shortened_minutes,
              COALESCE(ao.priority,'normal') priority,COALESCE(ao.color,'#2563EB') color,
              CASE WHEN a.title IN('Desayuno','Almuerzo','Cena') THEN 'meal' ELSE 'activity' END kind,
              SUM(ts.elapsed_seconds) AS elapsed_seconds,
              MAX(CASE WHEN ts.ended_at IS NULL THEN ts.started_at END) AS active_started_at,
              av.reason AS reason,
              COALESCE(ad.description, '') AS description
       FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_options ao ON ao.activity_id=a.id
       LEFT JOIN activity_details ad ON ad.activity_id=a.id
       LEFT JOIN time_sessions ts ON ts.planned_block_id=pb.id AND ts.deleted_at IS NULL LEFT JOIN auxiliary_blocks ab ON ab.block_id=pb.id LEFT JOIN activity_verifications av ON av.planned_block_id=pb.id AND av.deleted_at IS NULL
       WHERE pb.user_id=? AND pb.starts_at>=? AND pb.starts_at<? AND pb.deleted_at IS NULL AND COALESCE(ao.is_paused,0)=0 AND ao.deleted_at IS NULL
         AND ab.role IS NULL
         AND a.title NOT LIKE 'Traslado%'
         AND a.title NOT LIKE 'Regreso de%'
       GROUP BY pb.id ORDER BY pb.starts_at`,
      DEMO_USER_ID,
      start,
      end
    );
  },

  async listDueActivityPopups(db: SQLiteDatabase): Promise<DueActivityPopup[]> {
    const now = nowIso();
    const until = new Date(Date.now() + 60 * 60_000).toISOString();
    return db.getAllAsync<DueActivityPopup>(
      `SELECT pb.id,pb.activity_id,a.title,pb.starts_at,COALESCE(ao.priority,'normal') priority
       FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_options ao ON ao.activity_id=a.id
       WHERE pb.user_id=? AND pb.deleted_at IS NULL AND pb.status IN('planned','late','paused') AND pb.starts_at<=? AND pb.ends_at>? AND pb.id NOT IN(SELECT block_id FROM auxiliary_blocks) AND NOT EXISTS(SELECT 1 FROM activity_popup_dismissals d WHERE d.block_id=pb.id)
       ORDER BY CASE COALESCE(ao.priority,'normal') WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,pb.starts_at LIMIT 1`,
      DEMO_USER_ID,
      until,
      now
    );
  },

  async dismissActivityPopup(db: SQLiteDatabase, blockId: string): Promise<void> {
    await db.runAsync(
      'INSERT OR REPLACE INTO activity_popup_dismissals(block_id,user_id,dismissed_at) VALUES(?,?,?)',
      blockId,
      DEMO_USER_ID,
      nowIso()
    );
  },

  async listUpcomingBlocks(db: SQLiteDatabase): Promise<PlannedBlock[]> {
    return db.getAllAsync<PlannedBlock>(
      `SELECT pb.id,pb.activity_id,a.title,pb.starts_at,pb.ends_at,pb.status,COALESCE(ao.priority,'normal') priority,
              SUM(ts.elapsed_seconds) AS elapsed_seconds,
              MAX(CASE WHEN ts.ended_at IS NULL THEN ts.started_at END) AS active_started_at
       FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_options ao ON ao.activity_id=a.id
       LEFT JOIN time_sessions ts ON ts.planned_block_id=pb.id AND ts.deleted_at IS NULL
       WHERE pb.user_id=? AND pb.deleted_at IS NULL AND COALESCE(ao.is_paused,0)=0 AND ao.deleted_at IS NULL
         AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id AND ab.role IN('preparation','buffer'))
       GROUP BY pb.id ORDER BY pb.starts_at LIMIT 30`,
      DEMO_USER_ID
    );
  },

  async createPlannedActivity(
    db: SQLiteDatabase,
    input: CreatePlannedActivityInput
  ): Promise<{ activityId: string; scheduleId: string; occurrences: { blockId: string; startsAt: Date; endsAt: Date }[] }> {
    const activityId = Crypto.randomUUID();
    const scheduleId = Crypto.randomUUID();
    const createdAt = nowIso();
    const legacyDays =
      input.recurrence === 'weekly_month' ? 35 : input.recurrence === 'weekly_year' ? 371 : 0;
    const rangeEnd = input.endsOn ?? new Date(input.startsAt.getTime() + legacyDays * 24 * 60 * 60_000);
    const stepDays = input.recurrence === 'daily' ? 1 : input.recurrence === 'once' ? 0 : 7;
    const occurrences: { blockId: string; startsAt: Date; endsAt: Date; rule?: DayScheduleRule }[] = [];
    const selectedDays = input.weekdays?.length ? input.weekdays : null;

    for (let cursor = new Date(input.startsAt), guard = 0; cursor <= rangeEnd && guard < 400; guard++) {
      if (selectedDays && !selectedDays.includes(cursor.getDay())) {
        cursor = new Date(cursor.getTime() + 24 * 60 * 60_000);
        continue;
      }
      const rule = input.dayRules?.find((x) => x.weekday === cursor.getDay());
      const startsAt = new Date(cursor);
      if (rule) startsAt.setHours(rule.hour, rule.minute, 0, 0);
      const duration = rule?.durationMinutes ?? input.durationMinutes;
      occurrences.push({
        blockId: Crypto.randomUUID(),
        startsAt,
        endsAt: new Date(startsAt.getTime() + duration * 60_000),
        rule,
      });
      if (stepDays === 0 && !selectedDays) break;
      cursor = new Date(cursor.getTime() + (selectedDays ? 1 : stepDays) * 24 * 60 * 60_000);
    }
    if (!occurrences.length) throw new Error('El rango no contiene ninguno de los días seleccionados');

    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO activities(id,user_id,category_id,title,default_duration_minutes,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?)`,
        activityId,
        DEMO_USER_ID,
        '20000000-0000-0000-0000-000000000001',
        input.title,
        input.durationMinutes,
        createdAt,
        createdAt
      );
      if (input.description?.trim()) {
        await tx.runAsync(
          'INSERT INTO activity_details(activity_id,description) VALUES(?,?)',
          activityId,
          input.description.trim()
        );
      }
      await tx.runAsync(
        'INSERT INTO activity_options(activity_id,priority,color,focus_mode) VALUES(?,?,?,?)',
        activityId,
        input.priority ?? 'normal',
        input.color ?? '#2563EB',
        input.focusMode ? 1 : 0
      );
      const lastOccurrence = occurrences[occurrences.length - 1];
      await tx.runAsync(
        `INSERT INTO activity_schedules(id,user_id,activity_id,recurrence,starts_on,ends_on,local_start_time,duration_minutes,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        scheduleId,
        DEMO_USER_ID,
        activityId,
        input.recurrence,
        input.startsAt.toISOString().slice(0, 10),
        lastOccurrence.startsAt.toISOString().slice(0, 10),
        input.startsAt.toTimeString().slice(0, 5),
        input.durationMinutes,
        createdAt,
        createdAt
      );

      for (const weekday of selectedDays ?? [input.startsAt.getDay()]) {
        const rule = input.dayRules?.find((x) => x.weekday === weekday);
        const time = rule
          ? `${String(rule.hour).padStart(2, '0')}:${String(rule.minute).padStart(2, '0')}`
          : input.startsAt.toTimeString().slice(0, 5);
        await tx.runAsync(
          `INSERT OR IGNORE INTO schedule_rules VALUES(?,?,?,?,?,?,?,?,?,?)`,
          Crypto.randomUUID(),
          DEMO_USER_ID,
          scheduleId,
          weekday,
          time,
          rule?.durationMinutes ?? input.durationMinutes,
          rule?.preparationMinutes ?? input.preparationMinutes ?? 0,
          rule?.travelMinutes ?? input.travelMinutes ?? 0,
          rule?.bufferMinutes ?? input.bufferMinutes ?? 0,
          rule?.returnTravelMinutes ?? input.returnTravelMinutes ?? 0
        );
      }

      for (const occurrence of occurrences) {
        await tx.runAsync(
          `INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?)`,
          occurrence.blockId,
          DEMO_USER_ID,
          activityId,
          occurrence.startsAt.toISOString(),
          occurrence.endsAt.toISOString(),
          createdAt,
          createdAt
        );
        await tx.runAsync('INSERT INTO schedule_occurrences VALUES(?,?)', scheduleId, occurrence.blockId);
      }

      await tx.runAsync(
        `INSERT INTO sync_outbox(operation_id,entity,entity_id,operation,payload,created_at)
         VALUES(?,?,?,?,?,?)`,
        Crypto.randomUUID(),
        'activity_schedules',
        scheduleId,
        'insert',
        JSON.stringify({ scheduleId, activityId, recurrence: input.recurrence }),
        createdAt
      );
    });

    return { activityId, scheduleId, occurrences };
  },

  async createFlexibleActivity(
    db: SQLiteDatabase,
    input: { title: string; description?: string; durationMinutes: number; kind?: string }
  ): Promise<string> {
    const activityId = Crypto.randomUUID();
    const id = Crypto.randomUUID();
    const timestamp = nowIso();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO activities(id,user_id,category_id,title,default_duration_minutes,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?)`,
        activityId,
        DEMO_USER_ID,
        input.kind === 'study' ? '20000000-0000-0000-0000-000000000001' : null,
        input.title,
        input.durationMinutes,
        timestamp,
        timestamp
      );
      await tx.runAsync(
        `INSERT INTO flexible_activities(id,user_id,activity_id,description,duration_minutes,kind,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        id,
        DEMO_USER_ID,
        activityId,
        input.description?.trim() || '',
        input.durationMinutes,
        input.kind ?? 'general',
        timestamp,
        timestamp
      );
    });
    return id;
  },

  async listFlexibleActivities(db: SQLiteDatabase, kind?: string): Promise<FlexibleActivity[]> {
    return db.getAllAsync<FlexibleActivity>(
      `SELECT fa.id,fa.activity_id,a.title,fa.description,fa.duration_minutes,fa.kind
       FROM flexible_activities fa JOIN activities a ON a.id=fa.activity_id
       WHERE fa.user_id=? AND fa.deleted_at IS NULL ${kind ? 'AND fa.kind=?' : ''}
       ORDER BY fa.created_at DESC`,
      ...(kind ? [DEMO_USER_ID, kind] : [DEMO_USER_ID])
    );
  },

  async startFlexibleActivity(db: SQLiteDatabase, item: FlexibleActivity): Promise<string> {
    const start = new Date();
    const end = new Date(start.getTime() + item.duration_minutes * 60_000);
    const blockId = Crypto.randomUUID();
    const timestamp = nowIso();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,status,created_at,updated_at)
         VALUES(?,?,?,?,?,'in_progress',?,?)`,
        blockId,
        DEMO_USER_ID,
        item.activity_id,
        start.toISOString(),
        end.toISOString(),
        timestamp,
        timestamp
      );
      await tx.runAsync(
        `INSERT INTO time_sessions(id,user_id,activity_id,planned_block_id,started_at,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?)`,
        Crypto.randomUUID(),
        DEMO_USER_ID,
        item.activity_id,
        blockId,
        timestamp,
        timestamp,
        timestamp
      );
    });
    return blockId;
  },

  async attachNotification(
    db: SQLiteDatabase,
    blockId: string,
    notificationId: string,
    remindAt: Date,
    title: string
  ): Promise<void> {
    const createdAt = nowIso();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'UPDATE planned_blocks SET local_notification_id=?,updated_at=?,version=version+1 WHERE id=?',
        notificationId,
        createdAt,
        blockId
      );
      await tx.runAsync(
        'INSERT INTO reminders VALUES(?,?,?,?,?,?,?)',
        Crypto.randomUUID(),
        DEMO_USER_ID,
        blockId,
        remindAt.toISOString(),
        title,
        notificationId,
        createdAt
      );
    });
  },

  async clearBlockReminders(db: SQLiteDatabase, blockId: string): Promise<string[]> {
    const rows = await db.getAllAsync<{ local_notification_id: string }>(
      'SELECT local_notification_id FROM reminders WHERE planned_block_id=? AND local_notification_id IS NOT NULL',
      blockId
    );
    await db.runAsync('DELETE FROM reminders WHERE planned_block_id=?', blockId);
    return rows.map((x) => x.local_notification_id);
  },

  async listActivityReminderBlocks(
    db: SQLiteDatabase,
    activityId: string,
    includeDeleted = false
  ): Promise<ReminderBlock[]> {
    return db.getAllAsync<ReminderBlock>(
      `SELECT pb.id,pb.starts_at,a.title,pb.deleted_at,COALESCE(ao.priority,'normal') priority
       FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_options ao ON ao.activity_id=pb.activity_id
       WHERE pb.activity_id=? ${includeDeleted ? '' : 'AND pb.deleted_at IS NULL'}
       ORDER BY pb.starts_at`,
      activityId
    );
  },

  async listFutureReminderBlocks(db: SQLiteDatabase): Promise<ReminderBlock[]> {
    return db.getAllAsync<ReminderBlock>(
      `SELECT pb.id,pb.starts_at,a.title,pb.deleted_at,COALESCE(ao.priority,'normal') priority
       FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_options ao ON ao.activity_id=pb.activity_id
       WHERE pb.user_id=? AND pb.deleted_at IS NULL AND pb.starts_at>?
       ORDER BY pb.starts_at`,
      DEMO_USER_ID,
      nowIso()
    );
  },

  async listFocusSchedules(db: SQLiteDatabase): Promise<FocusSchedule[]> {
    return db.getAllAsync<FocusSchedule>(
      `SELECT pb.id,a.title,pb.starts_at,pb.ends_at
       FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id JOIN activity_options ao ON ao.activity_id=pb.activity_id
       WHERE pb.user_id=? AND pb.deleted_at IS NULL AND a.deleted_at IS NULL AND ao.deleted_at IS NULL
         AND ao.is_paused=0 AND ao.focus_mode=1 AND pb.status IN('planned','late','in_progress','paused') AND pb.ends_at>?
         AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id)
       ORDER BY pb.starts_at`,
      DEMO_USER_ID,
      nowIso()
    );
  },

  async startSession(db: SQLiteDatabase, block: PlannedBlock): Promise<void> {
    if (block.kind && block.kind !== 'activity' && block.kind !== 'meal') {
      throw new Error('Los tiempos auxiliares no tienen cronómetro propio.');
    }
    const timestamp = nowIso();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const request = await tx.getFirstAsync<{
        id: string;
        subject_id: string;
        topic: string;
        objective: string;
        duration_minutes: number;
        activity_id: string;
        content_id: string | null;
      }>(
        "SELECT sr.*,a.title activity_title,0 completed_minutes,sr.duration_minutes remaining_minutes FROM study_requests sr JOIN activities a ON a.id=sr.activity_id WHERE sr.planned_block_id=? AND sr.status IN('scheduled','pending')",
        block.id
      );
      await tx.runAsync(
        `UPDATE planned_blocks SET status='in_progress',updated_at=?,version=version+1 WHERE id=?`,
        timestamp,
        block.id
      );
      if (request) {
        const sessionId = Crypto.randomUUID();
        await tx.runAsync(
          `INSERT INTO study_sessions(id,user_id,subject_id,topic,objective,mode,target_seconds,started_at)
           VALUES(?,?,?,?,?,?,?,?)`,
          sessionId,
          DEMO_USER_ID,
          request.subject_id,
          request.topic,
          request.objective,
          'duration',
          request.duration_minutes * 60,
          timestamp
        );
        await tx.runAsync(
          'INSERT INTO study_session_links(session_id,activity_id,content_id) VALUES(?,?,?)',
          sessionId,
          request.activity_id,
          request.content_id
        );
        await tx.runAsync(
          'INSERT INTO study_request_sessions(request_id,session_id) VALUES(?,?)',
          request.id,
          sessionId
        );
        await tx.runAsync(
          `UPDATE study_requests SET session_id=?,status='in_progress',updated_at=? WHERE id=?`,
          sessionId,
          timestamp,
          request.id
        );
        return;
      }
      await tx.runAsync(
        `INSERT INTO time_sessions(id,user_id,activity_id,planned_block_id,started_at,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?)`,
        Crypto.randomUUID(),
        DEMO_USER_ID,
        block.activity_id,
        block.id,
        timestamp,
        timestamp,
        timestamp
      );
    });
  },

  async stopSession(db: SQLiteDatabase, blockId: string): Promise<void> {
    const endedAt = new Date();
    const session = await db.getFirstAsync<{ id: string; started_at: string }>(
      'SELECT id,started_at FROM time_sessions WHERE user_id=? AND planned_block_id=? AND ended_at IS NULL',
      DEMO_USER_ID,
      blockId
    );
    const study = await db.getFirstAsync<{ session_id: string }>(
      "SELECT session_id FROM study_requests WHERE planned_block_id=? AND status='in_progress'",
      blockId
    );
    if (!session) {
      if (study?.session_id) {
        await db.runAsync(
          `UPDATE planned_blocks SET status='paused',updated_at=?,version=version+1 WHERE id=?`,
          endedAt.toISOString(),
          blockId
        );
        const { studyRepository } = await import('@modules/study/data/studyRepository');
        await studyRepository.stopStudySession(db, study.session_id);
      }
      return;
    }
    const elapsed = Math.max(0, Math.round((endedAt.getTime() - new Date(session.started_at).getTime()) / 1000));
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'UPDATE time_sessions SET ended_at=?,elapsed_seconds=?,updated_at=?,version=version+1 WHERE id=?',
        endedAt.toISOString(),
        elapsed,
        endedAt.toISOString(),
        session.id
      );
      await tx.runAsync(
        `UPDATE planned_blocks SET status='paused',updated_at=?,version=version+1 WHERE id=?`,
        endedAt.toISOString(),
        blockId
      );
    });
    if (study?.session_id) {
      const { studyRepository } = await import('@modules/study/data/studyRepository');
      await studyRepository.stopStudySession(db, study.session_id);
    }
  },

  async verifyBlock(
    db: SQLiteDatabase,
    blockId: string,
    result: 'completed' | 'partial' | 'skipped' | 'cancelled',
    reason?: string,
    shortenedMinutes?: number
  ): Promise<void> {
    const now = new Date();
    const timestamp = now.toISOString();
    const completion = result === 'completed' ? 100 : result === 'partial' ? 50 : 0;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const block = await tx.getFirstAsync<{ starts_at: string; ends_at: string }>(
        'SELECT starts_at,ends_at FROM planned_blocks WHERE id=? AND user_id=? AND deleted_at IS NULL',
        blockId,
        DEMO_USER_ID
      );
      if (!block) throw new Error('Actividad no encontrada');
      const start = new Date(block.starts_at);
      const scheduledEnd = new Date(block.ends_at);
      let actualEnd: Date;
      let shortened = 0;

      if (result === 'skipped' || result === 'cancelled') {
        actualEnd = start;
        shortened = Math.max(0, Math.round((scheduledEnd.getTime() - start.getTime()) / 60_000));
      } else if (result === 'partial') {
        if (shortenedMinutes && shortenedMinutes > 0) {
          actualEnd = new Date(scheduledEnd.getTime() - shortenedMinutes * 60_000);
          shortened = shortenedMinutes;
        } else {
          actualEnd = new Date(Math.max(start.getTime(), Math.min(now.getTime(), scheduledEnd.getTime())));
          shortened = Math.max(0, Math.round((scheduledEnd.getTime() - actualEnd.getTime()) / 60_000));
        }
      } else {
        actualEnd = scheduledEnd;
        shortened = 0;
      }

      const session = await tx.getFirstAsync<{ id: string; started_at: string }>(
        'SELECT id,started_at FROM time_sessions WHERE planned_block_id=? AND ended_at IS NULL AND deleted_at IS NULL',
        blockId
      );
      if (session) {
        const elapsed = Math.max(0, Math.round((actualEnd.getTime() - new Date(session.started_at).getTime()) / 1000));
        await tx.runAsync(
          'UPDATE time_sessions SET ended_at=?,elapsed_seconds=?,updated_at=?,version=version+1 WHERE id=?',
          actualEnd.toISOString(),
          elapsed,
          timestamp,
          session.id
        );
      }
      await tx.runAsync(
        'UPDATE planned_blocks SET status=?,updated_at=?,version=version+1 WHERE id=?',
        result,
        timestamp,
        blockId
      );
      await tx.runAsync(
        `INSERT OR REPLACE INTO activity_verifications
         (id,user_id,planned_block_id,result,completion_percent,reason,actual_end_at,shortened_minutes,verified_at,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        Crypto.randomUUID(),
        DEMO_USER_ID,
        blockId,
        result,
        completion,
        reason || null,
        actualEnd.toISOString(),
        shortened,
        timestamp,
        timestamp,
        timestamp
      );
      await tx.runAsync(
        `INSERT INTO sync_outbox(operation_id,entity,entity_id,operation,payload,created_at) VALUES(?,?,?,?,?,?)`,
        Crypto.randomUUID(),
        'activity_verifications',
        blockId,
        'insert',
        JSON.stringify({
          blockId,
          result,
          completion,
          reason,
          shortened,
        }),
        timestamp
      );
    });
  },

  async getOccurrenceEditor(db: SQLiteDatabase, blockId: string): Promise<OccurrenceEditor | null> {
    return db.getFirstAsync<OccurrenceEditor>(
      `SELECT pb.id block_id,pb.activity_id,so.schedule_id,a.title,pb.starts_at,pb.ends_at,COALESCE(ao.priority,'normal') priority,COALESCE(ao.focus_mode,0) focus_mode,
              0 preparation, 0 travel, 0 buffer, 0 return_travel
       FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id
       LEFT JOIN schedule_occurrences so ON so.block_id=pb.id
       LEFT JOIN activity_options ao ON ao.activity_id=pb.activity_id
       WHERE pb.id=? GROUP BY pb.id`,
      blockId
    );
  },

  async updateOccurrence(
    db: SQLiteDatabase,
    item: OccurrenceEditor,
    input: UpdateOccurrenceInput,
    scope: 'one' | 'future' | 'all'
  ): Promise<void> {
    const timestamp = nowIso();
    const threshold = scope === 'all' ? '0000' : item.starts_at;
    const targets =
      scope === 'one'
        ? [item.block_id]
        : (
            await db.getAllAsync<{ id: string }>(
              `SELECT pb.id FROM planned_blocks pb JOIN schedule_occurrences so ON so.block_id=pb.id
               WHERE so.schedule_id=? AND pb.starts_at>=? AND pb.deleted_at IS NULL`,
              item.schedule_id,
              threshold
            )
          ).map((x) => x.id);

    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'UPDATE activities SET title=?,updated_at=?,version=version+1 WHERE id=?',
        input.title.trim(),
        timestamp,
        item.activity_id
      );
      await tx.runAsync(
        `INSERT INTO activity_options(activity_id,priority,focus_mode) VALUES(?,?,?)
         ON CONFLICT(activity_id) DO UPDATE SET priority=excluded.priority,focus_mode=excluded.focus_mode`,
        item.activity_id,
        input.priority,
        input.focusMode ? 1 : 0
      );
      for (const id of targets) {
        const old = await tx.getFirstAsync<{ starts_at: string }>(
          'SELECT starts_at FROM planned_blocks WHERE id=?',
          id
        );
        if (!old) continue;
        const start =
          scope === 'one'
            ? input.startsAt
            : new Date(
                new Date(old.starts_at).setHours(input.startsAt.getHours(), input.startsAt.getMinutes(), 0, 0)
              );
        const end = new Date(start.getTime() + input.durationMinutes * 60_000);
        await tx.runAsync(
          'UPDATE planned_blocks SET starts_at=?,ends_at=?,updated_at=?,version=version+1 WHERE id=?',
          start.toISOString(),
          end.toISOString(),
          timestamp,
          id
        );
        await this.updateAuxiliaryTimes(tx, id, start, end, input, timestamp);
      }
      if (scope !== 'one' && item.schedule_id) {
        await tx.runAsync(
          'UPDATE schedule_rules SET local_start_time=?,duration_minutes=?,preparation_minutes=0,travel_out_minutes=0,buffer_minutes=0,travel_return_minutes=0 WHERE schedule_id=?',
          `${String(input.startsAt.getHours()).padStart(2, '0')}:${String(input.startsAt.getMinutes()).padStart(
            2,
            '0'
          )}`,
          input.durationMinutes,
          item.schedule_id
        );
      }
      if (scope === 'one' && item.schedule_id) {
        await tx.runAsync(
          `INSERT INTO schedule_exceptions(id,user_id,schedule_id,block_id,occurrence_date,action,starts_at,ends_at,preparation_minutes,travel_out_minutes,buffer_minutes,travel_return_minutes,created_at)
           VALUES(?,?,?,?,?,'modified',?,?,0,0,0,0,?)
           ON CONFLICT(schedule_id,occurrence_date) DO UPDATE SET action='modified',starts_at=excluded.starts_at,ends_at=excluded.ends_at,preparation_minutes=0,travel_out_minutes=0,buffer_minutes=0,travel_return_minutes=0`,
          Crypto.randomUUID(),
          DEMO_USER_ID,
          item.schedule_id,
          item.block_id,
          item.starts_at.slice(0, 10),
          input.startsAt.toISOString(),
          new Date(input.startsAt.getTime() + input.durationMinutes * 60_000).toISOString(),
          timestamp
        );
      }
    });
  },

  async updateAuxiliaryTimes(
    tx: SQLiteDatabase,
    parentId: string,
    _start: Date,
    _end: Date,
    _input: { preparation?: number; travel?: number; buffer?: number; returnTravel?: number },
    timestamp: string
  ): Promise<void> {
    const rows = await tx.getAllAsync<{ block_id: string }>(
      'SELECT block_id FROM auxiliary_blocks WHERE parent_block_id=?',
      parentId
    );
    for (const r of rows) {
      await tx.runAsync(
        'UPDATE planned_blocks SET deleted_at=?,updated_at=?,version=version+1 WHERE id=?',
        timestamp,
        timestamp,
        r.block_id
      );
    }
    await tx.runAsync('DELETE FROM auxiliary_blocks WHERE parent_block_id=?', parentId);
  },

  async deleteOccurrence(
    db: SQLiteDatabase,
    item: OccurrenceEditor,
    scope: 'one' | 'future' | 'all'
  ): Promise<void> {
    const timestamp = nowIso();
    if (scope === 'one') {
      await db.runAsync(
        'UPDATE planned_blocks SET deleted_at=?,updated_at=? WHERE id=?',
        timestamp,
        timestamp,
        item.block_id
      );
      if (item.schedule_id) {
        await db.runAsync(
          `INSERT INTO schedule_exceptions(id,user_id,schedule_id,block_id,occurrence_date,action,created_at)
           VALUES(?,?,?,?,?,'excluded',?)
           ON CONFLICT(schedule_id,occurrence_date) DO UPDATE SET action='excluded'`,
          Crypto.randomUUID(),
          DEMO_USER_ID,
          item.schedule_id,
          item.block_id,
          item.starts_at.slice(0, 10),
          timestamp
        );
      }
    } else {
      const threshold = scope === 'all' ? '0000' : item.starts_at;
      await db.runAsync(
        `UPDATE planned_blocks SET deleted_at=?,updated_at=?
         WHERE id IN(SELECT block_id FROM schedule_occurrences WHERE schedule_id=?) AND starts_at>=?`,
        timestamp,
        timestamp,
        item.schedule_id,
        threshold
      );
      if (scope === 'all') {
        await db.runAsync(
          'UPDATE activity_options SET deleted_at=? WHERE activity_id=?',
          timestamp,
          item.activity_id
        );
        await db.runAsync('UPDATE activity_schedules SET deleted_at=? WHERE id=?', timestamp, item.schedule_id);
      }
    }
  },

  async deleteOccurrenceAtomic(
    db: SQLiteDatabase,
    item: OccurrenceEditor,
    scope: 'one' | 'future' | 'all'
  ): Promise<void> {
    const timestamp = nowIso();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const targets =
        scope === 'one'
          ? [item.block_id]
          : (
              await tx.getAllAsync<{ id: string }>(
                `SELECT pb.id FROM planned_blocks pb JOIN schedule_occurrences so ON so.block_id=pb.id
                 WHERE so.schedule_id=? AND pb.starts_at>=? AND pb.deleted_at IS NULL`,
                item.schedule_id,
                scope === 'all' ? '0000' : item.starts_at
              )
            ).map((row) => row.id);
      for (const id of targets) {
        await tx.runAsync(
          'UPDATE planned_blocks SET deleted_at=?,updated_at=?,version=version+1 WHERE id=?',
          timestamp,
          timestamp,
          id
        );
        await tx.runAsync(
          'UPDATE planned_blocks SET deleted_at=?,updated_at=?,version=version+1 WHERE id IN(SELECT block_id FROM auxiliary_blocks WHERE parent_block_id=?)',
          timestamp,
          timestamp,
          id
        );
      }
      if (scope === 'one' && item.schedule_id) {
        await tx.runAsync(
          `INSERT INTO schedule_exceptions(id,user_id,schedule_id,block_id,occurrence_date,action,created_at)
           VALUES(?,?,?,?,?,'excluded',?)
           ON CONFLICT(schedule_id,occurrence_date) DO UPDATE SET action='excluded'`,
          Crypto.randomUUID(),
          DEMO_USER_ID,
          item.schedule_id,
          item.block_id,
          item.starts_at.slice(0, 10),
          timestamp
        );
      }
      if (scope === 'all') {
        await tx.runAsync(
          'UPDATE activity_options SET deleted_at=? WHERE activity_id=?',
          timestamp,
          item.activity_id
        );
        await tx.runAsync('UPDATE activity_schedules SET deleted_at=? WHERE id=?', timestamp, item.schedule_id);
      }
    });
  },

  async setActivityPaused(db: SQLiteDatabase, activityId: string, paused: boolean): Promise<void> {
    await db.runAsync(
      `INSERT INTO activity_options(activity_id,is_paused) VALUES(?,?)
       ON CONFLICT(activity_id) DO UPDATE SET is_paused=excluded.is_paused`,
      activityId,
      paused ? 1 : 0
    );
  },

  async setActivityColor(db: SQLiteDatabase, activityId: string, color: string): Promise<void> {
    await db.runAsync(
      `INSERT INTO activity_options(activity_id,color) VALUES(?,?)
       ON CONFLICT(activity_id) DO UPDATE SET color=excluded.color`,
      activityId,
      color
    );
  },

  async listPausedActivities(db: SQLiteDatabase): Promise<{ activity_id: string; title: string }[]> {
    return db.getAllAsync<{ activity_id: string; title: string }>(
      `SELECT a.id activity_id,a.title FROM activity_options ao JOIN activities a ON a.id=ao.activity_id
       WHERE ao.is_paused=1 AND ao.deleted_at IS NULL ORDER BY a.title`
    );
  },

  async listTrash(db: SQLiteDatabase): Promise<{ activity_id: string; title: string; deleted_at: string }[]> {
    return db.getAllAsync<{ activity_id: string; title: string; deleted_at: string }>(
      `SELECT a.id activity_id,a.title,ao.deleted_at FROM activity_options ao JOIN activities a ON a.id=ao.activity_id
       WHERE ao.deleted_at IS NOT NULL ORDER BY ao.deleted_at DESC`
    );
  },

  async restoreActivity(db: SQLiteDatabase, activityId: string): Promise<void> {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('UPDATE activity_options SET deleted_at=NULL WHERE activity_id=?', activityId);
      await tx.runAsync('UPDATE activity_schedules SET deleted_at=NULL WHERE activity_id=?', activityId);
      await tx.runAsync('UPDATE planned_blocks SET deleted_at=NULL WHERE activity_id=?', activityId);
    });
  },

  async listRecoverableBlocks(db: SQLiteDatabase): Promise<RecoverableBlock[]> {
    return db.getAllAsync<RecoverableBlock>(
      `SELECT pb.id,pb.activity_id,a.title,pb.starts_at,pb.ends_at,pb.status,
              COALESCE(SUM(ts.elapsed_seconds),0) elapsed_seconds,NULL active_started_at,
              ROUND((julianday(pb.ends_at)-julianday(pb.starts_at))*1440) planned_minutes,
              CAST(COALESCE(SUM(ts.elapsed_seconds),0)/60 AS INTEGER) actual_minutes,
              MAX(0,ROUND((julianday(pb.ends_at)-julianday(pb.starts_at))*1440)-CAST(COALESCE(SUM(ts.elapsed_seconds),0)/60 AS INTEGER)) pending_minutes
       FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN time_sessions ts ON ts.planned_block_id=pb.id
       WHERE pb.user_id=? AND pb.ends_at<? AND pb.status IN('planned','partial','skipped') AND pb.deleted_at IS NULL
       GROUP BY pb.id ORDER BY pb.ends_at DESC`,
      DEMO_USER_ID,
      nowIso()
    );
  },

  async createRecovery(db: SQLiteDatabase, original: PlannedBlock, startsAt: Date): Promise<string> {
    const plannedMinutes = Math.round(
      (new Date(original.ends_at).getTime() - new Date(original.starts_at).getTime()) / 60_000
    );
    const actualMinutes = Math.round((original.elapsed_seconds ?? 0) / 60);
    const pending = Math.max(5, plannedMinutes - actualMinutes);
    const blockId = Crypto.randomUUID();
    const timestamp = nowIso();
    const endsAt = new Date(startsAt.getTime() + pending * 60_000);
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,status,created_at,updated_at)
         VALUES(?,?,?,?,?,'planned',?,?)`,
        blockId,
        DEMO_USER_ID,
        original.activity_id,
        startsAt.toISOString(),
        endsAt.toISOString(),
        timestamp,
        timestamp
      );
      await tx.runAsync(
        `INSERT INTO recovery_links VALUES(?,?,?,?,?,'pending',?)`,
        Crypto.randomUUID(),
        DEMO_USER_ID,
        original.id,
        blockId,
        pending,
        timestamp
      );
      await tx.runAsync(
        `UPDATE planned_blocks SET status='rescheduled',updated_at=?,version=version+1 WHERE id=?`,
        timestamp,
        original.id
      );
    });
    return blockId;
  },

  async addProgress(
    db: SQLiteDatabase,
    activityId: string,
    blockId: string | null,
    input: Omit<ProgressEntry, 'id' | 'created_at'>
  ): Promise<void> {
    const timestamp = nowIso();
    await db.runAsync(
      `INSERT INTO progress_entries(id,user_id,activity_id,planned_block_id,topic,pages_from,pages_to,exercises_done,exercises_correct,concentration,difficulty,next_step,note,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      Crypto.randomUUID(),
      DEMO_USER_ID,
      activityId,
      blockId,
      input.topic,
      input.pages_from,
      input.pages_to,
      input.exercises_done,
      input.exercises_correct,
      input.concentration,
      input.difficulty,
      input.next_step,
      input.note,
      timestamp,
      timestamp
    );
  },

  async listProgress(db: SQLiteDatabase, activityId: string): Promise<ProgressEntry[]> {
    return db.getAllAsync<ProgressEntry>(
      'SELECT id,topic,pages_from,pages_to,exercises_done,exercises_correct,concentration,difficulty,next_step,note,created_at FROM progress_entries WHERE activity_id=? AND deleted_at IS NULL ORDER BY created_at DESC',
      activityId
    );
  },

  async getActivity(db: SQLiteDatabase, id: string): Promise<{ id: string; title: string; color: string } | null> {
    return db.getFirstAsync<{ id: string; title: string; color: string }>(
      `SELECT a.id,a.title,COALESCE(ao.color,'#3157D5') color FROM activities a LEFT JOIN activity_options ao ON ao.activity_id=a.id AND ao.deleted_at IS NULL WHERE a.id=?`,
      id
    );
  },

  async purgeTravelBlocks(db: SQLiteDatabase): Promise<void> {
    const timestamp = nowIso();
    try {
      await db.withExclusiveTransactionAsync(async (tx) => {
        const aux = await tx.getAllAsync<{ block_id: string }>(
          "SELECT block_id FROM auxiliary_blocks WHERE role IN ('travel', 'return', 'buffer', 'preparation')"
        );
        for (const r of aux) {
          await tx.runAsync(
            'UPDATE planned_blocks SET deleted_at=?,updated_at=? WHERE id=?',
            timestamp,
            timestamp,
            r.block_id
          );
        }
        await tx.runAsync(
          "UPDATE planned_blocks SET deleted_at=?,updated_at=? WHERE title LIKE 'Traslado%' OR title LIKE 'Regreso de%'",
          timestamp,
          timestamp
        );
        await tx.runAsync(
          "UPDATE activities SET deleted_at=?,updated_at=? WHERE title LIKE 'Traslado%' OR title LIKE 'Regreso de%'",
          timestamp,
          timestamp
        );
        await tx.runAsync("DELETE FROM auxiliary_blocks WHERE role IN ('travel', 'return', 'buffer', 'preparation')");
      });
    } catch {
      // Ignore if tables are busy
    }
  },

  async deleteActivity(db: SQLiteDatabase, activityId: string): Promise<void> {
    const timestamp = nowIso();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'UPDATE planned_blocks SET deleted_at=?,updated_at=?,version=version+1 WHERE activity_id=?',
        timestamp,
        timestamp,
        activityId
      );
      await tx.runAsync(
        'UPDATE activity_schedules SET deleted_at=?,updated_at=? WHERE activity_id=?',
        timestamp,
        timestamp,
        activityId
      );
      await tx.runAsync('UPDATE activity_options SET deleted_at=? WHERE activity_id=?', timestamp, activityId);
      await tx.runAsync(
        'UPDATE flexible_activities SET deleted_at=?,updated_at=? WHERE activity_id=?',
        timestamp,
        timestamp,
        activityId
      );
      await tx.runAsync(
        'UPDATE activities SET deleted_at=?,updated_at=?,version=version+1 WHERE id=?',
        timestamp,
        timestamp,
        activityId
      );
    });
  },

  async updateActivityTitle(db: SQLiteDatabase, activityId: string, title: string): Promise<void> {
    const clean = title.trim();
    if (!clean) throw new Error('El título no puede estar vacío');
    const timestamp = nowIso();
    await db.runAsync(
      'UPDATE activities SET title=?,updated_at=?,version=version+1 WHERE id=?',
      clean,
      timestamp,
      activityId
    );
  },
};
