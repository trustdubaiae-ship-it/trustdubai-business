-- ===========================================================================
-- Client access to a project (Phase 3a). Adds a per-project public token and
-- client email, plus two SECURITY DEFINER RPCs the client page calls by token.
-- The client first verifies their identity via Supabase email OTP; the RPCs
-- then only return / accept data when the verified caller email (auth.email())
-- matches the project's client_email — so the anon key can read nothing else
-- and a link alone is not enough.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- NOTE: enable Email OTP in Supabase → Authentication → Providers (Email) for
-- the client login code to be delivered.
-- ===========================================================================

-- 1) Columns on ops_projects
alter table public.ops_projects add column if not exists public_token uuid default gen_random_uuid();
alter table public.ops_projects add column if not exists client_email text;
update public.ops_projects set public_token = gen_random_uuid() where public_token is null;
create unique index if not exists ops_projects_public_token_idx on public.ops_projects(public_token);

-- 2) Public READ of one project by token — only for the verified client of that project
create or replace function public.fn_get_project_by_token(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p public.ops_projects;
  v_company public.companies;
  v_email text := lower(coalesce(auth.email(), ''));
begin
  select * into v_p from public.ops_projects where public_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  -- identity gate: caller must be signed in as the project's client email
  if v_email = '' then return jsonb_build_object('ok', false, 'error', 'need_otp'); end if;
  if v_p.client_email is null or lower(v_p.client_email) <> v_email then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
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

-- 3) Client RESPONSE to an update that needs approval (approve / reject)
create or replace function public.fn_respond_project_update(p_token uuid, p_update_id uuid, p_response text, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p public.ops_projects;
  v_u public.project_updates;
  v_email text := lower(coalesce(auth.email(), ''));
begin
  if p_response not in ('approved','rejected') then return jsonb_build_object('ok', false, 'error', 'bad_response'); end if;
  select * into v_p from public.ops_projects where public_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_email = '' or v_p.client_email is null or lower(v_p.client_email) <> v_email then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  select * into v_u from public.project_updates where id = p_update_id and project_id = v_p.id;
  if not found then return jsonb_build_object('ok', false, 'error', 'update_not_found'); end if;
  if not v_u.needs_approval then return jsonb_build_object('ok', false, 'error', 'no_approval_needed'); end if;
  update public.project_updates
     set approval_status = p_response, client_comment = nullif(trim(p_comment), ''), client_response_at = now()
   where id = p_update_id;
  -- an approved timeline change moves the project's target end date
  if p_response = 'approved' and v_u.kind = 'timeline' and v_u.new_date is not null then
    update public.ops_projects set end_date = v_u.new_date where id = v_p.id;
  end if;
  return jsonb_build_object('ok', true, 'status', p_response);
end; $$;

grant execute on function public.fn_get_project_by_token(uuid) to anon, authenticated;
grant execute on function public.fn_respond_project_update(uuid, uuid, text, text) to anon, authenticated;
