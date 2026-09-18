-- ===========================================================================
-- Bill an approved Variation Order on its own invoice.
--
-- Until now a VO could only be collected through the payment schedule: it
-- raised the revised contract, and the next milestone asked for the difference.
-- That is right when the client pays by milestones, and wrong when the extra
-- work is agreed and billed on its own, which is the usual way a variation is
-- settled on site.
--
-- `variation_ids` records which variations a given invoice covers. It is what
-- keeps the two routes from billing the same work twice: a VO listed here has
-- left the schedule, so the app takes it out of the milestone base and counts
-- its payments separately.
--
-- Empty array on every existing invoice, which is exactly right - none of them
-- were raised for a variation on its own.
--
-- kind now also accepts 'variation' alongside 'full' and 'milestone'.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.invoices
  add column if not exists variation_ids jsonb default '[]'::jsonb;

-- Asked on every invoice screen ("which VOs are already billed?"), so it is
-- worth an index rather than a scan per quote.
create index if not exists invoices_variation_ids_idx
  on public.invoices using gin (variation_ids);

notify pgrst, 'reload schema';
