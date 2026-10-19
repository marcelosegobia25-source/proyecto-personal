import type { SQLiteDatabase } from 'expo-sqlite';
import { DEMO_USER_ID, nowIso } from './types';
import { resetAndSeedRequestedSchedule } from './seed';

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DROP TRIGGER IF EXISTS audit_location_rule_update;
    DROP TRIGGER IF EXISTS prevent_invalid_place_insert;
    DROP TRIGGER IF EXISTS prevent_invalid_place_update;
    DROP TABLE IF EXISTS automated_expenses;
    DROP TABLE IF EXISTS activity_commute_charges;
    DROP TABLE IF EXISTS activity_commute_settings;
    DROP TABLE IF EXISTS activity_locations;
    DROP TABLE IF EXISTS block_arrivals;
    DROP TABLE IF EXISTS place_events;
    DROP TABLE IF EXISTS location_automation_rules;
    DROP TABLE IF EXISTS location_state;
    DROP TABLE IF EXISTS places;
  `);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, timezone TEXT NOT NULL, currency_code TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_categories (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, color TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category_id TEXT REFERENCES activity_categories(id),
      title TEXT NOT NULL, default_duration_minutes INTEGER NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS flexible_activities (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, activity_id TEXT NOT NULL REFERENCES activities(id),
      description TEXT NOT NULL DEFAULT '', duration_minutes INTEGER NOT NULL CHECK(duration_minutes>0), kind TEXT NOT NULL DEFAULT 'general',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS activity_details (
      activity_id TEXT PRIMARY KEY REFERENCES activities(id), description TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS planned_blocks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, activity_id TEXT NOT NULL REFERENCES activities(id),
      starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned',
      local_notification_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
      CHECK (ends_at > starts_at)
    );
    CREATE TABLE IF NOT EXISTS time_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, activity_id TEXT NOT NULL REFERENCES activities(id),
      planned_block_id TEXT REFERENCES planned_blocks(id), started_at TEXT NOT NULL, ended_at TEXT,
      elapsed_seconds INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_session_per_user
      ON time_sessions(user_id) WHERE ended_at IS NULL AND deleted_at IS NULL;
    CREATE TABLE IF NOT EXISTS activity_verifications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, planned_block_id TEXT NOT NULL UNIQUE REFERENCES planned_blocks(id),
      result TEXT NOT NULL, completion_percent INTEGER NOT NULL, reason TEXT, actual_end_at TEXT,
      shortened_minutes INTEGER NOT NULL DEFAULT 0, verified_at TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, currency_code TEXT NOT NULL,
      opening_balance REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS financial_categories (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, color TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id),
      category_id TEXT REFERENCES financial_categories(id), kind TEXT NOT NULL, amount REAL NOT NULL CHECK(amount > 0),
      currency_code TEXT NOT NULL, occurred_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, planned_block_id TEXT REFERENCES planned_blocks(id),
      remind_at TEXT NOT NULL, title TEXT NOT NULL, local_notification_id TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_popup_dismissals (
      block_id TEXT PRIMARY KEY REFERENCES planned_blocks(id), user_id TEXT NOT NULL, dismissed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_schedules (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, activity_id TEXT NOT NULL REFERENCES activities(id),
      recurrence TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL,
      local_start_time TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS schedule_occurrences (
      schedule_id TEXT NOT NULL REFERENCES activity_schedules(id),
      block_id TEXT NOT NULL UNIQUE REFERENCES planned_blocks(id), PRIMARY KEY(schedule_id,block_id)
    );
    CREATE TABLE IF NOT EXISTS schedule_rules (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,schedule_id TEXT NOT NULL REFERENCES activity_schedules(id),
      weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),local_start_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL CHECK(duration_minutes>0),preparation_minutes INTEGER NOT NULL DEFAULT 0 CHECK(preparation_minutes>=0),
      travel_out_minutes INTEGER NOT NULL DEFAULT 0 CHECK(travel_out_minutes>=0),buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK(buffer_minutes>=0),
      travel_return_minutes INTEGER NOT NULL DEFAULT 0 CHECK(travel_return_minutes>=0),UNIQUE(schedule_id,weekday)
    );
    CREATE TABLE IF NOT EXISTS schedule_exceptions (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,schedule_id TEXT NOT NULL REFERENCES activity_schedules(id),block_id TEXT REFERENCES planned_blocks(id),
      occurrence_date TEXT NOT NULL,action TEXT NOT NULL CHECK(action IN('modified','excluded')),
      starts_at TEXT,ends_at TEXT,preparation_minutes INTEGER,travel_out_minutes INTEGER,buffer_minutes INTEGER,travel_return_minutes INTEGER,
      created_at TEXT NOT NULL,UNIQUE(schedule_id,occurrence_date)
    );
    CREATE TABLE IF NOT EXISTS activity_options (
      activity_id TEXT PRIMARY KEY REFERENCES activities(id),priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','critical')),
      is_paused INTEGER NOT NULL DEFAULT 0,color TEXT NOT NULL DEFAULT '#2563EB',focus_mode INTEGER NOT NULL DEFAULT 0,deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS app_preferences (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auxiliary_blocks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, parent_block_id TEXT NOT NULL REFERENCES planned_blocks(id),
      block_id TEXT NOT NULL UNIQUE REFERENCES planned_blocks(id), role TEXT NOT NULL CHECK(role IN('preparation','travel','buffer','return'))
    );
    CREATE TABLE IF NOT EXISTS recovery_links (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, original_block_id TEXT NOT NULL REFERENCES planned_blocks(id),
      recovery_block_id TEXT NOT NULL UNIQUE REFERENCES planned_blocks(id), minutes_pending INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS progress_entries (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, activity_id TEXT NOT NULL REFERENCES activities(id),
      planned_block_id TEXT REFERENCES planned_blocks(id), topic TEXT, pages_from INTEGER, pages_to INTEGER,
      exercises_done INTEGER, exercises_correct INTEGER, concentration INTEGER, difficulty TEXT,
      next_step TEXT, note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS study_subjects (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#3157D5',
      created_at TEXT NOT NULL, UNIQUE(user_id,name)
    );
    CREATE TABLE IF NOT EXISTS study_contents (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES study_subjects(id),
      title TEXT NOT NULL CHECK(length(trim(title))>0), description TEXT NOT NULL DEFAULT '',
      material_reference TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL CHECK(position>0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','in_progress','completed')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(subject_id,position)
    );
    CREATE TABLE IF NOT EXISTS study_plans (
      subject_id TEXT PRIMARY KEY REFERENCES study_subjects(id),user_id TEXT NOT NULL,
      weekly_target_minutes INTEGER NOT NULL CHECK(weekly_target_minutes>0),session_minutes INTEGER NOT NULL CHECK(session_minutes>0),updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS study_activity_targets (
      subject_id TEXT NOT NULL REFERENCES study_subjects(id),activity_id TEXT NOT NULL REFERENCES activities(id),user_id TEXT NOT NULL,
      weekly_target_minutes INTEGER NOT NULL CHECK(weekly_target_minutes>0),created_at TEXT NOT NULL,PRIMARY KEY(subject_id,activity_id)
    );
    CREATE TABLE IF NOT EXISTS study_activity_subjects (
      activity_id TEXT PRIMARY KEY REFERENCES activities(id),subject_id TEXT NOT NULL UNIQUE REFERENCES study_subjects(id),user_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_subactivities (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK(length(trim(name))>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted_at TEXT, UNIQUE(activity_id,name)
    );
    CREATE TABLE IF NOT EXISTS activity_study_progress (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      subactivity_id TEXT NOT NULL REFERENCES activity_subactivities(id), section_name TEXT NOT NULL DEFAULT '',
      target_seconds INTEGER, elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_seconds>=0),
      status TEXT NOT NULL DEFAULT 'paused' CHECK(status IN('paused','in_progress','completed','cancelled')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES study_subjects(id),
      topic TEXT, objective TEXT, mode TEXT NOT NULL, target_seconds INTEGER, started_at TEXT NOT NULL,
      ended_at TEXT, elapsed_seconds INTEGER, interruptions INTEGER NOT NULL DEFAULT 0, note TEXT
    );
    CREATE TABLE IF NOT EXISTS study_session_links (
      session_id TEXT PRIMARY KEY REFERENCES study_sessions(id),activity_id TEXT REFERENCES activities(id),content_id TEXT REFERENCES study_contents(id),
      subactivity_id TEXT REFERENCES activity_subactivities(id), progress_id TEXT REFERENCES activity_study_progress(id)
    );
    CREATE TABLE IF NOT EXISTS study_requests (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,activity_id TEXT NOT NULL REFERENCES activities(id),subject_id TEXT NOT NULL REFERENCES study_subjects(id),
      content_id TEXT REFERENCES study_contents(id),topic TEXT NOT NULL CHECK(length(trim(topic))>0),objective TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL CHECK(duration_minutes>0),preferred_date TEXT,preferred_time TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','scheduled','in_progress','completed','cancelled')),
      planned_block_id TEXT REFERENCES planned_blocks(id),session_id TEXT REFERENCES study_sessions(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS study_request_sessions (
      request_id TEXT NOT NULL REFERENCES study_requests(id),session_id TEXT NOT NULL UNIQUE REFERENCES study_sessions(id),PRIMARY KEY(request_id,session_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_study_session ON study_sessions(user_id) WHERE ended_at IS NULL;
    CREATE TRIGGER IF NOT EXISTS prevent_parallel_activity_timer BEFORE INSERT ON time_sessions
    WHEN NEW.ended_at IS NULL AND EXISTS(SELECT 1 FROM study_sessions WHERE user_id=NEW.user_id AND ended_at IS NULL)
    BEGIN SELECT RAISE(ABORT,'Ya existe un cronómetro de estudio activo'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_parallel_study_timer BEFORE INSERT ON study_sessions
    WHEN NEW.ended_at IS NULL AND EXISTS(SELECT 1 FROM time_sessions WHERE user_id=NEW.user_id AND ended_at IS NULL AND deleted_at IS NULL)
    BEGIN SELECT RAISE(ABORT,'Ya existe un cronómetro de actividad activo'); END;
    CREATE TABLE IF NOT EXISTS expense_definitions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, amount REAL NOT NULL CHECK(amount>0),
      category_id TEXT NOT NULL REFERENCES financial_categories(id), account_id TEXT NOT NULL REFERENCES accounts(id),
      recurrence TEXT NOT NULL DEFAULT 'manual', is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, UNIQUE(user_id,name)
    );
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,category_id TEXT NOT NULL REFERENCES financial_categories(id),
      period_start TEXT NOT NULL,period_end TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>0),currency_code TEXT NOT NULL,
      UNIQUE(user_id,category_id,period_start,period_end)
    );
    CREATE TABLE IF NOT EXISTS sync_outbox (
      operation_id TEXT PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, operation TEXT NOT NULL,
      payload TEXT NOT NULL, base_version INTEGER, retry_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS change_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,entity TEXT NOT NULL,entity_id TEXT NOT NULL,operation TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,old_version INTEGER,new_version INTEGER
    );
    CREATE TRIGGER IF NOT EXISTS audit_activity_update AFTER UPDATE ON activities
    BEGIN INSERT INTO change_audit(entity,entity_id,operation,old_version,new_version) VALUES('activities',OLD.id,'update',OLD.version,NEW.version); END;
    CREATE TRIGGER IF NOT EXISTS audit_planned_block_update AFTER UPDATE ON planned_blocks
    BEGIN INSERT INTO change_audit(entity,entity_id,operation,old_version,new_version) VALUES('planned_blocks',OLD.id,'update',OLD.version,NEW.version); END;
    CREATE TRIGGER IF NOT EXISTS prevent_invalid_block_update BEFORE UPDATE OF starts_at,ends_at ON planned_blocks
    WHEN NEW.ends_at<=NEW.starts_at BEGIN SELECT RAISE(ABORT,'La hora final debe ser posterior a la inicial'); END;
    CREATE TRIGGER IF NOT EXISTS prevent_negative_schedule_rule_update BEFORE UPDATE ON schedule_rules
    WHEN NEW.duration_minutes<=0 OR NEW.preparation_minutes<0 OR NEW.travel_out_minutes<0 OR NEW.buffer_minutes<0 OR NEW.travel_return_minutes<0
    BEGIN SELECT RAISE(ABORT,'Los tiempos de la regla no pueden ser negativos'); END;
  `);

  try {
    await db.execAsync('ALTER TABLE activity_verifications ADD COLUMN actual_end_at TEXT');
  } catch {
    /* ya existe */
  }
  try {
    await db.execAsync('ALTER TABLE activity_verifications ADD COLUMN shortened_minutes INTEGER NOT NULL DEFAULT 0');
  } catch {
    /* ya existe */
  }

  // Las versiones previas materializaban preparación y margen como bloques.
  const migrationTime = nowIso();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const travels = await tx.getAllAsync<{ travel_id: string; parent_start: string; minutes: number }>(
      `SELECT travel.id travel_id,parent.starts_at parent_start,ROUND((julianday(travel.ends_at)-julianday(travel.starts_at))*1440) minutes
       FROM auxiliary_blocks ab JOIN planned_blocks travel ON travel.id=ab.block_id
       JOIN planned_blocks parent ON parent.id=ab.parent_block_id
       WHERE ab.role='travel' AND travel.deleted_at IS NULL AND travel.ends_at<>parent.starts_at`
    );
    for (const travel of travels) {
      const end = new Date(travel.parent_start);
      const start = new Date(end.getTime() - Math.max(0, travel.minutes) * 60_000);
      await tx.runAsync(
        'UPDATE planned_blocks SET starts_at=?,ends_at=?,updated_at=?,version=version+1 WHERE id=?',
        start.toISOString(),
        end.toISOString(),
        migrationTime,
        travel.travel_id
      );
    }
    await tx.runAsync(
      `UPDATE planned_blocks SET deleted_at=COALESCE(deleted_at,?),updated_at=?
       WHERE id IN(SELECT block_id FROM auxiliary_blocks WHERE role IN('preparation','buffer'))`,
      migrationTime,
      migrationTime
    );
  });

  const linkColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(study_session_links)');
  if (!linkColumns.some((column) => column.name === 'subactivity_id')) {
    await db.execAsync(
      'ALTER TABLE study_session_links ADD COLUMN subactivity_id TEXT REFERENCES activity_subactivities(id)'
    );
  }
  if (!linkColumns.some((column) => column.name === 'progress_id')) {
    await db.execAsync(
      'ALTER TABLE study_session_links ADD COLUMN progress_id TEXT REFERENCES activity_study_progress(id)'
    );
  }
  const optionColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(activity_options)');
  if (!optionColumns.some((column) => column.name === 'color')) {
    await db.execAsync("ALTER TABLE activity_options ADD COLUMN color TEXT NOT NULL DEFAULT '#2563EB'");
  }
  if (!optionColumns.some((column) => column.name === 'focus_mode')) {
    await db.execAsync('ALTER TABLE activity_options ADD COLUMN focus_mode INTEGER NOT NULL DEFAULT 0');
  }

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      'INSERT OR IGNORE INTO profiles VALUES (?, ?, ?, ?)',
      DEMO_USER_ID,
      'Usuario local',
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/La_Paz',
      'BOB'
    );
    await tx.runAsync(
      'INSERT OR IGNORE INTO activity_categories VALUES (?, ?, ?, ?, ?)',
      '20000000-0000-0000-0000-000000000001',
      DEMO_USER_ID,
      'Estudio',
      'study',
      '#2563EB'
    );
    await tx.runAsync(
      'INSERT OR IGNORE INTO accounts VALUES (?, ?, ?, ?, ?, ?, ?)',
      '80000000-0000-0000-0000-000000000001',
      DEMO_USER_ID,
      'Efectivo',
      'BOB',
      0,
      nowIso(),
      nowIso()
    );
    await tx.runAsync(
      'INSERT OR IGNORE INTO financial_categories VALUES (?, ?, ?, ?, ?)',
      '90000000-0000-0000-0000-000000000001',
      DEMO_USER_ID,
      'Alimentación',
      'expense',
      '#F97316'
    );
    const expenseCategories = [
      ['90000000-0000-0000-0000-000000000011', 'Desayuno', '#F59E0B'],
      ['90000000-0000-0000-0000-000000000012', 'Almuerzo', '#F97316'],
      ['90000000-0000-0000-0000-000000000013', 'Cena', '#8B5CF6'],
      ['90000000-0000-0000-0000-000000000014', 'Otro', '#64748B'],
    ];
    for (const [id, name, color] of expenseCategories) {
      await tx.runAsync(
        'INSERT OR IGNORE INTO financial_categories VALUES (?, ?, ?, ?, ?)',
        id,
        DEMO_USER_ID,
        name,
        'expense',
        color
      );
    }
  });

  await resetAndSeedRequestedSchedule(db);
}
