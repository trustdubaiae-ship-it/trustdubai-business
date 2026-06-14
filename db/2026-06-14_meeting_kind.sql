-- Meeting type so the calendar can distinguish meetings / site visits / calls.
-- Run in Supabase → SQL Editor. Safe to re-run.
alter table public.company_meetings
  add column if not exists kind text not null default 'meeting';  -- meeting | site_visit | call
