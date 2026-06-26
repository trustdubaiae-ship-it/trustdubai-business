-- ============================================================
-- Single partner plan price is stored in qv_settings:
--   plan_price          = original price (e.g. 799)
--   plan_discount_pct   = discount % (e.g. 70) → partner pays the discounted amount
-- Make qv_settings (non-sensitive config) readable publicly so the partner SIGN-UP
-- page (anonymous) can show the discounted price too.
-- ============================================================
drop policy if exists qv_settings_read on public.qv_settings;
create policy qv_settings_read on public.qv_settings
  for select using (true);
