-- ===========================================================================
-- Subcontractor payment terms — editable per subcontractor, shown on the LPO.
-- retention_pct: % held back, released after defects liability period
-- payment_days:  days to pay a certified invoice
-- advance_pct:   advance % payable on mobilization (0 = none)
-- Safe to re-run.
-- ===========================================================================

alter table public.project_subcontractors add column if not exists retention_pct numeric default 10;
alter table public.project_subcontractors add column if not exists payment_days  integer default 30;
alter table public.project_subcontractors add column if not exists advance_pct   numeric default 0;
