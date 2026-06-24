-- ============================================================
-- Partner payouts via Stripe Connect.
-- ============================================================
alter table public.qv_partners
  add column if not exists stripe_account_id text,
  add column if not exists payouts_enabled   boolean not null default false;

-- Refresh the admin overview to also expose payout-connection state.
-- (drop first — the return type changes, which CREATE OR REPLACE can't do)
drop function if exists public.admin_partner_overview();
create or replace function public.admin_partner_overview()
returns table (
  id uuid, name text, email text, phone text, code text,
  commission_pct numeric, term_months integer, tier text, status text,
  created_at timestamptz,
  referred_total bigint, referred_paid bigint, paid_out numeric,
  payouts_enabled boolean, stripe_account_id text
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.email, p.phone, p.code,
         p.commission_pct, p.term_months, p.tier, p.status, p.created_at,
         (select count(*) from public.companies c where c.referred_by_partner_id = p.id) as referred_total,
         (select count(*) from public.companies c where c.referred_by_partner_id = p.id
            and coalesce(lower(c.plan),'free') <> 'free' and lower(c.status) = 'approved') as referred_paid,
         (select coalesce(sum(amount),0) from public.qv_partner_payouts o where o.partner_id = p.id and o.status = 'paid') as paid_out,
         coalesce(p.payouts_enabled, false) as payouts_enabled,
         p.stripe_account_id
  from public.qv_partners p
  where public.is_admin()
  order by p.created_at desc
$$;
grant execute on function public.admin_partner_overview() to authenticated;
