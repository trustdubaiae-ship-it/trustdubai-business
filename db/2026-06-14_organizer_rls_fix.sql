-- ===========================================================================
-- Organizer is a per-user private diary. Each logged-in user (company owner
-- OR staff) should fully manage ONLY their own rows, keyed by owner_email.
-- This adds a permissive policy so staff logins (whose email is not a company
-- owner_email) can still create/see their own meetings, tasks and notes.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.organizer_items enable row level security;

drop policy if exists organizer_owner_rw on public.organizer_items;

create policy organizer_owner_rw on public.organizer_items
  for all
  to authenticated
  using      (lower(owner_email) = lower(auth.email()))
  with check (lower(owner_email) = lower(auth.email()));
