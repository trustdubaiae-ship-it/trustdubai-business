-- ===========================================================================
-- Persist quotation discount + an explicit VAT flag so editing a quote no
-- longer drops the discount or silently re-enables VAT. Run in Supabase →
-- SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.quotations
  add column if not exists discount_type  text,          -- null | 'percent' | 'flat'
  add column if not exists discount_value numeric default 0,
  add column if not exists vat_enabled    boolean;        -- null on old rows (inferred on edit)
