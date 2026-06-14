-- Subcontractors per project (MEP / Gypsum / Tiles / Joinery ...) — a key cost
-- in fit-out jobs. contract_amount = agreed price to pay them; paid_amount =
-- paid so far; balance = contract − paid. Feeds the project P&L.
-- Run in Supabase → SQL Editor. Safe to re-run.
create table if not exists public.project_subcontractors (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  project_id      uuid not null,
  name            text not null,
  trade           text,                         -- MEP | Gypsum | Tiles | Joinery | Painting | ...
  phone           text,
  contract_amount numeric default 0,
  paid_amount     numeric default 0,
  status          text not null default 'ongoing',  -- ongoing | completed | on_hold
  notes           text,
  created_at      timestamptz default now()
);
create index if not exists project_subs_company_idx on public.project_subcontractors(company_id);
create index if not exists project_subs_project_idx on public.project_subcontractors(project_id);

alter table public.project_subcontractors enable row level security;
drop policy if exists project_subs_rw on public.project_subcontractors;
create policy project_subs_rw on public.project_subcontractors for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));
