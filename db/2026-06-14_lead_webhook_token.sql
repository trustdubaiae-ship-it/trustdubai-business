-- ===========================================================================
-- Per-company lead webhook token (multi-tenant Meta/Zapier lead intake).
-- Each company gets a unique token; the incoming-lead edge function maps the
-- token -> company so each company's Meta leads land in their own My Leads.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.companies
  add column if not exists lead_webhook_token uuid default gen_random_uuid();

-- backfill any existing rows that are null
update public.companies
   set lead_webhook_token = gen_random_uuid()
 where lead_webhook_token is null;

-- unique + fast lookup by token
create unique index if not exists companies_lead_webhook_token_idx
  on public.companies(lead_webhook_token);
