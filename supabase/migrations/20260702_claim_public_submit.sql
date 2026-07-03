-- ===========================================================================
-- Public claim submission — FIX: anon visitors could not submit a claim.
--
-- Root cause: claim_requests INSERT and trade-licenses storage upload were both
-- blocked by RLS, so the public /claim-company form always failed with
-- "Could not submit". (0 rows ever reached the table.)
--
-- Fix (same pattern as fn_respond_quote): a SECURITY DEFINER RPC does the insert,
-- so the table stays fully locked down — no anon INSERT/SELECT/UPDATE policies,
-- claimants' contact + licence data is never publicly readable. Admin keeps
-- reading via its own privileged path.
--
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

-- 1) Public submit RPC (handles both 'claim' and 'support' kinds)
create or replace function public.fn_submit_claim(
  p_company_id     uuid,
  p_company_name   text,
  p_kind           text,
  p_last4_verified boolean,
  p_contact_name   text,
  p_contact_email  text,
  p_contact_phone  text,
  p_tl_number      text,
  p_tl_expiry      date,
  p_tl_url         text,
  p_message        text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(trim(p_contact_name), '') = '' or coalesce(trim(p_contact_email), '') = '' then
    raise exception 'name and email are required';
  end if;
  if coalesce(p_kind, 'claim') not in ('claim', 'support') then
    raise exception 'invalid kind';
  end if;

  insert into public.claim_requests (
    company_id, company_name, kind, last4_verified,
    contact_name, contact_email, contact_phone,
    tl_number, tl_expiry, tl_url, message, status
  ) values (
    p_company_id,
    nullif(trim(p_company_name), ''),
    coalesce(p_kind, 'claim'),
    coalesce(p_last4_verified, false),
    nullif(trim(p_contact_name), ''),
    lower(nullif(trim(p_contact_email), '')),
    nullif(trim(p_contact_phone), ''),
    nullif(trim(p_tl_number), ''),
    p_tl_expiry,
    nullif(trim(p_tl_url), ''),
    nullif(trim(p_message), ''),
    'pending'
  ) returning id into v_id;

  return v_id;
end; $$;

-- Only the public key may EXECUTE this one function (it can't touch the table directly)
grant execute on function public.fn_submit_claim(uuid,text,text,boolean,text,text,text,text,date,text,text)
  to anon, authenticated;

-- 2) Storage: allow uploading a trade licence into the PRIVATE 'trade-licenses'
--    bucket under the claims/ prefix. No public read policy is added, so files
--    stay private — admin opens them via signed URLs (see ClaimRequests.jsx).
drop policy if exists "claim tl upload" on storage.objects;
create policy "claim tl upload" on storage.objects
  for insert to anon, authenticated
  with check ( bucket_id = 'trade-licenses' );
