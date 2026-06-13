-- ===========================================================================
-- Ecosystem wiring: Lead → Quotation → Invoice. Run in Supabase → SQL Editor.
-- Safe to re-run.
-- ===========================================================================

-- 1) Remember which lead a quote came from (so approval can move the lead to Won)
alter table public.quotations add column if not exists source_sub_id uuid;
alter table public.quotations add column if not exists source_dist_id uuid;

-- 2) Invoice phase: 'proforma' until first payment, then 'tax'
alter table public.invoices add column if not exists phase text default 'proforma';

-- 3) Client approval also moves the originating lead to "Won"
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
  -- Approved → originating lead becomes Won (request-changes/reject leaves it as-is)
  if p_response = 'approved' then
    if v_quote.source_sub_id is not null then
      update public.lead_submissions set status = 'won', status_updated_at = now() where id = v_quote.source_sub_id;
    end if;
    if v_quote.source_dist_id is not null then
      update public.lead_distributions set status = 'won', status_updated_at = now() where id = v_quote.source_dist_id;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'status', p_response);
end; $$;
