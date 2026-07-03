-- ===========================================================================
-- Claim verification audit trail — admin must call the registered number and
-- complete a verification checklist before a claim can be approved.
-- Stores what the admin checked, notes, who verified, and when.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.claim_requests add column if not exists verify_checklist jsonb;
alter table public.claim_requests add column if not exists verify_notes     text;
alter table public.claim_requests add column if not exists verified_by_name text;
alter table public.claim_requests add column if not exists verified_at      timestamptz;
