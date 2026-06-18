-- Invoice lifecycle: cancel / hold an UNPAID invoice instead of deleting it.
-- Deleting breaks numbering & corrupts the ledger; cancelling keeps the record
-- but excludes it from income, receivable, VAT and outstanding (handled in app).
--
-- status now also accepts: 'hold' (paused) and 'cancelled' (voided).
-- These two columns are optional audit fields; the app falls back gracefully
-- if they are missing, but run this so the cancel reason is saved.
-- Safe to re-run.

alter table public.invoices
  add column if not exists cancel_reason text;

alter table public.invoices
  add column if not exists status_changed_at timestamptz;
