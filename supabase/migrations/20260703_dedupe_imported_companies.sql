-- ===========================================================================
-- De-dup imported company listings flagged in Duplicate Watch (same phone).
-- Removes 4 duplicate / thin listings; keeps the stronger one in each pair.
-- Verified before writing: all 4 have 0 reviews and 0 leads (no data lost).
-- Guard: only unclaimed, imported listings are ever touched.
-- KEEP (do NOT delete): Creative Shelf LLC, clean-slug Aqua Epoxy, MD Design &
-- Fitout, Antonovich Design, and BOTH of the ALEC + AC pairs.
-- Run in Supabase → SQL Editor. Safe to re-run (deletes nothing on 2nd run).
-- ===========================================================================

begin;

delete from public.companies
where claimed = false
  and is_imported = true
  and slug in (
    'interior-company',                                -- dup of Creative Shelf LLC
    'aqua-epoxy-flooring-and-installation-qvsu',       -- exact-name dup of Aqua Epoxy
    'md-technical-and-renovation-services-llc-menku',  -- thin dup (no location)
    'luxury-antonovich-group-furniture-zes-w'          -- thin dup (no location)
  );

commit;
