-- ============================================================
-- Structured address parts (separate fields in the profile form).
-- Office/Flat, Building, Street are stored separately; `location` stays the Area.
-- On save the app also composes them into `address` (newline-joined) for display.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ============================================================
alter table public.companies add column if not exists addr_office   text;
alter table public.companies add column if not exists addr_building text;
alter table public.companies add column if not exists addr_street   text;
