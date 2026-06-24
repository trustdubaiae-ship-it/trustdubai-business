// Quvera — pay a partner via Stripe Connect transfer. Admin-only.
// Verifies the caller is an active admin (admin_users), then transfers the payout
// amount to the partner's connected account and marks the payout paid.
// Secrets: STRIPE_SECRET_KEY. SUPABASE_* auto-injected. Deploy: supabase functions deploy partner-payout
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

  // verify the caller is an active admin
  const { data: ures } = await caller.auth.getUser();
  const email = ures?.user?.email;
  if (!email) return json({ error: "Not signed in" }, 401);
  const { data: adm } = await admin.from("admin_users").select("id").eq("email", email).eq("is_active", true).maybeSingle();
  if (!adm) return json({ error: "Admins only" }, 403);

  let body: any = {}; try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const payoutId = String(body.payoutId || "");
  if (!payoutId) return json({ error: "Missing payout id" }, 400);

  const { data: payout } = await admin.from("qv_partner_payouts").select("*").eq("id", payoutId).maybeSingle();
  if (!payout) return json({ error: "Payout not found" }, 404);
  if (payout.status === "paid") return json({ error: "Already paid" }, 409);

  const { data: partner } = await admin.from("qv_partners").select("stripe_account_id, payouts_enabled, name").eq("id", payout.partner_id).maybeSingle();
  if (!partner?.stripe_account_id || !partner.payouts_enabled) {
    return json({ error: `${partner?.name || "Partner"} hasn't finished payout setup (Stripe Connect) yet.` }, 400);
  }

  try {
    const transfer = await stripe.transfers.create({
      amount: Math.round(Number(payout.amount) * 100), // AED -> fils
      currency: "aed",
      destination: partner.stripe_account_id,
      metadata: { payout_id: payoutId, partner_id: payout.partner_id },
    });
    await admin.from("qv_partner_payouts").update({
      status: "paid", paid_on: new Date().toISOString().slice(0, 10), method: "stripe", reference: transfer.id,
    }).eq("id", payoutId);
    return json({ ok: true, transfer: transfer.id });
  } catch (e) {
    return json({ error: String((e && (e as any).message) || e) }, 500);
  }
});
