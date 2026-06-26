-- ============================================================
-- Marketplace v2 — per-field contact privacy, "Express Interest", award flow.
-- ============================================================
alter table public.qv_subcontract_projects
  add column if not exists contact_email      text,
  add column if not exists show_name           boolean not null default false,
  add column if not exists show_phone          boolean not null default false,
  add column if not exists show_email          boolean not null default false,
  add column if not exists awarded_to          text,
  add column if not exists awarded_company_id  uuid;
-- status values now: 'open' | 'under_discussion'

-- Interests: a gold company expresses interest in a posted project. The poster
-- can see the interested companies (with their contact) and award one.
create table if not exists public.qv_subcontract_interests (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.qv_subcontract_projects(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  company_name  text,
  contact_phone text,
  contact_email text,
  note          text,
  created_at    timestamptz default now(),
  unique (project_id, company_id)
);
alter table public.qv_subcontract_interests enable row level security;

-- gold company records its own interest
drop policy if exists qsi_insert on public.qv_subcontract_interests;
create policy qsi_insert on public.qv_subcontract_interests for insert
  with check (company_id = public.my_company_id() and public.is_gold_company());

-- the interested company sees its own rows; the POSTER sees interests on their projects
drop policy if exists qsi_select on public.qv_subcontract_interests;
create policy qsi_select on public.qv_subcontract_interests for select using (
  company_id = public.my_company_id()
  or exists (select 1 from public.qv_subcontract_projects p where p.id = project_id and p.company_id = public.my_company_id())
);

-- interested company can withdraw its own interest
drop policy if exists qsi_delete on public.qv_subcontract_interests;
create policy qsi_delete on public.qv_subcontract_interests for delete using (company_id = public.my_company_id());

-- Feed: privacy-aware — contact fields are returned ONLY when the poster chose to
-- show them; matches on the viewer's category array. (Drop+recreate: return type changed.)
drop function if exists public.subcontract_feed();
create or replace function public.subcontract_feed()
returns table (
  id uuid, company_id uuid, poster_name text, title text, description text,
  categories text[], budget_min numeric, budget_max numeric, location text, timeline text,
  contact_name text, contact_phone text, contact_email text,
  status text, awarded_to text, created_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select p.id, p.company_id, p.poster_name, p.title, p.description,
         p.categories, p.budget_min, p.budget_max, p.location, p.timeline,
         case when p.show_name  then p.contact_name  else null end,
         case when p.show_phone then p.contact_phone else null end,
         case when p.show_email then p.contact_email else null end,
         p.status, p.awarded_to, p.created_at
  from public.qv_subcontract_projects p, public.companies c
  where c.id = public.my_company_id()
    and public.is_gold_company()
    and p.company_id <> c.id
    and (
      cardinality(p.categories) = 0
      or exists (select 1 from unnest(p.categories) pc
                 where lower(pc) = any (select lower(x) from unnest(coalesce(c.categories, array[]::text[])) x)
                    or lower(pc) = lower(coalesce(c.category, '')))
    )
  order by (p.status = 'open') desc, p.created_at desc
$$;
grant execute on function public.subcontract_feed() to authenticated;
