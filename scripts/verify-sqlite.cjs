const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync('mobile-database/schema.sql', 'utf8'));
db.exec(fs.readFileSync('mobile-database/seed.sql', 'utf8'));

const daily = db.prepare('select * from v_local_daily_activity_summary').all();
const budgets = db.prepare('select * from v_local_budget_progress').all();

db.prepare(`insert into time_sessions values(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
  'session-open-1', 'offline-user', '30000000-0000-0000-0000-000000000001', null,
  '2026-09-08T10:00:00Z', null, null, null, '2026-09-08T10:00:00Z',
  '2026-09-08T10:00:00Z', 1, null
);
let openSessionGuard = false;
try {
  db.prepare(`insert into time_sessions values(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'session-open-2', 'offline-user', '30000000-0000-0000-0000-000000000001', null,
    '2026-09-08T11:00:00Z', null, null, null, '2026-09-08T11:00:00Z',
    '2026-09-08T11:00:00Z', 1, null
  );
} catch {
  openSessionGuard = true;
}

if (!openSessionGuard) throw new Error('Open session uniqueness was not enforced');
if (daily.length !== 1 || daily[0].actual_minutes !== 82) throw new Error('Daily summary is incorrect');
if (budgets.length !== 1 || budgets[0].spent_amount !== 28.5) throw new Error('Budget summary is incorrect');
if (db.prepare('pragma integrity_check').get().integrity_check !== 'ok') throw new Error('SQLite integrity check failed');

console.log(JSON.stringify({ ok: true, daily, budgets, openSessionGuard }, null, 2));
