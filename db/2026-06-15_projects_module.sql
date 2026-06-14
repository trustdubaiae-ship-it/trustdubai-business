-- ===========================================================================
-- Projects & Ops module: projects (from won quotes), material requests,
-- site expenses. Company-scoped RLS via current_company_ids().
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  quote_id        uuid,
  name            text not null,
  client_id       text,
  client_name     text,
  client_phone    text,
  status          text not null default 'planning',  -- planning | ongoing | on_hold | completed | cancelled
  contract_value  numeric default 0,
  start_date      date,
  end_date        date,
  progress        int default 0,
  location        text,
  notes           text,
  created_by_email text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists projects_company_idx on public.projects(company_id);
create index if not exists projects_quote_idx   on public.projects(quote_id);

create table if not exists public.material_requests (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  project_id  uuid not null,
  item        text not null,
  quantity    numeric default 1,
  unit        text,
  vendor      text,
  est_cost    numeric default 0,
  status      text not null default 'requested',  -- requested | approved | ordered | received
  notes       text,
  created_at  timestamptz default now()
);
create index if not exists material_requests_company_idx on public.material_requests(company_id);
create index if not exists material_requests_project_idx on public.material_requests(project_id);

create table if not exists public.site_expenses (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  project_id  uuid not null,
  category    text default 'material',  -- labour | material | transport | misc
  description text,
  amount      numeric default 0,
  spent_on    date default current_date,
  created_at  timestamptz default now()
);
create index if not exists site_expenses_company_idx on public.site_expenses(company_id);
create index if not exists site_expenses_project_idx on public.site_expenses(project_id);

-- ---- RLS (company-scoped) -------------------------------------------------
alter table public.projects         enable row level security;
alter table public.material_requests enable row level security;
alter table public.site_expenses    enable row level security;

drop policy if exists projects_rw on public.projects;
create policy projects_rw on public.projects for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

drop policy if exists material_requests_rw on public.material_requests;
create policy material_requests_rw on public.material_requests for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

drop policy if exists site_expenses_rw on public.site_expenses;
create policy site_expenses_rw on public.site_expenses for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));
