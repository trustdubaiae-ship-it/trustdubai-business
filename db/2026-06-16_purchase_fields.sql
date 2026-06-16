-- ===========================================================================
-- Purchase bill extra fields: link a purchase to a project/purpose, who bought
-- it, and how it was paid (mode + remark). Makes each entry self-explanatory:
-- who · for what · how. Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.purchase_invoices add column if not exists project_id     uuid;
alter table public.purchase_invoices add column if not exists project_name    text;   -- project / purpose / site
alter table public.purchase_invoices add column if not exists purchased_by    text;   -- who made the purchase
alter table public.purchase_invoices add column if not exists method          text default 'Cash';  -- mode of payment
alter table public.purchase_invoices add column if not exists payment_remark  text;   -- e.g. card last 4, cheque no, bank ref
