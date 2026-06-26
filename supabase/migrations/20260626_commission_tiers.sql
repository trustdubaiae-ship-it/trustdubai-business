-- ============================================================
-- Partner commission — GLOBAL progressive (marginal) slabs by referral count.
-- Replaces the old fixed per-tier commission. Commission is MARGINAL like tax
-- brackets: referrals 1-25 earn the 1-25 rate, 26-50 earn the 26-50 rate, etc.
-- Count basis = a partner's ACTIVE PAYING referrals.
-- Admin sets these manually on the Partner Program settings page.
-- ============================================================
create table if not exists public.qv_commission_tiers (
  id              uuid primary key default gen_random_uuid(),
  min_referrals   int     not null,
  max_referrals   int,                                  -- null = unlimited (top slab)
  commission_pct  numeric not null check (commission_pct >= 0),
  sort            int     not null default 0,
  created_at      timestamptz default now()
);

alter table public.qv_commission_tiers enable row level security;

-- Partners (any signed-in user) can READ the slabs to see their own earnings.
drop policy if exists qv_ct_read on public.qv_commission_tiers;
create policy qv_ct_read on public.qv_commission_tiers
  for select to authenticated using (true);

-- Only admins can change them.
drop policy if exists qv_ct_admin on public.qv_commission_tiers;
create policy qv_ct_admin on public.qv_commission_tiers
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed the default ladder once (1-25 -> 10%, 26-50 -> 15%, 51+ -> 21%).
insert into public.qv_commission_tiers (min_referrals, max_referrals, commission_pct, sort)
select v.min_referrals, v.max_referrals, v.commission_pct, v.sort
from (values
  (1,  25,         10::numeric, 0),
  (26, 50,         15::numeric, 1),
  (51, null::int,  21::numeric, 2)
) as v(min_referrals, max_referrals, commission_pct, sort)
where not exists (select 1 from public.qv_commission_tiers);
