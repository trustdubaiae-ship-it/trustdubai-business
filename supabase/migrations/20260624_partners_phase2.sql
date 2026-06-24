-- ============================================================
-- Partner Program — Phase 2
-- Admin management access + partner-initiated payout requests + tiers.
-- ============================================================

-- Tier of the partner (affects commission %). Simple text tier for now.
alter table public.qv_partners
  add column if not exists tier text not null default 'standard';  -- standard | premium

-- Is the current caller an active admin? (admin app authenticates as a normal user;
-- privileges come from the admin_users table, matched by email.)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a
    where a.email = (auth.jwt() ->> 'email') and a.is_active
  )
$$;

-- Admins can read & manage every partner and payout.
drop policy if exists qv_partners_admin_all on public.qv_partners;
create policy qv_partners_admin_all on public.qv_partners
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists qv_payouts_admin_all on public.qv_partner_payouts;
create policy qv_payouts_admin_all on public.qv_partner_payouts
  for all using (public.is_admin()) with check (public.is_admin());

-- A partner can raise a payout request for themselves (status must be 'requested').
drop policy if exists qv_payouts_self_request on public.qv_partner_payouts;
create policy qv_payouts_self_request on public.qv_partner_payouts
  for insert with check (
    status = 'requested'
    and partner_id in (select id from public.qv_partners where auth_user_id = auth.uid())
  );

-- For the admin Partners page: each partner with their referral + payout totals.
create or replace function public.admin_partner_overview()
returns table (
  id uuid, name text, email text, phone text, code text,
  commission_pct numeric, term_months integer, tier text, status text,
  created_at timestamptz,
  referred_total bigint, referred_paid bigint, paid_out numeric
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.email, p.phone, p.code,
         p.commission_pct, p.term_months, p.tier, p.status, p.created_at,
         (select count(*) from public.companies c where c.referred_by_partner_id = p.id) as referred_total,
         (select count(*) from public.companies c where c.referred_by_partner_id = p.id
            and coalesce(lower(c.plan),'free') <> 'free' and lower(c.status) = 'approved') as referred_paid,
         (select coalesce(sum(amount),0) from public.qv_partner_payouts o where o.partner_id = p.id and o.status = 'paid') as paid_out
  from public.qv_partners p
  where public.is_admin()
  order by p.created_at desc
$$;
grant execute on function public.admin_partner_overview() to authenticated;
