-- "Notes for client" on a quotation (was captured in the builder but never
-- persisted). Run in Supabase → SQL Editor. Safe to re-run.

alter table public.quotations add column if not exists notes text;
