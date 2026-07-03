-- ===========================================================================
-- Meta (Facebook/Instagram) backbone — connections, per-page routing, campaigns.
-- Powers: Meta lead auto-capture (leadgen webhook) + AI Marketing Agent (ads).
-- Idempotent: creates tables if missing, adds any missing columns, (re)sets RLS.
-- Company-scoped RLS via current_company_ids(); edge functions use service role.
-- Tokens live in these tables (sensitive) — the UI never SELECTs *_access_token.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) meta_connections — one row per company (the UI's connection summary)
-- ---------------------------------------------------------------------------
create table if not exists public.meta_connections (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  connected     boolean default false,
  page_id       text,
  page_name     text,
  ig_username   text,
  ad_account_id text,
  ad_account_name text,
  page_access_token text,     -- primary page token (server-only)
  user_access_token text,     -- long-lived user token (server-only)
  token_expires_at  timestamptz,
  target_cpl    numeric,
  connected_at  timestamptz default now(),
  updated_at    timestamptz default now()
);
-- backfill columns if the table pre-existed ad-hoc
alter table public.meta_connections add column if not exists connected boolean default false;
alter table public.meta_connections add column if not exists page_id text;
alter table public.meta_connections add column if not exists page_name text;
alter table public.meta_connections add column if not exists ig_username text;
alter table public.meta_connections add column if not exists ad_account_id text;
alter table public.meta_connections add column if not exists ad_account_name text;
alter table public.meta_connections add column if not exists page_access_token text;
alter table public.meta_connections add column if not exists user_access_token text;
alter table public.meta_connections add column if not exists token_expires_at timestamptz;
alter table public.meta_connections add column if not exists target_cpl numeric;
alter table public.meta_connections add column if not exists connected_at timestamptz default now();
alter table public.meta_connections add column if not exists updated_at timestamptz default now();

create unique index if not exists meta_connections_company_idx on public.meta_connections(company_id);

-- ---------------------------------------------------------------------------
-- 2) meta_pages — one row per connected Page (multi-page lead routing).
--    The leadgen webhook maps an incoming page_id → company + page token.
-- ---------------------------------------------------------------------------
create table if not exists public.meta_pages (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null,
  page_id           text not null,
  page_name         text,
  page_access_token text,       -- server-only; used to fetch full lead data
  ig_id             text,
  subscribed        boolean default false,
  created_at        timestamptz default now()
);
create unique index if not exists meta_pages_page_idx    on public.meta_pages(page_id);
create index        if not exists meta_pages_company_idx on public.meta_pages(company_id);

-- ---------------------------------------------------------------------------
-- 3) meta_campaigns — ad campaigns (drafts now; real Meta ids after publish)
-- ---------------------------------------------------------------------------
create table if not exists public.meta_campaigns (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  name         text,
  objective    text,
  status       text default 'draft',
  daily_budget numeric,
  spend        numeric default 0,
  leads        integer default 0,
  clicks       integer default 0,
  impressions  integer default 0,
  conversions  integer default 0,
  audience     jsonb,
  creative     jsonb,
  lead_form    jsonb,
  meta_ref     jsonb,          -- real Meta {campaign_id, adset_id, ad_id, creative_id}
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.meta_campaigns add column if not exists meta_ref jsonb;
alter table public.meta_campaigns add column if not exists lead_form jsonb;
alter table public.meta_campaigns add column if not exists updated_at timestamptz default now();
create index if not exists meta_campaigns_company_idx on public.meta_campaigns(company_id);

-- ---------------------------------------------------------------------------
-- RLS — company-scoped for all three (edge functions use the service role)
-- ---------------------------------------------------------------------------
alter table public.meta_connections enable row level security;
alter table public.meta_pages       enable row level security;
alter table public.meta_campaigns   enable row level security;

drop policy if exists meta_connections_rw on public.meta_connections;
create policy meta_connections_rw on public.meta_connections for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

drop policy if exists meta_pages_rw on public.meta_pages;
create policy meta_pages_rw on public.meta_pages for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

drop policy if exists meta_campaigns_rw on public.meta_campaigns;
create policy meta_campaigns_rw on public.meta_campaigns for all to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

grant select, insert, update, delete on public.meta_connections to anon, authenticated;
grant select, insert, update, delete on public.meta_pages       to anon, authenticated;
grant select, insert, update, delete on public.meta_campaigns   to anon, authenticated;
