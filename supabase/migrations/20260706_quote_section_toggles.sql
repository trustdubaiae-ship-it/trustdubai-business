-- ============================================================
-- Quotation: separate show/hide toggles for the Terms, Payment schedule,
-- and Why-Choose-Us sections (previously bundled under show_footer).
-- Default TRUE so existing quotes keep showing all three.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ============================================================
alter table public.quotations add column if not exists show_terms   boolean default true;
alter table public.quotations add column if not exists show_payment boolean default true;
alter table public.quotations add column if not exists show_why_us  boolean default true;
