-- ===========================================================================
-- Contracts. A quotation can be converted into a formal Contract Agreement
-- with one button. The contract is a FROZEN SNAPSHOT: `snapshot` holds a copy
-- of the line items, totals and payment schedule as they were at the moment of
-- generation, so later revisions to the quotation never change a contract that
-- has already been issued.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.
-- ===========================================================================

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quotation_id uuid not null references public.quotations(id) on delete cascade,

  contract_no text not null,               -- derived from the quote ref: RFP-011 -> CNT-011
  contract_date date default current_date,

  client_name text,
  client_address text,
  client_phone text,

  scope_reference text,                    -- "Quotation Ref RFP-011 Rev.02, attached as Annexure A"
  snapshot jsonb default '{}'::jsonb,      -- frozen items/subtotal/vat/total/payment schedule

  timeline_text text,
  warranty_text text,
  payment_terms_text text,
  variation_text text,
  extra_clauses jsonb default '[]'::jsonb, -- [{ title, body }] — auto-numbered on the document

  status text default 'draft',             -- draft | sent | signed

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One contract number per company (NOT globally unique: two companies can each
-- legitimately have their own RFP-011, and therefore their own CNT-011).
create unique index if not exists contracts_company_no_uidx
  on public.contracts(company_id, contract_no);
create index if not exists contracts_company_idx    on public.contracts(company_id);
create index if not exists contracts_quotation_idx  on public.contracts(quotation_id);

-- keep updated_at honest
create or replace function public.fn_contracts_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists contracts_touch on public.contracts;
create trigger contracts_touch before update on public.contracts
  for each row execute function public.fn_contracts_touch();

-- ---------------------------------------------------------------------------
-- Access. This matches the posture already used by quotations / invoices:
-- grants to the API roles, with company_id filtering applied in every query the
-- app makes. See db/2026-06-13_invoices.sql, which states the same.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.contracts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- OPTIONAL HARDENING — read this before enabling.
--
-- The block below turns on real row-level security so a company can only reach
-- its own contracts. It is left commented out because it is only half-complete:
-- owner access is easy (companies.owner_email matches the JWT email), but STAFF
-- access is resolved at runtime through the claim_staff_invite() RPC, and the
-- table that RPC reads is not defined anywhere in this repo and is not readable
-- with the anon key. Enabling the policy as written would lock every staff user
-- out of contracts.
--
-- To finish it: add the staff invite table (the one claim_staff_invite reads,
-- keyed by invited email) as a second branch of fn_user_company_ids(), then
-- uncomment. Verify with a staff login before shipping.
--
-- create or replace function public.fn_user_company_ids()
-- returns setof uuid language sql stable security definer set search_path = public as $$
--   select c.id from public.companies c
--    where lower(c.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
--   -- union
--   -- select i.company_id from public.<staff_invite_table> i
--   --  where lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
--   --    and i.accepted is true
-- $$;
-- grant execute on function public.fn_user_company_ids() to authenticated;
--
-- alter table public.contracts enable row level security;
-- drop policy if exists contracts_own on public.contracts;
-- create policy contracts_own on public.contracts
--   for all to authenticated
--   using (company_id in (select public.fn_user_company_ids()))
--   with check (company_id in (select public.fn_user_company_ids()));
-- revoke select, insert, update, delete on public.contracts from anon;
