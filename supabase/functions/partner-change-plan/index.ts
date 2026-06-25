// Quvera — change a PARTNER's tier (upgrade/downgrade). Raw fetch to Stripe.
// If the partner has an active subscription, its price is swapped (prorated) and the
// DB tier/commission is updated. If not paying yet, only the DB row is updated.
// Secret: STRIPE_SECRET_KEY. SUPABASE_* auto-injected. Gated to the calling partner.
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
async function stripePost(secret: string, path: string, params: any) {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(toForm(params)).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}
async function stripeGet(secret: string, path: string) {
  const res = await fetch("https://api.stripe.com/v1/" + path, { headers: { Authorization: "Bearer " + secret } });
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

  const { data: rows } = await caller.from("qv_partners").select("id, tier, payment_status, stripe_subscription_id").limit(1);
  const partner = rows?.[0];
  if (!partner) return json({ error: "Not a partner" }, 403);

  let body: any = {}; try { body = await req.json(); } catch { /* ok */ }
  const tier = String(body.tier || "");
  if (!TIERS[tier]) return json({ error: "Invalid plan" }, 400);
  if (tier === partner.tier) return json({ ok: true, unchanged: true });

  const fee = TIERS[tier].fee, commission = TIERS[tier].commission;

  // reuse (or create) a 5% UAE VAT tax rate, added on top of the plan price (exclusive)
  async function getVatRateId() {
    try {
      const list = await fetch("https://api.stripe.com/v1/tax_rates?limit=100&active=true", { headers: { Authorization: "Bearer " + key } }).then((r) => r.json());
      const found = (list?.data || []).find((r: any) => r.metadata?.quvera === "vat5");
      if (found) return found.id;
      const created = await stripePost(key, "tax_rates", { display_name: "VAT", description: "UAE VAT 5%", percentage: 5, inclusive: false, country: "AE", metadata: { quvera: "vat5" } });
      return created.id;
    } catch { return null; }
  }

  try {
    // If the partner is actively paying, swap the subscription price (prorated).
    if (partner.payment_status === "active" && partner.stripe_subscription_id) {
      const vatRateId = await getVatRateId();
      const sub = await stripeGet(key, "subscriptions/" + partner.stripe_subscription_id);
      const itemId = sub?.items?.data?.[0]?.id;
      if (!itemId) throw new Error("Could not read your current subscription");
      const price = await stripePost(key, "prices", {
        currency: "aed", unit_amount: fee * 100, recurring: { interval: "month" },
        product_data: { name: `Quvera Partner — ${tier} plan` },
      });
      await stripePost(key, "subscriptions/" + partner.stripe_subscription_id, {
        items: [{ id: itemId, price: price.id, ...(vatRateId ? { tax_rates: [vatRateId] } : {}) }],
        proration_behavior: "create_prorations",
        metadata: { partner_id: partner.id, tier },
      });
    }
    // Update the partner row (commission applies immediately).
    const { error } = await admin.from("qv_partners").update({ tier, fee_monthly: fee, commission_pct: commission }).eq("id", partner.id);
    if (error) throw error;
    return json({ ok: true, tier });
  } catch (e) {
    return json({ error: String((e && (e as any).message) || e) }, 500);
  }
});
