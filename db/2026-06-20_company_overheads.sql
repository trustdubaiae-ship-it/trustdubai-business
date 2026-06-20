-- ===========================================================================
-- Company Overheads — recurring fixed costs (Trade License fee, rent, utilities,
-- insurance, etc.) shown in the Ledger. Staff salaries come from team_members.
-- Company-scoped RLS via current_company_ids(). Safe to re-run.
-- ===========================================================================

create table if not exists public.company_overheads (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  name        text not null,
  category    text,                              -- Trade License | Rent | Utilities | Insurance | Marketing | Other
  amount      numeric not null default 0,
  frequency   text not null default 'monthly',   -- monthly | yearly
  created_at  timestamptz default now()
);

create index if not exists company_overheads_company_idx on public.company_overheads(company_id);

alter table public.company_overheads enable row level security;

drop policy if exists company_overheads_rw on public.company_overheads;
create policy company_overheads_rw on public.company_overheads
  for all
  to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

grant select, insert, update, delete on public.company_overheads to anon, authenticated;
