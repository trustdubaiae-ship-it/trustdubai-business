-- Record WHO made each project update (staff name), so a multi-staff team
-- can see "kisne kya update kiya" by name on the project timeline.
-- Safe to run multiple times.

alter table public.project_updates
  add column if not exists created_by_name text;

-- Backfill existing rows: derive a readable name from the recorded email
-- (text before @) where name is missing, so old updates aren't blank.
update public.project_updates
   set created_by_name = split_part(created_by_email, '@', 1)
 where created_by_name is null
   and created_by_email is not null
   and created_by_email <> '';
