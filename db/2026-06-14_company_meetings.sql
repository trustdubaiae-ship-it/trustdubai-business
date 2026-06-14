-- ===========================================================================
-- Company Meetings — shared (owner + staff) meeting scheduler with reminders,
-- lead linkage and Minutes of Meeting (MOM) follow-up. Separate from the
-- personal "My Organizer" (which is owner_email-private).
-- Company-scoped RLS via current_company_ids() so any company member can use it.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

create table if not exists public.company_meetings (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  created_by_email text,
  title           text not null,
  start_at        timestamptz not null,
  remind_minutes  int  default 30,
  location        text,
  notes           text,
  lead_id         text,
  lead_name       text,
  status          text not null default 'scheduled',  -- scheduled | done | cancelled
  mom             text,
  follow_up_date  date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists company_meetings_company_idx on public.company_meetings(company_id);
create index if not exists company_meetings_start_idx   on public.company_meetings(start_at);
create index if not exists company_meetings_lead_idx    on public.company_meetings(lead_id);

alter table public.company_meetings enable row level security;

drop policy if exists company_meetings_rw on public.company_meetings;
create policy company_meetings_rw on public.company_meetings
  for all
  to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));
