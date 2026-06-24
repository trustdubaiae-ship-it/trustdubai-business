// Quvera — partner payout onboarding via Stripe Connect (Express).
// The calling partner (identified by their JWT) gets/creates a connected account
// and an onboarding link; we cache the account id + payouts_enabled on qv_partners.
// Secrets: STRIPE_SECRET_KEY. SUPABASE_* auto-injected. Deploy: supabase functions deploy partner-connect
import Stripe from "https://esm.sh/stripe@17.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ error: "Stripe not configured" }, 500);
  const stripe = new Stripe(key, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") || "";
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // identify the partner from their own session (RLS returns only their row)
  const { data: rows } = await caller.from("qv_partners").select("id, name, email, stripe_account_id, status").limit(1);
  const partner = rows?.[0];
  if (!partner) return json({ error: "Not a partner" }, 403);

  let body: any = {}; try { body = await req.json(); } catch { /* ok */ }
  const origin = String(body.origin || "").replace(/\/$/, "");

  try {
    let acctId = partner.stripe_account_id as string | null;
    if (!acctId) {
      const acct = await stripe.accounts.create({
        type: "express",
        email: partner.email || undefined,
        capabilities: { transfers: { requested: true } },
        business_type: "individual",
        metadata: { partner_id: partner.id },
      });
      acctId = acct.id;
      await admin.from("qv_partners").update({ stripe_account_id: acctId }).eq("id", partner.id);
    }

    const acct = await stripe.accounts.retrieve(acctId);
    const enabled = !!acct.payouts_enabled;
    await admin.from("qv_partners").update({ payouts_enabled: enabled }).eq("id", partner.id);

    if (enabled) return json({ payouts_enabled: true });

    const link = await stripe.accountLinks.create({
      account: acctId,
      refresh_url: `${origin}/?connect_refresh=1`,
      return_url: `${origin}/?connect_done=1`,
      type: "account_onboarding",
    });
    return json({ payouts_enabled: false, url: link.url });
  } catch (e) {
    return json({ error: String((e && (e as any).message) || e) }, 500);
  }
});
