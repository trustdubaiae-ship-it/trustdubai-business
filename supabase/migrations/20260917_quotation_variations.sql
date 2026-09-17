-- ===========================================================================
-- Variation Orders (VOs). An APPROVED quotation is a fixed contract value, so
-- every later scope change is recorded as its own numbered document — VO-01,
-- VO-02 ... — against that quotation. Only VOs with status 'approved' count
-- towards the revised contract value (Quotations detail, Invoices, Projects).
--
-- An omission (removed work) is stored as NEGATIVE subtotal/vat/total, which is
-- why there is no non-negative check on the money columns.
--
-- The app has been reading and writing public.quotation_variations since the VO
-- feature shipped, but the table was never defined here. Without it every
-- insert bounces (42P01 if the table is absent, 42501 if it exists with RLS on
-- and no policy) and the VO list just looks permanently empty.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.
-- ===========================================================================

create table if not exists public.quotation_variations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  quotation_id uuid not null references public.quotations(id) on delete cascade,

  vo_number int not null,                  -- 1, 2, 3 ... rendered as VO-01, VO-02
  description text,                        -- what changed in the scope
  items jsonb default '[]'::jsonb,         -- [{ title, desc, unit, qty, rate, trade? }]

  subtotal numeric default 0,              -- negative on an omission
  vat_enabled boolean default true,
  vat_amount numeric default 0,            -- negative on an omission
  total numeric default 0,                 -- negative on an omission

  status text default 'draft',             -- draft | sent | approved | rejected

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Columns added separately too, so re-running against a table that was created
-- by hand in the dashboard (with fewer columns) brings it up to date.
alter table public.quotation_variations add column if not exists vo_number   int;
alter table public.quotation_variations add column if not exists description text;
alter table public.quotation_variations add column if not exists items       jsonb default '[]'::jsonb;
alter table public.quotation_variations add column if not exists subtotal    numeric default 0;
alter table public.quotation_variations add column if not exists vat_enabled boolean default true;
alter table public.quotation_variations add column if not exists vat_amount  numeric default 0;
alter table public.quotation_variations add column if not exists total       numeric default 0;
alter table public.quotation_variations add column if not exists status      text default 'draft';
alter table public.quotation_variations add column if not exists created_at  timestamptz default now();
alter table public.quotation_variations add column if not exists updated_at  timestamptz default now();

create index if not exists quotation_variations_company_idx   on public.quotation_variations(company_id);
create index if not exists quotation_variations_quotation_idx on public.quotation_variations(quotation_id);

-- VO numbers are picked client-side as max(vo_number)+1, which two people on the
-- same quote can hit at once. The unique index turns that race into a visible
-- "duplicate key" error instead of two documents both called VO-02.
--
-- Wrapped so that a table which ALREADY contains duplicates does not abort the
-- whole script: the rest still applies and the notice says what to clean up.
do $idx$
begin
  create unique index if not exists quotation_variations_quote_no_uidx
    on public.quotation_variations(quotation_id, vo_number);
exception when unique_violation then
  raise notice 'quotation_variations: duplicate (quotation_id, vo_number) rows exist - renumber them, then re-run this script to add the unique index.';
end
$idx$;

-- keep updated_at honest.
-- Named dollar tag ($fn$) rather than bare $$: some SQL editors split pasted
-- statements on the semicolons inside the body when the tag is anonymous.
create or replace function public.fn_quotation_variations_touch()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists quotation_variations_touch on public.quotation_variations;
create trigger quotation_variations_touch before update on public.quotation_variations
  for each row execute function public.fn_quotation_variations_touch();

-- ---------------------------------------------------------------------------
-- Access. Same posture as contracts (supabase/migrations/20260814_contracts.sql):
-- signed-in users only, with the company_id filter that every query in the app
-- already applies doing the tenant separation.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.quotation_variations to authenticated;

-- Supabase enables RLS on new public tables, so without a policy every write is
-- rejected with 42501 - which is exactly how this table failed before.
alter table public.quotation_variations enable row level security;
drop policy if exists quotation_variations_authenticated on public.quotation_variations;
create policy quotation_variations_authenticated on public.quotation_variations
  for all to authenticated using (true) with check (true);

-- Per-company hardening is the same unfinished story as contracts: see the
-- OPTIONAL HARDENING note in supabase/migrations/20260814_contracts.sql. Once
-- fn_user_company_ids() covers staff logins, this table should adopt it too.
