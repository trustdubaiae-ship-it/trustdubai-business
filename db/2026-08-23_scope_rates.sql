-- ===========================================================================
-- Scope line rates — the price per unit behind each amount.
--
-- project_scope already stored `quantity` and `unit` (e.g. 500 m²) but only
-- lump-sum totals: client_amount and sub_amount. So a line priced at 17 AED/m²
-- to the client and sublet at 8.50 AED/m² had to be multiplied out by hand, the
-- rate itself was never recorded, and the LPO could only print the total — not
-- the "500 m² × AED 8.50" breakdown a subcontractor expects to check.
--
-- Both rates are nullable: lines genuinely priced as a lump sum (a single door,
-- a mobilisation charge) keep a null rate and print as they do today.
--
-- The backfill derives a rate for existing rows where one can be inferred. It
-- only runs where quantity and amount are both set, and is skipped for rows
-- that already carry a rate, so the file is safe to re-run.
-- ===========================================================================

alter table public.project_scope add column if not exists client_rate numeric;
alter table public.project_scope add column if not exists sub_rate    numeric;

update public.project_scope
   set client_rate = round((client_amount / nullif(quantity, 0))::numeric, 4)
 where client_rate is null
   and coalesce(quantity, 0) > 0
   and coalesce(client_amount, 0) > 0;

update public.project_scope
   set sub_rate = round((sub_amount / nullif(quantity, 0))::numeric, 4)
 where sub_rate is null
   and coalesce(quantity, 0) > 0
   and coalesce(sub_amount, 0) > 0;
