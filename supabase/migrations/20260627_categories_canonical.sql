-- ============================================================
-- Canonical category list across the whole platform.
-- 1) Seed/activate the canonical categories in the `categories` table (source for
--    the business Profile multi-select + public directory), deactivate the rest.
-- 2) Map every company's legacy category value(s) to the canonical names so the
--    Marketplace category matching (and the directory) line up.
-- Keep the list identical to src/lib/categories.js in all three repos.
-- ============================================================

-- 1) Seed the categories table -------------------------------------------------
do $$
declare
  canon text[][] := array[
    ['Interior Design','🛋️'], ['Fit-Out','🏗️'], ['Renovation','🔨'], ['Construction & Civil','🧱'],
    ['Joinery & Carpentry','🪚'], ['MEP','⚙️'], ['Electrical','⚡'], ['Plumbing','🚰'], ['HVAC & AC','❄️'],
    ['Painting','🎨'], ['Flooring & Tiling','🔲'], ['False Ceiling & Gypsum','🏠'], ['Waterproofing','💧'],
    ['Glass & Aluminium','🪟'], ['Metal & Steel Works','🔩'], ['Kitchen & Bathroom','🚿'],
    ['Landscaping','🌳'], ['Swimming Pools','🏊'], ['Signage & Branding','🪧'], ['Furniture & Decor','🪑'],
    ['Smart Home & Automation','🏡'], ['Demolition','🚧'], ['Cleaning Services','🧹'],
    ['Handyman & Maintenance','🛠️'], ['Movers & Storage','📦'], ['Pest Control','🐜'], ['Security & CCTV','📹'],
    ['Restaurant & Cafe','🍽️'], ['Gym & Fitness','🏋️'], ['Salon & Spa','💇'], ['Medical & Clinic','🏥'],
    ['Legal Services','⚖️'], ['Real Estate','🏢'], ['IT & Technology','💻'], ['Automotive','🚗'],
    ['Education','🎓'], ['Retail','🛍️'], ['Other','🔧']
  ];
  i int; nm text; ic text;
begin
  for i in 1 .. array_length(canon, 1) loop
    nm := canon[i][1]; ic := canon[i][2];
    if exists (select 1 from public.categories where lower(name) = lower(nm)) then
      update public.categories set is_active = true, sort_order = i where lower(name) = lower(nm);
    else
      insert into public.categories (name, type, icon, is_active, sort_order) values (nm, 'minor', ic, true, i);
    end if;
  end loop;
  -- hide anything not in the canonical list
  update public.categories set is_active = false
   where lower(name) <> all (select lower(canon[j][1]) from generate_subscripts(canon, 1) j);
end $$;

-- 2a) Map the legacy single `category` value --------------------------------------
update public.companies c set category = m.new
from (values
  ('AC Service','HVAC & AC'), ('HVAC & AC','HVAC & AC'),
  ('Technical Contracting','Construction & Civil'), ('Construction & Renovation','Construction & Civil'),
  ('Handyman','Handyman & Maintenance'), ('Cleaning','Cleaning Services'),
  ('Restaurant','Restaurant & Cafe'), ('Food & Restaurant','Restaurant & Cafe'),
  ('Gym','Gym & Fitness'), ('Medical','Medical & Clinic'), ('Healthcare','Medical & Clinic'),
  ('Legal','Legal Services'), ('Salon','Salon & Spa'), ('Hotel','Other'),
  ('Kitchen & Bath','Kitchen & Bathroom'), ('Flooring','Flooring & Tiling'),
  ('Security Systems','Security & CCTV'), ('Finance & Accounting','Other'),
  ('Furniture','Furniture & Decor'), ('Fit Out','Fit-Out')
) as m(old, new)
where lower(c.category) = lower(m.old) and c.category is distinct from m.new;

-- 2b) Map values inside the `categories` array (if the column exists) --------------
do $$
declare
  m text[][] := array[
    ['AC Service','HVAC & AC'], ['Technical Contracting','Construction & Civil'],
    ['Construction & Renovation','Construction & Civil'], ['Handyman','Handyman & Maintenance'],
    ['Cleaning','Cleaning Services'], ['Restaurant','Restaurant & Cafe'], ['Food & Restaurant','Restaurant & Cafe'],
    ['Gym','Gym & Fitness'], ['Medical','Medical & Clinic'], ['Healthcare','Medical & Clinic'],
    ['Legal','Legal Services'], ['Salon','Salon & Spa'], ['Hotel','Other'],
    ['Kitchen & Bath','Kitchen & Bathroom'], ['Flooring','Flooring & Tiling'],
    ['Security Systems','Security & CCTV'], ['Finance & Accounting','Other'],
    ['Furniture','Furniture & Decor'], ['Fit Out','Fit-Out']
  ];
  i int;
begin
  if exists (select 1 from information_schema.columns where table_name='companies' and column_name='categories') then
    for i in 1 .. array_length(m, 1) loop
      update public.companies set categories = array_replace(categories, m[i][1], m[i][2])
       where categories && array[m[i][1]]::text[];
    end loop;
  end if;
end $$;

-- 3) Ensure the Marketplace feed matches on the viewer's category ARRAY -----------
-- (idempotent — re-applies the array-overlap version regardless of migration order)
drop function if exists public.subcontract_feed();
create or replace function public.subcontract_feed()
returns setof public.qv_subcontract_projects
language sql security definer set search_path = public stable as $$
  select p.*
  from public.qv_subcontract_projects p, public.companies c
  where c.id = public.my_company_id()
    and public.is_gold_company()
    and p.status = 'open'
    and p.company_id <> c.id
    and (
      cardinality(p.categories) = 0
      or exists (select 1 from unnest(p.categories) pc
                 where lower(pc) = any (select lower(x) from unnest(coalesce(c.categories, array[]::text[])) x)
                    or lower(pc) = lower(coalesce(c.category, '')))
    )
  order by p.created_at desc
$$;
