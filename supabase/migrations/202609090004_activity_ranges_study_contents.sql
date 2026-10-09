begin;

create table public.study_contents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.study_subjects(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  material_reference text not null default '',
  position integer not null check (position > 0),
  status text not null default 'pending' check (status in ('pending','in_progress','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  deleted_at timestamptz,
  unique(subject_id, position)
);

create trigger set_metadata before update on public.study_contents
for each row execute function public.set_updated_metadata();

alter table public.study_contents enable row level security;
revoke all on public.study_contents from anon;
grant select,insert,update,delete on public.study_contents to authenticated;
create policy own_study_contents on public.study_contents for all to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

alter table public.study_subjects add constraint study_subject_name_not_blank check(length(trim(name))>0);
alter table public.expense_definitions add constraint expense_definition_name_not_blank check(length(trim(name))>0);
alter table public.activity_schedules add constraint activity_schedule_valid_range check(ends_on>=starts_on);

commit;
