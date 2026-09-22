-- Measured ("work done") invoicing.
--
-- An invoice raised for work actually completed records how much of each
-- quotation line it billed:
--   { "<index of the item in quotations.items>": <quantity billed here> }
-- The next invoice reads this back, so a square metre already billed can
-- never be billed a second time, and the client's statement stays honest.
alter table public.invoices
  add column if not exists item_qtys jsonb default '{}'::jsonb;

-- PostgREST caches the table shape. Without this the new column stays
-- invisible to the app until the API happens to restart.
notify pgrst, 'reload schema';
