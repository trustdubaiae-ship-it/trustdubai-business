-- Customer TRN (Tax Registration Number) for FTA-compliant tax invoices.
-- Captured on the quotation and carried onto the invoice. Run in Supabase →
-- SQL Editor. Safe to re-run.

alter table public.quotations add column if not exists client_trn text;
alter table public.invoices   add column if not exists client_trn text;
