-- ===========================================================================
-- Project updates — a date-stamped history/timeline for each project. The
-- company logs site meetings, notes, special client requirements, material
-- changes and timeline changes here. Each entry can be flagged client-visible
-- and/or as needing client approval (used by the upcoming client view). For
-- timeline changes, old_date/new_date capture the original vs revised dates so
-- the full history of agreed → changed dates is preserved.
-- Company-scoped RLS via current_company_ids(). Run in Supabase → SQL Editor.
-- Safe to re-run.
-- ===========================================================================

create table if not exists public.project_updates (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  project_id      uuid not null,
  kind            text default 'note',        -- meeting | note | requirement | material | timeline | decision
  title           text,
  body            text,
  event_date      date default current_date,  -- the date this update relates to
  old_date        date,                        -- timeline change: previously agreed date
  new_date        date,                        -- timeline change: revised date
  client_visible  boolean default true,        -- show on the client view
  needs_approval  boolean default false,       -- change must be confirmed by the client
  approval_status text default 'none',         -- none | pending | approved | rejected
  client_response_at timestamptz,
  client_comment  text,
  created_by_email text,
  created_at      timestamptz default now()
);
create index if not exists project_updates_company_idx on public.project_updates(company_id);
create index if not exists project_updates_project_idx on public.project_updates(project_id);

alter table public.project_updates enable row level security;
drop policy if exists project_updates_rw on public.project_updates;
create policy project_updates_rw on public.project_updates for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));
