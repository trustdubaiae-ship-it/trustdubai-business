-- ===========================================================================
-- Subcontractor "Additional work" — extra work done on a project beyond the
-- original scope, stored as a JSON array of { id, label, amount, date } items.
-- These amounts are folded into contract_amount (pre-VAT) so the balance,
-- Statement of Account and dashboards all reflect the added work automatically.
-- Safe to re-run.
-- ===========================================================================

alter table public.project_subcontractors
  add column if not exists extra_work jsonb not null default '[]'::jsonb;
