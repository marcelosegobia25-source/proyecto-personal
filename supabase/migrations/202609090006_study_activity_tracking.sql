begin;
create table public.study_activity_subjects(
 activity_id uuid primary key references public.activities(id) on delete cascade,
 subject_id uuid not null unique references public.study_subjects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade
);
create table public.study_session_links(
 session_id uuid primary key references public.study_sessions(id) on delete cascade,
 activity_id uuid not null references public.activities(id) on delete cascade,
 content_id uuid references public.study_contents(id) on delete set null
);
alter table public.study_activity_subjects enable row level security;
revoke all on public.study_activity_subjects from anon;
grant select,insert,update,delete on public.study_activity_subjects to authenticated;
create policy own_study_activity_subjects on public.study_activity_subjects for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
alter table public.study_session_links enable row level security;
revoke all on public.study_session_links from anon;
grant select,insert,update,delete on public.study_session_links to authenticated;
create policy own_study_session_links_v2 on public.study_session_links for all to authenticated using(exists(select 1 from public.study_sessions s where s.id=session_id and s.user_id=(select auth.uid()))) with check(exists(select 1 from public.study_sessions s where s.id=session_id and s.user_id=(select auth.uid())));
commit;
