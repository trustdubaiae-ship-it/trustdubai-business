-- ===========================================================================
-- WhatsApp Bot — per-company config, message log, and conversation state.
-- Powers the auto-reply engine in the whatsapp-webhook function (menu/catalogue
-- + Claude AI for free text). Company-scoped RLS; the webhook uses service role.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

-- 1) Per-company bot configuration (one row per company)
create table if not exists public.whatsapp_bot_config (
  company_id  uuid primary key,
  enabled     boolean default false,       -- default OFF → existing lead-only behaviour unchanged
  greeting    text,                         -- first-message welcome; {name}/{company} placeholders
  menu        jsonb default '[]'::jsonb,    -- catalogue rows: [{id,title,description,reply}]
  ai_enabled  boolean default true,         -- use Claude for free-text messages
  ai_instructions text,                     -- extra brand/context for the AI
  handover_note   text,                     -- shown when a human takeover is triggered
  handover_keywords text default 'agent,human,call me,representative',
  collect_lead    boolean default true,     -- still file/refresh a lead alongside the chat
  updated_at  timestamptz default now()
);

-- 2) Message log (both directions) — history + AI context + audit
create table if not exists public.whatsapp_messages (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  wa_id       text not null,                -- the customer's WhatsApp number (digits)
  direction   text not null,               -- 'in' | 'out'
  type        text,                         -- text | interactive | template | ...
  body        text,
  raw         jsonb,
  created_at  timestamptz default now()
);
create index if not exists wa_messages_company_wa_idx on public.whatsapp_messages(company_id, wa_id, created_at desc);

-- 3) Conversation state per customer (menu node, handover flag, greeted)
create table if not exists public.whatsapp_conversations (
  company_id  uuid not null,
  wa_id       text not null,
  state       jsonb default '{}'::jsonb,    -- { greeted, node, last_intent }
  handover    boolean default false,        -- true → bot stays silent, human is handling
  updated_at  timestamptz default now(),
  primary key (company_id, wa_id)
);

-- RLS — company-scoped for the portal UI; webhook uses service role (bypasses RLS)
alter table public.whatsapp_bot_config    enable row level security;
alter table public.whatsapp_messages       enable row level security;
alter table public.whatsapp_conversations  enable row level security;

drop policy if exists whatsapp_bot_config_rw on public.whatsapp_bot_config;
create policy whatsapp_bot_config_rw on public.whatsapp_bot_config for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

drop policy if exists whatsapp_messages_rw on public.whatsapp_messages;
create policy whatsapp_messages_rw on public.whatsapp_messages for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

drop policy if exists whatsapp_conversations_rw on public.whatsapp_conversations;
create policy whatsapp_conversations_rw on public.whatsapp_conversations for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

grant select, insert, update, delete on public.whatsapp_bot_config   to anon, authenticated;
grant select, insert, update, delete on public.whatsapp_messages      to anon, authenticated;
grant select, insert, update, delete on public.whatsapp_conversations to anon, authenticated;
