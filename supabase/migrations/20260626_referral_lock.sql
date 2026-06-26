-- ============================================================
-- Secure partner referral attribution.
-- Problem: the client set companies.referred_by_partner_id directly, so a
-- business could change/reassign its referrer any number of times (commission
-- fraud). Fix: a business may attach a referral code ONCE, only via the
-- apply_partner_code() RPC; after that it is immutable. Trusted callers
-- (service role, admins) can still set/correct it (e.g. the approval flow).
-- ============================================================
alter table public.companies
  add column if not exists referred_at timestamptz;

-- Guard: block direct/repeat changes to referred_by_partner_id.
create or replace function public.guard_referral_lock()
returns trigger
language plpgsql
as $$
begin
  if NEW.referred_by_partner_id is distinct from OLD.referred_by_partner_id then
    -- trusted callers may set or correct it freely
    if coalesce(auth.role(), '') = 'service_role'
       or public.is_admin()
       or coalesce(current_setting('app.allow_referral_set', true), '') = 'on' then
      return NEW;
    end if;
    -- a normal business user editing their own row directly:
    if OLD.referred_by_partner_id is not null then
      raise exception 'A referral code is already recorded and cannot be changed';
    end if;
    raise exception 'Add a referral code through the prompt, not directly';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_referral_lock on public.companies;
create trigger trg_referral_lock
  before update on public.companies
  for each row execute function public.guard_referral_lock();

-- One-time, validated setter. Maps the caller (owner) -> their company, checks
-- it has no referrer yet, resolves an ACTIVE partner, and records it atomically.
create or replace function public.apply_partner_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_cid uuid; v_existing uuid; v_pid uuid; v_powner uuid;
begin
  select id, referred_by_partner_id into v_cid, v_existing
    from public.companies
    where lower(owner_email) = lower(coalesce(auth.email(), ''))
    limit 1;
  if v_cid is null then
    return jsonb_build_object('ok', false, 'error', 'No company found for your account.');
  end if;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'error', 'A referral code is already recorded on your account.');
  end if;

  select id, auth_user_id into v_pid, v_powner
    from public.qv_partners
    where upper(code) = upper(trim(p_code)) and status = 'active'
    limit 1;
  if v_pid is null then
    return jsonb_build_object('ok', false, 'error', 'That code is invalid or not active.');
  end if;
  if v_powner = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'You cannot use your own referral code.');
  end if;

  perform set_config('app.allow_referral_set', 'on', true);
  update public.companies
     set referred_by_partner_id = v_pid, referred_at = now()
   where id = v_cid and referred_by_partner_id is null;   -- belt-and-suspenders one-time guard

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.apply_partner_code(text) to authenticated;
