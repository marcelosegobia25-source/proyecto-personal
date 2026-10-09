begin;

create type public.auxiliary_role as enum ('preparation','travel','buffer','return');
create type public.recovery_status as enum ('pending','recovered','completed_late','discarded');

create table public.auxiliary_blocks (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 parent_block_id uuid not null references public.planned_blocks(id) on delete cascade,
 block_id uuid not null unique references public.planned_blocks(id) on delete cascade,role public.auxiliary_role not null
);
create table public.recovery_links (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 original_block_id uuid not null references public.planned_blocks(id),recovery_block_id uuid not null unique references public.planned_blocks(id),
 minutes_pending integer not null check(minutes_pending>0),status public.recovery_status not null default 'pending',created_at timestamptz not null default now()
);
create table public.progress_entries (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 activity_id uuid not null references public.activities(id),planned_block_id uuid references public.planned_blocks(id),topic text,
 pages_from integer,pages_to integer,exercises_done integer,exercises_correct integer,concentration smallint check(concentration between 1 and 5),
 difficulty text,next_step text,note text,metrics jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),version bigint not null default 1,deleted_at timestamptz
);
create table public.study_subjects (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null,color text not null default '#3157D5',created_at timestamptz not null default now(),unique(user_id,name)
);
create table public.study_sessions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 subject_id uuid not null references public.study_subjects(id),topic text,objective text,mode text not null,target_seconds integer,
 started_at timestamptz not null,ended_at timestamptz,elapsed_seconds integer,interruptions integer not null default 0,note text,
 check(ended_at is null or ended_at>=started_at)
);
create unique index one_open_study_session_cloud on public.study_sessions(user_id) where ended_at is null;
create table public.expense_definitions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null,
 amount numeric(16,2) not null check(amount>0),category_id uuid not null references public.financial_categories(id),account_id uuid not null references public.accounts(id),
 recurrence text not null default 'manual',is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),version bigint not null default 1,deleted_at timestamptz,unique(user_id,name)
);

do $$ declare t text; begin
 foreach t in array array['progress_entries','expense_definitions'] loop execute format('create trigger set_metadata before update on public.%I for each row execute function public.set_updated_metadata()',t); end loop;
 foreach t in array array['auxiliary_blocks','recovery_links','progress_entries','study_subjects','study_sessions','expense_definitions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon',t);execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))','own_'||t,t);
 end loop;
end $$;

commit;
