-- ===========================================================================
-- Ledger transfers: move money between accounts (e.g. Bank → Cash to fund the
-- petty-cash box, or Cash → Bank to deposit). A transfer is NOT income or
-- expense — it only shifts the balance from one method to another. Stored as a
-- ledger_entries row with kind='transfer', method = FROM account, transfer_to =
-- TO account. Run in Supabase → SQL Editor. Safe to re-run.
-- ===========================================================================

alter table public.ledger_entries add column if not exists transfer_to text;
