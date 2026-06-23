-- AI Agents: per-company access toggles (which specialist agents are switched on).
-- Stored as a JSON map { "<agentKey>": false } — an agent is ON unless explicitly false.
alter table public.ai_agent_config
  add column if not exists access jsonb not null default '{}'::jsonb;
