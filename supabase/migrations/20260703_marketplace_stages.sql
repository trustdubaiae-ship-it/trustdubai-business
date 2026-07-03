-- ============================================================
-- Marketplace — deal pipeline on a posted project.
-- stage: open → contacted → quoted → negotiation → awarded.
-- Once 'awarded', the post shows greyed + locked in the feed (still visible).
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

alter table public.qv_subcontract_projects add column if not exists stage text default 'open';

-- backfill: existing awarded/under-discussion posts → 'awarded', rest → 'open'
update public.qv_subcontract_projects set stage = 'awarded'
  where status = 'under_discussion' and (stage is null or stage = 'open');
update public.qv_subcontract_projects set stage = 'open' where stage is null;

-- Feed now also returns stage. (Drop+recreate: return type changed.)
drop function if exists public.subcontract_feed();
create or replace function public.subcontract_feed()
returns table (
  id uuid, company_id uuid, poster_name text, title text, description text,
  categories text[], budget_min numeric, budget_max numeric, location text, timeline text,
  contact_name text, contact_phone text, contact_email text,
  images text[], scope text[], project_type text, urgency text,
  status text, stage text, awarded_to text, created_at timestamptz,
  poster_trust_score numeric, poster_trust_tier text, poster_is_verified boolean,
  poster_avg_rating numeric, poster_total_reviews int, poster_logo_url text, poster_slug text
)
language sql security definer set search_path = public stable as $$
  select p.id, p.company_id, p.poster_name, p.title, p.description,
         p.categories, p.budget_min, p.budget_max, p.location, p.timeline,
         case when p.show_name  then p.contact_name  else null end,
         case when p.show_phone then p.contact_phone else null end,
         case when p.show_email then p.contact_email else null end,
         coalesce(p.images, '{}'), coalesce(p.scope, '{}'), p.project_type, p.urgency,
         p.status, coalesce(p.stage, 'open'), p.awarded_to, p.created_at,
         owner.trust_score, owner.trust_tier, owner.is_verified,
         owner.avg_rating, owner.total_reviews, owner.logo_url, owner.slug
  from public.qv_subcontract_projects p
  join public.companies owner on owner.id = p.company_id,
       public.companies c
  where c.id = public.my_company_id()
    and public.is_gold_company()
    and p.company_id <> c.id
    and (
      cardinality(p.categories) = 0
      or exists (select 1 from unnest(p.categories) pc
                 where lower(pc) = any (select lower(x) from unnest(coalesce(c.categories, array[]::text[])) x)
                    or lower(pc) = lower(coalesce(c.category, '')))
    )
  order by (coalesce(p.stage,'open') <> 'awarded') desc, p.created_at desc
$$;
grant execute on function public.subcontract_feed() to authenticated;
