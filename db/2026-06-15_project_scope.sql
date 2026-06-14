-- Scope of Work per project (imported from the quotation or added manually),
-- with each line assignable to a subcontractor at an agreed amount. Plus LPO /
-- contract fields on the subcontractor. Run in Supabase → SQL Editor. Safe to re-run.

create table if not exists public.project_scope (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  project_id    uuid not null,
  description   text not null,
  unit          text,
  quantity      numeric default 1,
  client_amount numeric default 0,          -- value from the quote (revenue side)
  trade         text,
  sub_id        uuid,                        -- assigned subcontractor (project_subcontractors.id)
  sub_amount    numeric default 0,           -- agreed amount to pay the sub for this line
  created_at    timestamptz default now()
);
create index if not exists project_scope_company_idx on public.project_scope(company_id);
create index if not exists project_scope_project_idx on public.project_scope(project_id);
create index if not exists project_scope_sub_idx     on public.project_scope(sub_id);

alter table public.project_scope enable row level security;
drop policy if exists project_scope_rw on public.project_scope;
create policy project_scope_rw on public.project_scope for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

alter table public.project_subcontractors
  add column if not exists lpo_number      text,
  add column if not exists lpo_date        date,
  add column if not exists contract_signed boolean default false,
  add column if not exists contract_date   date;
