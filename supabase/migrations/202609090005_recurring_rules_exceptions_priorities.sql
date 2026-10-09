begin;
create table public.activity_options(
 activity_id uuid primary key references public.activities(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 priority text not null default 'normal' check(priority in('low','normal','high','critical')),is_paused boolean not null default false,deleted_at timestamptz
);
create table public.schedule_rules(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,schedule_id uuid not null references public.activity_schedules(id) on delete cascade,
 weekday smallint not null check(weekday between 0 and 6),local_start_time time not null,duration_minutes integer not null check(duration_minutes>0),
 preparation_minutes integer not null default 0 check(preparation_minutes>=0),travel_out_minutes integer not null default 0 check(travel_out_minutes>=0),
 buffer_minutes integer not null default 0 check(buffer_minutes>=0),travel_return_minutes integer not null default 0 check(travel_return_minutes>=0),unique(schedule_id,weekday)
);
create table public.schedule_exceptions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,schedule_id uuid not null references public.activity_schedules(id) on delete cascade,
 block_id uuid references public.planned_blocks(id) on delete set null,occurrence_date date not null,action text not null check(action in('modified','excluded')),
 starts_at timestamptz,ends_at timestamptz,preparation_minutes integer,travel_out_minutes integer,buffer_minutes integer,travel_return_minutes integer,
 created_at timestamptz not null default now(),unique(schedule_id,occurrence_date),check(action='excluded' or (starts_at is not null and ends_at>starts_at))
);
do $$ declare t text;begin foreach t in array array['activity_options','schedule_rules','schedule_exceptions'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon',t);execute format('grant select,insert,update,delete on public.%I to authenticated',t);execute format('create policy %I on public.%I for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))','own_'||t,t);end loop;end $$;
commit;
