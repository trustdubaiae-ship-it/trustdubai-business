-- ===========================================================================
-- Notify the company (Inbox/bell) when the client posts a message or responds
-- to an approval. The notification insert is wrapped so it can never break the
-- client action. Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

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
  begin
    insert into public.notifications (company_id, sender_type, title, message, type, status)
    values (v_p.company_id, 'client', 'New message from client', coalesce(v_p.name, 'Project') || ': ' || left(trim(p_body), 120), 'general', 'unread');
  exception when others then null; end;
  return jsonb_build_object('ok', true);
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
  begin
    insert into public.notifications (company_id, sender_type, title, message, type, status)
    values (v_p.company_id, 'client', 'Client ' || p_response || ' a change',
            coalesce(v_p.name, 'Project') || ': ' || coalesce(v_u.title, v_u.kind)
            || (case when nullif(trim(p_comment), '') is not null then ' — "' || trim(p_comment) || '"' else '' end),
            'general', 'unread');
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', p_response);
end; $$;

grant execute on function public.fn_add_client_update(uuid, text, text) to anon, authenticated;
grant execute on function public.fn_respond_project_update(uuid, text, uuid, text, text) to anon, authenticated;
