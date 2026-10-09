import { readFileSync,readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../mobile/lib/database.ts',import.meta.url),'utf8');
const match=source.match(/await db\.execAsync\(`([\s\S]*?)`\);/);
assert(match,'No se encontró el esquema SQLite embebido');
const db=new DatabaseSync(':memory:');db.exec(match[1]);
const tables=db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'").all().map(x=>x.name);
for(const required of ['activities','activity_schedules','schedule_rules','planned_blocks','auxiliary_blocks','study_sessions','study_session_links','transactions','sync_outbox','change_audit'])assert(tables.includes(required),'Falta tabla '+required);
for(const table of tables.filter(x=>!['schedule_occurrences'].includes(x))){const columns=db.prepare('pragma table_info('+table+')').all();assert(columns.some(x=>x.pk>0),'Tabla sin PK: '+table)}
assert.equal(db.prepare('pragma foreign_key_check').all().length,0,'FK inválidas');
const triggers=db.prepare("select name from sqlite_master where type='trigger'").all().map(x=>x.name);for(const name of ['audit_activity_update','audit_planned_block_update','prevent_invalid_block_update','prevent_negative_schedule_rule_update'])assert(triggers.includes(name),'Falta trigger '+name);
const now='2026-09-09T12:00:00.000Z';db.prepare('insert into activity_categories values(?,?,?,?,?)').run('cat','u','General','other','#000');db.prepare('insert into activities(id,user_id,category_id,title,default_duration_minutes,created_at,updated_at) values(?,?,?,?,?,?,?)').run('a','u','cat','Clase',60,now,now);db.prepare("insert into planned_blocks(id,user_id,activity_id,starts_at,ends_at,status,created_at,updated_at) values(?,?,?,?,?,'planned',?,?)").run('b','u','a','2026-09-10T10:00:00Z','2026-09-10T11:00:00Z',now,now);
assert.throws(()=>db.prepare('update planned_blocks set ends_at=? where id=?').run('2026-09-10T09:00:00Z','b'));
db.prepare('update planned_blocks set starts_at=?,ends_at=?,version=version+1 where id=?').run('2026-09-10T12:00:00Z','2026-09-10T13:00:00Z','b');assert.equal(db.prepare("select count(*) n from change_audit where entity='planned_blocks'").get().n,1);
db.prepare('insert into time_sessions(id,user_id,activity_id,planned_block_id,started_at,created_at,updated_at) values(?,?,?,?,?,?,?)').run('t1','u','a','b',now,now,now);assert.throws(()=>db.prepare('insert into time_sessions(id,user_id,activity_id,planned_block_id,started_at,created_at,updated_at) values(?,?,?,?,?,?,?)').run('t2','u','a','b',now,now,now));
assert(!source.includes("if(index===0||scope==='one')"),'Solo se actualizaba el primer auxiliar');assert(source.includes('await upsertAuxiliary'),'No existe regeneración de auxiliares');
for(const file of readdirSync(new URL('../supabase/migrations',import.meta.url)).filter(x=>x.endsWith('.sql'))){const sql=readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8').trim().toLowerCase();assert(sql.startsWith('begin;')&&sql.endsWith('commit;'),'Migración no transaccional: '+file)}
console.log(JSON.stringify({ok:true,tables:tables.length,triggers:triggers.length,foreignKeyErrors:0,tests:['PK','FK','CHECK de horas','auditoría','sesión única','actualización de todos los auxiliares','migraciones transaccionales']},null,2));
