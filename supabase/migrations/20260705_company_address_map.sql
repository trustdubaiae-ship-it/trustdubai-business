-- ============================================================
-- Company full address + Google Maps link (shown on the public profile).
-- `location` (short area, e.g. "Business Bay") stays for chips/SEO;
-- `address` = full street address; `map_link` = the company's Google Maps URL.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ============================================================
alter table public.companies add column if not exists address  text;
alter table public.companies add column if not exists map_link text;
