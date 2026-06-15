-- Payments made to a subcontractor (running ledger). The subcontractor's
-- paid_amount becomes the SUM of these rows; contract_amount comes from the
-- assigned scope. Run in Supabase → SQL Editor. Safe to re-run.

create table if not exists public.sub_payments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  project_id  uuid not null,
  sub_id      uuid not null,
  amount      numeric default 0,
  paid_on     date,
  method      text,                 -- Cash / Bank / Cheque / Online
  reference   text,                 -- cheque no / txn ref
  note        text,
  created_at  timestamptz default now()
);
create index if not exists sub_payments_company_idx on public.sub_payments(company_id);
create index if not exists sub_payments_project_idx on public.sub_payments(project_id);
create index if not exists sub_payments_sub_idx     on public.sub_payments(sub_id);

alter table public.sub_payments enable row level security;
drop policy if exists sub_payments_rw on public.sub_payments;
create policy sub_payments_rw on public.sub_payments for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));
