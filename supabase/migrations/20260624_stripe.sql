-- ============================================================
-- Stripe subscriptions — track each company's paid plan.
-- ============================================================
alter table public.companies
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status    text;   -- active | past_due | canceled | null

create index if not exists companies_stripe_sub_idx on public.companies(stripe_subscription_id);
create index if not exists companies_stripe_cus_idx on public.companies(stripe_customer_id);
