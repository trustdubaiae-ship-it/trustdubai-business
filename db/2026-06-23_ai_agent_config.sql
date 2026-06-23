-- ===========================================================================
-- AI Agents config — per-company knowledge the agents use to be specific to the
-- business, plus optional per-agent custom instructions.
--   knowledge : free text about the company (services, rates, USP, terms…)
--   notes     : { "<agent_key>": "extra instruction for that agent" }
-- Company-scoped RLS. Safe to re-run.
-- ===========================================================================

create table if not exists public.ai_agent_config (
  company_id uuid primary key,
  knowledge  text,
  notes      jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.ai_agent_config enable row level security;

drop policy if exists ai_agent_config_rw on public.ai_agent_config;
create policy ai_agent_config_rw on public.ai_agent_config
  for all
  to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

grant select, insert, update, delete on public.ai_agent_config to anon, authenticated;
