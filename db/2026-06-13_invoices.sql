-- ===========================================================================
-- Invoices + payment tracking. Run in Supabase → SQL Editor. Safe to re-run.
-- Invoices are created from an approved quote (full amount or a single milestone)
-- and track payments received as a jsonb ledger.
-- ===========================================================================

-- invoice numbering lives on the company's quote template
alter table public.quotation_templates add column if not exists invoice_prefix text default 'INV';
alter table public.quotation_templates add column if not exists next_invoice_seq integer default 1;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  invoice_number text,
  quotation_id uuid,
  quote_number text,
  client_id uuid,
  client_uid text,
  client_name text,
  client_phone text,
  client_email text,
  project_title text,
  location text,
  kind text default 'full',            -- 'full' | 'milestone'
  milestone_label text,                -- e.g. "1st Payment — Advance (50%)"
  mode text default 'simple',
  items jsonb default '[]'::jsonb,
  vat_enabled boolean default true,
  subtotal numeric default 0,
  vat_amount numeric default 0,
  total numeric default 0,
  issue_date date default current_date,
  due_date date,
  payments jsonb default '[]'::jsonb,  -- [{ amount, date, method, note }]
  status text default 'unpaid',        -- unpaid | partial | paid
  notes text,
  created_at timestamptz default now()
);
create index if not exists invoices_company_idx on public.invoices(company_id);

-- atomic per-company invoice number
create or replace function public.fn_next_invoice_seq(p_company_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  update public.quotation_templates
     set next_invoice_seq = coalesce(next_invoice_seq, 1) + 1
   where company_id = p_company_id
   returning next_invoice_seq - 1 into v_seq;
  return coalesce(v_seq, 1);
end; $$;

-- API roles (same posture as the rest of the app: company_id filtering in queries)
grant execute on function public.fn_next_invoice_seq(uuid) to authenticated;
grant select, insert, update, delete on public.invoices to anon, authenticated;
