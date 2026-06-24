-- ============================================================
-- Partner payouts — manual bank transfer model + claim rules.
-- Bank details live in qv_partners.payout_info (jsonb):
--   { account_holder, bank_name, iban, swift }
-- ============================================================

-- Admin-configurable settings (min payout, claims allowed per month).
create table if not exists public.qv_settings (
  key   text primary key,
  value numeric not null
);
insert into public.qv_settings (key, value) values
  ('min_payout', 100),
  ('claims_per_month', 2)
on conflict (key) do nothing;

alter table public.qv_settings enable row level security;

drop policy if exists qv_settings_read on public.qv_settings;
create policy qv_settings_read on public.qv_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists qv_settings_admin_write on public.qv_settings;
create policy qv_settings_admin_write on public.qv_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- A partner claims a payout — enforces: bank details set, >= min, <= N claims/month.
create or replace function public.partner_request_payout(p_amount numeric)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid; v_bank jsonb; v_min numeric; v_max numeric; v_count int;
begin
  select id, payout_info into v_id, v_bank from public.qv_partners where auth_user_id = auth.uid();
  if v_id is null then return json_build_object('error', 'Not a partner'); end if;
  if v_bank is null or coalesce(length(v_bank->>'iban'), 0) < 5 then
    return json_build_object('error', 'Add your bank account details first.');
  end if;

  select value into v_min from public.qv_settings where key = 'min_payout';
  select value into v_max from public.qv_settings where key = 'claims_per_month';

  if coalesce(p_amount, 0) < coalesce(v_min, 0) then
    return json_build_object('error', 'Minimum payout is AED ' || coalesce(v_min, 0)::text || '.');
  end if;

  select count(*) into v_count from public.qv_partner_payouts
    where partner_id = v_id and to_char(created_at, 'YYYY-MM') = to_char(now(), 'YYYY-MM');
  if v_count >= coalesce(v_max, 2) then
    return json_build_object('error', 'You can claim at most ' || coalesce(v_max, 2)::int::text || ' times per month.');
  end if;

  insert into public.qv_partner_payouts (partner_id, period, amount, status)
    values (v_id, to_char(now(), 'YYYY-MM'), p_amount, 'requested');
  return json_build_object('ok', true);
end $$;
grant execute on function public.partner_request_payout(numeric) to authenticated;
