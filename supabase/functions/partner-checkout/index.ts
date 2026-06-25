// Quvera — Stripe Checkout for a PARTNER's monthly tier subscription (raw fetch).
// The partner pays Quvera; the tier sets their commission. Gated to the calling partner.
// Secret: STRIPE_SECRET_KEY. SUPABASE_* auto-injected. Deploy: supabase functions deploy partner-checkout
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const TIERS: Record<string, { fee: number; commission: number }> = {
  starter: { fee: 99, commission: 5 }, growth: { fee: 199, commission: 15 }, pro: { fee: 299, commission: 25 },
};

function toForm(obj: any, prefix = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((it, i) => { if (it && typeof it === "object") toForm(it, `${key}[${i}]`, out); else out[`${key}[${i}]`] = String(it); });
    else if (typeof v === "object") toForm(v, key, out);
    else out[key] = String(v);
  }
  return out;
}
async function stripe(secret: string, path: string, params: any) {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(toForm(params)).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ error: "Stripe not configured" }, 500);

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: rows } = await caller.from("qv_partners").select("id, name, email, tier, stripe_customer_id").limit(1);
  const partner = rows?.[0];
  if (!partner) return json({ error: "Not a partner" }, 403);

  let body: any = {}; try { body = await req.json(); } catch { /* ok */ }
  const origin = String(body.origin || "").replace(/\/$/, "");
  const tier = TIERS[partner.tier] ? partner.tier : "starter";
  const amountFils = TIERS[tier].fee * 100;

  try {
    let customerId = partner.stripe_customer_id || undefined;
    if (!customerId) {
      const cust = await stripe(key, "customers", { email: partner.email || undefined, name: partner.name || undefined, metadata: { partner_id: partner.id } });
      customerId = cust.id;
      await admin.from("qv_partners").update({ stripe_customer_id: customerId }).eq("id", partner.id);
    }
    const session = await stripe(key, "checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      line_items: [{ quantity: 1, price_data: { currency: "aed", unit_amount: amountFils, recurring: { interval: "month" }, product_data: { name: `Quvera Partner — ${tier} plan` } } }],
      metadata: { partner_id: partner.id, tier },
      subscription_data: { metadata: { partner_id: partner.id, tier } },
      success_url: `${origin}/?partner_paid=1`,
      cancel_url: `${origin}/?partner_pay_cancelled=1`,
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e && (e as any).message) || e) }, 500);
  }
});
