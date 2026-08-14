-- ===========================================================================
-- Handwritten date under the printed signature.
--
-- Nullable on purpose: when it is null the document falls back to its own date
-- (the quotation's created_at, the contract's contract_date), so the field
-- fills itself and nothing has to be typed. It is only set when the signing
-- date genuinely differs from the issue date.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.quotations add column if not exists sign_date date;
alter table public.contracts  add column if not exists sign_date date;
