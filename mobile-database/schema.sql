pragma foreign_keys = on;
pragma journal_mode = wal;

create table if not exists profiles (
  user_id text primary key, display_name text not null, timezone text not null default 'America/La_Paz',
  currency_code text not null default 'BOB', locale text not null default 'es-BO',
  created_at text not null, updated_at text not null, version integer not null default 1, deleted_at text
) strict;
create table if not exists activity_categories (
  id text primary key,user_id text not null,name text not null,kind text not null,color text not null,icon text,
  created_at text not null,updated_at text not null,version integer not null default 1,deleted_at text,
  unique(user_id,name),check(kind in('study','training','work','rest','personal','other'))
) strict;
create table if not exists activities (
  id text primary key,user_id text not null,category_id text references activity_categories(id),title text not null,
  description text,default_duration_minutes integer,default_reminder_minutes integer,is_archived integer not null default 0,
  created_at text not null,updated_at text not null,version integer not null default 1,deleted_at text,
  check(default_duration_minutes is null or default_duration_minutes between 1 and 1440)
) strict;
create table if not exists activity_schedules (
  id text primary key,user_id text not null,activity_id text not null references activities(id),rrule text not null,
  local_start_time text not null,timezone text not null,duration_minutes integer not null,starts_on text not null,ends_on text,
  is_active integer not null default 1,created_at text not null,updated_at text not null,version integer not null default 1,deleted_at text
) strict;
create table if not exists planned_blocks (
  id text primary key,user_id text not null,activity_id text not null references activities(id),schedule_id text references activity_schedules(id),
  starts_at text not null,ends_at text not null,status text not null default 'planned',notes text,rescheduled_from_id text references planned_blocks(id),
  local_notification_id text,created_at text not null,updated_at text not null,version integer not null default 1,deleted_at text,
  check(status in('planned','in_progress','completed','partial','skipped','rescheduled','cancelled')),check(ends_at>starts_at)
) strict;
create table if not exists time_sessions (
  id text primary key,user_id text not null,activity_id text not null references activities(id),planned_block_id text references planned_blocks(id),
  started_at text not null,ended_at text,elapsed_seconds integer,note text,created_at text not null,updated_at text not null,
  version integer not null default 1,deleted_at text,check(ended_at is null or ended_at>=started_at)
) strict;
create unique index if not exists one_local_open_session on time_sessions(user_id) where ended_at is null and deleted_at is null;
create table if not exists session_pauses (
  id text primary key,user_id text not null,session_id text not null references time_sessions(id) on delete cascade,
  started_at text not null,ended_at text,created_at text not null,updated_at text not null,version integer not null default 1,deleted_at text
) strict;
create table if not exists activity_verifications (
  id text primary key,user_id text not null,planned_block_id text not null unique references planned_blocks(id),result text not null,
  completion_percent integer not null,reason text,actual_end_at text,shortened_minutes integer not null default 0,
  verified_at text not null,created_at text not null,updated_at text not null,
  version integer not null default 1,deleted_at text,check(result in('completed','partial','skipped','rescheduled')),
  check((result='completed' and completion_percent=100) or (result='partial' and completion_percent between 1 and 99) or (result in('skipped','rescheduled') and completion_percent=0))
) strict;
create table if not exists accounts (
  id text primary key,user_id text not null,name text not null,account_type text not null,currency_code text not null,
  opening_balance real not null default 0,is_archived integer not null default 0,created_at text not null,updated_at text not null,
  version integer not null default 1,deleted_at text,unique(user_id,name)
) strict;
create table if not exists financial_categories (
  id text primary key,user_id text not null,name text not null,kind text not null,color text not null,
  created_at text not null,updated_at text not null,version integer not null default 1,deleted_at text,
  check(kind in('income','expense','transfer','adjustment')),unique(user_id,name,kind)
) strict;
create table if not exists transactions (
  id text primary key,user_id text not null,account_id text not null references accounts(id),category_id text references financial_categories(id),
  kind text not null,amount real not null,currency_code text not null,occurred_at text not null,merchant text,note text,receipt_path text,
  locked_at text,reverses_transaction_id text references transactions(id),created_at text not null,updated_at text not null,
  version integer not null default 1,deleted_at text,check(amount>0),check(kind in('income','expense','transfer','adjustment'))
) strict;
create table if not exists budgets (
  id text primary key,user_id text not null,category_id text not null references financial_categories(id),period_start text not null,
  period_end text not null,amount real not null,currency_code text not null,created_at text not null,updated_at text not null,
  version integer not null default 1,deleted_at text,check(amount>0),unique(user_id,category_id,period_start,period_end)
) strict;
create table if not exists goals (
  id text primary key,user_id text not null,title text not null,metric text not null,target_value real not null,period text not null,
  starts_on text not null,ends_on text,is_active integer not null default 1,created_at text not null,updated_at text not null,
  version integer not null default 1,deleted_at text
) strict;
create table if not exists daily_reflections (
  id text primary key,user_id text not null,local_date text not null,energy integer,mood integer,note text,
  created_at text not null,updated_at text not null,version integer not null default 1,deleted_at text,unique(user_id,local_date)
) strict;
create table if not exists reminders (
  id text primary key,user_id text not null,planned_block_id text references planned_blocks(id),channel text not null,remind_at text not null,
  title text not null,body text,local_notification_id text,sent_at text,cancelled_at text,created_at text not null,updated_at text not null,
  version integer not null default 1,deleted_at text
) strict;
create table if not exists sync_outbox (
  operation_id text primary key,entity text not null,entity_id text not null,operation text not null,payload text not null,
  base_version integer,retry_count integer not null default 0,next_attempt_at text,created_at text not null,last_error text,
  check(operation in('insert','update','delete'))
) strict;
create table if not exists sync_state (
  scope text primary key,cursor_updated_at text,cursor_id text,last_success_at text
) strict;
create table if not exists sync_conflicts (
  id text primary key,entity text not null,entity_id text not null,local_payload text not null,remote_payload text not null,
  reason text not null,created_at text not null,resolved_at text,resolution text
) strict;
create trigger if not exists prevent_locked_transaction_update before update on transactions
when old.locked_at is not null begin select raise(abort,'Locked transactions are immutable; create a reversal'); end;
create trigger if not exists prevent_locked_transaction_delete before delete on transactions
when old.locked_at is not null begin select raise(abort,'Locked transactions are immutable; create a reversal'); end;
create trigger if not exists terminal_block_status before update of status on planned_blocks
when old.status in('completed','skipped','cancelled') and new.status<>old.status
begin select raise(abort,'A terminal planned block cannot change status'); end;

create view if not exists v_local_daily_activity_summary as
select substr(pb.starts_at,1,10) local_date,count(*) planned_count,
 sum(case when pb.status in('completed','partial') then 1 else 0 end) performed_count,
 cast(sum((julianday(pb.ends_at)-julianday(pb.starts_at))*1440) as integer) planned_minutes,
 coalesce(cast(sum(ts.elapsed_seconds)/60 as integer),0) actual_minutes
from planned_blocks pb left join time_sessions ts on ts.planned_block_id=pb.id and ts.deleted_at is null
where pb.deleted_at is null and pb.status<>'cancelled' group by substr(pb.starts_at,1,10);

create view if not exists v_local_budget_progress as
select b.id budget_id,b.amount budget_amount,coalesce(sum(case when t.kind='expense' then t.amount else 0 end),0) spent_amount
from budgets b left join transactions t on t.category_id=b.category_id and substr(t.occurred_at,1,10) between b.period_start and b.period_end and t.deleted_at is null
where b.deleted_at is null group by b.id;
