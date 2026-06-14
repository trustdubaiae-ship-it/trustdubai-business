-- Per-company private token for the phone calendar-sync feed (.ics).
-- The phone's Calendar app subscribes to a URL containing this token; it
-- refreshes periodically so new/updated meetings sync automatically and the
-- phone fires its own native reminders. Run in Supabase → SQL Editor. Safe to re-run.
alter table public.companies
  add column if not exists calendar_token uuid default gen_random_uuid();

update public.companies set calendar_token = gen_random_uuid() where calendar_token is null;

create unique index if not exists companies_calendar_token_idx on public.companies(calendar_token);
