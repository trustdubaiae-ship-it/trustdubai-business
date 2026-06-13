-- ===========================================================================
-- Phase 1 — Quotation work-type templates + validity (run in Supabase → SQL Editor)
-- Safe to run multiple times (IF NOT EXISTS guards). Nothing is dropped.
-- ===========================================================================

-- 1) Work-type presets bundle (payment + terms + why-us) per company template.
--    Shape: [{ "name": "Joinery", "isDefault": true,
--             "payment": [{ "percent": 60, "label": "...", "description": "..." }],
--             "terms": "…", "whyUs": [{ "title": "...", "detail": "..." }] }]
alter table public.quotation_templates
  add column if not exists work_type_presets jsonb not null default '[]'::jsonb;

-- 2) Optional manual validity / expiry date on a quotation.
alter table public.quotations
  add column if not exists valid_until date;

-- 3) Which work-type preset the quote used (display + snapshot).
alter table public.quotations
  add column if not exists work_type text;

-- 4) Per-quote Terms & Conditions snapshot (each quote keeps its own T&C).
alter table public.quotations
  add column if not exists terms text;
