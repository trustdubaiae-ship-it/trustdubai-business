-- ============================================================
-- Marketplace — project photos.
-- A poster can attach images to a subcontract project; the feed returns them
-- so other companies see them on the card and in the detail view.
-- ============================================================
alter table public.qv_subcontract_projects
  add column if not exists images text[] not null default '{}';

-- Feed: now also returns the images array. (Drop+recreate: return type changed.)
drop function if exists public.subcontract_feed();
create or replace function public.subcontract_feed()
returns table (
  id uuid, company_id uuid, poster_name text, title text, description text,
  categories text[], budget_min numeric, budget_max numeric, location text, timeline text,
  contact_name text, contact_phone text, contact_email text,
  images text[], status text, awarded_to text, created_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select p.id, p.company_id, p.poster_name, p.title, p.description,
         p.categories, p.budget_min, p.budget_max, p.location, p.timeline,
         case when p.show_name  then p.contact_name  else null end,
         case when p.show_phone then p.contact_phone else null end,
         case when p.show_email then p.contact_email else null end,
         coalesce(p.images, '{}'), p.status, p.awarded_to, p.created_at
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
