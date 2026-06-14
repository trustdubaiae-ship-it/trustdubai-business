-- ===========================================================================
-- Link Organizer meetings to leads + capture Minutes of Meeting (MOM).
-- Lets a meeting be scheduled from a lead and, after the meeting, write the
-- minutes + a follow-up back to that lead. Run in Supabase → SQL Editor.
-- Safe to re-run.
-- ===========================================================================

alter table public.organizer_items
  add column if not exists lead_id   text,
  add column if not exists lead_name text,
  add column if not exists mom       text;

create index if not exists organizer_items_lead_id_idx
  on public.organizer_items(lead_id);
