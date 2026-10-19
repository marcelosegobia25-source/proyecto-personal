import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DEMO_USER_ID, nowIso } from '@core/database/types';
import type { LinkableActivity } from '@modules/activities/domain/types';
import { calendarRepository } from '@modules/calendar/data/calendarRepository';
import type {
  ActivityExtraSummary,
  ActivityStudyProgress,
  ActivitySubactivity,
  CreateStudySessionInput,
  DetailedStudySession,
  OpenStudySession,
  RecentStudySession,
  StudyActivityStats,
  StudyContent,
  StudyPlan,
  StudyRequest,
  StudySlot,
  StudySubject,
  StudyTimeReport,
  TopicDedication,
  UpdateStudySessionInput,
  GlobalTopicDedication,
} from '../domain/types';
import { DEFAULT_SUBACTIVITIES } from '../domain/types';

export const studyRepository = {
  async listSubjects(db: SQLiteDatabase): Promise<StudySubject[]> {
    return db.getAllAsync<StudySubject>(
      'SELECT id,name,color FROM study_subjects WHERE user_id=? ORDER BY name',
      DEMO_USER_ID
    );
  },

  async addSubject(db: SQLiteDatabase, name: string): Promise<string> {
    const clean = name.trim();
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM study_subjects WHERE user_id=? AND name=?',
      DEMO_USER_ID,
      clean
    );
    if (existing) return existing.id;
    const id = Crypto.randomUUID();
    await db.runAsync('INSERT INTO study_subjects VALUES(?,?,?,?,?)', id, DEMO_USER_ID, clean, '#3157D5', nowIso());
    return id;
  },

  async listStudyContents(db: SQLiteDatabase, subjectId: string): Promise<StudyContent[]> {
    return db.getAllAsync<StudyContent>(
      'SELECT id,subject_id,title,description,material_reference,position,status FROM study_contents WHERE user_id=? AND subject_id=? ORDER BY position',
      DEMO_USER_ID,
      subjectId
    );
  },

  async addStudyContent(
    db: SQLiteDatabase,
    subjectId: string,
    title: string,
    description: string,
    materialReference: string
  ): Promise<string> {
    const timestamp = nowIso();
    const row = await db.getFirstAsync<{ next_position: number }>(
      'SELECT COALESCE(MAX(position),0)+1 next_position FROM study_contents WHERE subject_id=?',
      subjectId
    );
    const id = Crypto.randomUUID();
    await db.runAsync(
      `INSERT INTO study_contents(id,user_id,subject_id,title,description,material_reference,position,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,'pending',?,?)`,
      id,
      DEMO_USER_ID,
      subjectId,
      title.trim(),
      description.trim(),
      materialReference.trim(),
      row?.next_position ?? 1,
      timestamp,
      timestamp
    );
    return id;
  },

  async setStudyContentStatus(
    db: SQLiteDatabase,
    id: string,
    status: StudyContent['status']
  ): Promise<void> {
    await db.runAsync(
      'UPDATE study_contents SET status=?,updated_at=? WHERE id=? AND user_id=?',
      status,
      nowIso(),
      id,
      DEMO_USER_ID
    );
  },

  async getNextStudyContent(db: SQLiteDatabase, subjectId: string): Promise<StudyContent | null> {
    return db.getFirstAsync<StudyContent>(
      `SELECT id,subject_id,title,description,material_reference,position,status
       FROM study_contents WHERE user_id=? AND subject_id=? AND status<>'completed'
       ORDER BY position LIMIT 1`,
      DEMO_USER_ID,
      subjectId
    );
  },

  async getStudyPlan(db: SQLiteDatabase, subjectId: string): Promise<StudyPlan | null> {
    return db.getFirstAsync<StudyPlan>(
      'SELECT weekly_target_minutes,session_minutes FROM study_plans WHERE subject_id=? AND user_id=?',
      subjectId,
      DEMO_USER_ID
    );
  },

  async saveStudyPlan(
    db: SQLiteDatabase,
    subjectId: string,
    weeklyMinutes: number,
    sessionMinutes: number
  ): Promise<void> {
    await db.runAsync(
      `INSERT INTO study_plans(subject_id,user_id,weekly_target_minutes,session_minutes,updated_at)
       VALUES(?,?,?,?,?)
       ON CONFLICT(subject_id) DO UPDATE SET weekly_target_minutes=excluded.weekly_target_minutes,session_minutes=excluded.session_minutes,updated_at=excluded.updated_at`,
      subjectId,
      DEMO_USER_ID,
      weeklyMinutes,
      sessionMinutes,
      nowIso()
    );
  },

  async createStudyRequest(
    db: SQLiteDatabase,
    input: {
      activityId: string;
      subjectId: string;
      contentId?: string;
      topic: string;
      objective: string;
      durationMinutes: number;
      preferredDate?: string;
      preferredTime?: string;
    }
  ): Promise<string> {
    const id = Crypto.randomUUID();
    const timestamp = nowIso();
    await db.runAsync(
      `INSERT INTO study_requests(id,user_id,activity_id,subject_id,content_id,topic,objective,duration_minutes,preferred_date,preferred_time,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,?)`,
      id,
      DEMO_USER_ID,
      input.activityId,
      input.subjectId,
      input.contentId ?? null,
      input.topic.trim(),
      input.objective.trim(),
      input.durationMinutes,
      input.preferredDate ?? null,
      input.preferredTime ?? null,
      timestamp,
      timestamp
    );
    return id;
  },

  async listStudyRequests(db: SQLiteDatabase): Promise<StudyRequest[]> {
    return db.getAllAsync<StudyRequest>(
      `SELECT sr.id,sr.activity_id,sr.subject_id,sr.content_id,a.title activity_title,sr.topic,sr.objective,sr.duration_minutes,
              sr.preferred_date,sr.preferred_time,sr.status,
              CAST(COALESCE(SUM(ss.elapsed_seconds),0)/60 AS INTEGER) completed_minutes,
              MAX(0,sr.duration_minutes-CAST(COALESCE(SUM(ss.elapsed_seconds),0)/60 AS INTEGER)) remaining_minutes
       FROM study_requests sr
       JOIN activities a ON a.id=sr.activity_id
       LEFT JOIN study_request_sessions srs ON srs.request_id=sr.id
       LEFT JOIN study_sessions ss ON ss.id=srs.session_id
       WHERE sr.user_id=? AND sr.status NOT IN('completed','cancelled')
       GROUP BY sr.id ORDER BY sr.created_at`,
      DEMO_USER_ID
    );
  },

  async suggestStudySlots(
    db: SQLiteDatabase,
    durationMinutes: number,
    preferredDate?: string | null,
    preferredTime?: string | null
  ): Promise<StudySlot[]> {
    const prefs = await calendarRepository.getSchedulePreferences(db);
    const days: Date[] = [];
    const first = preferredDate ? new Date(preferredDate + 'T12:00:00') : new Date();
    for (let i = 0; i < (preferredDate ? 1 : 14); i++) {
      const day = new Date(first);
      day.setDate(first.getDate() + i);
      if (!prefs.showWeekends && [0, 6].includes(day.getDay())) continue;
      days.push(day);
    }
    const suggestions: StudySlot[] = [];
    for (const day of days) {
      const dayStart = new Date(day);
      dayStart.setHours(Number(prefs.dayStart.slice(0, 2)), Number(prefs.dayStart.slice(3)), 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(Number(prefs.dayEnd.slice(0, 2)), Number(prefs.dayEnd.slice(3)), 0, 0);

      const blocks = await db.getAllAsync<{ starts_at: string; ends_at: string }>(
        `SELECT starts_at,ends_at FROM planned_blocks WHERE user_id=? AND deleted_at IS NULL AND status NOT IN('cancelled','rescheduled') AND starts_at<? AND ends_at>? ORDER BY starts_at`,
        DEMO_USER_ID,
        dayEnd.toISOString(),
        dayStart.toISOString()
      );
      const occupied = blocks.map((x) => ({
        start: new Date(x.starts_at).getTime(),
        end: new Date(x.ends_at).getTime(),
      }));

      if (preferredTime) {
        const candidate = new Date(day);
        candidate.setHours(Number(preferredTime.slice(0, 2)), Number(preferredTime.slice(3)), 0, 0);
        const finish = candidate.getTime() + durationMinutes * 60000;
        if (
          candidate >= dayStart &&
          finish <= dayEnd.getTime() &&
          !occupied.some((x) => candidate.getTime() < x.end && finish > x.start)
        ) {
          suggestions.push({
            startsAt: candidate.toISOString(),
            endsAt: new Date(finish).toISOString(),
          });
        }
      } else {
        let cursor = Math.max(
          dayStart.getTime(),
          day.toDateString() === new Date().toDateString() ? Date.now() : dayStart.getTime()
        );
        for (const range of occupied) {
          if (range.start - cursor >= durationMinutes * 60000) {
            suggestions.push({
              startsAt: new Date(cursor).toISOString(),
              endsAt: new Date(cursor + durationMinutes * 60000).toISOString(),
            });
          }
          cursor = Math.max(cursor, range.end);
          if (suggestions.length >= 3) break;
        }
        if (dayEnd.getTime() - cursor >= durationMinutes * 60000 && suggestions.length < 3) {
          suggestions.push({
            startsAt: new Date(cursor).toISOString(),
            endsAt: new Date(cursor + durationMinutes * 60000).toISOString(),
          });
        }
      }
      if (suggestions.length >= 3) break;
    }
    return suggestions.slice(0, 3);
  },

  async scheduleStudyRequest(db: SQLiteDatabase, request: StudyRequest, start: Date): Promise<string> {
    const timestamp = nowIso();
    const blockId = Crypto.randomUUID();
    const end = new Date(start.getTime() + request.duration_minutes * 60000);
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,status,created_at,updated_at)
         VALUES(?,?,?,?,?,'planned',?,?)`,
        blockId,
        DEMO_USER_ID,
        request.activity_id,
        start.toISOString(),
        end.toISOString(),
        timestamp,
        timestamp
      );
      const result = await tx.runAsync(
        `UPDATE study_requests SET planned_block_id=?,status='scheduled',updated_at=? WHERE id=? AND status='pending'`,
        blockId,
        timestamp,
        request.id
      );
      if (result.changes !== 1) throw new Error('La propuesta ya fue utilizada');
    });
    return blockId;
  },

  async startStudyRequest(
    db: SQLiteDatabase,
    request: StudyRequest,
    targetMinutes = request.remaining_minutes
  ): Promise<string> {
    const seconds = Math.max(60, Math.min(request.remaining_minutes, targetMinutes) * 60);
    const sessionId = await this.startStudySession(
      db,
      request.subject_id,
      request.topic,
      request.objective,
      'duration',
      seconds,
      request.activity_id,
      request.content_id ?? undefined
    );
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'INSERT INTO study_request_sessions(request_id,session_id) VALUES(?,?)',
        request.id,
        sessionId
      );
      await tx.runAsync(
        `UPDATE study_requests SET session_id=?,status='in_progress',updated_at=? WHERE id=?`,
        sessionId,
        nowIso(),
        request.id
      );
    });
    return sessionId;
  },

  async listStudyLinkableActivities(db: SQLiteDatabase): Promise<LinkableActivity[]> {
    return db.getAllAsync<LinkableActivity>(
      `SELECT a.id, trim(a.title) title
       FROM activities a
       WHERE a.user_id=? AND a.deleted_at IS NULL
         AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=a.id)
         AND a.title NOT LIKE 'Traslado%'
         AND a.title NOT LIKE 'Regreso de%'
       ORDER BY trim(a.title) ASC`,
      DEMO_USER_ID
    );
  },

  async ensureActivitySubactivities(db: SQLiteDatabase, activityId: string): Promise<void> {
    const timestamp = nowIso();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const existing = await tx.getFirstAsync<{ id: string }>(
        'SELECT id FROM activity_subactivities WHERE activity_id=? AND deleted_at IS NULL LIMIT 1',
        activityId
      );
      if (existing) return;
      for (const name of DEFAULT_SUBACTIVITIES) {
        await tx.runAsync(
          'INSERT OR IGNORE INTO activity_subactivities(id,user_id,activity_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)',
          Crypto.randomUUID(),
          DEMO_USER_ID,
          activityId,
          name,
          timestamp,
          timestamp
        );
      }
    });
  },

  async listActivitySubactivities(db: SQLiteDatabase, activityId: string): Promise<ActivitySubactivity[]> {
    await this.ensureActivitySubactivities(db, activityId);
    return db.getAllAsync<ActivitySubactivity>(
      'SELECT id,name FROM activity_subactivities WHERE activity_id=? AND deleted_at IS NULL ORDER BY created_at',
      activityId
    );
  },

  async addActivitySubactivity(db: SQLiteDatabase, activityId: string, name: string): Promise<string> {
    const clean = name.trim();
    if (!clean) throw new Error('Escribe el nombre de la subactividad');
    const timestamp = nowIso();
    const id = Crypto.randomUUID();
    await db.runAsync(
      'INSERT INTO activity_subactivities(id,user_id,activity_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      id,
      DEMO_USER_ID,
      activityId,
      clean,
      timestamp,
      timestamp
    );
    return id;
  },

  async getStudyActivityTarget(
    db: SQLiteDatabase,
    subjectId: string
  ): Promise<{ activity_id: string; weekly_target_minutes: number } | null> {
    return db.getFirstAsync<{ activity_id: string; weekly_target_minutes: number }>(
      'SELECT activity_id,weekly_target_minutes FROM study_activity_targets WHERE subject_id=? AND user_id=?',
      subjectId,
      DEMO_USER_ID
    );
  },

  async saveStudyActivityTarget(
    db: SQLiteDatabase,
    subjectId: string,
    activityId: string,
    weeklyMinutes: number
  ): Promise<void> {
    await db.runAsync(
      `INSERT INTO study_activity_targets(subject_id,activity_id,user_id,weekly_target_minutes,created_at)
       VALUES(?,?,?,?,?)
       ON CONFLICT(subject_id,activity_id) DO UPDATE SET weekly_target_minutes=excluded.weekly_target_minutes`,
      subjectId,
      activityId,
      DEMO_USER_ID,
      weeklyMinutes,
      nowIso()
    );
  },

  async ensureStudySubjectForActivity(db: SQLiteDatabase, activity: LinkableActivity): Promise<string> {
    const linked = await db.getFirstAsync<{ subject_id: string }>(
      'SELECT subject_id FROM study_activity_subjects WHERE activity_id=?',
      activity.id
    );
    if (linked) return linked.subject_id;
    const subjectId = await this.addSubject(db, activity.title);
    await db.runAsync(
      'INSERT OR IGNORE INTO study_activity_subjects(activity_id,subject_id,user_id) VALUES(?,?,?)',
      activity.id,
      subjectId,
      DEMO_USER_ID
    );
    return subjectId;
  },

  async getOpenStudySession(db: SQLiteDatabase): Promise<OpenStudySession | null> {
    return db.getFirstAsync<OpenStudySession>(
      `SELECT ss.*,s.name subject_name,sl.progress_id,sl.activity_id,asp.elapsed_seconds progress_elapsed_seconds,asp.target_seconds progress_target_seconds
       FROM study_sessions ss
       JOIN study_subjects s ON s.id=ss.subject_id
       LEFT JOIN study_session_links sl ON sl.session_id=ss.id
       LEFT JOIN activity_study_progress asp ON asp.id=sl.progress_id
       WHERE ss.user_id=? AND ss.ended_at IS NULL`,
      DEMO_USER_ID
    );
  },

  async startStudySession(
    db: SQLiteDatabase,
    subjectId: string,
    topic: string,
    objective: string,
    mode: string,
    targetSeconds: number | null,
    activityId?: string,
    contentId?: string,
    subactivityId?: string,
    progressId?: string
  ): Promise<string> {
    const id = Crypto.randomUUID();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO study_sessions(id,user_id,subject_id,topic,objective,mode,target_seconds,started_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        id,
        DEMO_USER_ID,
        subjectId,
        topic.trim(),
        objective.trim(),
        mode,
        targetSeconds,
        nowIso()
      );
      await tx.runAsync(
        'INSERT INTO study_session_links(session_id,activity_id,content_id,subactivity_id,progress_id) VALUES(?,?,?,?,?)',
        id,
        activityId ?? null,
        contentId ?? null,
        subactivityId ?? null,
        progressId ?? null
      );
    });
    return id;
  },

  async startActivityExtraSession(
    db: SQLiteDatabase,
    activity: LinkableActivity,
    subactivity: ActivitySubactivity
  ): Promise<string> {
    const subjectId = await this.ensureStudySubjectForActivity(db, activity);
    return this.startStudySession(
      db,
      subjectId,
      subactivity.name,
      'Tiempo extra',
      'extra',
      null,
      activity.id,
      undefined,
      subactivity.id
    );
  },

  async addActivityExtraManual(
    db: SQLiteDatabase,
    activity: LinkableActivity,
    subactivity: ActivitySubactivity,
    minutes: number
  ): Promise<string> {
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('Indica un tiempo válido');
    const subjectId = await this.ensureStudySubjectForActivity(db, activity);
    const id = Crypto.randomUUID();
    const endedAt = nowIso();
    const startedAt = new Date(Date.now() - minutes * 60_000).toISOString();
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'INSERT INTO study_sessions(id,user_id,subject_id,topic,objective,mode,started_at,ended_at,elapsed_seconds,note) VALUES(?,?,?,?,?,?,?,?,?,?)',
        id,
        DEMO_USER_ID,
        subjectId,
        subactivity.name,
        'Tiempo extra',
        'manual',
        startedAt,
        endedAt,
        Math.round(minutes * 60),
        'Registro manual'
      );
      await tx.runAsync(
        'INSERT INTO study_session_links(session_id,activity_id,content_id,subactivity_id) VALUES(?,?,?,?)',
        id,
        activity.id,
        null,
        subactivity.id
      );
    });
    return id;
  },

  async listActivityStudyProgress(db: SQLiteDatabase, activityId: string): Promise<ActivityStudyProgress[]> {
    return db.getAllAsync<ActivityStudyProgress>(
      `SELECT asp.id,asp.subactivity_id,sa.name subactivity_name,asp.section_name,asp.target_seconds,asp.elapsed_seconds,asp.status,asp.updated_at
       FROM activity_study_progress asp
       JOIN activity_subactivities sa ON sa.id=asp.subactivity_id
       WHERE asp.activity_id=? AND asp.status<>'cancelled'
       ORDER BY asp.updated_at DESC`,
      activityId
    );
  },

  async startOrResumeActivityProgress(
    db: SQLiteDatabase,
    activity: LinkableActivity,
    subactivity: ActivitySubactivity,
    sectionName: string,
    targetMinutes?: number
  ): Promise<string> {
    const cleanSection = sectionName.trim() || subactivity.name;
    const subjectId = await this.ensureStudySubjectForActivity(db, activity);
    const timestamp = nowIso();
    let progressId = '';
    let remainingSeconds: number | null = null;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const existing = await tx.getFirstAsync<{
        id: string;
        target_seconds: number | null;
        elapsed_seconds: number;
        status: string;
      }>(
        `SELECT id,target_seconds,elapsed_seconds,status FROM activity_study_progress
         WHERE activity_id=? AND subactivity_id=? AND section_name=? AND status IN('paused','in_progress')
         ORDER BY updated_at DESC LIMIT 1`,
        activity.id,
        subactivity.id,
        cleanSection
      );
      if (existing) {
        progressId = existing.id;
        remainingSeconds =
          existing.target_seconds === null
            ? null
            : Math.max(0, existing.target_seconds - existing.elapsed_seconds);
        await tx.runAsync(
          "UPDATE activity_study_progress SET status='in_progress',updated_at=? WHERE id=?",
          timestamp,
          progressId
        );
      } else {
        progressId = Crypto.randomUUID();
        const target = targetMinutes && targetMinutes > 0 ? Math.round(targetMinutes * 60) : null;
        remainingSeconds = target;
        await tx.runAsync(
          `INSERT INTO activity_study_progress(id,user_id,activity_id,subactivity_id,section_name,target_seconds,elapsed_seconds,status,created_at,updated_at)
           VALUES(?,?,?,?,?,?,0,'in_progress',?,?)`,
          progressId,
          DEMO_USER_ID,
          activity.id,
          subactivity.id,
          cleanSection,
          target,
          timestamp,
          timestamp
        );
      }
    });
    return this.startStudySession(
      db,
      subjectId,
      cleanSection || subactivity.name,
      'Progreso de estudio',
      'persistent',
      remainingSeconds,
      activity.id,
      undefined,
      subactivity.id,
      progressId
    );
  },

  async interruptStudySession(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync('UPDATE study_sessions SET interruptions=interruptions+1 WHERE id=?', id);
  },

  async stopStudySession(db: SQLiteDatabase, id: string, note = ''): Promise<void> {
    const row = await db.getFirstAsync<{ started_at: string }>(
      'SELECT started_at FROM study_sessions WHERE id=?',
      id
    );
    if (!row) return;
    const end = new Date();
    await db.withExclusiveTransactionAsync(async (tx) => {
      const elapsed = Math.round((end.getTime() - new Date(row.started_at).getTime()) / 1000);
      await tx.runAsync(
        'UPDATE study_sessions SET ended_at=?,elapsed_seconds=?,note=? WHERE id=?',
        end.toISOString(),
        elapsed,
        note,
        id
      );
      const progress = await tx.getFirstAsync<{ progress_id: string }>(
        'SELECT progress_id FROM study_session_links WHERE session_id=? AND progress_id IS NOT NULL',
        id
      );
      if (progress?.progress_id) {
        const total = await tx.getFirstAsync<{ seconds: number }>(
          'SELECT COALESCE(SUM(ss.elapsed_seconds),0) seconds FROM study_session_links sl JOIN study_sessions ss ON ss.id=sl.session_id WHERE sl.progress_id=? AND ss.ended_at IS NOT NULL',
          progress.progress_id
        );
        const target = await tx.getFirstAsync<{ target_seconds: number | null }>(
          'SELECT target_seconds FROM activity_study_progress WHERE id=?',
          progress.progress_id
        );
        const done = total?.seconds ?? 0;
        const completed = target?.target_seconds !== null && done >= target!.target_seconds;
        await tx.runAsync(
          'UPDATE activity_study_progress SET elapsed_seconds=?,status=?,updated_at=?,completed_at=? WHERE id=?',
          done,
          completed ? 'completed' : 'paused',
          end.toISOString(),
          completed ? end.toISOString() : null,
          progress.progress_id
        );
      }
      const request = await tx.getFirstAsync<{ id: string; duration_minutes: number }>(
        'SELECT sr.id,sr.duration_minutes FROM study_requests sr JOIN study_request_sessions srs ON srs.request_id=sr.id WHERE srs.session_id=?',
        id
      );
      if (request) {
        const total = await tx.getFirstAsync<{ seconds: number }>(
          'SELECT COALESCE(SUM(ss.elapsed_seconds),0) seconds FROM study_request_sessions srs JOIN study_sessions ss ON ss.id=srs.session_id WHERE srs.request_id=?',
          request.id
        );
        await tx.runAsync(
          'UPDATE study_requests SET status=?,session_id=NULL,updated_at=? WHERE id=?',
          (total?.seconds ?? 0) >= request.duration_minutes * 60 ? 'completed' : 'pending',
          end.toISOString(),
          request.id
        );
      }
    });
  },

  async finishStudySession(db: SQLiteDatabase, id: string, note = ''): Promise<void> {
    await this.stopStudySession(db, id, note);
    await db.withExclusiveTransactionAsync(async (tx) => {
      const request = await tx.getFirstAsync<{ id: string; duration_minutes: number }>(
        'SELECT sr.id,sr.duration_minutes FROM study_requests sr JOIN study_request_sessions srs ON srs.request_id=sr.id WHERE srs.session_id=?',
        id
      );
      if (!request) return;
      const total = await tx.getFirstAsync<{ seconds: number }>(
        'SELECT COALESCE(SUM(ss.elapsed_seconds),0) seconds FROM study_request_sessions srs JOIN study_sessions ss ON ss.id=srs.session_id WHERE srs.request_id=?',
        request.id
      );
      await tx.runAsync(
        'UPDATE study_requests SET status=?,session_id=NULL,updated_at=? WHERE id=?',
        (total?.seconds ?? 0) >= request.duration_minutes * 60 ? 'completed' : 'pending',
        nowIso(),
        request.id
      );
    });
  },

  async getStudyTimeReport(db: SQLiteDatabase, days = 7): Promise<StudyTimeReport[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
    return db.getAllAsync<StudyTimeReport>(
      `SELECT COALESCE(a.title,s.name) name,CAST(COALESCE(SUM(ss.elapsed_seconds),0)/60 AS INTEGER) minutes,COUNT(ss.id) sessions
       FROM study_sessions ss
       JOIN study_subjects s ON s.id=ss.subject_id
       LEFT JOIN study_session_links sl ON sl.session_id=ss.id
       LEFT JOIN activities a ON a.id=sl.activity_id
       WHERE ss.user_id=? AND ss.started_at>=? AND ss.ended_at IS NOT NULL
       GROUP BY COALESCE(a.title,s.name) ORDER BY minutes DESC`,
      DEMO_USER_ID,
      since
    );
  },

  async getStudyActivityStats(db: SQLiteDatabase, activityId: string): Promise<StudyActivityStats> {
    const now = new Date();
    const week = new Date(now);
    week.setDate(now.getDate() - 6);
    week.setHours(0, 0, 0, 0);
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    const row = await db.getFirstAsync<StudyActivityStats>(
      `SELECT CAST(COALESCE(SUM(CASE WHEN ss.started_at>=? THEN ss.elapsed_seconds ELSE 0 END),0)/60 AS INTEGER) week_minutes,
              CAST(COALESCE(SUM(CASE WHEN ss.started_at>=? THEN ss.elapsed_seconds ELSE 0 END),0)/60 AS INTEGER) month_minutes,
              CAST(COALESCE(SUM(ss.elapsed_seconds),0)/60 AS INTEGER) total_minutes,
              COUNT(ss.id) sessions
       FROM study_sessions ss
       JOIN study_session_links sl ON sl.session_id=ss.id
       WHERE sl.activity_id=? AND ss.ended_at IS NOT NULL`,
      week.toISOString(),
      month.toISOString(),
      activityId
    );
    return row ?? { week_minutes: 0, month_minutes: 0, total_minutes: 0, sessions: 0 };
  },

  async getActivityExtraSummary(db: SQLiteDatabase, activityId: string): Promise<ActivityExtraSummary[]> {
    return db.getAllAsync<ActivityExtraSummary>(
      `SELECT COALESCE(sa.name,ss.topic,'Tiempo extra') name,
              CAST(COALESCE(SUM(ss.elapsed_seconds),0)/60 AS INTEGER) minutes,
              COUNT(ss.id) sessions
       FROM study_sessions ss
       JOIN study_session_links sl ON sl.session_id=ss.id
       LEFT JOIN activity_subactivities sa ON sa.id=sl.subactivity_id
       WHERE sl.activity_id=? AND ss.ended_at IS NOT NULL
       GROUP BY COALESCE(sa.name,ss.topic,'Tiempo extra') ORDER BY minutes DESC`,
      activityId
    );
  },

  async getScheduledClassMinutes(db: SQLiteDatabase, activityId: string): Promise<number> {
    const row = await db.getFirstAsync<{ minutes: number }>(
      'SELECT CAST(COALESCE(SUM((julianday(ends_at)-julianday(starts_at))*1440),0) AS INTEGER) minutes FROM planned_blocks WHERE activity_id=? AND deleted_at IS NULL AND id IN(SELECT block_id FROM schedule_occurrences)',
      activityId
    );
    return row?.minutes ?? 0;
  },

  async listRecentStudySessions(db: SQLiteDatabase, activityId: string): Promise<RecentStudySession[]> {
    return db.getAllAsync<RecentStudySession>(
      `SELECT ss.id,ss.topic,ss.started_at,ss.elapsed_seconds
       FROM study_sessions ss
       JOIN study_session_links sl ON sl.session_id=ss.id
       WHERE sl.activity_id=? AND ss.ended_at IS NOT NULL
       ORDER BY ss.started_at DESC LIMIT 8`,
      activityId
    );
  },

  async getTopicDedicationSummary(
    db: SQLiteDatabase,
    activityId: string
  ): Promise<TopicDedication[]> {
    return db.getAllAsync<TopicDedication>(
      `SELECT 
         COALESCE(NULLIF(TRIM(ss.topic), ''), sa.name, 'Estudio general') AS topic,
         CAST(COALESCE(SUM(ss.elapsed_seconds), 0) / 60 AS INTEGER) AS totalMinutes,
         COUNT(ss.id) AS sessionsCount,
         COALESCE(SUM(ss.interruptions), 0) AS totalInterruptions,
         MAX(ss.started_at) AS lastStudiedAt
       FROM study_sessions ss
       JOIN study_session_links sl ON sl.session_id = ss.id
       LEFT JOIN activity_subactivities sa ON sa.id = sl.subactivity_id
       WHERE sl.activity_id = ? AND ss.ended_at IS NOT NULL
       GROUP BY COALESCE(NULLIF(TRIM(ss.topic), ''), sa.name, 'Estudio general')
       ORDER BY totalMinutes DESC`,
      activityId
    );
  },

  async listActivityStudySessions(
    db: SQLiteDatabase,
    activityId: string
  ): Promise<DetailedStudySession[]> {
    return db.getAllAsync<DetailedStudySession>(
      `SELECT 
         ss.id,
         COALESCE(NULLIF(TRIM(ss.topic), ''), sa.name, 'Estudio general') AS topic,
         ss.started_at,
         ss.ended_at,
         COALESCE(ss.elapsed_seconds, 0) AS elapsed_seconds,
         COALESCE(ss.interruptions, 0) AS interruptions,
         ss.note,
         ss.mode
       FROM study_sessions ss
       JOIN study_session_links sl ON sl.session_id = ss.id
       LEFT JOIN activity_subactivities sa ON sa.id = sl.subactivity_id
       WHERE sl.activity_id = ? AND ss.ended_at IS NOT NULL
       ORDER BY ss.started_at DESC`,
      activityId
    );
  },

  async createManualStudySession(
    db: SQLiteDatabase,
    input: CreateStudySessionInput
  ): Promise<string> {
    const { activityId, topic, minutes, interruptions = 0, note = '', date } = input;
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error('Indica un tiempo válido en minutos');
    }
    const activity = await db.getFirstAsync<{ id: string; title: string }>(
      'SELECT id, title FROM activities WHERE id=?',
      activityId
    );
    if (!activity) throw new Error('Actividad no encontrada');
    const subjectId = await this.ensureStudySubjectForActivity(db, activity);
    const id = Crypto.randomUUID();
    const sessionDate = date ? new Date(date) : new Date();
    const endedAt = sessionDate.toISOString();
    const startedAt = new Date(sessionDate.getTime() - minutes * 60_000).toISOString();
    const cleanTopic = topic.trim() || 'Estudio general';

    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        `INSERT INTO study_sessions(id,user_id,subject_id,topic,objective,mode,started_at,ended_at,elapsed_seconds,interruptions,note)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        DEMO_USER_ID,
        subjectId,
        cleanTopic,
        'Registro manual',
        'manual',
        startedAt,
        endedAt,
        Math.round(minutes * 60),
        interruptions,
        note.trim()
      );
      await tx.runAsync(
        'INSERT INTO study_session_links(session_id,activity_id,content_id,subactivity_id) VALUES(?,?,?,?)',
        id,
        activityId,
        null,
        null
      );
    });
    return id;
  },

  async updateStudySession(
    db: SQLiteDatabase,
    input: UpdateStudySessionInput
  ): Promise<void> {
    const { id, topic, minutes, interruptions, note } = input;
    const updates: string[] = [];
    const params: any[] = [];
    if (topic !== undefined) {
      updates.push('topic=?');
      params.push(topic.trim() || 'Estudio general');
    }
    if (minutes !== undefined && Number.isFinite(minutes) && minutes > 0) {
      updates.push('elapsed_seconds=?');
      params.push(Math.round(minutes * 60));
    }
    if (interruptions !== undefined) {
      updates.push('interruptions=?');
      params.push(Math.max(0, interruptions));
    }
    if (note !== undefined) {
      updates.push('note=?');
      params.push(note.trim());
    }
    if (updates.length === 0) return;
    params.push(id);
    await db.runAsync(`UPDATE study_sessions SET ${updates.join(', ')} WHERE id=?`, ...params);
  },

  async deleteStudySession(db: SQLiteDatabase, sessionId: string): Promise<void> {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('DELETE FROM study_request_sessions WHERE session_id=?', sessionId);
      await tx.runAsync('DELETE FROM study_session_links WHERE session_id=?', sessionId);
      await tx.runAsync('DELETE FROM study_sessions WHERE id=?', sessionId);
    });
  },

  async getAllTopicDedications(db: SQLiteDatabase): Promise<GlobalTopicDedication[]> {
    return db.getAllAsync<GlobalTopicDedication>(
      `SELECT 
        COALESCE(a.id, 'unlinked') as activity_id,
        COALESCE(a.title, s.name, 'Estudio general') as activity_title,
        COALESCE(NULLIF(TRIM(ss.topic), ''), 'Estudio general') as topic,
        CAST(COALESCE(SUM(ss.elapsed_seconds), 0) / 60 AS INTEGER) as total_minutes,
        COUNT(ss.id) as total_sessions,
        COALESCE(SUM(ss.interruptions), 0) as total_interruptions,
        MAX(ss.started_at) as last_studied_at
       FROM study_sessions ss
       JOIN study_subjects s ON s.id = ss.subject_id
       LEFT JOIN study_session_links sl ON sl.session_id = ss.id
       LEFT JOIN activities a ON a.id = sl.activity_id
       WHERE ss.ended_at IS NOT NULL
       GROUP BY activity_id, activity_title, topic
       ORDER BY total_minutes DESC`
    );
  },
};
