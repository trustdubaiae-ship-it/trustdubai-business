-- Link a Marketplace post back to an ops_project (when posted from a project),
-- so awarding the work can add the chosen company as that project's subcontractor.
alter table public.qv_subcontract_projects
  add column if not exists project_id uuid references public.ops_projects(id) on delete set null;
