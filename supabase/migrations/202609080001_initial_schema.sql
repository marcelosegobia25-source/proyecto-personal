begin;

create extension if not exists pgcrypto;
create extension if not exists pgtap with schema extensions;

create type public.activity_kind as enum ('study','training','work','rest','personal','other');
create type public.block_status as enum ('planned','in_progress','completed','partial','skipped','rescheduled','cancelled');
create type public.verification_result as enum ('completed','partial','skipped','rescheduled');
create type public.transaction_kind as enum ('income','expense','transfer','adjustment');
create type public.goal_period as enum ('daily','weekly','monthly','custom');
create type public.reminder_channel as enum ('local','push');

create or replace function public.set_updated_metadata()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  timezone text not null default 'America/La_Paz',
  currency_code text not null default 'BOB' check (currency_code ~ '^[A-Z]{3}$'),
  locale text not null default 'es-BO',
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz
);

create table public.activity_categories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60), kind public.activity_kind not null,
  color text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'), icon text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz,
  unique (user_id, name)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.activity_categories(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160), description text,
  default_duration_minutes integer check (default_duration_minutes between 1 and 1440),
  default_reminder_minutes integer check (default_reminder_minutes between 0 and 10080),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz
);

create table public.activity_schedules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  rrule text not null, local_start_time time not null, timezone text not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  starts_on date not null, ends_on date, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz,
  check (ends_on is null or ends_on >= starts_on)
);

create table public.planned_blocks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  schedule_id uuid references public.activity_schedules(id) on delete set null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status public.block_status not null default 'planned', notes text,
  rescheduled_from_id uuid references public.planned_blocks(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz,
  check (ends_at > starts_at),
  unique (schedule_id, starts_at)
);

create table public.time_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  planned_block_id uuid references public.planned_blocks(id) on delete set null,
  started_at timestamptz not null, ended_at timestamptz,
  elapsed_seconds integer check (elapsed_seconds is null or elapsed_seconds >= 0), note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create unique index one_open_session_per_user on public.time_sessions(user_id)
where ended_at is null and deleted_at is null;

create table public.session_pauses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.time_sessions(id) on delete cascade,
  started_at timestamptz not null, ended_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

create table public.activity_verifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  planned_block_id uuid not null references public.planned_blocks(id) on delete cascade,
  result public.verification_result not null, completion_percent smallint not null check (completion_percent between 0 and 100),
  reason text, actual_end_at timestamptz, shortened_minutes integer not null default 0 check (shortened_minutes>=0),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz,
  unique (planned_block_id),
  check ((result='completed' and completion_percent=100)
      or (result='partial' and completion_percent between 1 and 99)
      or (result in ('skipped','rescheduled') and completion_percent=0))
);

create table public.goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160), metric text not null,
  target_value numeric(14,2) not null check (target_value > 0), period public.goal_period not null,
  starts_on date not null, ends_on date, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz,
  check (ends_on is null or ends_on >= starts_on)
);

create table public.goal_progress (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  period_start date not null, period_end date not null, actual_value numeric(14,2) not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz,
  check (period_end >= period_start), unique(goal_id, period_start, period_end)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80), account_type text not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), opening_balance numeric(16,2) not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz, unique(user_id,name)
);

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60), kind public.transaction_kind not null,
  color text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz, unique(user_id,name,kind)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  category_id uuid references public.financial_categories(id) on delete set null,
  kind public.transaction_kind not null, amount numeric(16,2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'), occurred_at timestamptz not null,
  merchant text, note text, receipt_path text, transfer_pair_id uuid,
  locked_at timestamptz, reverses_transaction_id uuid references public.transactions(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.financial_categories(id) on delete cascade,
  period_start date not null, period_end date not null, amount numeric(16,2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz,
  check(period_end >= period_start), unique(user_id,category_id,period_start,period_end)
);

create table public.daily_reflections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null, energy smallint check (energy between 1 and 5), mood smallint check (mood between 1 and 5),
  note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz, unique(user_id,local_date)
);

create table public.device_installations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check(platform in ('android','ios')), device_name text,
  push_token text, push_enabled boolean not null default false, last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz, unique(user_id,push_token)
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  planned_block_id uuid references public.planned_blocks(id) on delete cascade,
  channel public.reminder_channel not null, remind_at timestamptz not null,
  title text not null, body text, sent_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version bigint not null default 1, deleted_at timestamptz
);

create table public.processed_sync_operations (
  operation_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null, entity_id uuid not null, processed_at timestamptz not null default now(), result jsonb
);

create table public.audit_log (
  id bigint generated always as identity primary key, user_id uuid,
  table_name text not null, row_id uuid, action text not null,
  old_data jsonb, new_data jsonb, occurred_at timestamptz not null default now()
);

create or replace function public.validate_owned_references()
returns trigger language plpgsql as $$
declare reference_owner uuid;
begin
  if tg_table_name = 'activities' and new.category_id is not null then
    select user_id into reference_owner from public.activity_categories where id=new.category_id;
  elsif tg_table_name = 'planned_blocks' then
    select user_id into reference_owner from public.activities where id=new.activity_id;
    if reference_owner is distinct from new.user_id then raise exception 'Activity must belong to the same user'; end if;
    if new.schedule_id is not null then select user_id into reference_owner from public.activity_schedules where id=new.schedule_id; end if;
  elsif tg_table_name = 'time_sessions' then
    select user_id into reference_owner from public.activities where id=new.activity_id;
    if reference_owner is distinct from new.user_id then raise exception 'Activity must belong to the same user'; end if;
    if new.planned_block_id is not null then select user_id into reference_owner from public.planned_blocks where id=new.planned_block_id; end if;
  elsif tg_table_name = 'activity_schedules' then
    select user_id into reference_owner from public.activities where id=new.activity_id;
  elsif tg_table_name = 'session_pauses' then
    select user_id into reference_owner from public.time_sessions where id=new.session_id;
  elsif tg_table_name = 'activity_verifications' then
    select user_id into reference_owner from public.planned_blocks where id=new.planned_block_id;
  elsif tg_table_name = 'goal_progress' then
    select user_id into reference_owner from public.goals where id=new.goal_id;
  elsif tg_table_name = 'transactions' then
    select user_id into reference_owner from public.accounts where id=new.account_id;
    if reference_owner is distinct from new.user_id then raise exception 'Account must belong to the same user'; end if;
    if new.category_id is not null then select user_id into reference_owner from public.financial_categories where id=new.category_id; end if;
  elsif tg_table_name = 'budgets' then
    select user_id into reference_owner from public.financial_categories where id=new.category_id;
  elsif tg_table_name = 'reminders' and new.planned_block_id is not null then
    select user_id into reference_owner from public.planned_blocks where id=new.planned_block_id;
  end if;
  if reference_owner is distinct from new.user_id then
    raise exception 'Referenced row must belong to the same user';
  end if;
  return new;
end; $$;

create or replace function public.compute_session_elapsed()
returns trigger language plpgsql as $$
declare paused integer;
begin
  if new.ended_at is null then new.elapsed_seconds := null; return new; end if;
  select coalesce(sum(extract(epoch from (coalesce(ended_at,new.ended_at)-started_at)))::integer,0)
    into paused from public.session_pauses where session_id=new.id and deleted_at is null;
  new.elapsed_seconds := greatest(0, extract(epoch from (new.ended_at-new.started_at))::integer-paused);
  return new;
end; $$;

create or replace function public.validate_block_transition()
returns trigger language plpgsql as $$
begin
  if old.status in ('completed','skipped','cancelled') and new.status <> old.status then
    raise exception 'A terminal planned block cannot change status';
  end if;
  return new;
end; $$;

create or replace function public.protect_locked_transaction()
returns trigger language plpgsql as $$
begin
  if old.locked_at is not null and (tg_op = 'DELETE' or to_jsonb(new) is distinct from to_jsonb(old)) then
    raise exception 'Locked transactions are immutable; create a reversal';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create or replace function public.audit_sensitive_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare payload jsonb; owner uuid; rid uuid;
begin
  payload := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  owner := (payload->>'user_id')::uuid; rid := (payload->>'id')::uuid;
  insert into public.audit_log(user_id,table_name,row_id,action,old_data,new_data)
  values(owner,tg_table_name,rid,tg_op,case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new,old);
end; $$;

do $$ declare t text; begin
  foreach t in array array['profiles','activity_categories','activities','activity_schedules','planned_blocks','time_sessions','session_pauses','activity_verifications','goals','goal_progress','accounts','financial_categories','transactions','budgets','daily_reflections','device_installations','reminders'] loop
    execute format('create trigger set_metadata before update on public.%I for each row execute function public.set_updated_metadata()',t);
  end loop;
end $$;

create trigger activities_owner before insert or update on public.activities for each row execute function public.validate_owned_references();
create trigger schedules_owner before insert or update on public.activity_schedules for each row execute function public.validate_owned_references();
create trigger blocks_owner before insert or update on public.planned_blocks for each row execute function public.validate_owned_references();
create trigger sessions_owner before insert or update on public.time_sessions for each row execute function public.validate_owned_references();
create trigger pauses_owner before insert or update on public.session_pauses for each row execute function public.validate_owned_references();
create trigger verifications_owner before insert or update on public.activity_verifications for each row execute function public.validate_owned_references();
create trigger progress_owner before insert or update on public.goal_progress for each row execute function public.validate_owned_references();
create trigger transactions_owner before insert or update on public.transactions for each row execute function public.validate_owned_references();
create trigger budgets_owner before insert or update on public.budgets for each row execute function public.validate_owned_references();
create trigger reminders_owner before insert or update on public.reminders for each row execute function public.validate_owned_references();
create trigger session_elapsed before insert or update of ended_at on public.time_sessions for each row execute function public.compute_session_elapsed();
create trigger block_transition before update of status on public.planned_blocks for each row execute function public.validate_block_transition();
create trigger locked_transaction before update or delete on public.transactions for each row execute function public.protect_locked_transaction();
create trigger audit_transactions after insert or update or delete on public.transactions for each row execute function public.audit_sensitive_change();
create trigger audit_verifications after insert or update or delete on public.activity_verifications for each row execute function public.audit_sensitive_change();

create index blocks_user_start_idx on public.planned_blocks(user_id,starts_at) where deleted_at is null;
create index sessions_user_start_idx on public.time_sessions(user_id,started_at) where deleted_at is null;
create index transactions_user_occurred_idx on public.transactions(user_id,occurred_at) where deleted_at is null;
create index reminders_due_idx on public.reminders(remind_at) where sent_at is null and cancelled_at is null and deleted_at is null;

create or replace view public.v_schedule_conflicts with (security_invoker=true) as
select a.user_id,a.id as block_id,b.id as conflicts_with_id,
       greatest(a.starts_at,b.starts_at) as overlap_starts_at,
       least(a.ends_at,b.ends_at) as overlap_ends_at
from public.planned_blocks a join public.planned_blocks b
  on a.user_id=b.user_id and a.id<b.id and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)')
where a.deleted_at is null and b.deleted_at is null
  and a.status not in ('cancelled','rescheduled') and b.status not in ('cancelled','rescheduled');

create or replace view public.v_daily_activity_summary with (security_invoker=true) as
select pb.user_id,(pb.starts_at at time zone p.timezone)::date as local_date,
 count(*) as planned_count,
 count(*) filter(where pb.status in ('completed','partial')) as performed_count,
 sum(extract(epoch from(pb.ends_at-pb.starts_at))/60)::integer as planned_minutes,
 coalesce(sum(ts.elapsed_seconds)/60,0)::integer as actual_minutes,
 round(least(1::numeric,coalesce(sum(ts.elapsed_seconds),0)::numeric/nullif(sum(extract(epoch from(pb.ends_at-pb.starts_at))),0))*100,1) as adherence_percent
from public.planned_blocks pb join public.profiles p on p.user_id=pb.user_id
left join public.time_sessions ts on ts.planned_block_id=pb.id and ts.deleted_at is null and ts.ended_at is not null
where pb.deleted_at is null and pb.status <> 'cancelled'
group by pb.user_id,(pb.starts_at at time zone p.timezone)::date;

create or replace view public.v_budget_progress with (security_invoker=true) as
select b.id as budget_id,b.user_id,b.category_id,b.period_start,b.period_end,b.amount as budget_amount,b.currency_code,
 coalesce(sum(t.amount) filter(where t.kind='expense'),0) as spent_amount,
 round(coalesce(sum(t.amount) filter(where t.kind='expense'),0)/nullif(b.amount,0)*100,1) as used_percent
from public.budgets b join public.profiles p on p.user_id=b.user_id
left join public.transactions t on t.user_id=b.user_id and t.category_id=b.category_id
 and t.occurred_at >= (b.period_start::timestamp at time zone p.timezone)
 and t.occurred_at < ((b.period_end+1)::timestamp at time zone p.timezone) and t.deleted_at is null
where b.deleted_at is null group by b.id;

do $$ declare t text; begin
  foreach t in array array['profiles','activity_categories','activities','activity_schedules','planned_blocks','time_sessions','session_pauses','activity_verifications','goals','goal_progress','accounts','financial_categories','transactions','budgets','daily_reflections','device_installations','reminders','processed_sync_operations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()))','own_'||t,t);
  end loop;
end $$;
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon,authenticated;
revoke all on public.v_schedule_conflicts,public.v_daily_activity_summary,public.v_budget_progress from anon;
grant select on public.v_schedule_conflicts,public.v_daily_activity_summary,public.v_budget_progress to authenticated;

commit;
