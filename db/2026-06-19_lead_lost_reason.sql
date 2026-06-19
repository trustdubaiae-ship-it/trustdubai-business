-- Capture WHY a lead was closed/lost (e.g. "Budget too low"), so disqualified
-- leads keep a reason you can see and analyse. Applies to own leads and the
-- company's copy of platform-distributed leads. Safe to re-run.

alter table public.lead_submissions
  add column if not exists lost_reason text;

alter table public.lead_distributions
  add column if not exists lost_reason text;
