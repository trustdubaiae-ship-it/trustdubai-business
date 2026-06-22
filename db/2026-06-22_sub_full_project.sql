-- ===========================================================================
-- Subcontractor full-project flag — when true, the LPO carries a note that this
-- subcontractor is responsible for the entire project (not just assigned scope).
-- Safe to re-run.
-- ===========================================================================

alter table public.project_subcontractors add column if not exists full_project boolean default false;
