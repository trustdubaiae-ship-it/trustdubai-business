-- AI Agents: persist chat history in the DB (was localStorage only, which iOS/Safari
-- evicts on close). Stored per company on the existing ai_agent_config row as
-- { "<agentKey>": [ { id, title, msgs, updatedAt }, ... ] }.
alter table public.ai_agent_config
  add column if not exists threads jsonb not null default '{}'::jsonb;
