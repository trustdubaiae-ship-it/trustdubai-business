-- ===========================================================================
-- Client access via a shared ACCESS CODE (replaces the email-OTP approach).
-- The company shares the project link + a 6-digit access code with the client
-- over WhatsApp. The client opens the link and enters the code; the RPCs return
-- / accept data only when the code matches. No email, no auth, no rate limits.
-- The anon key can read nothing directly — only these SECURITY DEFINER RPCs by
-- (token, code). Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

-- per-project access code (6 digits). public_token already added earlier.
alter table public.ops_projects add column if not exists access_code text
  default lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
update public.ops_projects set access_code = lpad((floor(random() * 900000) + 100000)::int::text, 6, '0') where access_code is null;

-- replace the old email-gated functions with code-gated ones
drop function if exists public.fn_get_project_by_token(uuid);
drop function if exists public.fn_respond_project_update(uuid, uuid, text, text);

create or replace function public.fn_get_project_by_token(p_token uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p public.ops_projects; v_company public.companies;
begin
  select * into v_p from public.ops_projects where public_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_p.access_code is null or coalesce(trim(p_code), '') <> v_p.access_code then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  select * into v_company from public.companies where id = v_p.company_id;
  return jsonb_build_object(
    'ok', true,
    'project', jsonb_build_object(
      'id', v_p.id, 'name', v_p.name, 'status', v_p.status, 'location', v_p.location,
      'start_date', v_p.start_date, 'end_date', v_p.end_date, 'progress', v_p.progress
    ),
    'company', jsonb_build_object('name', v_company.name, 'logo_url', v_company.logo_url, 'phone', v_company.phone),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object('title', m.title, 'target_date', m.target_date, 'status', m.status) order by m.sort, m.created_at)
      from public.project_milestones m where m.project_id = v_p.id), '[]'::jsonb),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'kind', u.kind, 'title', u.title, 'body', u.body, 'event_date', u.event_date,
        'old_date', u.old_date, 'new_date', u.new_date, 'needs_approval', u.needs_approval,
        'approval_status', u.approval_status, 'client_comment', u.client_comment
      ) order by u.event_date desc, u.created_at desc)
      from public.project_updates u where u.project_id = v_p.id and u.client_visible = true), '[]'::jsonb)
  );
end; $$;

create or replace function public.fn_respond_project_update(p_token uuid, p_code text, p_update_id uuid, p_response text, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p public.ops_projects; v_u public.project_updates;
begin
  if p_response not in ('approved','rejected') then return jsonb_build_object('ok', false, 'error', 'bad_response'); end if;
  select * into v_p from public.ops_projects where public_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_p.access_code is null or coalesce(trim(p_code), '') <> v_p.access_code then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  select * into v_u from public.project_updates where id = p_update_id and project_id = v_p.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'update_not_found'); end if;
  if not v_u.needs_approval then return jsonb_build_object('ok', false, 'error', 'no_approval_needed'); end if;
  update public.project_updates
     set approval_status = p_response, client_comment = nullif(trim(p_comment), ''), client_response_at = now()
   where id = p_update_id;
  if p_response = 'approved' and v_u.kind = 'timeline' and v_u.new_date is not null then
    update public.ops_projects set end_date = v_u.new_date where id = v_p.id;
  end if;
  return jsonb_build_object('ok', true, 'status', p_response);
end; $$;

grant execute on function public.fn_get_project_by_token(uuid, text) to anon, authenticated;
grant execute on function public.fn_respond_project_update(uuid, text, uuid, text, text) to anon, authenticated;
