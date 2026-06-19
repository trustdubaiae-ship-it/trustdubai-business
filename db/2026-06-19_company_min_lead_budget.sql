-- Company-wide minimum lead budget. Leads whose budget is below this are
-- flagged "below budget" in Lead Hub for the whole team (not per-browser).
-- Safe to re-run.

alter table public.companies
  add column if not exists min_lead_budget integer;
