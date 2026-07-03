-- ===========================================================================
-- Tidy up duplicate INSERT policies on the trade-licenses bucket.
-- Keep ONE canonical upload policy ("claim tl upload", anon+authenticated) and
-- the service-role read policy; drop the two overlapping duplicates.
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

drop policy if exists "Allow public upload to trade-licenses" on storage.objects;
drop policy if exists "claim tl upload jvedgb_0"              on storage.objects;

-- Ensure the canonical upload policy exists (INSERT for anon + authenticated).
drop policy if exists "claim tl upload" on storage.objects;
create policy "claim tl upload" on storage.objects
  for insert to anon, authenticated
  with check ( bucket_id = 'trade-licenses' );
