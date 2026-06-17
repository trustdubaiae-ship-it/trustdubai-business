-- ===========================================================================
-- Let the client post their own update/message from the project page, and tag
-- who authored each update (company vs client). Run in Supabase → SQL Editor.
-- Safe to re-run.
-- ===========================================================================

alter table public.project_updates add column if not exists from_client boolean default false;

-- include from_client in the client-facing read (token + code gated, as before)
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
        'approval_status', u.approval_status, 'client_comment', u.client_comment, 'from_client', u.from_client
      ) order by u.event_date desc, u.created_at desc)
      from public.project_updates u where u.project_id = v_p.id and u.client_visible = true), '[]'::jsonb)
  );
end; $$;

-- client posts a note/message (token + code gated)
create or replace function public.fn_add_client_update(p_token uuid, p_code text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p public.ops_projects;
begin
  if coalesce(trim(p_body), '') = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  select * into v_p from public.ops_projects where public_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_p.access_code is null or coalesce(trim(p_code), '') <> v_p.access_code then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  insert into public.project_updates (company_id, project_id, kind, title, body, client_visible, from_client, approval_status)
  values (v_p.company_id, v_p.id, 'note', 'Message from client', trim(p_body), true, true, 'none');
  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.fn_add_client_update(uuid, text, text) to anon, authenticated;
