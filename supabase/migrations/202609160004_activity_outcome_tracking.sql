alter table public.activity_verifications
  add column if not exists actual_end_at timestamptz,
  add column if not exists shortened_minutes integer not null default 0;

alter table public.activity_verifications
  drop constraint if exists activity_verifications_shortened_minutes_check;

alter table public.activity_verifications
  add constraint activity_verifications_shortened_minutes_check check (shortened_minutes >= 0);
