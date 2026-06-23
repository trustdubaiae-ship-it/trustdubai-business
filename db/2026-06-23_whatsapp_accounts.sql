-- ===========================================================================
-- WhatsApp Business (Cloud API) accounts — maps a company's WhatsApp phone
-- number to the company so the webhook can file incoming messages as leads.
--   phone_number_id : Meta's Phone Number ID (comes on every incoming message)
--   access_token    : permanent token (for sending replies later) — sensitive
-- Company-scoped RLS. The webhook reads this with the service role. Safe to re-run.
-- ===========================================================================

create table if not exists public.whatsapp_accounts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  phone_number_id text not null,
  display_number  text,
  waba_id         text,
  access_token    text,
  connected_at    timestamptz default now()
);

create unique index if not exists whatsapp_accounts_pnid_idx    on public.whatsapp_accounts(phone_number_id);
create index        if not exists whatsapp_accounts_company_idx on public.whatsapp_accounts(company_id);

alter table public.whatsapp_accounts enable row level security;

drop policy if exists whatsapp_accounts_rw on public.whatsapp_accounts;
create policy whatsapp_accounts_rw on public.whatsapp_accounts
  for all
  to authenticated
  using      (company_id::text in (select cid::text from public.current_company_ids() cid))
  with check (company_id::text in (select cid::text from public.current_company_ids() cid));

grant select, insert, update, delete on public.whatsapp_accounts to anon, authenticated;
