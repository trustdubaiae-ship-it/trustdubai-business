-- ============================================================
-- Link a subcontractor row to the subcontractor's OWN TrustDubai company,
-- so that company can see the work in its own portal ("My Subcontracts").
-- The contractor (e.g. Seven Jaguar) adds the sub; if the sub is a registered
-- member, sub_company_id points at their companies.id. External subs stay null.
-- Safe to re-run.
-- ============================================================

alter table public.project_subcontractors
  add column if not exists sub_company_id uuid references public.companies(id) on delete set null;
create index if not exists psub_sub_company_idx on public.project_subcontractors(sub_company_id);

-- Resolve the caller's company for OWNERS *and* STAFF (was owner-email only), so
-- staff of a company also see "My Subcontracts" (and the subcontract board).
create or replace function public.my_company_id()
returns uuid language sql security definer set search_path = public stable as $$
  select coalesce(
    (select id from public.companies
       where lower(owner_email) = lower(coalesce(auth.email(), '')) limit 1),
    (select company_id from public.business_staff
       where lower(email) = lower(coalesce(auth.email(), '')) and active = true limit 1)
  )
$$;
grant execute on function public.my_company_id() to authenticated;

-- Search registered companies to link when adding a subcontractor.
-- Minimal public fields only; needs a query string; never returns the caller.
create or replace function public.fn_search_companies(q text)
returns table(id uuid, name text, phone text, logo_url text, category text)
language sql security definer set search_path = public stable as $$
  select c.id, c.name, c.phone, c.logo_url, c.category
  from public.companies c
  where public.my_company_id() is not null
    and c.id <> public.my_company_id()
    and length(coalesce(q, '')) >= 2
    and (c.name ilike '%' || q || '%' or c.phone ilike '%' || q || '%')
  order by c.name
  limit 20
$$;
grant execute on function public.fn_search_companies(text) to authenticated;

-- Does a subcontractor row belong to the CALLER's company?
--  • an explicit link (sub_company_id) always wins; otherwise
--  • for OLD unlinked rows added before this feature, fall back to a strict
--    match: exact (case-insensitive) name, or the same phone (last 9 digits,
--    so +9715… and 05… match). Keeps pre-existing assignments visible.
create or replace function public.fn_sub_row_is_mine(p_link uuid, p_name text, p_phone text)
returns boolean language sql security definer set search_path = public stable as $$
  select case when public.my_company_id() is null then false else exists (
    select 1 from public.companies me
    where me.id = public.my_company_id()
      and (
        p_link = me.id
        or (p_link is null and (
          (length(trim(coalesce(p_name,''))) > 0 and lower(trim(p_name)) = lower(trim(me.name)))
          or (
            length(regexp_replace(coalesce(me.phone,''), '\D', '', 'g')) >= 9
            and length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) >= 9
            and right(regexp_replace(coalesce(me.phone,''), '\D', '', 'g'), 9)
              = right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 9)
          )
        ))
      )
  ) end
$$;
grant execute on function public.fn_sub_row_is_mine(uuid, text, text) to authenticated;

-- The subcontracts awarded TO the caller's company (they are the subcontractor).
-- SAFE fields only — no client name, project value or the contractor's margin.
create or replace function public.fn_my_subcontracts()
returns table(
  sub_id uuid,
  project_name text,
  project_location text,
  trade text,
  status text,
  contract_amount numeric,
  apply_vat boolean,
  paid_amount numeric,
  extra_work jsonb,
  contract_signed boolean,
  lpo_number text,
  notes text,
  created_at timestamptz,
  contractor_name text,
  contractor_logo text,
  contractor_phone text
)
language sql security definer set search_path = public stable as $$
  select s.id, p.name, p.location, s.trade, s.status,
         s.contract_amount, s.apply_vat, s.paid_amount, s.extra_work,
         s.contract_signed, s.lpo_number, s.notes, s.created_at,
         c.name, c.logo_url, c.phone
  from public.project_subcontractors s
  join public.ops_projects p on p.id = s.project_id
  join public.companies c on c.id = s.company_id          -- the contractor who awarded it
  where public.fn_sub_row_is_mine(s.sub_company_id, s.name, s.phone)
  order by s.created_at desc
$$;
grant execute on function public.fn_my_subcontracts() to authenticated;

-- Payments recorded against ONE of my subcontract rows (for the Statement).
-- Guarded so a company can only read payments on rows linked to itself.
create or replace function public.fn_my_subcontract_payments(p_sub_id uuid)
returns table(id uuid, amount numeric, paid_on date, method text, reference text, note text)
language sql security definer set search_path = public stable as $$
  select sp.id, sp.amount, sp.paid_on, sp.method, sp.reference, sp.note
  from public.sub_payments sp
  where sp.sub_id = p_sub_id
    and exists (
      select 1 from public.project_subcontractors s
      where s.id = p_sub_id and public.fn_sub_row_is_mine(s.sub_company_id, s.name, s.phone)
    )
  order by sp.paid_on
$$;
grant execute on function public.fn_my_subcontract_payments(uuid) to authenticated;
