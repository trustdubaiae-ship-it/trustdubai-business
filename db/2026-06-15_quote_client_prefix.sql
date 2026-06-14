-- Client title/prefix (Mr. / Mrs. / Ms. / M/s) shown before the client name.
-- Run in Supabase → SQL Editor. Safe to re-run.
alter table public.quotations
  add column if not exists client_prefix text default 'Mr.';
