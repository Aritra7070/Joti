-- Run in Supabase SQL editor. The backend uses the service-role key (bypasses RLS).
create table if not exists public.jobs (
  id text primary key,
  status text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();

alter table public.jobs enable row level security;
-- no anon policies: only the service role reads/writes jobs
