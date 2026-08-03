-- ============================================================
-- A subcontract awarded to us gets a REAL project row in our own company,
-- so the subcontractor gets the full project workspace (timeline, scope,
-- their own subcontractors, materials, site expenses, P&L) on work someone
-- else awarded them — not just a read-only statement.
--
-- The mirror row is created by the portal (Projects page) and points back at
-- the contractor's project_subcontractors row, which stays the source of truth
-- for the contract amount and the payments received.
-- Safe to re-run.
-- ============================================================

-- Plain uuid on purpose (no FK): the row it points at lives in the CONTRACTOR's
-- company and is only readable through fn_my_subcontracts. If the contractor
-- later removes the subcontract, the id simply stops resolving and the project
-- behaves like any normal project of ours — our own data is never lost.
alter table public.ops_projects
  add column if not exists awarded_sub_id uuid;

-- one mirror project per awarded subcontract, per company
create unique index if not exists ops_projects_awarded_sub_uidx
  on public.ops_projects(company_id, awarded_sub_id)
  where awarded_sub_id is not null;
