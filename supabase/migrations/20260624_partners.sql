-- ============================================================
-- Quvera Partner Program — Phase 1
-- Resellers refer businesses and earn a recurring commission.
-- ============================================================

-- 1) Partners (resellers). A partner logs in with a normal Supabase auth user
--    (auth_user_id) but has no company — they see the Partner Dashboard instead.
create table if not exists public.partners (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid references auth.users(id) on delete set null,
  name            text not null,
  email           text,
  phone           text,
  code            text not null unique,              -- referral code, e.g. RAVI25
  commission_pct  numeric not null default 25,       -- % of the plan fee
  term_months     integer not null default 12,       -- how long commission runs per referral
  status          text not null default 'active',    -- active | paused
  payout_info     jsonb default '{}'::jsonb,          -- bank / IBAN etc.
  created_at      timestamptz not null default now()
);
create index if not exists partners_auth_user_idx on public.partners(auth_user_id);

-- 2) Link a referred business back to the partner who brought it.
alter table public.companies
  add column if not exists referred_by_partner_id uuid references public.partners(id) on delete set null;

-- Capture the referral at sign-up time too (carried over when the application is approved).
alter table public.company_applications
  add column if not exists referral_code text,
  add column if not exists referred_by_partner_id uuid references public.partners(id) on delete set null;

-- 3) Payouts to partners (one row per period paid).
create table if not exists public.partner_payouts (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  period      text,                                   -- e.g. '2026-06'
  amount      numeric not null default 0,
  status      text not null default 'pending',        -- pending | paid
  paid_on     date,
  method      text,
  reference   text,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists partner_payouts_partner_idx on public.partner_payouts(partner_id);

-- ============================================================
-- RLS — a partner can only see their own data.
-- ============================================================
alter table public.partners        enable row level security;
alter table public.partner_payouts enable row level security;

drop policy if exists partners_self_read on public.partners;
create policy partners_self_read on public.partners
  for select using (auth_user_id = auth.uid());

drop policy if exists partners_self_update on public.partners;
create policy partners_self_update on public.partners
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

drop policy if exists payouts_self_read on public.partner_payouts;
create policy payouts_self_read on public.partner_payouts
  for select using (
    partner_id in (select id from public.partners where auth_user_id = auth.uid())
  );

-- ============================================================
-- A partner reads their referred businesses through this function only
-- (limited columns — they never get direct access to the companies table).
-- ============================================================
create or replace function public.partner_my_referrals()
returns table (company_name text, plan text, status text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.name, c.plan, c.status, c.created_at
  from public.companies c
  join public.partners p on p.id = c.referred_by_partner_id
  where p.auth_user_id = auth.uid()
  order by c.created_at desc
$$;
grant execute on function public.partner_my_referrals() to authenticated;

-- Resolve a referral code -> partner id at sign-up time (public/anon, no table access).
create or replace function public.resolve_partner_code(p_code text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from public.partners where code = p_code and status = 'active' limit 1
$$;
grant execute on function public.resolve_partner_code(text) to anon, authenticated;
