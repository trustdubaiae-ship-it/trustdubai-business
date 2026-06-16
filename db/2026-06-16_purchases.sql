-- ===========================================================================
-- Purchases module: suppliers + purchase_invoices (the buy-side mirror of
-- Invoices). Lets a company save vendors once and record each purchase bill
-- with VAT, so Input VAT and expenses flow cleanly into the Ledger.
-- Company-scoped RLS via current_company_ids(). Run in Supabase → SQL Editor.
-- Safe to re-run.
-- ===========================================================================

create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  name        text not null,
  trn         text,
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_by_email text,
  created_at  timestamptz default now()
);
create index if not exists suppliers_company_idx on public.suppliers(company_id);

create table if not exists public.purchase_invoices (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null,
  supplier_id    uuid,
  supplier_name  text,
  supplier_trn   text,
  invoice_number text,                              -- the supplier's bill number
  invoice_date   date default current_date,
  category       text default 'Material',           -- Material | Tools | Subcontractor | Transport | Misc ...
  description    text,
  subtotal       numeric default 0,                 -- NET amount (before VAT)
  vat_rate       numeric default 0,                 -- 0 or 5
  vat_amount     numeric default 0,
  total          numeric default 0,                 -- subtotal + vat_amount (gross)
  paid           numeric default 0,                 -- amount paid so far
  status         text default 'unpaid',             -- unpaid | partial | paid
  notes          text,
  created_by_email text,
  created_at     timestamptz default now()
);
create index if not exists purchase_invoices_company_idx  on public.purchase_invoices(company_id);
create index if not exists purchase_invoices_supplier_idx on public.purchase_invoices(supplier_id);
create index if not exists purchase_invoices_date_idx     on public.purchase_invoices(invoice_date);

-- ---- RLS (company-scoped, mirrors invoices / site_expenses) ----------------
alter table public.suppliers          enable row level security;
alter table public.purchase_invoices  enable row level security;

drop policy if exists suppliers_rw on public.suppliers;
create policy suppliers_rw on public.suppliers for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

drop policy if exists purchase_invoices_rw on public.purchase_invoices;
create policy purchase_invoices_rw on public.purchase_invoices for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

grant select, insert, update, delete on public.suppliers         to anon, authenticated;
grant select, insert, update, delete on public.purchase_invoices to anon, authenticated;
