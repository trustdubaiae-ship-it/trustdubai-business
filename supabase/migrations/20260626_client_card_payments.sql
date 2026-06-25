-- ============================================================
-- Client card payments (Stripe) — LOCKED to specific companies.
-- Only companies with client_pay_enabled = true may generate a
-- "Pay by card" link for their clients. All such payments settle into
-- the single Renofix Plus Technical Contracting Stripe account, so the
-- client's statement shows that entity (descriptor "RENOFIX CONTRACTING").
-- This is intentionally NOT offered to every business — doing so would
-- pool other companies' money into one account (aggregator/licensing risk).
-- For a platform-wide version, each business needs its own Stripe Connect
-- account instead.
-- ============================================================
alter table public.companies
  add column if not exists client_pay_enabled boolean not null default false;

-- Enable for the owner's two companies (adjust the match if names differ).
update public.companies
   set client_pay_enabled = true
 where name ilike '%seven jaguar%'
    or name ilike '%renofix%';
