# WhatsApp webhook — setup

Turns messages sent to a connected WhatsApp Business number into leads.

## 1. Run the migration
`db/2026-06-23_whatsapp_accounts.sql` (creates `whatsapp_accounts`).

## 2. Set Edge Function secrets (Supabase → Edge Functions → Secrets)
- `APP_SUPABASE_URL` — your project URL
- `APP_SERVICE_ROLE_KEY` — service role key
- `WHATSAPP_VERIFY_TOKEN` — any random string you choose (also entered in Meta, step 4)
- `WHATSAPP_APP_SECRET` — (optional) Meta app secret, to validate signatures

## 3. Deploy (no JWT — Meta can't send one)
```
supabase functions deploy whatsapp-webhook --no-verify-jwt
```
URL becomes: `https://<project-ref>.functions.supabase.co/whatsapp-webhook`

## 4. Configure the webhook in Meta
Meta app → WhatsApp → Configuration → Webhook:
- Callback URL: the function URL above
- Verify token: the same `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the **messages** field

## 5. Connect a number to a company
Insert a row in `whatsapp_accounts` mapping the company to Meta's **Phone Number ID**:
```sql
insert into public.whatsapp_accounts (company_id, phone_number_id, display_number, waba_id, access_token)
values ('<company-uuid>', '<META_PHONE_NUMBER_ID>', '+9715xxxxxxxx', '<WABA_ID>', '<PERMANENT_TOKEN>');
```
(A "Connect WhatsApp" screen in the portal will do this insert for the user.)

## Test
Send a WhatsApp to the connected number → a lead (Source: WhatsApp) appears in the Lead Hub.
