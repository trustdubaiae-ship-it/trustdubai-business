-- ============================================================
-- Partner Program v2 — paid tiers + KYC + activation gate.
-- Tiers (partner pays Quvera monthly; tier sets their commission):
--   starter AED 99 -> 5% | growth AED 199 -> 15% | pro AED 299 -> 25%
-- A partner is activated by an admin only after: tier subscription PAID
-- + Emirates ID & Trade License uploaded & verified.
-- ============================================================
alter table public.qv_partners
  add column if not exists fee_monthly    numeric not null default 0,
  add column if not exists documents      jsonb   not null default '{}'::jsonb,   -- { emirates_id, trade_license } base64 data urls
  add column if not exists docs_verified  boolean not null default false,
  add column if not exists payment_status text    not null default 'unpaid',      -- unpaid | active | past_due | canceled
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text;
-- `tier` column already exists (was default 'standard'); now holds starter/growth/pro.
-- `commission_pct` already exists; set from the tier.
