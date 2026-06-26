-- ============================================================
-- Subcontract Project Board (Business Hub → Subcontract tab).
-- A company posts work it wants to subcontract; the post is shown ONLY to
-- GOLD/PLATINUM companies whose category matches the post's target categories
-- (e.g. an interior job is not shown to a cleaning company).
-- ============================================================
create table if not exists public.qv_subcontract_projects (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  poster_name   text,
  title         text not null,
  description   text,
  categories    text[] not null default '{}',     -- which company categories should see it
  budget_min    numeric,
  budget_max    numeric,
  location      text,
  timeline      text,
  contact_name  text,
  contact_phone text,
  status        text not null default 'open',      -- open | closed
  created_at    timestamptz default now()
);
create index if not exists qsp_status_idx on public.qv_subcontract_projects(status, created_at desc);

alter table public.qv_subcontract_projects enable row level security;

-- Caller's own company (owner-based) and whether it is on a Gold/Platinum plan.
create or replace function public.my_company_id()
returns uuid language sql security definer set search_path = public stable as $$
  select id from public.companies where lower(owner_email) = lower(coalesce(auth.email(), '')) limit 1
$$;
grant execute on function public.my_company_id() to authenticated;

create or replace function public.is_gold_company()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(lower(plan) in ('gold', 'platinum'), false)
  from public.companies where id = public.my_company_id()
$$;
grant execute on function public.is_gold_company() to authenticated;

-- A company manages its OWN posts. Posting (insert) requires Gold/Platinum.
drop policy if exists qsp_select on public.qv_subcontract_projects;
create policy qsp_select on public.qv_subcontract_projects for select using (company_id = public.my_company_id());
drop policy if exists qsp_insert on public.qv_subcontract_projects;
create policy qsp_insert on public.qv_subcontract_projects for insert with check (company_id = public.my_company_id() and public.is_gold_company());
drop policy if exists qsp_update on public.qv_subcontract_projects;
create policy qsp_update on public.qv_subcontract_projects for update using (company_id = public.my_company_id()) with check (company_id = public.my_company_id());
drop policy if exists qsp_delete on public.qv_subcontract_projects;
create policy qsp_delete on public.qv_subcontract_projects for delete using (company_id = public.my_company_id());

-- The FEED a Gold company sees: open posts, not their own, whose target categories
-- include the viewer's own category. (Definer → bypasses RLS to read others' posts.)
drop function if exists public.subcontract_feed();
create or replace function public.subcontract_feed()
returns setof public.qv_subcontract_projects
language sql security definer set search_path = public stable as $$
  select p.*
  from public.qv_subcontract_projects p, public.companies c
  where c.id = public.my_company_id()
    and public.is_gold_company()
    and p.status = 'open'
    and p.company_id <> c.id
    and (
      cardinality(p.categories) = 0
      -- match on the viewer's category array (preferred) OR the legacy single category
      or exists (select 1 from unnest(p.categories) pc
                 where lower(pc) = any (select lower(x) from unnest(coalesce(c.categories, array[]::text[])) x)
                    or lower(pc) = lower(coalesce(c.category, '')))
    )
  order by p.created_at desc
$$;
grant execute on function public.subcontract_feed() to authenticated;
