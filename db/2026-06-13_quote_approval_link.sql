-- ===========================================================================
-- Client approval link — public token + response fields + secure RPCs.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- The public page never touches tables directly; it only calls these two
-- SECURITY DEFINER functions by token, so the anon key can't read anything else.
-- ===========================================================================

-- 1) Columns on quotations
alter table public.quotations add column if not exists public_token uuid default gen_random_uuid();
alter table public.quotations add column if not exists approved_by_name text;
alter table public.quotations add column if not exists client_response_at timestamptz;
alter table public.quotations add column if not exists client_comment text;

-- backfill existing quotes with a token
update public.quotations set public_token = gen_random_uuid() where public_token is null;

-- fast + unique token lookup
create unique index if not exists quotations_public_token_idx on public.quotations(public_token);

-- 2) Public READ of one quote by token (returns quote + minimal branding)
create or replace function public.fn_get_quote_by_token(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_quote   public.quotations;
  v_tpl     public.quotation_templates;
  v_company public.companies;
begin
  select * into v_quote from public.quotations where public_token = p_token;
  if not found then return null; end if;
  select * into v_tpl from public.quotation_templates where company_id = v_quote.company_id;
  select * into v_company from public.companies where id = v_quote.company_id;
  return jsonb_build_object(
    'quote', to_jsonb(v_quote),
    'company', jsonb_build_object(
      'name', v_company.name, 'logo_url', v_company.logo_url, 'phone', v_company.phone
    ),
    'tpl', jsonb_build_object(
      'company_legal_name', v_tpl.company_legal_name, 'tagline', v_tpl.tagline,
      'trn_number', v_tpl.trn_number, 'contact_phone', v_tpl.contact_phone, 'contact_email', v_tpl.contact_email,
      -- bank details only if the quote was set to show them
      'bank_name',           case when v_quote.show_bank then v_tpl.bank_name end,
      'bank_account_name',   case when v_quote.show_bank then v_tpl.bank_account_name end,
      'bank_account_number', case when v_quote.show_bank then v_tpl.bank_account_number end,
      'bank_iban',           case when v_quote.show_bank then v_tpl.bank_iban end,
      'bank_swift',          case when v_quote.show_bank then v_tpl.bank_swift end,
      'bank_branch',         case when v_quote.show_bank then v_tpl.bank_branch end
    )
  );
end; $$;

-- 3) Client RESPONSE (approve / reject) by token
create or replace function public.fn_respond_quote(p_token uuid, p_response text, p_name text, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_quote public.quotations;
begin
  if p_response not in ('approved','rejected') then
    return jsonb_build_object('ok', false, 'error', 'bad_response');
  end if;
  select * into v_quote from public.quotations where public_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_quote.status in ('approved','rejected') then
    return jsonb_build_object('ok', false, 'error', 'already_' || v_quote.status);
  end if;
  update public.quotations
     set status = p_response,
         approved_by_name = nullif(trim(p_name), ''),
         client_comment = nullif(trim(p_comment), ''),
         client_response_at = now()
   where public_token = p_token;
  return jsonb_build_object('ok', true, 'status', p_response);
end; $$;

-- 4) Let the public (anon) key call ONLY these two functions
grant execute on function public.fn_get_quote_by_token(uuid) to anon, authenticated;
grant execute on function public.fn_respond_quote(uuid, text, text, text) to anon, authenticated;
