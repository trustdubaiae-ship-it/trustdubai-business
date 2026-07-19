-- ============================================================
-- Fix: adding materials to a project fails.
--
-- Two possible causes, both handled here (safe to re-run):
--   1. public.material_requests never got created in the live DB
--      (it only ever lived in db/2026-06-15_projects_module.sql,
--       which is run by hand in the SQL Editor).
--   2. Its RLS policy depends on public.current_company_ids(),
--      which is called by 10 db/*.sql files but defined nowhere.
--      If it is missing, the WITH CHECK fails and every INSERT
--      is rejected.
-- ============================================================

-- 1. Define current_company_ids() only if it does not already exist.
--    Never CREATE OR REPLACE: the live version may have a different
--    return type, and replacing it would error out or break the other
--    9 tables that share this predicate.
--    Resolves the caller's company for owners AND staff, mirroring
--    public.my_company_id() (20260718_subcontract_link.sql).
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_company_ids'
  ) then
    execute $fn$
      create function public.current_company_ids()
      returns setof uuid
      language sql security definer set search_path = public stable as $body$
        select id from public.companies
          where lower(owner_email) = lower(coalesce(auth.email(), ''))
        union
        select company_id from public.business_staff
          where lower(email) = lower(coalesce(auth.email(), '')) and active = true
      $body$;
    $fn$;
    execute 'grant execute on function public.current_company_ids() to authenticated';
  end if;
end $$;

-- 2. Table (matches db/2026-06-15_projects_module.sql exactly).
create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null,
  item text not null,
  quantity numeric default 1,
  unit text,
  vendor text,
  est_cost numeric default 0,
  status text not null default 'requested',
  notes text,
  created_at timestamptz default now()
);
create index if not exists material_requests_project_idx
  on public.material_requests(project_id);
create index if not exists material_requests_company_idx
  on public.material_requests(company_id);

-- 3. Actual cost. est_cost stays the estimate/budget; actual_cost is what was
--    really paid, and only counts toward the project's total expense once the
--    material is 'received'.
alter table public.material_requests
  add column if not exists actual_cost numeric default 0;

-- 4. RLS.
alter table public.material_requests enable row level security;
drop policy if exists material_requests_rw on public.material_requests;
create policy material_requests_rw on public.material_requests for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));
