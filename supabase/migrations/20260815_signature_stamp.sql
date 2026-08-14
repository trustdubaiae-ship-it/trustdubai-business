-- ===========================================================================
-- Signature + company stamp on printed documents.
--
-- The company uploads a signature and a stamp ONCE in Quote Settings, then
-- ticks a box per quotation or contract to print them into the signature block.
--
-- Both images are stored as data URIs in text columns, NOT in storage. The
-- company-assets bucket is public - an existing logo URL returns 200 with no
-- auth - and a downloadable signature image is a forgery risk. Held in the row,
-- there is no URL to leak, and the image embeds straight into the printed PDF.
-- Signature PNGs are small; the app downscales to 600px wide before saving.
--
-- Run in Supabase -> SQL Editor. Safe to re-run.
-- ===========================================================================

-- where the images live (one per company)
alter table public.quotation_templates add column if not exists signature_data text;
alter table public.quotation_templates add column if not exists stamp_data text;

-- per-document opt-in. Default false: printing a signature is a deliberate act,
-- never something that happens to every document by accident.
alter table public.quotations add column if not exists show_sign_image  boolean default false;
alter table public.quotations add column if not exists show_stamp_image boolean default false;

alter table public.contracts  add column if not exists show_sign_image  boolean default false;
alter table public.contracts  add column if not exists show_stamp_image boolean default false;
