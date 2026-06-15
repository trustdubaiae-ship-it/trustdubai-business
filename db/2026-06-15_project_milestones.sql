-- Project milestones / timeline (stages of the job). Overall project progress
-- is derived from completed milestones. Run in Supabase → SQL Editor. Safe to re-run.

create table if not exists public.project_milestones (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  project_id  uuid not null,
  title       text not null,
  target_date date,
  status      text default 'pending',   -- pending / in_progress / done
  sort        int  default 0,
  done_on     date,
  note        text,
  created_at  timestamptz default now()
);
create index if not exists project_milestones_company_idx on public.project_milestones(company_id);
create index if not exists project_milestones_project_idx on public.project_milestones(project_id);

alter table public.project_milestones enable row level security;
drop policy if exists project_milestones_rw on public.project_milestones;
create policy project_milestones_rw on public.project_milestones for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));
