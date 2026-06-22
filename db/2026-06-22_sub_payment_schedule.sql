-- ===========================================================================
-- Subcontractor payment SCHEDULE — a custom list of stages shown on the LPO,
-- e.g. [{"label":"Advance on signing","pct":40},{"label":"On delivery","pct":30},
--       {"label":"On completion","pct":30}]. Stored as JSON.
-- payment_days (added earlier) is the credit period per certified invoice.
-- Safe to re-run.
-- ===========================================================================

alter table public.project_subcontractors add column if not exists payment_schedule jsonb default '[]'::jsonb;
