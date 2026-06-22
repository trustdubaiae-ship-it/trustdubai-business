-- ===========================================================================
-- Subcontractor extra details — contact person, owner, VAT/TRN, project code.
-- Shown on the LPO. All manual / optional. Safe to re-run.
-- ===========================================================================

alter table public.project_subcontractors add column if not exists contact_person text;
alter table public.project_subcontractors add column if not exists owner_name    text;
alter table public.project_subcontractors add column if not exists owner_mobile  text;
alter table public.project_subcontractors add column if not exists vat_no        text;
alter table public.project_subcontractors add column if not exists project_code  text;
