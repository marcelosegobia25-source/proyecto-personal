import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export const DEMO_USER_ID = '10000000-0000-0000-0000-000000000001';

export type BlockStatus = 'planned'|'late'|'in_progress'|'paused'|'completed'|'partial'|'skipped'|'rescheduled'|'cancelled';

export type PlannedBlock = {
  id: string;
  activity_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: BlockStatus;
  elapsed_seconds: number | null;
  active_started_at: string | null;
  scheduled_ends_at?: string;
  shortened_minutes?: number;
  priority?: 'low'|'normal'|'high'|'critical';
  kind?: 'activity'|'travel'|'preparation'|'buffer'|'return'|'meal';
  color?: string;
};

export type DailyReport = {
  planned_count: number;
  performed_count: number;
  planned_minutes: number;
  actual_minutes: number;
  adherence_percent: number;
};

const nowIso = () => new Date().toISOString();

export async function migrateDatabase(db: SQLiteDatabase) {
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
      period_start TEXT NOT NULL,period_end TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>0),currency_code TEXT NOT NULL
      ,UNIQUE(user_id,category_id,period_start,period_end)
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
  try { await db.execAsync('ALTER TABLE activity_verifications ADD COLUMN actual_end_at TEXT'); } catch { /* ya existe */ }
  try { await db.execAsync('ALTER TABLE activity_verifications ADD COLUMN shortened_minutes INTEGER NOT NULL DEFAULT 0'); } catch { /* ya existe */ }
  // Las versiones previas materializaban preparación y margen como bloques.
  const migrationTime=nowIso();
  await db.withExclusiveTransactionAsync(async tx=>{
    const travels=await tx.getAllAsync<{travel_id:string;parent_start:string;minutes:number}>(`SELECT travel.id travel_id,parent.starts_at parent_start,ROUND((julianday(travel.ends_at)-julianday(travel.starts_at))*1440) minutes FROM auxiliary_blocks ab JOIN planned_blocks travel ON travel.id=ab.block_id JOIN planned_blocks parent ON parent.id=ab.parent_block_id WHERE ab.role='travel' AND travel.deleted_at IS NULL AND travel.ends_at<>parent.starts_at`);
    for(const travel of travels){const end=new Date(travel.parent_start),start=new Date(end.getTime()-Math.max(0,travel.minutes)*60_000);await tx.runAsync('UPDATE planned_blocks SET starts_at=?,ends_at=?,updated_at=?,version=version+1 WHERE id=?',start.toISOString(),end.toISOString(),migrationTime,travel.travel_id)}
    await tx.runAsync(`UPDATE planned_blocks SET deleted_at=COALESCE(deleted_at,?),updated_at=? WHERE id IN(SELECT block_id FROM auxiliary_blocks WHERE role IN('preparation','buffer'))`,migrationTime,migrationTime);
  });

  // Bases creadas antes de este cambio no tienen la columna; la migración es aditiva y conserva el historial.
  const linkColumns = await db.getAllAsync<{name:string}>('PRAGMA table_info(study_session_links)');
  if (!linkColumns.some(column => column.name === 'subactivity_id')) {
    await db.execAsync('ALTER TABLE study_session_links ADD COLUMN subactivity_id TEXT REFERENCES activity_subactivities(id)');
  }
  if (!linkColumns.some(column => column.name === 'progress_id')) {
    await db.execAsync('ALTER TABLE study_session_links ADD COLUMN progress_id TEXT REFERENCES activity_study_progress(id)');
  }
  const optionColumns=await db.getAllAsync<{name:string}>('PRAGMA table_info(activity_options)');
  if(!optionColumns.some(column=>column.name==='color')) await db.execAsync("ALTER TABLE activity_options ADD COLUMN color TEXT NOT NULL DEFAULT '#2563EB'");
  if(!optionColumns.some(column=>column.name==='focus_mode')) await db.execAsync("ALTER TABLE activity_options ADD COLUMN focus_mode INTEGER NOT NULL DEFAULT 0");

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      'INSERT OR IGNORE INTO profiles VALUES (?, ?, ?, ?)',
      DEMO_USER_ID, 'Usuario local', Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/La_Paz', 'BOB'
    );
    await tx.runAsync(
      'INSERT OR IGNORE INTO activity_categories VALUES (?, ?, ?, ?, ?)',
      '20000000-0000-0000-0000-000000000001', DEMO_USER_ID, 'Estudio', 'study', '#2563EB'
    );
    await tx.runAsync(
      'INSERT OR IGNORE INTO accounts VALUES (?, ?, ?, ?, ?, ?, ?)',
      '80000000-0000-0000-0000-000000000001', DEMO_USER_ID, 'Efectivo', 'BOB', 0, nowIso(), nowIso()
    );
    await tx.runAsync(
      'INSERT OR IGNORE INTO financial_categories VALUES (?, ?, ?, ?, ?)',
      '90000000-0000-0000-0000-000000000001', DEMO_USER_ID, 'Alimentación', 'expense', '#F97316'
    );
    const expenseCategories = [
      ['90000000-0000-0000-0000-000000000011', 'Desayuno', '#F59E0B'],
      ['90000000-0000-0000-0000-000000000012', 'Almuerzo', '#F97316'],
      ['90000000-0000-0000-0000-000000000013', 'Cena', '#8B5CF6'],
      ['90000000-0000-0000-0000-000000000014', 'Otro', '#64748B'],
    ];
    for (const [id, name, color] of expenseCategories) {
      await tx.runAsync('INSERT OR IGNORE INTO financial_categories VALUES (?, ?, ?, ?, ?)', id, DEMO_USER_ID, name, 'expense', color);
    }
  });
  await resetAndSeedRequestedSchedule(db);
}

const REQUESTED_SEED_VERSION='complete-demo-2026-09-v4';
async function resetAndSeedRequestedSchedule(db:SQLiteDatabase){
  const current=await db.getFirstAsync<{value:string}>('SELECT value FROM app_meta WHERE key=?','seed_version');
  if(current?.value===REQUESTED_SEED_VERSION)return;
  let seedStep='limpieza';
  try{await db.withExclusiveTransactionAsync(async tx=>{
    for(const table of ['change_audit','reminders','activity_popup_dismissals','schedule_exceptions','schedule_rules','schedule_occurrences','auxiliary_blocks','recovery_links','progress_entries','activity_verifications','time_sessions','study_request_sessions','study_requests','planned_blocks','activity_schedules','flexible_activities','activity_details','study_session_links','study_sessions','activity_study_progress','study_activity_targets','study_plans','study_activity_subjects','study_contents','study_subjects','activity_subactivities','expense_definitions','budgets','transactions','sync_outbox','activity_options','activities']) await tx.execAsync(`DELETE FROM ${table};`);
    seedStep='actividades';
    const timestamp=nowIso();
    const at=(dayOffset:number,hour:number,minute=0)=>{const value=new Date();value.setDate(value.getDate()+dayOffset);value.setHours(hour,minute,0,0);return value.toISOString()};
    const activities=[
      {id:'demo-activity-requisitos',title:'Ingeniería de Requisitos y Modelado',minutes:90,color:'#7C3AED'},
      {id:'demo-activity-programacion',title:'Programación II',minutes:120,color:'#16A34A'},
      {id:'demo-activity-bdatos',title:'Base de Datos II',minutes:90,color:'#0891B2'},
      {id:'demo-activity-estadistica',title:'Probabilidad y Estadística I',minutes:90,color:'#DC2626'},
    ];
    for(const activity of activities){
      await tx.runAsync(`INSERT INTO activities(id,user_id,category_id,title,default_duration_minutes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,activity.id,DEMO_USER_ID,'20000000-0000-0000-0000-000000000001',activity.title,activity.minutes,timestamp,timestamp);
      await tx.runAsync(`INSERT INTO activity_options(activity_id,priority,is_paused,color,focus_mode) VALUES(?,?,?,?,?)`,activity.id,activity.id==='demo-activity-requisitos'?'high':'normal',0,activity.color,activity.id==='demo-activity-programacion'?1:0);
      await tx.runAsync(`INSERT INTO activity_details(activity_id,description) VALUES(?,?)`,activity.id,`Registro de demostración para probar ${activity.title}.`);
      await tx.runAsync(`INSERT INTO activity_schedules(id,user_id,activity_id,recurrence,starts_on,ends_on,local_start_time,duration_minutes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,`demo-schedule-${activity.id}`,DEMO_USER_ID,activity.id,'weekly',at(-14,8).slice(0,10),at(30,8).slice(0,10),'08:00',activity.minutes,timestamp,timestamp);
    }
    const blocks=[
      ['req-1','demo-activity-requisitos',-6,8,90,'completed'],['req-2','demo-activity-requisitos',-4,8,90,'skipped'],['req-3','demo-activity-requisitos',-2,8,90,'partial'],['req-4','demo-activity-requisitos',0,8,90,'completed'],['req-5','demo-activity-requisitos',2,8,90,'planned'],
      ['pro-1','demo-activity-programacion',-5,14,120,'completed'],['pro-2','demo-activity-programacion',-3,14,120,'skipped'],['pro-3','demo-activity-programacion',0,11,120,'partial'],['pro-4','demo-activity-programacion',1,14,120,'planned'],
      ['bd-1','demo-activity-bdatos',-6,17,90,'completed'],['bd-2','demo-activity-bdatos',-1,17,90,'skipped'],['bd-3','demo-activity-bdatos',0,19,90,'planned'],['bd-4','demo-activity-bdatos',3,17,90,'planned'],
      ['est-1','demo-activity-estadistica',-5,19,90,'partial'],['est-2','demo-activity-estadistica',-3,19,90,'completed'],['est-3','demo-activity-estadistica',1,19,90,'planned'],
    ] as const;
    seedStep='ocurrencias';
    for(const [shortId,activityId,day,hour,minutes,status] of blocks){
      const id=`demo-block-${shortId}`,start=at(day,hour),end=new Date(new Date(start).getTime()+minutes*60_000).toISOString();
      await tx.runAsync(`INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,id,DEMO_USER_ID,activityId,start,end,status,timestamp,timestamp);
      await tx.runAsync(`INSERT INTO schedule_occurrences(schedule_id,block_id) VALUES(?,?)`,`demo-schedule-${activityId}`,id);
      if(status==='completed'||status==='partial'){
        const elapsed=status==='completed'?minutes:Math.round(minutes*.55);
        await tx.runAsync(`INSERT INTO activity_verifications(id,user_id,planned_block_id,result,completion_percent,reason,actual_end_at,shortened_minutes,verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,`demo-verification-${shortId}`,DEMO_USER_ID,id,status,status==='completed'?100:55,status==='partial'?'Se avanzó una parte del contenido':'Actividad realizada',new Date(new Date(start).getTime()+elapsed*60_000).toISOString(),status==='completed'?Math.max(0,minutes-elapsed):0,timestamp,timestamp,timestamp);
      }else if(status==='skipped'){
        await tx.runAsync(`INSERT INTO activity_verifications(id,user_id,planned_block_id,result,completion_percent,reason,actual_end_at,shortened_minutes,verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,`demo-verification-${shortId}`,DEMO_USER_ID,id,'skipped',0,'No se pudo asistir',null,0,timestamp,timestamp,timestamp);
      }
    }
    seedStep='progreso';
    await tx.runAsync(`INSERT INTO flexible_activities(id,user_id,activity_id,description,duration_minutes,kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,'demo-flex-1',DEMO_USER_ID,'demo-activity-programacion','Practicar ejercicios adicionales',45,'study',timestamp,timestamp);
    await tx.runAsync(`INSERT INTO progress_entries(id,user_id,activity_id,planned_block_id,topic,pages_from,pages_to,exercises_done,exercises_correct,concentration,difficulty,next_step,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,'demo-progress-1',DEMO_USER_ID,'demo-activity-programacion','demo-block-pro-1','Herencia y polimorfismo',20,38,12,10,4,'media','Repasar interfaces','Buen avance',timestamp,timestamp);
    seedStep='estudio';
    const subjectId='demo-subject-programacion',contentId='demo-content-poo',subactivityId='demo-subactivity-ejercicios';
    await tx.runAsync(`INSERT INTO study_subjects(id,user_id,name,color,created_at) VALUES(?,?,?,?,?)`,subjectId,DEMO_USER_ID,'Programación II','#16A34A',timestamp);
    await tx.runAsync(`INSERT INTO study_activity_subjects(activity_id,subject_id,user_id) VALUES(?,?,?)`,'demo-activity-programacion',subjectId,DEMO_USER_ID);
    await tx.runAsync(`INSERT INTO study_contents(id,user_id,subject_id,title,description,material_reference,position,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,contentId,DEMO_USER_ID,subjectId,'Programación orientada a objetos','Clases, herencia e interfaces','Capítulos 4 y 5',1,'in_progress',timestamp,timestamp);
    await tx.runAsync(`INSERT INTO study_plans(subject_id,user_id,weekly_target_minutes,session_minutes,updated_at) VALUES(?,?,?,?,?)`,subjectId,DEMO_USER_ID,300,50,timestamp);
    await tx.runAsync(`INSERT INTO study_activity_targets(subject_id,activity_id,user_id,weekly_target_minutes,created_at) VALUES(?,?,?,?,?)`,subjectId,'demo-activity-programacion',DEMO_USER_ID,300,timestamp);
    await tx.runAsync(`INSERT INTO activity_subactivities(id,user_id,activity_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)`,subactivityId,DEMO_USER_ID,'demo-activity-programacion','Resolver ejercicios',timestamp,timestamp);
    await tx.runAsync(`INSERT INTO activity_study_progress(id,user_id,activity_id,subactivity_id,section_name,target_seconds,elapsed_seconds,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,'demo-study-progress',DEMO_USER_ID,'demo-activity-programacion',subactivityId,'Ejercicios de herencia',7200,3300,'paused',timestamp,timestamp);
    for(const [id,day,minutes,topic] of [['study-1',-4,55,'Clases y objetos'],['study-2',-2,45,'Herencia'],['study-3',-1,35,'Interfaces']] as const){const end=at(day,21),start=new Date(new Date(end).getTime()-minutes*60_000).toISOString();await tx.runAsync(`INSERT INTO study_sessions(id,user_id,subject_id,topic,objective,mode,target_seconds,started_at,ended_at,elapsed_seconds,interruptions,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,`demo-${id}`,DEMO_USER_ID,subjectId,topic,'Practicar conceptos','duration',minutes*60,start,end,minutes*60,day===-2?1:0,'Sesión de prueba');await tx.runAsync(`INSERT INTO study_session_links(session_id,activity_id,content_id,subactivity_id,progress_id) VALUES(?,?,?,?,?)`,`demo-${id}`,'demo-activity-programacion',contentId,subactivityId,null)}
    await tx.runAsync(`INSERT INTO study_requests(id,user_id,activity_id,subject_id,content_id,topic,objective,duration_minutes,preferred_date,preferred_time,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,'demo-study-request',DEMO_USER_ID,'demo-activity-programacion',subjectId,contentId,'Practicar polimorfismo','Resolver cinco ejercicios',60,at(1,18).slice(0,10),'18:00','pending',timestamp,timestamp);
    seedStep='finanzas';
    const expenses=[
      ['expense-1',-88,'90000000-0000-0000-0000-000000000014',85,'Internet mensual'],
      ['expense-2',-76,'90000000-0000-0000-0000-000000000014',42,'Libro usado'],
      ['expense-3',-65,'90000000-0000-0000-0000-000000000014',16,'Fotocopias'],
      ['expense-4',-54,'90000000-0000-0000-0000-000000000014',24,'Materiales de estudio'],
      ['expense-5',-46,'90000000-0000-0000-0000-000000000012',28,'Almuerzo universitario'],
      ['expense-6',-39,'90000000-0000-0000-0000-000000000014',15,'Transporte'],
      ['expense-7',-33,'90000000-0000-0000-0000-000000000013',34,'Cena con amigos'],
      ['expense-8',-27,'90000000-0000-0000-0000-000000000011',10,'Café y pan'],
      ['expense-9',-24,'90000000-0000-0000-0000-000000000012',26,'Almuerzo'],
      ['expense-10',-21,'90000000-0000-0000-0000-000000000014',8,'Pasaje'],
      ['expense-11',-18,'90000000-0000-0000-0000-000000000014',19,'Cuaderno'],
      ['expense-12',-15,'90000000-0000-0000-0000-000000000013',21,'Cena'],
      ['expense-13',-12,'90000000-0000-0000-0000-000000000011',11,'Desayuno'],
      ['expense-14',-10,'90000000-0000-0000-0000-000000000014',7,'Impresiones'],
      ['expense-15',-8,'90000000-0000-0000-0000-000000000012',29,'Menú del día'],
      ['expense-16',-6,'90000000-0000-0000-0000-000000000014',18,'Transporte'],
      ['expense-17',-5,'90000000-0000-0000-0000-000000000011',12,'Desayuno'],
      ['expense-18',-4,'90000000-0000-0000-0000-000000000012',25,'Almuerzo'],
      ['expense-19',-3,'90000000-0000-0000-0000-000000000014',6,'Agua'],
      ['expense-20',-2,'90000000-0000-0000-0000-000000000014',18,'Transporte'],
      ['expense-21',-1,'90000000-0000-0000-0000-000000000013',22,'Cena'],
      ['expense-22',0,'90000000-0000-0000-0000-000000000011',9,'Café'],
      ['expense-23',0,'90000000-0000-0000-0000-000000000012',27,'Almuerzo'],
      ['expense-24',0,'90000000-0000-0000-0000-000000000014',5,'Pasaje'],
    ] as const;
    for(const [id,day,category,amount,note] of expenses)await tx.runAsync(`INSERT INTO transactions(id,user_id,account_id,category_id,kind,amount,currency_code,occurred_at,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,`demo-${id}`,DEMO_USER_ID,'80000000-0000-0000-0000-000000000001',category,'expense',amount,'BOB',at(day,13),note,timestamp,timestamp);
    const monthStart=new Date();monthStart.setDate(1);const monthEnd=new Date(monthStart.getFullYear(),monthStart.getMonth()+1,0);
    await tx.runAsync(`INSERT INTO budgets(id,user_id,category_id,period_start,period_end,amount,currency_code) VALUES(?,?,?,?,?,?,?)`,'demo-budget',DEMO_USER_ID,'90000000-0000-0000-0000-000000000001',monthStart.toISOString().slice(0,10),monthEnd.toISOString().slice(0,10),650,'BOB');
    await tx.runAsync(`INSERT INTO expense_definitions(id,user_id,name,amount,category_id,account_id,recurrence,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,'demo-expense-definition',DEMO_USER_ID,'Almuerzo habitual',25,'90000000-0000-0000-0000-000000000012','80000000-0000-0000-0000-000000000001','daily',1,timestamp,timestamp);
    await tx.runAsync(`INSERT INTO app_meta(key,value) VALUES('seed_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,REQUESTED_SEED_VERSION);
  });}catch(error){throw new Error(`Carga de prueba falló en ${seedStep}: ${error instanceof Error?error.message:String(error)}`)}
}

const UNIVERSITY_SCHEDULE_IMPORT_VERSION='university-2026-2-v1';
type UniversityClass={code:string;title:string;days:{weekday:number;hour:number;minute:number;duration:number;room:string}[];color:string};

/** Carga idempotente del horario proporcionado por el usuario para 2/2026. */
async function importUniversitySchedule2026(db:SQLiteDatabase){
  const imported=await db.getFirstAsync<{value:string}>('SELECT value FROM app_meta WHERE key=?','university_schedule_import');
  if(imported?.value===UNIVERSITY_SCHEDULE_IMPORT_VERSION)return;

  const classes:UniversityClass[]=[
    {code:'INF111',title:'Arquitectura de Computadores',color:'#2563EB',days:[
      {weekday:1,hour:17,minute:30,duration:90,room:'236-34'},{weekday:3,hour:17,minute:30,duration:90,room:'236-34'},{weekday:5,hour:17,minute:30,duration:90,room:'236-34'}]},
    {code:'INF210',title:'Programación II',color:'#16A34A',days:[
      {weekday:2,hour:13,minute:45,duration:135,room:'236-16'},{weekday:4,hour:13,minute:45,duration:135,room:'236-46'}]},
    {code:'INF219',title:'Ingeniería de Requisitos y Modelado',color:'#7C3AED',days:[
      {weekday:1,hour:7,minute:0,duration:90,room:'236-45'},{weekday:3,hour:7,minute:0,duration:90,room:'236-43'},{weekday:5,hour:7,minute:0,duration:90,room:'236-25'}]},
    {code:'INF308',title:'Legislación Informática y Ética',color:'#EA580C',days:[
      {weekday:3,hour:14,minute:30,duration:135,room:'236-22'},{weekday:6,hour:14,minute:30,duration:135,room:'236-21'}]},
    {code:'INF212',title:'Base de Datos II',color:'#0891B2',days:[
      {weekday:3,hour:10,minute:45,duration:135,room:'236-23'},{weekday:5,hour:10,minute:45,duration:135,room:'236-46'}]},
    {code:'MAT202',title:'Probabilidad y Estadística I',color:'#DC2626',days:[
      {weekday:2,hour:18,minute:15,duration:135,room:'236-12'},{weekday:4,hour:18,minute:15,duration:135,room:'236-33'}]},
  ];
  const startsAt=new Date(2026,8,14,7,0,0,0);
  const endsOn=new Date(2026,11,31,23,59,59,999);
  for(const item of classes){
    const existing=await db.getFirstAsync<{id:string}>('SELECT id FROM activities WHERE user_id=? AND title=? AND deleted_at IS NULL',DEMO_USER_ID,item.title);
    if(existing)continue;
    await createPlannedActivity(db,{
      title:item.title,
      description:`${item.code} · Presencial · ${item.days.map(day=>`Aula ${day.room}`).join(' / ')}`,
      startsAt,
      endsOn,
      durationMinutes:item.days[0].duration,
      recurrence:'weekly',
      weekdays:item.days.map(day=>day.weekday),
      dayRules:item.days.map(day=>({weekday:day.weekday,hour:day.hour,minute:day.minute,durationMinutes:day.duration,preparationMinutes:0,travelMinutes:0,bufferMinutes:0,returnTravelMinutes:0})),
      priority:'normal',color:item.color,
    });
  }
  await db.runAsync(`INSERT INTO app_meta(key,value) VALUES('university_schedule_import',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,UNIVERSITY_SCHEDULE_IMPORT_VERSION);
}

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.toISOString(), end.toISOString()] as const;
}

export async function listTodayBlocks(db: SQLiteDatabase) {
  const [start, end] = todayBounds();
  await db.runAsync(`UPDATE planned_blocks SET status='late',updated_at=?,version=version+1
    WHERE user_id=? AND status='planned' AND deleted_at IS NULL AND id NOT IN(SELECT block_id FROM auxiliary_blocks)
    AND datetime(starts_at) < datetime(?)
    AND ends_at>?`,nowIso(),DEMO_USER_ID,nowIso(),nowIso());
  return db.getAllAsync<PlannedBlock>(`
    SELECT pb.id,pb.activity_id,a.title,pb.starts_at,CASE WHEN av.actual_end_at IS NOT NULL THEN av.actual_end_at ELSE pb.ends_at END ends_at,pb.ends_at scheduled_ends_at,pb.status,COALESCE(av.shortened_minutes,0) shortened_minutes,COALESCE(ao.priority,'normal') priority,COALESCE(ao.color,'#2563EB') color,
           CASE WHEN ab.role IS NOT NULL THEN ab.role WHEN a.title IN('Desayuno','Almuerzo','Cena') THEN 'meal' ELSE 'activity' END kind,
           SUM(ts.elapsed_seconds) AS elapsed_seconds,
           MAX(CASE WHEN ts.ended_at IS NULL THEN ts.started_at END) AS active_started_at
    FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_options ao ON ao.activity_id=a.id
    LEFT JOIN time_sessions ts ON ts.planned_block_id=pb.id AND ts.deleted_at IS NULL LEFT JOIN auxiliary_blocks ab ON ab.block_id=pb.id LEFT JOIN activity_verifications av ON av.planned_block_id=pb.id AND av.deleted_at IS NULL
    WHERE pb.user_id=? AND pb.starts_at>=? AND pb.starts_at<? AND pb.deleted_at IS NULL AND COALESCE(ao.is_paused,0)=0 AND ao.deleted_at IS NULL
      AND (ab.role IS NULL OR ab.role NOT IN('preparation','buffer'))
    GROUP BY pb.id ORDER BY pb.starts_at`, DEMO_USER_ID, start, end);
}
export type DueActivityPopup={id:string;activity_id:string;title:string;starts_at:string;priority:'low'|'normal'|'high'|'critical'};
export async function listDueActivityPopups(db:SQLiteDatabase){const now=nowIso(),until=new Date(Date.now()+60*60_000).toISOString();return db.getAllAsync<DueActivityPopup>(`SELECT pb.id,pb.activity_id,a.title,pb.starts_at,COALESCE(ao.priority,'normal') priority FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_options ao ON ao.activity_id=a.id WHERE pb.user_id=? AND pb.deleted_at IS NULL AND pb.status IN('planned','late','paused') AND pb.starts_at<=? AND pb.ends_at>? AND pb.id NOT IN(SELECT block_id FROM auxiliary_blocks) AND NOT EXISTS(SELECT 1 FROM activity_popup_dismissals d WHERE d.block_id=pb.id) ORDER BY CASE COALESCE(ao.priority,'normal') WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,pb.starts_at LIMIT 1`,DEMO_USER_ID,until,now)}
export async function dismissActivityPopup(db:SQLiteDatabase,blockId:string){await db.runAsync('INSERT OR REPLACE INTO activity_popup_dismissals(block_id,user_id,dismissed_at) VALUES(?,?,?)',blockId,DEMO_USER_ID,nowIso())}

export async function listUpcomingBlocks(db: SQLiteDatabase) {
  return db.getAllAsync<PlannedBlock>(`
    SELECT pb.id,pb.activity_id,a.title,pb.starts_at,pb.ends_at,pb.status,COALESCE(ao.priority,'normal') priority,
           SUM(ts.elapsed_seconds) AS elapsed_seconds,
           MAX(CASE WHEN ts.ended_at IS NULL THEN ts.started_at END) AS active_started_at
    FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_options ao ON ao.activity_id=a.id
    LEFT JOIN time_sessions ts ON ts.planned_block_id=pb.id AND ts.deleted_at IS NULL
    WHERE pb.user_id=? AND pb.deleted_at IS NULL AND COALESCE(ao.is_paused,0)=0 AND ao.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id AND ab.role IN('preparation','buffer'))
    GROUP BY pb.id ORDER BY pb.starts_at LIMIT 30`, DEMO_USER_ID);
}
export type SchedulePreferences={dayStart:string;dayEnd:string;slotMinutes:15|30|60;hidePast:boolean;minFreeMinutes:number;showWeekends:boolean;initialView:'day'|'week'};
const DEFAULT_SCHEDULE_PREFERENCES:SchedulePreferences={dayStart:'06:00',dayEnd:'22:00',slotMinutes:30,hidePast:true,minFreeMinutes:15,showWeekends:true,initialView:'day'};
export async function getSchedulePreferences(db:SQLiteDatabase){const rows=await db.getAllAsync<{key:string;value:string}>(`SELECT key,value FROM app_preferences WHERE key LIKE 'schedule_%'`);const map=Object.fromEntries(rows.map(x=>[x.key,x.value]));return {dayStart:map.schedule_day_start??DEFAULT_SCHEDULE_PREFERENCES.dayStart,dayEnd:map.schedule_day_end??DEFAULT_SCHEDULE_PREFERENCES.dayEnd,slotMinutes:Number(map.schedule_slot_minutes||30) as 15|30|60,hidePast:(map.schedule_hide_past??'1')==='1',minFreeMinutes:Number(map.schedule_min_free||15),showWeekends:(map.schedule_weekends??'1')==='1',initialView:(map.schedule_initial_view??'day') as 'day'|'week'} satisfies SchedulePreferences}
export async function saveSchedulePreferences(db:SQLiteDatabase,p:SchedulePreferences){const values=[['schedule_day_start',p.dayStart],['schedule_day_end',p.dayEnd],['schedule_slot_minutes',String(p.slotMinutes)],['schedule_hide_past',p.hidePast?'1':'0'],['schedule_min_free',String(p.minFreeMinutes)],['schedule_weekends',p.showWeekends?'1':'0'],['schedule_initial_view',p.initialView]];await db.withExclusiveTransactionAsync(async tx=>{for(const [key,value] of values)await tx.runAsync(`INSERT INTO app_preferences(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,key,value)})}
export type NotificationPreferences={offsets:number[]};
export async function getNotificationPreferences(db:SQLiteDatabase):Promise<NotificationPreferences>{const row=await db.getFirstAsync<{value:string}>(`SELECT value FROM app_preferences WHERE key='notification_offsets'`);const offsets=(row?.value??'60,30,5').split(',').map(Number).filter(value=>[60,30,5].includes(value));return {offsets:offsets.length?[...new Set(offsets)]:[60]}}
export async function saveNotificationPreferences(db:SQLiteDatabase,p:NotificationPreferences){await db.runAsync(`INSERT INTO app_preferences(key,value) VALUES('notification_offsets',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,p.offsets.join(','))}
export type DailyScheduleItem=PlannedBlock&{description:string;kind:'activity'|'travel'|'preparation'|'buffer'|'return'|'meal';color:string};
export async function listBlocksForDate(db:SQLiteDatabase,date:Date){const start=new Date(date);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);return db.getAllAsync<DailyScheduleItem>(`SELECT pb.id,pb.activity_id,a.title,COALESCE(ad.description,'') description,pb.starts_at,CASE WHEN av.actual_end_at IS NOT NULL THEN av.actual_end_at ELSE pb.ends_at END ends_at,pb.ends_at scheduled_ends_at,pb.status,COALESCE(av.shortened_minutes,0) shortened_minutes,COALESCE(ao.priority,'normal') priority,COALESCE(ao.color,'#2563EB') color,NULL elapsed_seconds,NULL active_started_at,CASE WHEN lower(a.title) LIKE 'traslado a %' THEN 'travel' WHEN lower(a.title) LIKE 'regreso de %' THEN 'return' WHEN a.title IN('Desayuno','Almuerzo','Cena') THEN 'meal' ELSE 'activity' END kind FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_details ad ON ad.activity_id=a.id LEFT JOIN activity_options ao ON ao.activity_id=a.id LEFT JOIN activity_verifications av ON av.planned_block_id=pb.id AND av.deleted_at IS NULL WHERE pb.user_id=? AND pb.starts_at<? AND pb.ends_at>? AND pb.deleted_at IS NULL AND COALESCE(ao.is_paused,0)=0 AND ao.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id AND ab.role IN('preparation','buffer')) ORDER BY pb.starts_at,pb.ends_at`,DEMO_USER_ID,end.toISOString(),start.toISOString())}
export async function countScheduleConflicts(db:SQLiteDatabase,input:{startsAt:Date;endsOn:Date;durationMinutes:number;recurrence:'once'|'daily'|'weekly';weekdays:number[]}){const existing=await db.getAllAsync<{starts_at:string;ends_at:string}>('SELECT starts_at,ends_at FROM planned_blocks WHERE user_id=? AND deleted_at IS NULL AND starts_at<=? AND ends_at>=?',DEMO_USER_ID,input.endsOn.toISOString(),input.startsAt.toISOString());let count=0;for(let cursor=new Date(input.startsAt),guard=0;cursor<=input.endsOn&&guard++<400;cursor=new Date(cursor.getTime()+24*60*60_000)){if(input.recurrence!=='once'&&!input.weekdays.includes(cursor.getDay()))continue;const end=cursor.getTime()+input.durationMinutes*60_000;if(existing.some(x=>new Date(x.starts_at).getTime()<end&&new Date(x.ends_at).getTime()>cursor.getTime()))count++;if(input.recurrence==='once')break}return count}

export async function createPlannedActivity(
  db: SQLiteDatabase,
  input: { title: string; startsAt: Date; endsOn?: Date; durationMinutes: number; recurrence: 'once' | 'daily' | 'weekly' | 'weekly_month' | 'weekly_year'; weekdays?: number[]; dayRules?: DayScheduleRule[]; description?: string; priority?: 'low'|'normal'|'high'|'critical'; color?:string; focusMode?:boolean; preparationMinutes?: number; travelMinutes?: number; bufferMinutes?: number; returnTravelMinutes?: number },
) {
  const activityId = Crypto.randomUUID();
  const scheduleId = Crypto.randomUUID();
  const createdAt = nowIso();
  const legacyDays=input.recurrence==='weekly_month'?35:input.recurrence==='weekly_year'?371:0;
  const rangeEnd=input.endsOn??new Date(input.startsAt.getTime()+legacyDays*24*60*60_000);
  const stepDays=input.recurrence==='daily'?1:input.recurrence==='once'?0:7;
  const occurrences:{blockId:string;startsAt:Date;endsAt:Date;rule?:DayScheduleRule}[]=[];
  const selectedDays=input.weekdays?.length?input.weekdays:null;
  for(let cursor=new Date(input.startsAt),guard=0;cursor<=rangeEnd&&guard<400;guard++){
    if(selectedDays&&!selectedDays.includes(cursor.getDay())){cursor=new Date(cursor.getTime()+24*60*60_000);continue}
    const rule=input.dayRules?.find(x=>x.weekday===cursor.getDay());const startsAt=new Date(cursor);if(rule)startsAt.setHours(rule.hour,rule.minute,0,0);const duration=rule?.durationMinutes??input.durationMinutes;
    occurrences.push({blockId:Crypto.randomUUID(),startsAt,endsAt:new Date(startsAt.getTime()+duration*60_000),rule});
    if(stepDays===0&&!selectedDays)break;
    cursor=new Date(cursor.getTime()+(selectedDays?1:stepDays)*24*60*60_000);
  }
  if(!occurrences.length)throw new Error('El rango no contiene ninguno de los días seleccionados');
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO activities(id,user_id,category_id,title,default_duration_minutes,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?)`,
      activityId, DEMO_USER_ID, '20000000-0000-0000-0000-000000000001', input.title,
      input.durationMinutes, createdAt, createdAt,
    );
    if (input.description?.trim()) await tx.runAsync('INSERT INTO activity_details(activity_id,description) VALUES(?,?)', activityId, input.description.trim());
    await tx.runAsync('INSERT INTO activity_options(activity_id,priority,color,focus_mode) VALUES(?,?,?,?)',activityId,input.priority??'normal',input.color??'#2563EB',input.focusMode?1:0);
    const lastOccurrence = occurrences[occurrences.length - 1];
    await tx.runAsync(`INSERT INTO activity_schedules(id,user_id,activity_id,recurrence,starts_on,ends_on,local_start_time,duration_minutes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      scheduleId, DEMO_USER_ID, activityId, input.recurrence, input.startsAt.toISOString().slice(0, 10), lastOccurrence.startsAt.toISOString().slice(0, 10),
      input.startsAt.toTimeString().slice(0, 5), input.durationMinutes, createdAt, createdAt);
    for(const weekday of selectedDays??[input.startsAt.getDay()]){const rule=input.dayRules?.find(x=>x.weekday===weekday);const time=rule?`${String(rule.hour).padStart(2,'0')}:${String(rule.minute).padStart(2,'0')}`:input.startsAt.toTimeString().slice(0,5);await tx.runAsync(`INSERT OR IGNORE INTO schedule_rules VALUES(?,?,?,?,?,?,?,?,?,?)`,Crypto.randomUUID(),DEMO_USER_ID,scheduleId,weekday,time,rule?.durationMinutes??input.durationMinutes,rule?.preparationMinutes??input.preparationMinutes??0,rule?.travelMinutes??input.travelMinutes??0,rule?.bufferMinutes??input.bufferMinutes??0,rule?.returnTravelMinutes??input.returnTravelMinutes??0)}
    for (const occurrence of occurrences) {
      await tx.runAsync(`INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,
        occurrence.blockId, DEMO_USER_ID, activityId, occurrence.startsAt.toISOString(), occurrence.endsAt.toISOString(), createdAt, createdAt);
      await tx.runAsync('INSERT INTO schedule_occurrences VALUES(?,?)', scheduleId, occurrence.blockId);
      const extras = [
        { role: 'travel', minutes: occurrence.rule?.travelMinutes??input.travelMinutes??0, title: `Traslado a ${input.title}` },
      ] as const;
      let cursor = occurrence.startsAt.getTime();
      for (const extra of [...extras].reverse()) {
        if (!extra.minutes) continue;
        const extraActivityId = Crypto.randomUUID(); const extraBlockId = Crypto.randomUUID(); const end = new Date(cursor); const start = new Date(cursor - extra.minutes * 60_000); cursor = start.getTime();
        await tx.runAsync(`INSERT INTO activities(id,user_id,category_id,title,default_duration_minutes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, extraActivityId, DEMO_USER_ID, null, extra.title, extra.minutes, createdAt, createdAt);
        await tx.runAsync(`INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, extraBlockId, DEMO_USER_ID, extraActivityId, start.toISOString(), end.toISOString(), createdAt, createdAt);
        await tx.runAsync('INSERT INTO auxiliary_blocks VALUES(?,?,?,?,?)', Crypto.randomUUID(), DEMO_USER_ID, occurrence.blockId, extraBlockId, extra.role);
      }
      const returnMinutes=occurrence.rule?.returnTravelMinutes??input.returnTravelMinutes??0;if(returnMinutes){const extraActivityId=Crypto.randomUUID(),extraBlockId=Crypto.randomUUID(),start=new Date(occurrence.endsAt),end=new Date(start.getTime()+returnMinutes*60_000);await tx.runAsync(`INSERT INTO activities(id,user_id,category_id,title,default_duration_minutes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,extraActivityId,DEMO_USER_ID,null,`Regreso de ${input.title}`,returnMinutes,createdAt,createdAt);await tx.runAsync(`INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,extraBlockId,DEMO_USER_ID,extraActivityId,start.toISOString(),end.toISOString(),createdAt,createdAt);await tx.runAsync('INSERT INTO auxiliary_blocks VALUES(?,?,?,?,?)',Crypto.randomUUID(),DEMO_USER_ID,occurrence.blockId,extraBlockId,'return')}
    }
    await tx.runAsync(
      `INSERT INTO sync_outbox(operation_id,entity,entity_id,operation,payload,created_at)
       VALUES(?,?,?,?,?,?)`,
      Crypto.randomUUID(), 'activity_schedules', scheduleId, 'insert', JSON.stringify({ scheduleId, activityId, recurrence: input.recurrence }), createdAt,
    );
  });
  return { activityId, scheduleId, occurrences };
}

export type DayScheduleRule={weekday:number;hour:number;minute:number;durationMinutes:number;preparationMinutes:number;travelMinutes:number;bufferMinutes:number;returnTravelMinutes:number};

export type FlexibleActivity = { id: string; activity_id: string; title: string; description: string | null; duration_minutes: number; kind: string };
export async function createFlexibleActivity(db: SQLiteDatabase, input: { title: string; description?: string; durationMinutes: number; kind?: string }) {
  const activityId = Crypto.randomUUID(); const id = Crypto.randomUUID(); const timestamp = nowIso();
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync(`INSERT INTO activities(id,user_id,category_id,title,default_duration_minutes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, activityId, DEMO_USER_ID, input.kind === 'study' ? '20000000-0000-0000-0000-000000000001' : null, input.title, input.durationMinutes, timestamp, timestamp);
    await tx.runAsync(`INSERT INTO flexible_activities(id,user_id,activity_id,description,duration_minutes,kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`, id, DEMO_USER_ID, activityId, input.description?.trim() || '', input.durationMinutes, input.kind ?? 'general', timestamp, timestamp);
  });
  return id;
}
export async function listFlexibleActivities(db: SQLiteDatabase, kind?: string) {
  return db.getAllAsync<FlexibleActivity>(`SELECT fa.id,fa.activity_id,a.title,fa.description,fa.duration_minutes,fa.kind FROM flexible_activities fa JOIN activities a ON a.id=fa.activity_id WHERE fa.user_id=? AND fa.deleted_at IS NULL ${kind ? 'AND fa.kind=?' : ''} ORDER BY fa.created_at DESC`, ...(kind ? [DEMO_USER_ID, kind] : [DEMO_USER_ID]));
}
export async function startFlexibleActivity(db: SQLiteDatabase, item: FlexibleActivity) {
  const start = new Date(); const end = new Date(start.getTime() + item.duration_minutes * 60_000); const blockId = Crypto.randomUUID(); const timestamp = nowIso();
  await db.withExclusiveTransactionAsync(async tx=>{
    await tx.runAsync(`INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,status,created_at,updated_at) VALUES(?,?,?,?,?,'in_progress',?,?)`, blockId, DEMO_USER_ID, item.activity_id, start.toISOString(), end.toISOString(), timestamp, timestamp);
    await tx.runAsync(`INSERT INTO time_sessions(id,user_id,activity_id,planned_block_id,started_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,Crypto.randomUUID(),DEMO_USER_ID,item.activity_id,blockId,timestamp,timestamp,timestamp);
  });
  return blockId;
}

export async function attachNotification(db: SQLiteDatabase, blockId: string, notificationId: string, remindAt: Date, title: string) {
  const createdAt = nowIso();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('UPDATE planned_blocks SET local_notification_id=?,updated_at=?,version=version+1 WHERE id=?', notificationId, createdAt, blockId);
    await tx.runAsync('INSERT INTO reminders VALUES(?,?,?,?,?,?,?)', Crypto.randomUUID(), DEMO_USER_ID, blockId, remindAt.toISOString(), title, notificationId, createdAt);
  });
}
export async function clearBlockReminders(db:SQLiteDatabase,blockId:string){const rows=await db.getAllAsync<{local_notification_id:string}>('SELECT local_notification_id FROM reminders WHERE planned_block_id=? AND local_notification_id IS NOT NULL',blockId);await db.runAsync('DELETE FROM reminders WHERE planned_block_id=?',blockId);return rows.map(x=>x.local_notification_id)}
export type ReminderBlock={id:string;starts_at:string;title:string;deleted_at:string|null;priority:'low'|'normal'|'high'|'critical'};
export async function listActivityReminderBlocks(db:SQLiteDatabase,activityId:string,includeDeleted=false){return db.getAllAsync<ReminderBlock>(`SELECT pb.id,pb.starts_at,a.title,pb.deleted_at,COALESCE(ao.priority,'normal') priority FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_options ao ON ao.activity_id=pb.activity_id WHERE pb.activity_id=? ${includeDeleted?'':'AND pb.deleted_at IS NULL'} ORDER BY pb.starts_at`,activityId)}
export async function listFutureReminderBlocks(db:SQLiteDatabase){return db.getAllAsync<ReminderBlock>(`SELECT pb.id,pb.starts_at,a.title,pb.deleted_at,COALESCE(ao.priority,'normal') priority FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN activity_options ao ON ao.activity_id=pb.activity_id WHERE pb.user_id=? AND pb.deleted_at IS NULL AND pb.starts_at>? ORDER BY pb.starts_at`,DEMO_USER_ID,nowIso())}
export type FocusSchedule={id:string;title:string;starts_at:string;ends_at:string};
export async function listFocusSchedules(db:SQLiteDatabase){return db.getAllAsync<FocusSchedule>(`SELECT pb.id,a.title,pb.starts_at,pb.ends_at FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id JOIN activity_options ao ON ao.activity_id=pb.activity_id WHERE pb.user_id=? AND pb.deleted_at IS NULL AND a.deleted_at IS NULL AND ao.deleted_at IS NULL AND ao.is_paused=0 AND ao.focus_mode=1 AND pb.status IN('planned','late','in_progress','paused') AND pb.ends_at>? AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id) ORDER BY pb.starts_at`,DEMO_USER_ID,nowIso())}

export async function startSession(db: SQLiteDatabase, block: PlannedBlock) {
  if(block.kind&&block.kind!=='activity'&&block.kind!=='meal')throw new Error('Los tiempos auxiliares no tienen cronómetro propio.');
  const timestamp = nowIso();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const request=await tx.getFirstAsync<StudyRequest>('SELECT sr.*,a.title activity_title,0 completed_minutes,sr.duration_minutes remaining_minutes FROM study_requests sr JOIN activities a ON a.id=sr.activity_id WHERE sr.planned_block_id=? AND sr.status IN(\'scheduled\',\'pending\')',block.id);
    await tx.runAsync(`UPDATE planned_blocks SET status='in_progress',updated_at=?,version=version+1 WHERE id=?`, timestamp, block.id);
    if(request){const sessionId=Crypto.randomUUID();await tx.runAsync(`INSERT INTO study_sessions(id,user_id,subject_id,topic,objective,mode,target_seconds,started_at) VALUES(?,?,?,?,?,?,?,?)`,sessionId,DEMO_USER_ID,request.subject_id,request.topic,request.objective,'duration',request.duration_minutes*60,timestamp);await tx.runAsync('INSERT INTO study_session_links(session_id,activity_id,content_id) VALUES(?,?,?)',sessionId,request.activity_id,request.content_id);await tx.runAsync('INSERT INTO study_request_sessions(request_id,session_id) VALUES(?,?)',request.id,sessionId);await tx.runAsync(`UPDATE study_requests SET session_id=?,status='in_progress',updated_at=? WHERE id=?`,sessionId,timestamp,request.id);return}
    await tx.runAsync(`INSERT INTO time_sessions(id,user_id,activity_id,planned_block_id,started_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, Crypto.randomUUID(), DEMO_USER_ID, block.activity_id, block.id, timestamp, timestamp, timestamp);
  });
}

export async function stopSession(db: SQLiteDatabase, blockId: string) {
  const endedAt = new Date();
  const session = await db.getFirstAsync<{ id: string; started_at: string }>(
    'SELECT id,started_at FROM time_sessions WHERE user_id=? AND planned_block_id=? AND ended_at IS NULL', DEMO_USER_ID, blockId,
  );
  const study=await db.getFirstAsync<{session_id:string}>('SELECT session_id FROM study_requests WHERE planned_block_id=? AND status=\'in_progress\'',blockId);
  if (!session){if(study?.session_id){await db.runAsync(`UPDATE planned_blocks SET status='paused',updated_at=?,version=version+1 WHERE id=?`,endedAt.toISOString(),blockId);await stopStudySession(db,study.session_id)}return}
  const elapsed = Math.max(0, Math.round((endedAt.getTime() - new Date(session.started_at).getTime()) / 1000));
  await db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('UPDATE time_sessions SET ended_at=?,elapsed_seconds=?,updated_at=?,version=version+1 WHERE id=?',endedAt.toISOString(),elapsed,endedAt.toISOString(),session.id);await tx.runAsync(`UPDATE planned_blocks SET status='paused',updated_at=?,version=version+1 WHERE id=?`,endedAt.toISOString(),blockId)});
  if(study?.session_id)await stopStudySession(db,study.session_id);
}

export async function verifyBlock(db: SQLiteDatabase, blockId: string, result: 'completed' | 'partial' | 'skipped') {
  const now=new Date(),timestamp=now.toISOString();
  const completion = result === 'completed' ? 100 : result === 'partial' ? 50 : 0;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const block=await tx.getFirstAsync<{starts_at:string;ends_at:string}>('SELECT starts_at,ends_at FROM planned_blocks WHERE id=? AND user_id=? AND deleted_at IS NULL',blockId,DEMO_USER_ID);if(!block)throw new Error('Actividad no encontrada');
    const start=new Date(block.starts_at),scheduledEnd=new Date(block.ends_at);const actualEnd=result==='skipped'?start:new Date(Math.max(start.getTime(),Math.min(now.getTime(),scheduledEnd.getTime())));const shortened=Math.max(0,Math.round((scheduledEnd.getTime()-actualEnd.getTime())/60_000));
    const session=await tx.getFirstAsync<{id:string;started_at:string}>('SELECT id,started_at FROM time_sessions WHERE planned_block_id=? AND ended_at IS NULL AND deleted_at IS NULL',blockId);if(session){const elapsed=Math.max(0,Math.round((actualEnd.getTime()-new Date(session.started_at).getTime())/1000));await tx.runAsync('UPDATE time_sessions SET ended_at=?,elapsed_seconds=?,updated_at=?,version=version+1 WHERE id=?',actualEnd.toISOString(),elapsed,timestamp,session.id)}
    await tx.runAsync('UPDATE planned_blocks SET status=?,updated_at=?,version=version+1 WHERE id=?', result, timestamp, blockId);
    await tx.runAsync(
      `INSERT OR REPLACE INTO activity_verifications
       (id,user_id,planned_block_id,result,completion_percent,actual_end_at,shortened_minutes,verified_at,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`, Crypto.randomUUID(), DEMO_USER_ID, blockId, result, completion, actualEnd.toISOString(), shortened, timestamp, timestamp, timestamp,
    );
    await tx.runAsync(
      `INSERT INTO sync_outbox(operation_id,entity,entity_id,operation,payload,created_at) VALUES(?,?,?,?,?,?)`,
      Crypto.randomUUID(), 'activity_verifications', blockId, 'insert', JSON.stringify({ blockId, result, completion, actualEnd:actualEnd.toISOString(), shortenedMinutes:shortened }), timestamp,
    );
  });
}

export type OccurrenceEditor={block_id:string;activity_id:string;schedule_id:string|null;title:string;starts_at:string;ends_at:string;priority:'low'|'normal'|'high'|'critical';focus_mode:number;preparation:number;travel:number;buffer:number;return_travel:number};
export async function getOccurrenceEditor(db:SQLiteDatabase,blockId:string){return db.getFirstAsync<OccurrenceEditor>(`SELECT pb.id block_id,pb.activity_id,so.schedule_id,a.title,pb.starts_at,pb.ends_at,COALESCE(ao.priority,'normal') priority,COALESCE(ao.focus_mode,0) focus_mode,COALESCE(MAX(CASE WHEN ab.role='preparation' THEN ROUND((julianday(aux.ends_at)-julianday(aux.starts_at))*1440) END),0) preparation,COALESCE(MAX(CASE WHEN ab.role='travel' THEN ROUND((julianday(aux.ends_at)-julianday(aux.starts_at))*1440) END),0) travel,COALESCE(MAX(CASE WHEN ab.role='buffer' THEN ROUND((julianday(aux.ends_at)-julianday(aux.starts_at))*1440) END),0) buffer,COALESCE(MAX(CASE WHEN ab.role='return' THEN ROUND((julianday(aux.ends_at)-julianday(aux.starts_at))*1440) END),0) return_travel FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN schedule_occurrences so ON so.block_id=pb.id LEFT JOIN activity_options ao ON ao.activity_id=pb.activity_id LEFT JOIN auxiliary_blocks ab ON ab.parent_block_id=pb.id LEFT JOIN planned_blocks aux ON aux.id=ab.block_id AND aux.deleted_at IS NULL WHERE pb.id=? GROUP BY pb.id`,blockId)}
export async function updateOccurrence(db:SQLiteDatabase,item:OccurrenceEditor,input:{title:string;startsAt:Date;durationMinutes:number;priority:OccurrenceEditor['priority'];focusMode:boolean;preparation:number;travel:number;buffer:number;returnTravel:number},scope:'one'|'future'|'all'){
 const timestamp=nowIso();const threshold=scope==='all'?'0000':item.starts_at;const targets=scope==='one'?[item.block_id]:(await db.getAllAsync<{id:string}>(`SELECT pb.id FROM planned_blocks pb JOIN schedule_occurrences so ON so.block_id=pb.id WHERE so.schedule_id=? AND pb.starts_at>=? AND pb.deleted_at IS NULL`,item.schedule_id,threshold)).map(x=>x.id);
 await db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('UPDATE activities SET title=?,updated_at=?,version=version+1 WHERE id=?',input.title.trim(),timestamp,item.activity_id);await tx.runAsync(`INSERT INTO activity_options(activity_id,priority,focus_mode) VALUES(?,?,?) ON CONFLICT(activity_id) DO UPDATE SET priority=excluded.priority,focus_mode=excluded.focus_mode`,item.activity_id,input.priority,input.focusMode?1:0);
  for(const id of targets){const old=await tx.getFirstAsync<{starts_at:string}>('SELECT starts_at FROM planned_blocks WHERE id=?',id);if(!old)continue;const start=scope==='one'?input.startsAt:new Date(new Date(old.starts_at).setHours(input.startsAt.getHours(),input.startsAt.getMinutes(),0,0));const end=new Date(start.getTime()+input.durationMinutes*60_000);await tx.runAsync('UPDATE planned_blocks SET starts_at=?,ends_at=?,updated_at=?,version=version+1 WHERE id=?',start.toISOString(),end.toISOString(),timestamp,id);await updateAuxiliaryTimes(tx,id,start,end,input,timestamp)}
  if(scope!=='one'&&item.schedule_id)await tx.runAsync('UPDATE schedule_rules SET local_start_time=?,duration_minutes=?,preparation_minutes=?,travel_out_minutes=?,buffer_minutes=?,travel_return_minutes=? WHERE schedule_id=?',`${String(input.startsAt.getHours()).padStart(2,'0')}:${String(input.startsAt.getMinutes()).padStart(2,'0')}`,input.durationMinutes,input.preparation,input.travel,input.buffer,input.returnTravel,item.schedule_id);
  if(scope==='one'&&item.schedule_id)await tx.runAsync(`INSERT INTO schedule_exceptions(id,user_id,schedule_id,block_id,occurrence_date,action,starts_at,ends_at,preparation_minutes,travel_out_minutes,buffer_minutes,travel_return_minutes,created_at) VALUES(?,?,?,?,?,'modified',?,?,?,?,?,?,?) ON CONFLICT(schedule_id,occurrence_date) DO UPDATE SET action='modified',starts_at=excluded.starts_at,ends_at=excluded.ends_at,preparation_minutes=excluded.preparation_minutes,travel_out_minutes=excluded.travel_out_minutes,buffer_minutes=excluded.buffer_minutes,travel_return_minutes=excluded.travel_return_minutes`,Crypto.randomUUID(),DEMO_USER_ID,item.schedule_id,item.block_id,item.starts_at.slice(0,10),input.startsAt.toISOString(),new Date(input.startsAt.getTime()+input.durationMinutes*60_000).toISOString(),input.preparation,input.travel,input.buffer,input.returnTravel,timestamp);
 });
}
async function updateAuxiliaryTimes(tx:SQLiteDatabase,parentId:string,start:Date,end:Date,input:{preparation:number;travel:number;buffer:number;returnTravel:number},timestamp:string){
 const parent=await tx.getFirstAsync<{user_id:string;title:string}>('SELECT pb.user_id,a.title FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id WHERE pb.id=?',parentId);if(!parent)throw new Error('No se encontró la actividad principal');
 const travelStart=new Date(start.getTime()-input.travel*60000);await upsertAuxiliary(tx,parentId,'travel',input.travel,travelStart,start,'Traslado a '+parent.title,parent.user_id,timestamp);
 // El margen y la preparación no ocupan filas del horario.
 await upsertAuxiliary(tx,parentId,'buffer',0,start,start,'Margen para '+parent.title,parent.user_id,timestamp);
 await upsertAuxiliary(tx,parentId,'preparation',0,start,start,'Prepararse para '+parent.title,parent.user_id,timestamp);
 await upsertAuxiliary(tx,parentId,'return',input.returnTravel,end,new Date(end.getTime()+input.returnTravel*60000),'Regreso de '+parent.title,parent.user_id,timestamp);
}
async function upsertAuxiliary(tx:SQLiteDatabase,parentId:string,role:'preparation'|'travel'|'buffer'|'return',minutes:number,start:Date,end:Date,title:string,userId:string,timestamp:string){const row=await tx.getFirstAsync<{block_id:string;activity_id:string}>('SELECT ab.block_id,pb.activity_id FROM auxiliary_blocks ab JOIN planned_blocks pb ON pb.id=ab.block_id WHERE ab.parent_block_id=? AND ab.role=?',parentId,role);if(row){if(minutes===0){await tx.runAsync('UPDATE planned_blocks SET deleted_at=?,updated_at=?,version=version+1 WHERE id=?',timestamp,timestamp,row.block_id)}else{await tx.runAsync('UPDATE activities SET title=?,default_duration_minutes=?,updated_at=?,version=version+1 WHERE id=?',title,minutes,timestamp,row.activity_id);await tx.runAsync('UPDATE planned_blocks SET starts_at=?,ends_at=?,deleted_at=NULL,updated_at=?,version=version+1 WHERE id=?',start.toISOString(),end.toISOString(),timestamp,row.block_id)}return}if(minutes===0)return;const activityId=Crypto.randomUUID(),blockId=Crypto.randomUUID();await tx.runAsync('INSERT INTO activities(id,user_id,category_id,title,default_duration_minutes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',activityId,userId,null,title,minutes,timestamp,timestamp);await tx.runAsync(`INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,status,created_at,updated_at) VALUES(?,?,?,?,?,'planned',?,?)`,blockId,userId,activityId,start.toISOString(),end.toISOString(),timestamp,timestamp);await tx.runAsync('INSERT INTO auxiliary_blocks(id,user_id,parent_block_id,block_id,role) VALUES(?,?,?,?,?)',Crypto.randomUUID(),userId,parentId,blockId,role)}
export async function deleteOccurrence(db:SQLiteDatabase,item:OccurrenceEditor,scope:'one'|'future'|'all'){const timestamp=nowIso();if(scope==='one'){await db.runAsync('UPDATE planned_blocks SET deleted_at=?,updated_at=? WHERE id=?',timestamp,timestamp,item.block_id);if(item.schedule_id)await db.runAsync(`INSERT INTO schedule_exceptions(id,user_id,schedule_id,block_id,occurrence_date,action,created_at) VALUES(?,?,?,?,?,'excluded',?) ON CONFLICT(schedule_id,occurrence_date) DO UPDATE SET action='excluded'`,Crypto.randomUUID(),DEMO_USER_ID,item.schedule_id,item.block_id,item.starts_at.slice(0,10),timestamp)}else{const threshold=scope==='all'?'0000':item.starts_at;await db.runAsync(`UPDATE planned_blocks SET deleted_at=?,updated_at=? WHERE id IN(SELECT block_id FROM schedule_occurrences WHERE schedule_id=?) AND starts_at>=?`,timestamp,timestamp,item.schedule_id,threshold);if(scope==='all'){await db.runAsync('UPDATE activity_options SET deleted_at=? WHERE activity_id=?',timestamp,item.activity_id);await db.runAsync('UPDATE activity_schedules SET deleted_at=? WHERE id=?',timestamp,item.schedule_id)}}}
export async function deleteOccurrenceAtomic(db:SQLiteDatabase,item:OccurrenceEditor,scope:'one'|'future'|'all'){
 const timestamp=nowIso();
 await db.withExclusiveTransactionAsync(async tx=>{
  const targets=scope==='one'?[item.block_id]:(await tx.getAllAsync<{id:string}>(`SELECT pb.id FROM planned_blocks pb JOIN schedule_occurrences so ON so.block_id=pb.id WHERE so.schedule_id=? AND pb.starts_at>=? AND pb.deleted_at IS NULL`,item.schedule_id,scope==='all'?'0000':item.starts_at)).map(row=>row.id);
  for(const id of targets){
   await tx.runAsync('UPDATE planned_blocks SET deleted_at=?,updated_at=?,version=version+1 WHERE id=?',timestamp,timestamp,id);
   await tx.runAsync('UPDATE planned_blocks SET deleted_at=?,updated_at=?,version=version+1 WHERE id IN(SELECT block_id FROM auxiliary_blocks WHERE parent_block_id=?)',timestamp,timestamp,id);
  }
  if(scope==='one'&&item.schedule_id)await tx.runAsync(`INSERT INTO schedule_exceptions(id,user_id,schedule_id,block_id,occurrence_date,action,created_at) VALUES(?,?,?,?,?,'excluded',?) ON CONFLICT(schedule_id,occurrence_date) DO UPDATE SET action='excluded'`,Crypto.randomUUID(),DEMO_USER_ID,item.schedule_id,item.block_id,item.starts_at.slice(0,10),timestamp);
  if(scope==='all'){await tx.runAsync('UPDATE activity_options SET deleted_at=? WHERE activity_id=?',timestamp,item.activity_id);await tx.runAsync('UPDATE activity_schedules SET deleted_at=? WHERE id=?',timestamp,item.schedule_id)}
 });
}
export async function setActivityPaused(db:SQLiteDatabase,activityId:string,paused:boolean){await db.runAsync(`INSERT INTO activity_options(activity_id,is_paused) VALUES(?,?) ON CONFLICT(activity_id) DO UPDATE SET is_paused=excluded.is_paused`,activityId,paused?1:0)}
export async function setActivityColor(db:SQLiteDatabase,activityId:string,color:string){await db.runAsync(`INSERT INTO activity_options(activity_id,color) VALUES(?,?) ON CONFLICT(activity_id) DO UPDATE SET color=excluded.color`,activityId,color)}
export async function listPausedActivities(db:SQLiteDatabase){return db.getAllAsync<{activity_id:string;title:string}>(`SELECT a.id activity_id,a.title FROM activity_options ao JOIN activities a ON a.id=ao.activity_id WHERE ao.is_paused=1 AND ao.deleted_at IS NULL ORDER BY a.title`)}
export async function listTrash(db:SQLiteDatabase){return db.getAllAsync<{activity_id:string;title:string;deleted_at:string}>(`SELECT a.id activity_id,a.title,ao.deleted_at FROM activity_options ao JOIN activities a ON a.id=ao.activity_id WHERE ao.deleted_at IS NOT NULL ORDER BY ao.deleted_at DESC`)}
export async function restoreActivity(db:SQLiteDatabase,activityId:string){await db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('UPDATE activity_options SET deleted_at=NULL WHERE activity_id=?',activityId);await tx.runAsync('UPDATE activity_schedules SET deleted_at=NULL WHERE activity_id=?',activityId);await tx.runAsync('UPDATE planned_blocks SET deleted_at=NULL WHERE activity_id=?',activityId)})}

export async function getDailyReport(db: SQLiteDatabase): Promise<DailyReport> {
  const [start, end] = todayBounds();
  const row = await db.getFirstAsync<Omit<DailyReport, 'adherence_percent'>>(`
    SELECT COUNT(DISTINCT pb.id) planned_count,
      COUNT(DISTINCT CASE WHEN pb.status IN ('completed','partial') THEN pb.id END) performed_count,
      COALESCE(CAST(SUM(DISTINCT (julianday(pb.ends_at)-julianday(pb.starts_at))*1440) AS INTEGER),0) planned_minutes,
      COALESCE(CAST(SUM(ts.elapsed_seconds)/60 AS INTEGER),0) + COALESCE((SELECT CAST(SUM(ss.elapsed_seconds)/60 AS INTEGER) FROM study_sessions ss JOIN study_request_sessions srs ON srs.session_id=ss.id JOIN study_requests sr ON sr.id=srs.request_id JOIN planned_blocks spb ON spb.id=sr.planned_block_id WHERE spb.user_id=? AND spb.starts_at>=? AND spb.starts_at<? AND ss.ended_at IS NOT NULL),0) actual_minutes
    FROM planned_blocks pb LEFT JOIN time_sessions ts ON ts.planned_block_id=pb.id AND ts.deleted_at IS NULL
    WHERE pb.user_id=? AND pb.starts_at>=? AND pb.starts_at<? AND pb.deleted_at IS NULL AND pb.status<>'cancelled'`,
    DEMO_USER_ID, start, end, DEMO_USER_ID, start, end,
  );
  const base = row ?? { planned_count: 0, performed_count: 0, planned_minutes: 0, actual_minutes: 0 };
  return { ...base, adherence_percent: base.planned_minutes ? Math.min(100, Math.round(base.actual_minutes / base.planned_minutes * 100)) : 0 };
}

export const EXPENSE_CATEGORIES = [
  { id: '90000000-0000-0000-0000-000000000011', name: 'Desayuno' },
  { id: '90000000-0000-0000-0000-000000000012', name: 'Almuerzo' },
  { id: '90000000-0000-0000-0000-000000000013', name: 'Cena' },
  { id: '90000000-0000-0000-0000-000000000014', name: 'Otro' },
] as const;
export async function createExpense(db: SQLiteDatabase, amount: number, note: string, categoryId: string = EXPENSE_CATEGORIES[3].id) {
  const timestamp = nowIso();
  const id = Crypto.randomUUID();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO transactions(id,user_id,account_id,category_id,kind,amount,currency_code,occurred_at,note,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id, DEMO_USER_ID, '80000000-0000-0000-0000-000000000001',
      categoryId, 'expense', amount, 'BOB', timestamp, note.trim(), timestamp, timestamp,
    );
    await tx.runAsync(`INSERT INTO sync_outbox(operation_id,entity,entity_id,operation,payload,created_at) VALUES(?,?,?,?,?,?)`,
      Crypto.randomUUID(), 'transactions', id, 'insert', JSON.stringify({ id, amount, note }), timestamp);
  });
}

export type ExpenseTransaction = { id: string; amount: number; note: string | null; occurred_at: string; category_name: string };
export async function listTodayExpenses(db: SQLiteDatabase) {
  const [start,end]=todayBounds();
  return db.getAllAsync<ExpenseTransaction>(`SELECT t.id,t.amount,t.note,t.occurred_at,COALESCE(fc.name,'Otro') category_name FROM transactions t LEFT JOIN financial_categories fc ON fc.id=t.category_id WHERE t.user_id=? AND t.kind='expense' AND t.occurred_at>=? AND t.occurred_at<? AND t.deleted_at IS NULL ORDER BY t.occurred_at DESC`,DEMO_USER_ID,start,end);
}
export type ExpenseHistoryPeriod='week'|30|90|365;
export async function listExpenseTransactions(db:SQLiteDatabase,period:ExpenseHistoryPeriod=90){const start=new Date();start.setHours(0,0,0,0);if(period==='week'){const weekday=start.getDay();start.setDate(start.getDate()-(weekday===0?6:weekday-1))}else start.setDate(start.getDate()-period+1);return db.getAllAsync<ExpenseTransaction>(`SELECT t.id,t.amount,t.note,t.occurred_at,COALESCE(fc.name,'Otro') category_name FROM transactions t LEFT JOIN financial_categories fc ON fc.id=t.category_id WHERE t.user_id=? AND t.kind='expense' AND t.occurred_at>=? AND t.deleted_at IS NULL ORDER BY t.occurred_at DESC`,DEMO_USER_ID,start.toISOString())}
export async function cancelExpense(db: SQLiteDatabase,id:string){const timestamp=nowIso();await db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('UPDATE transactions SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND user_id=?',timestamp,timestamp,id,DEMO_USER_ID);await tx.runAsync(`INSERT INTO sync_outbox(operation_id,entity,entity_id,operation,payload,created_at) VALUES(?,?,?,?,?,?)`,Crypto.randomUUID(),'transactions',id,'delete',JSON.stringify({id}),timestamp);});}

export async function getExpenseTotal(db: SQLiteDatabase) {
  const [start, end] = todayBounds();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE user_id=? AND kind='expense' AND occurred_at>=? AND occurred_at<? AND deleted_at IS NULL`,
    DEMO_USER_ID, start, end,
  );
  return row?.total ?? 0;
}
export type ExpensePeriodSummary={total:number;top_name:string|null;top_count:number};
export type DailyExpenseSummary={day:string;total:number;count:number};
export type ExpenseHistorySummary={day:string;name:string;total:number;count:number};
export type ExpenseCategorySummary={name:string;color:string;total:number;count:number};
export type EconomicReport={monthTotal:number;budget:number|null;remaining:number|null;dailyAverage:number;projectedTotal:number;transactionCount:number;categories:ExpenseCategorySummary[]};
export async function getExpensePeriodSummary(db:SQLiteDatabase,days:number){const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);const end=new Date();end.setHours(24,0,0,0);const total=await db.getFirstAsync<{total:number}>('SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE user_id=? AND kind=\'expense\' AND occurred_at>=? AND occurred_at<? AND deleted_at IS NULL',DEMO_USER_ID,start.toISOString(),end.toISOString());const top=await db.getFirstAsync<{name:string;count:number}>('SELECT COALESCE(NULLIF(note,\'\'),\'Otro\') name,COUNT(*) count FROM transactions WHERE user_id=? AND kind=\'expense\' AND occurred_at>=? AND occurred_at<? AND deleted_at IS NULL GROUP BY COALESCE(NULLIF(note,\'\'),\'Otro\') ORDER BY count DESC, SUM(amount) DESC LIMIT 1',DEMO_USER_ID,start.toISOString(),end.toISOString());return {total:total?.total??0,top_name:top?.name??null,top_count:top?.count??0}}
export async function listDailyExpenseSummary(db:SQLiteDatabase,days=7){const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);return db.getAllAsync<DailyExpenseSummary>('SELECT substr(occurred_at,1,10) day,COALESCE(SUM(amount),0) total,COUNT(*) count FROM transactions WHERE user_id=? AND kind=\'expense\' AND occurred_at>=? AND deleted_at IS NULL GROUP BY substr(occurred_at,1,10) ORDER BY day DESC',DEMO_USER_ID,start.toISOString())}
export async function listExpenseHistorySummary(db:SQLiteDatabase,days=30){const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);return db.getAllAsync<ExpenseHistorySummary>(`SELECT substr(t.occurred_at,1,10) day,COALESCE(NULLIF(TRIM(t.note),''),fc.name,'Otro') name,COALESCE(SUM(t.amount),0) total,COUNT(*) count FROM transactions t LEFT JOIN financial_categories fc ON fc.id=t.category_id WHERE t.user_id=? AND t.kind='expense' AND t.occurred_at>=? AND t.deleted_at IS NULL GROUP BY substr(t.occurred_at,1,10),COALESCE(NULLIF(TRIM(t.note),''),fc.name,'Otro') ORDER BY day DESC,total DESC`,DEMO_USER_ID,start.toISOString())}
export async function getEconomicReport(db:SQLiteDatabase):Promise<EconomicReport>{const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),1),end=new Date(now.getFullYear(),now.getMonth()+1,1),daysElapsed=now.getDate(),daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();const totals=await db.getFirstAsync<{total:number;count:number}>(`SELECT COALESCE(SUM(amount),0) total,COUNT(*) count FROM transactions WHERE user_id=? AND kind='expense' AND occurred_at>=? AND occurred_at<? AND deleted_at IS NULL`,DEMO_USER_ID,start.toISOString(),end.toISOString());const budget=await db.getFirstAsync<{amount:number}>(`SELECT amount FROM budgets WHERE user_id=? AND period_start<=? AND period_end>=? ORDER BY amount DESC LIMIT 1`,DEMO_USER_ID,now.toISOString().slice(0,10),now.toISOString().slice(0,10));const categories=await db.getAllAsync<ExpenseCategorySummary>(`SELECT COALESCE(NULLIF(TRIM(t.note),''),fc.name,'Otro') name,COALESCE(MAX(fc.color),'#64748B') color,COALESCE(SUM(t.amount),0) total,COUNT(*) count FROM transactions t LEFT JOIN financial_categories fc ON fc.id=t.category_id WHERE t.user_id=? AND t.kind='expense' AND t.occurred_at>=? AND t.occurred_at<? AND t.deleted_at IS NULL GROUP BY COALESCE(NULLIF(TRIM(t.note),''),fc.name,'Otro') ORDER BY total DESC`,DEMO_USER_ID,start.toISOString(),end.toISOString());const monthTotal=totals?.total??0,dailyAverage=monthTotal/daysElapsed;return {monthTotal,budget:budget?.amount??null,remaining:budget?budget.amount-monthTotal:null,dailyAverage,projectedTotal:dailyAverage*daysInMonth,transactionCount:totals?.count??0,categories}}

export type RecoverableBlock=PlannedBlock&{planned_minutes:number;actual_minutes:number;pending_minutes:number};
export async function listRecoverableBlocks(db: SQLiteDatabase) {
  return db.getAllAsync<RecoverableBlock>(`SELECT pb.id,pb.activity_id,a.title,pb.starts_at,pb.ends_at,pb.status,COALESCE(SUM(ts.elapsed_seconds),0) elapsed_seconds,NULL active_started_at,ROUND((julianday(pb.ends_at)-julianday(pb.starts_at))*1440) planned_minutes,CAST(COALESCE(SUM(ts.elapsed_seconds),0)/60 AS INTEGER) actual_minutes,MAX(0,ROUND((julianday(pb.ends_at)-julianday(pb.starts_at))*1440)-CAST(COALESCE(SUM(ts.elapsed_seconds),0)/60 AS INTEGER)) pending_minutes FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id LEFT JOIN time_sessions ts ON ts.planned_block_id=pb.id WHERE pb.user_id=? AND pb.ends_at<? AND pb.status IN('planned','partial','skipped') AND pb.deleted_at IS NULL GROUP BY pb.id ORDER BY pb.ends_at DESC`, DEMO_USER_ID, nowIso());
}

export async function createRecovery(db: SQLiteDatabase, original: PlannedBlock, startsAt: Date) {
  const plannedMinutes = Math.round((new Date(original.ends_at).getTime() - new Date(original.starts_at).getTime()) / 60_000);
  const actualMinutes = Math.round((original.elapsed_seconds ?? 0) / 60); const pending = Math.max(5, plannedMinutes - actualMinutes);
  const blockId = Crypto.randomUUID(); const timestamp = nowIso(); const endsAt = new Date(startsAt.getTime() + pending * 60_000);
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(`INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,status,created_at,updated_at) VALUES(?,?,?,?,?,'planned',?,?)`, blockId, DEMO_USER_ID, original.activity_id, startsAt.toISOString(), endsAt.toISOString(), timestamp, timestamp);
    await tx.runAsync(`INSERT INTO recovery_links VALUES(?,?,?,?,?,'pending',?)`, Crypto.randomUUID(), DEMO_USER_ID, original.id, blockId, pending, timestamp);
    await tx.runAsync(`UPDATE planned_blocks SET status='rescheduled',updated_at=?,version=version+1 WHERE id=?`, timestamp, original.id);
  });
  return blockId;
}

export type ProgressEntry = { id: string; topic: string | null; pages_from: number | null; pages_to: number | null; exercises_done: number | null; exercises_correct: number | null; concentration: number | null; difficulty: string | null; next_step: string | null; note: string | null; created_at: string };
export async function addProgress(db: SQLiteDatabase, activityId: string, blockId: string | null, input: Omit<ProgressEntry, 'id' | 'created_at'>) {
  const timestamp = nowIso(); await db.runAsync(`INSERT INTO progress_entries(id,user_id,activity_id,planned_block_id,topic,pages_from,pages_to,exercises_done,exercises_correct,concentration,difficulty,next_step,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Crypto.randomUUID(), DEMO_USER_ID, activityId, blockId, input.topic, input.pages_from, input.pages_to, input.exercises_done, input.exercises_correct, input.concentration, input.difficulty, input.next_step, input.note, timestamp, timestamp);
}
export async function listProgress(db: SQLiteDatabase, activityId: string) { return db.getAllAsync<ProgressEntry>('SELECT id,topic,pages_from,pages_to,exercises_done,exercises_correct,concentration,difficulty,next_step,note,created_at FROM progress_entries WHERE activity_id=? AND deleted_at IS NULL ORDER BY created_at DESC', activityId); }
export async function getActivity(db: SQLiteDatabase, id: string) { return db.getFirstAsync<{ id: string; title: string;color:string }>(`SELECT a.id,a.title,COALESCE(ao.color,'#3157D5') color FROM activities a LEFT JOIN activity_options ao ON ao.activity_id=a.id AND ao.deleted_at IS NULL WHERE a.id=?`, id); }

export type StudySubject = { id: string; name: string; color: string };
export async function listSubjects(db: SQLiteDatabase) { return db.getAllAsync<StudySubject>('SELECT id,name,color FROM study_subjects WHERE user_id=? ORDER BY name', DEMO_USER_ID); }
export async function addSubject(db: SQLiteDatabase, name: string) { const clean=name.trim();const existing=await db.getFirstAsync<{id:string}>('SELECT id FROM study_subjects WHERE user_id=? AND name=?',DEMO_USER_ID,clean);if(existing)return existing.id;const id=Crypto.randomUUID(); await db.runAsync('INSERT INTO study_subjects VALUES(?,?,?,?,?)',id,DEMO_USER_ID,clean,'#3157D5',nowIso()); return id; }
export type StudyContent={id:string;subject_id:string;title:string;description:string;material_reference:string;position:number;status:'pending'|'in_progress'|'completed'};
export async function listStudyContents(db:SQLiteDatabase,subjectId:string){return db.getAllAsync<StudyContent>('SELECT id,subject_id,title,description,material_reference,position,status FROM study_contents WHERE user_id=? AND subject_id=? ORDER BY position',DEMO_USER_ID,subjectId)}
export async function addStudyContent(db:SQLiteDatabase,subjectId:string,title:string,description:string,materialReference:string){const timestamp=nowIso();const row=await db.getFirstAsync<{next_position:number}>('SELECT COALESCE(MAX(position),0)+1 next_position FROM study_contents WHERE subject_id=?',subjectId);const id=Crypto.randomUUID();await db.runAsync('INSERT INTO study_contents(id,user_id,subject_id,title,description,material_reference,position,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,\'pending\',?,?)',id,DEMO_USER_ID,subjectId,title.trim(),description.trim(),materialReference.trim(),row?.next_position??1,timestamp,timestamp);return id}
export async function setStudyContentStatus(db:SQLiteDatabase,id:string,status:StudyContent['status']){await db.runAsync('UPDATE study_contents SET status=?,updated_at=? WHERE id=? AND user_id=?',status,nowIso(),id,DEMO_USER_ID)}
export async function getNextStudyContent(db:SQLiteDatabase,subjectId:string){return db.getFirstAsync<StudyContent>(`SELECT id,subject_id,title,description,material_reference,position,status FROM study_contents WHERE user_id=? AND subject_id=? AND status<>'completed' ORDER BY position LIMIT 1`,DEMO_USER_ID,subjectId)}
export type StudyPlan={weekly_target_minutes:number;session_minutes:number};
export async function getStudyPlan(db:SQLiteDatabase,subjectId:string){return db.getFirstAsync<StudyPlan>('SELECT weekly_target_minutes,session_minutes FROM study_plans WHERE subject_id=? AND user_id=?',subjectId,DEMO_USER_ID)}
export async function saveStudyPlan(db:SQLiteDatabase,subjectId:string,weeklyMinutes:number,sessionMinutes:number){await db.runAsync(`INSERT INTO study_plans(subject_id,user_id,weekly_target_minutes,session_minutes,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(subject_id) DO UPDATE SET weekly_target_minutes=excluded.weekly_target_minutes,session_minutes=excluded.session_minutes,updated_at=excluded.updated_at`,subjectId,DEMO_USER_ID,weeklyMinutes,sessionMinutes,nowIso())}
export type StudyRequest={id:string;activity_id:string;subject_id:string;content_id:string|null;activity_title:string;topic:string;objective:string;duration_minutes:number;preferred_date:string|null;preferred_time:string|null;status:string;completed_minutes:number;remaining_minutes:number};
export async function createStudyRequest(db:SQLiteDatabase,input:{activityId:string;subjectId:string;contentId?:string;topic:string;objective:string;durationMinutes:number;preferredDate?:string;preferredTime?:string}){const id=Crypto.randomUUID(),timestamp=nowIso();await db.runAsync(`INSERT INTO study_requests(id,user_id,activity_id,subject_id,content_id,topic,objective,duration_minutes,preferred_date,preferred_time,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,?)`,id,DEMO_USER_ID,input.activityId,input.subjectId,input.contentId??null,input.topic.trim(),input.objective.trim(),input.durationMinutes,input.preferredDate??null,input.preferredTime??null,timestamp,timestamp);return id}
export async function listStudyRequests(db:SQLiteDatabase){return db.getAllAsync<StudyRequest>(`SELECT sr.id,sr.activity_id,sr.subject_id,sr.content_id,a.title activity_title,sr.topic,sr.objective,sr.duration_minutes,sr.preferred_date,sr.preferred_time,sr.status,CAST(COALESCE(SUM(ss.elapsed_seconds),0)/60 AS INTEGER) completed_minutes,MAX(0,sr.duration_minutes-CAST(COALESCE(SUM(ss.elapsed_seconds),0)/60 AS INTEGER)) remaining_minutes FROM study_requests sr JOIN activities a ON a.id=sr.activity_id LEFT JOIN study_request_sessions srs ON srs.request_id=sr.id LEFT JOIN study_sessions ss ON ss.id=srs.session_id WHERE sr.user_id=? AND sr.status NOT IN('completed','cancelled') GROUP BY sr.id ORDER BY sr.created_at`,DEMO_USER_ID)}
export type StudySlot={startsAt:string;endsAt:string};
export async function suggestStudySlots(db:SQLiteDatabase,durationMinutes:number,preferredDate?:string|null,preferredTime?:string|null){const prefs=await getSchedulePreferences(db),days:Date[]=[];const first=preferredDate?new Date(preferredDate+'T12:00:00'):new Date();for(let i=0;i<(preferredDate?1:14);i++){const day=new Date(first);day.setDate(first.getDate()+i);if(!prefs.showWeekends&&[0,6].includes(day.getDay()))continue;days.push(day)}const suggestions:StudySlot[]=[];for(const day of days){const dayStart=new Date(day);dayStart.setHours(Number(prefs.dayStart.slice(0,2)),Number(prefs.dayStart.slice(3)),0,0);const dayEnd=new Date(day);dayEnd.setHours(Number(prefs.dayEnd.slice(0,2)),Number(prefs.dayEnd.slice(3)),0,0);const blocks=await db.getAllAsync<{starts_at:string;ends_at:string}>(`SELECT starts_at,ends_at FROM planned_blocks WHERE user_id=? AND deleted_at IS NULL AND status NOT IN('cancelled','rescheduled') AND starts_at<? AND ends_at>? ORDER BY starts_at`,DEMO_USER_ID,dayEnd.toISOString(),dayStart.toISOString());const occupied=blocks.map(x=>({start:new Date(x.starts_at).getTime(),end:new Date(x.ends_at).getTime()}));if(preferredTime){const candidate=new Date(day);candidate.setHours(Number(preferredTime.slice(0,2)),Number(preferredTime.slice(3)),0,0);const finish=candidate.getTime()+durationMinutes*60000;if(candidate>=dayStart&&finish<=dayEnd.getTime()&&!occupied.some(x=>candidate.getTime()<x.end&&finish>x.start))suggestions.push({startsAt:candidate.toISOString(),endsAt:new Date(finish).toISOString()})}else{let cursor=Math.max(dayStart.getTime(),day.toDateString()===new Date().toDateString()?Date.now():dayStart.getTime());for(const range of occupied){if(range.start-cursor>=durationMinutes*60000)suggestions.push({startsAt:new Date(cursor).toISOString(),endsAt:new Date(cursor+durationMinutes*60000).toISOString()});cursor=Math.max(cursor,range.end);if(suggestions.length>=3)break}if(dayEnd.getTime()-cursor>=durationMinutes*60000&&suggestions.length<3)suggestions.push({startsAt:new Date(cursor).toISOString(),endsAt:new Date(cursor+durationMinutes*60000).toISOString()})}if(suggestions.length>=3)break}return suggestions.slice(0,3)}
export async function scheduleStudyRequest(db:SQLiteDatabase,request:StudyRequest,start:Date){const timestamp=nowIso(),blockId=Crypto.randomUUID(),end=new Date(start.getTime()+request.duration_minutes*60000);await db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync(`INSERT INTO planned_blocks(id,user_id,activity_id,starts_at,ends_at,status,created_at,updated_at) VALUES(?,?,?,?,?,'planned',?,?)`,blockId,DEMO_USER_ID,request.activity_id,start.toISOString(),end.toISOString(),timestamp,timestamp);const result=await tx.runAsync(`UPDATE study_requests SET planned_block_id=?,status='scheduled',updated_at=? WHERE id=? AND status='pending'`,blockId,timestamp,request.id);if(result.changes!==1)throw new Error('La propuesta ya fue utilizada')});return blockId}
export async function startStudyRequest(db:SQLiteDatabase,request:StudyRequest,targetMinutes=request.remaining_minutes){const seconds=Math.max(60,Math.min(request.remaining_minutes,targetMinutes)*60),sessionId=await startStudySession(db,request.subject_id,request.topic,request.objective,'duration',seconds,request.activity_id,request.content_id??undefined);await db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('INSERT INTO study_request_sessions(request_id,session_id) VALUES(?,?)',request.id,sessionId);await tx.runAsync(`UPDATE study_requests SET session_id=?,status='in_progress',updated_at=? WHERE id=?`,sessionId,nowIso(),request.id)});return sessionId}
export type LinkableActivity={id:string;title:string};
export async function listStudyLinkableActivities(db:SQLiteDatabase){return db.getAllAsync<LinkableActivity>(`SELECT MIN(a.id) id,MIN(trim(a.title)) title FROM activities a JOIN activity_schedules s ON s.activity_id=a.id WHERE a.user_id=? AND a.deleted_at IS NULL AND s.deleted_at IS NULL AND EXISTS(SELECT 1 FROM planned_blocks pb WHERE pb.activity_id=a.id AND pb.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id)) GROUP BY lower(trim(a.title)) ORDER BY MIN(trim(a.title))`,DEMO_USER_ID)}
export type ActivitySubactivity={id:string;name:string};
const DEFAULT_SUBACTIVITIES=['Clase presencial','Estudio individual','Resolver ejercicios','Leer material','Proyecto / tarea','Repaso para examen'];
export async function ensureActivitySubactivities(db:SQLiteDatabase,activityId:string){
 const timestamp=nowIso();
 await db.withExclusiveTransactionAsync(async tx=>{const existing=await tx.getFirstAsync<{id:string}>('SELECT id FROM activity_subactivities WHERE activity_id=? AND deleted_at IS NULL LIMIT 1',activityId);if(existing)return;for(const name of DEFAULT_SUBACTIVITIES)await tx.runAsync('INSERT OR IGNORE INTO activity_subactivities(id,user_id,activity_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)',Crypto.randomUUID(),DEMO_USER_ID,activityId,name,timestamp,timestamp)});
}
export async function listActivitySubactivities(db:SQLiteDatabase,activityId:string){await ensureActivitySubactivities(db,activityId);return db.getAllAsync<ActivitySubactivity>('SELECT id,name FROM activity_subactivities WHERE activity_id=? AND deleted_at IS NULL ORDER BY created_at',activityId)}
export async function addActivitySubactivity(db:SQLiteDatabase,activityId:string,name:string){const clean=name.trim();if(!clean)throw new Error('Escribe el nombre de la subactividad');const timestamp=nowIso(),id=Crypto.randomUUID();await db.runAsync('INSERT INTO activity_subactivities(id,user_id,activity_id,name,created_at,updated_at) VALUES(?,?,?,?,?,?)',id,DEMO_USER_ID,activityId,clean,timestamp,timestamp);return id}
export async function getStudyActivityTarget(db:SQLiteDatabase,subjectId:string){return db.getFirstAsync<{activity_id:string;weekly_target_minutes:number}>('SELECT activity_id,weekly_target_minutes FROM study_activity_targets WHERE subject_id=? AND user_id=?',subjectId,DEMO_USER_ID)}
export async function saveStudyActivityTarget(db:SQLiteDatabase,subjectId:string,activityId:string,weeklyMinutes:number){await db.runAsync(`INSERT INTO study_activity_targets(subject_id,activity_id,user_id,weekly_target_minutes,created_at) VALUES(?,?,?,?,?) ON CONFLICT(subject_id,activity_id) DO UPDATE SET weekly_target_minutes=excluded.weekly_target_minutes`,subjectId,activityId,DEMO_USER_ID,weeklyMinutes,nowIso())}
export async function ensureStudySubjectForActivity(db:SQLiteDatabase,activity:LinkableActivity){const linked=await db.getFirstAsync<{subject_id:string}>('SELECT subject_id FROM study_activity_subjects WHERE activity_id=?',activity.id);if(linked)return linked.subject_id;const subjectId=await addSubject(db,activity.title);await db.runAsync('INSERT OR IGNORE INTO study_activity_subjects(activity_id,subject_id,user_id) VALUES(?,?,?)',activity.id,subjectId,DEMO_USER_ID);return subjectId}
export async function getOpenStudySession(db: SQLiteDatabase) { return db.getFirstAsync<{ id:string; subject_id:string; subject_name:string; topic:string|null; objective:string|null; mode:string; target_seconds:number|null; started_at:string; interruptions:number; progress_id:string|null; activity_id:string|null; progress_elapsed_seconds:number|null; progress_target_seconds:number|null }>(`SELECT ss.*,s.name subject_name,sl.progress_id,sl.activity_id,asp.elapsed_seconds progress_elapsed_seconds,asp.target_seconds progress_target_seconds FROM study_sessions ss JOIN study_subjects s ON s.id=ss.subject_id LEFT JOIN study_session_links sl ON sl.session_id=ss.id LEFT JOIN activity_study_progress asp ON asp.id=sl.progress_id WHERE ss.user_id=? AND ss.ended_at IS NULL`,DEMO_USER_ID); }
export async function startStudySession(db: SQLiteDatabase, subjectId:string, topic:string, objective:string, mode:string, targetSeconds:number|null,activityId?:string,contentId?:string,subactivityId?:string,progressId?:string) { const id=Crypto.randomUUID();await db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync(`INSERT INTO study_sessions(id,user_id,subject_id,topic,objective,mode,target_seconds,started_at) VALUES(?,?,?,?,?,?,?,?)`,id,DEMO_USER_ID,subjectId,topic.trim(),objective.trim(),mode,targetSeconds,nowIso());await tx.runAsync('INSERT INTO study_session_links(session_id,activity_id,content_id,subactivity_id,progress_id) VALUES(?,?,?,?,?)',id,activityId??null,contentId??null,subactivityId??null,progressId??null)}); return id; }
export async function startActivityExtraSession(db:SQLiteDatabase,activity:LinkableActivity,subactivity:ActivitySubactivity){const subjectId=await ensureStudySubjectForActivity(db,activity);return startStudySession(db,subjectId,subactivity.name,'Tiempo extra','extra',null,activity.id,undefined,subactivity.id)}
export async function addActivityExtraManual(db:SQLiteDatabase,activity:LinkableActivity,subactivity:ActivitySubactivity,minutes:number){if(!Number.isFinite(minutes)||minutes<=0)throw new Error('Indica un tiempo válido');const subjectId=await ensureStudySubjectForActivity(db,activity),id=Crypto.randomUUID(),endedAt=nowIso(),startedAt=new Date(Date.now()-minutes*60_000).toISOString();await db.withExclusiveTransactionAsync(async tx=>{await tx.runAsync('INSERT INTO study_sessions(id,user_id,subject_id,topic,objective,mode,started_at,ended_at,elapsed_seconds,note) VALUES(?,?,?,?,?,?,?,?,?,?)',id,DEMO_USER_ID,subjectId,subactivity.name,'Tiempo extra','manual',startedAt,endedAt,Math.round(minutes*60),'Registro manual');await tx.runAsync('INSERT INTO study_session_links(session_id,activity_id,content_id,subactivity_id) VALUES(?,?,?,?)',id,activity.id,null,subactivity.id)});return id}
export type ActivityStudyProgress={id:string;subactivity_id:string;subactivity_name:string;section_name:string;target_seconds:number|null;elapsed_seconds:number;status:'paused'|'in_progress'|'completed'|'cancelled';updated_at:string};
export async function listActivityStudyProgress(db:SQLiteDatabase,activityId:string){return db.getAllAsync<ActivityStudyProgress>(`SELECT asp.id,asp.subactivity_id,sa.name subactivity_name,asp.section_name,asp.target_seconds,asp.elapsed_seconds,asp.status,asp.updated_at FROM activity_study_progress asp JOIN activity_subactivities sa ON sa.id=asp.subactivity_id WHERE asp.activity_id=? AND asp.status<>'cancelled' ORDER BY asp.updated_at DESC`,activityId)}
export async function startOrResumeActivityProgress(db:SQLiteDatabase,activity:LinkableActivity,subactivity:ActivitySubactivity,sectionName:string,targetMinutes?:number){
 const cleanSection=sectionName.trim()||subactivity.name;const subjectId=await ensureStudySubjectForActivity(db,activity),timestamp=nowIso();let progressId='';let remainingSeconds:number|null=null;
 await db.withExclusiveTransactionAsync(async tx=>{const existing=await tx.getFirstAsync<{id:string;target_seconds:number|null;elapsed_seconds:number;status:string}>(`SELECT id,target_seconds,elapsed_seconds,status FROM activity_study_progress WHERE activity_id=? AND subactivity_id=? AND section_name=? AND status IN('paused','in_progress') ORDER BY updated_at DESC LIMIT 1`,activity.id,subactivity.id,cleanSection);if(existing){progressId=existing.id;remainingSeconds=existing.target_seconds===null?null:Math.max(0,existing.target_seconds-existing.elapsed_seconds);await tx.runAsync("UPDATE activity_study_progress SET status='in_progress',updated_at=? WHERE id=?",timestamp,progressId)}else{progressId=Crypto.randomUUID();const target=targetMinutes&&targetMinutes>0?Math.round(targetMinutes*60):null;remainingSeconds=target;await tx.runAsync(`INSERT INTO activity_study_progress(id,user_id,activity_id,subactivity_id,section_name,target_seconds,elapsed_seconds,status,created_at,updated_at) VALUES(?,?,?,?,?,?,0,'in_progress',?,?)`,progressId,DEMO_USER_ID,activity.id,subactivity.id,cleanSection,target,timestamp,timestamp)}});
 return startStudySession(db,subjectId,cleanSection||subactivity.name,'Progreso de estudio','persistent',remainingSeconds,activity.id,undefined,subactivity.id,progressId);
}
export async function interruptStudySession(db:SQLiteDatabase,id:string){ await db.runAsync('UPDATE study_sessions SET interruptions=interruptions+1 WHERE id=?',id); }
export async function stopStudySession(db:SQLiteDatabase,id:string,note=''){const row=await db.getFirstAsync<{started_at:string}>('SELECT started_at FROM study_sessions WHERE id=?',id);if(!row)return;const end=new Date();await db.withExclusiveTransactionAsync(async tx=>{const elapsed=Math.round((end.getTime()-new Date(row.started_at).getTime())/1000);await tx.runAsync('UPDATE study_sessions SET ended_at=?,elapsed_seconds=?,note=? WHERE id=?',end.toISOString(),elapsed,note,id);const progress=await tx.getFirstAsync<{progress_id:string}>("SELECT progress_id FROM study_session_links WHERE session_id=? AND progress_id IS NOT NULL",id);if(progress?.progress_id){const total=await tx.getFirstAsync<{seconds:number}>('SELECT COALESCE(SUM(ss.elapsed_seconds),0) seconds FROM study_session_links sl JOIN study_sessions ss ON ss.id=sl.session_id WHERE sl.progress_id=? AND ss.ended_at IS NOT NULL',progress.progress_id);const target=await tx.getFirstAsync<{target_seconds:number|null}>('SELECT target_seconds FROM activity_study_progress WHERE id=?',progress.progress_id);const done=(total?.seconds??0);const completed=target?.target_seconds!==null&&done>=target!.target_seconds;await tx.runAsync('UPDATE activity_study_progress SET elapsed_seconds=?,status=?,updated_at=?,completed_at=? WHERE id=?',done,completed?'completed':'paused',end.toISOString(),completed?end.toISOString():null,progress.progress_id)}const request=await tx.getFirstAsync<{id:string;duration_minutes:number}>('SELECT sr.id,sr.duration_minutes FROM study_requests sr JOIN study_request_sessions srs ON srs.request_id=sr.id WHERE srs.session_id=?',id);if(request){const total=await tx.getFirstAsync<{seconds:number}>('SELECT COALESCE(SUM(ss.elapsed_seconds),0) seconds FROM study_request_sessions srs JOIN study_sessions ss ON ss.id=srs.session_id WHERE srs.request_id=?',request.id);await tx.runAsync('UPDATE study_requests SET status=?,session_id=NULL,updated_at=? WHERE id=?',(total?.seconds??0)>=request.duration_minutes*60?'completed':'pending',end.toISOString(),request.id)}})}
export async function finishStudySession(db:SQLiteDatabase,id:string,note=''){await stopStudySession(db,id,note);await db.withExclusiveTransactionAsync(async tx=>{const request=await tx.getFirstAsync<{id:string;duration_minutes:number}>('SELECT sr.id,sr.duration_minutes FROM study_requests sr JOIN study_request_sessions srs ON srs.request_id=sr.id WHERE srs.session_id=?',id);if(!request)return;const total=await tx.getFirstAsync<{seconds:number}>('SELECT COALESCE(SUM(ss.elapsed_seconds),0) seconds FROM study_request_sessions srs JOIN study_sessions ss ON ss.id=srs.session_id WHERE srs.request_id=?',request.id);await tx.runAsync('UPDATE study_requests SET status=?,session_id=NULL,updated_at=? WHERE id=?',(total?.seconds??0)>=request.duration_minutes*60?'completed':'pending',nowIso(),request.id)})}
export type StudyTimeReport={name:string;minutes:number;sessions:number};
export async function getStudyTimeReport(db:SQLiteDatabase,days=7){const since=new Date(Date.now()-days*24*60*60_000).toISOString();return db.getAllAsync<StudyTimeReport>(`SELECT COALESCE(a.title,s.name) name,CAST(COALESCE(SUM(ss.elapsed_seconds),0)/60 AS INTEGER) minutes,COUNT(ss.id) sessions FROM study_sessions ss JOIN study_subjects s ON s.id=ss.subject_id LEFT JOIN study_session_links sl ON sl.session_id=ss.id LEFT JOIN activities a ON a.id=sl.activity_id WHERE ss.user_id=? AND ss.started_at>=? AND ss.ended_at IS NOT NULL GROUP BY COALESCE(a.title,s.name) ORDER BY minutes DESC`,DEMO_USER_ID,since)}
export type StudyActivityStats={week_minutes:number;month_minutes:number;total_minutes:number;sessions:number};
export type RecentStudySession={id:string;topic:string;started_at:string;elapsed_seconds:number};
export async function getStudyActivityStats(db:SQLiteDatabase,activityId:string){const now=new Date();const week=new Date(now);week.setDate(now.getDate()-6);week.setHours(0,0,0,0);const month=new Date(now.getFullYear(),now.getMonth(),1);const row=await db.getFirstAsync<StudyActivityStats>(`SELECT CAST(COALESCE(SUM(CASE WHEN ss.started_at>=? THEN ss.elapsed_seconds ELSE 0 END),0)/60 AS INTEGER) week_minutes,CAST(COALESCE(SUM(CASE WHEN ss.started_at>=? THEN ss.elapsed_seconds ELSE 0 END),0)/60 AS INTEGER) month_minutes,CAST(COALESCE(SUM(ss.elapsed_seconds),0)/60 AS INTEGER) total_minutes,COUNT(ss.id) sessions FROM study_sessions ss JOIN study_session_links sl ON sl.session_id=ss.id WHERE sl.activity_id=? AND ss.ended_at IS NOT NULL`,week.toISOString(),month.toISOString(),activityId);return row??{week_minutes:0,month_minutes:0,total_minutes:0,sessions:0}}
export type ActivityExtraSummary={name:string;minutes:number;sessions:number};
export async function getActivityExtraSummary(db:SQLiteDatabase,activityId:string){return db.getAllAsync<ActivityExtraSummary>(`SELECT COALESCE(sa.name,ss.topic,'Tiempo extra') name,CAST(COALESCE(SUM(ss.elapsed_seconds),0)/60 AS INTEGER) minutes,COUNT(ss.id) sessions FROM study_sessions ss JOIN study_session_links sl ON sl.session_id=ss.id LEFT JOIN activity_subactivities sa ON sa.id=sl.subactivity_id WHERE sl.activity_id=? AND ss.ended_at IS NOT NULL GROUP BY COALESCE(sa.name,ss.topic,'Tiempo extra') ORDER BY minutes DESC`,activityId)}
export async function getScheduledClassMinutes(db:SQLiteDatabase,activityId:string){const row=await db.getFirstAsync<{minutes:number}>('SELECT CAST(COALESCE(SUM((julianday(ends_at)-julianday(starts_at))*1440),0) AS INTEGER) minutes FROM planned_blocks WHERE activity_id=? AND deleted_at IS NULL AND id IN(SELECT block_id FROM schedule_occurrences)',activityId);return row?.minutes??0}
export async function listRecentStudySessions(db:SQLiteDatabase,activityId:string){return db.getAllAsync<RecentStudySession>(`SELECT ss.id,ss.topic,ss.started_at,ss.elapsed_seconds FROM study_sessions ss JOIN study_session_links sl ON sl.session_id=ss.id WHERE sl.activity_id=? AND ss.ended_at IS NOT NULL ORDER BY ss.started_at DESC LIMIT 8`,activityId)}

export type ExpenseDefinition={id:string;name:string;amount:number;recurrence:string;category_id:string};
export async function listExpenseDefinitions(db:SQLiteDatabase){return db.getAllAsync<ExpenseDefinition>('SELECT id,name,amount,recurrence,category_id FROM expense_definitions WHERE user_id=? AND is_active=1 ORDER BY name',DEMO_USER_ID);}
export async function saveExpenseDefinition(db:SQLiteDatabase,name:string,amount:number,recurrence:string,categoryId:string=EXPENSE_CATEGORIES[3].id){const timestamp=nowIso();await db.runAsync(`INSERT INTO expense_definitions(id,user_id,name,amount,category_id,account_id,recurrence,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET amount=excluded.amount,category_id=excluded.category_id,recurrence=excluded.recurrence,is_active=1,updated_at=excluded.updated_at`,Crypto.randomUUID(),DEMO_USER_ID,name.trim(),amount,categoryId,'80000000-0000-0000-0000-000000000001',recurrence,1,timestamp,timestamp);}
export async function useExpenseDefinition(db:SQLiteDatabase,id:string){const item=await db.getFirstAsync<ExpenseDefinition>('SELECT id,name,amount,recurrence,category_id FROM expense_definitions WHERE id=? AND is_active=1',id);if(item)await createExpense(db,item.amount,item.name,item.category_id);}
export async function saveMonthlyBudget(db:SQLiteDatabase,amount:number){const date=new Date();const start=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-01`;const endDate=new Date(date.getFullYear(),date.getMonth()+1,0);const end=`${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;await db.runAsync(`INSERT INTO budgets VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,category_id,period_start,period_end) DO UPDATE SET amount=excluded.amount`,Crypto.randomUUID(),DEMO_USER_ID,'90000000-0000-0000-0000-000000000001',start,end,amount,'BOB');}
export type ActivityOutcomeReport={group_key:string;title:string;color:string;total:number;completed:number;partial:number;skipped:number;pending:number};
export type ActivityOutcomeDetail={id:string;group_key:string;starts_at:string;status:BlockStatus};
export async function getActivityOutcomeReport(db:SQLiteDatabase){return db.getAllAsync<ActivityOutcomeReport>(`WITH unique_blocks AS (SELECT DISTINCT pb.id,pb.activity_id,pb.status FROM planned_blocks pb WHERE pb.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id)) SELECT lower(trim(a.title)) group_key,MIN(trim(a.title)) title,COALESCE(MAX(ao.color),'#3157D5') color,COUNT(ub.id) total,COALESCE(SUM(CASE WHEN ub.status='completed' THEN 1 ELSE 0 END),0) completed,COALESCE(SUM(CASE WHEN ub.status='partial' THEN 1 ELSE 0 END),0) partial,COALESCE(SUM(CASE WHEN ub.status='skipped' THEN 1 ELSE 0 END),0) skipped,COALESCE(SUM(CASE WHEN ub.status NOT IN('completed','partial','skipped','cancelled','rescheduled') THEN 1 ELSE 0 END),0) pending FROM activities a LEFT JOIN activity_options ao ON ao.activity_id=a.id AND ao.deleted_at IS NULL JOIN unique_blocks ub ON ub.activity_id=a.id WHERE a.user_id=? AND a.deleted_at IS NULL GROUP BY lower(trim(a.title)) HAVING COUNT(ub.id)>0 ORDER BY MIN(trim(a.title))`,DEMO_USER_ID)}
export async function getActivityOutcomeDetails(db:SQLiteDatabase){return db.getAllAsync<ActivityOutcomeDetail>(`SELECT pb.id,lower(trim(a.title)) group_key,pb.starts_at,pb.status FROM planned_blocks pb JOIN activities a ON a.id=pb.activity_id WHERE a.user_id=? AND a.deleted_at IS NULL AND pb.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM auxiliary_blocks ab WHERE ab.block_id=pb.id) ORDER BY pb.starts_at DESC`,DEMO_USER_ID)}
export async function getWeeklySummary(db:SQLiteDatabase){const since=new Date(Date.now()-7*24*60*60_000).toISOString();return db.getFirstAsync<{planned:number;performed:number;minutes:number;expenses:number;recoveries:number;topics:string|null}>(`SELECT COUNT(DISTINCT pb.id) planned,COUNT(DISTINCT CASE WHEN pb.status IN('completed','partial') THEN pb.id END) performed,COALESCE(CAST(SUM(ts.elapsed_seconds)/60 AS INTEGER),0) minutes,(SELECT COALESCE(SUM(amount),0) FROM transactions WHERE occurred_at>=? AND kind='expense') expenses,(SELECT COUNT(*) FROM recovery_links WHERE created_at>=?) recoveries,(SELECT GROUP_CONCAT(DISTINCT topic) FROM progress_entries WHERE created_at>=? AND topic IS NOT NULL) topics FROM planned_blocks pb LEFT JOIN time_sessions ts ON ts.planned_block_id=pb.id WHERE pb.starts_at>=?`,since,since,since,since);}
