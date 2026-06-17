-- ===========================================================================
-- Additional client WhatsApp numbers per project. The primary number stays
-- ops_projects.client_phone (locked, from the client/lead record); extra_phones
-- holds any additional recipients (comma-separated) the company wants to share
-- the project link + access code with. Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.ops_projects add column if not exists extra_phones text;
