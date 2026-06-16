-- ===========================================================================
-- Ledger entries — a company's full money ledger: manual INCOME & EXPENSE
-- transactions with optional VAT. This complements the auto sources the Ledger
-- page already reads (invoice payments = income/output-VAT, site_expenses =
-- project costs) so a company can record ANY money in/out and run a VAT return.
-- Company-scoped RLS via current_company_ids(). Run in Supabase → SQL Editor.
-- Safe to re-run.
-- ===========================================================================

create table if not exists public.ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  kind          text not null default 'expense',   -- 'income' | 'expense'
  category      text,                               -- e.g. Material, Labour, Rent, Sale, Advance ...
  description   text,
  party         text,                               -- client (income) or vendor (expense) name
  amount        numeric default 0,                  -- NET amount (before VAT)
  vat_rate      numeric default 0,                  -- 0 or 5
  vat_amount    numeric default 0,                  -- VAT portion (0 if none)
  total         numeric default 0,                  -- amount + vat_amount (gross)
  entry_date    date    default current_date,
  method        text    default 'cash',             -- cash | bank | card | cheque | online
  reference     text,                               -- bill / receipt / txn number
  notes         text,
  created_by_email text,
  created_at    timestamptz default now()
);
create index if not exists ledger_entries_company_idx on public.ledger_entries(company_id);
create index if not exists ledger_entries_date_idx    on public.ledger_entries(entry_date);

-- ---- RLS (company-scoped, mirrors site_expenses / ops_projects) ------------
alter table public.ledger_entries enable row level security;

drop policy if exists ledger_entries_rw on public.ledger_entries;
create policy ledger_entries_rw on public.ledger_entries for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

grant select, insert, update, delete on public.ledger_entries to anon, authenticated;
