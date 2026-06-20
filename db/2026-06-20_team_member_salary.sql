-- Monthly salary per team member, so staff salaries roll into Company Overheads.
-- Safe to re-run.

alter table public.team_members
  add column if not exists salary numeric;
