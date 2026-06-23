-- ===========================================================================
-- Subcontractor "Add 5% VAT" toggle — when true, the LPO shows 5% VAT.
-- Default true (existing rows keep VAT); untick for non-VAT subcontractors.
-- Safe to re-run.
-- ===========================================================================

alter table public.project_subcontractors add column if not exists apply_vat boolean default true;
