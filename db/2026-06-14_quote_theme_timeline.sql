-- ===========================================================================
-- Quotation visual theme (selectable colour template) + project timeline.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.quotations
  add column if not exists quote_theme      text default 'gold',   -- gold | royal | emerald | slate
  add column if not exists project_timeline jsonb;                 -- [{ phase, duration }]
