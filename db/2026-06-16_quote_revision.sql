-- ===========================================================================
-- Quotation revision number. When a quote is re-issued after changes (e.g. a
-- discount), the quote number stays the same but the revision is bumped so the
-- client (and you) can tell versions apart — shown as "Rev. N" on the quote.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.quotations add column if not exists revision integer default 0;
