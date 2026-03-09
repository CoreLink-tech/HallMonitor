-- Run this in Supabase SQL Editor once.
create table if not exists public.hallmonitor_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.hallmonitor_state enable row level security;

-- Public read/write for anon key (temporary open mode).
-- Replace with stricter policies before production.
drop policy if exists hallmonitor_state_select on public.hallmonitor_state;
create policy hallmonitor_state_select
on public.hallmonitor_state
for select
using (true);

drop policy if exists hallmonitor_state_insert on public.hallmonitor_state;
create policy hallmonitor_state_insert
on public.hallmonitor_state
for insert
with check (true);

drop policy if exists hallmonitor_state_update on public.hallmonitor_state;
create policy hallmonitor_state_update
on public.hallmonitor_state
for update
using (true)
with check (true);

-- Optional: seed empty row (the app will also auto-create this row on first write).
insert into public.hallmonitor_state (id, payload)
values ('global', '{"meta":{"seededAt":"2026-01-01T00:00:00.000Z","version":4},"universities":[],"admins":[],"superAdmins":[{"id":1,"username":"ashedavid2005@gmail.com","password":"p1a2s3@code","displayName":"Primary Super Admin"}],"halls":[],"activity":[]}'::jsonb)
on conflict (id) do nothing;
