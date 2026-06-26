// Quvera — Stripe Checkout for the PARTNER's monthly plan (raw fetch).
// Single plan; price = qv_settings plan_price − plan_discount_pct, read server-side.
// Secret: STRIPE_SECRET_KEY. SUPABASE_* auto-injected. Deploy: supabase functions deploy partner-checkout
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

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

  const { data: rows } = await caller.from("qv_partners").select("id, name, email, stripe_customer_id").limit(1);
  const partner = rows?.[0];
  if (!partner) return json({ error: "Not a partner" }, 403);

  let body: any = {}; try { body = await req.json(); } catch { /* ok */ }
  const origin = String(body.origin || "").replace(/\/$/, "");

  // Single partner plan — price is set by admin (original price - discount). Read it
  // server-side so it can't be spoofed.
  const { data: setRows } = await admin.from("qv_settings").select("key, value");
  const sm: Record<string, number> = {}; (setRows || []).forEach((r: any) => { sm[r.key] = Number(r.value); });
  const orig = Number.isFinite(sm.plan_price) ? sm.plan_price : 799;
  const disc = Number.isFinite(sm.plan_discount_pct) ? sm.plan_discount_pct : 0;
  const effective = Math.max(0, orig * (1 - disc / 100));
  const amountFils = Math.round(effective * 100);

  // reuse (or create) a 5% UAE VAT tax rate, added on top of the plan price (exclusive)
  async function getVatRateId() {
    try {
      const list = await fetch("https://api.stripe.com/v1/tax_rates?limit=100&active=true", { headers: { Authorization: "Bearer " + key } }).then((r) => r.json());
      const found = (list?.data || []).find((r: any) => r.metadata?.quvera === "vat5");
      if (found) return found.id;
      const created = await stripe(key, "tax_rates", { display_name: "VAT", description: "UAE VAT 5%", percentage: 5, inclusive: false, country: "AE", metadata: { quvera: "vat5" } });
      return created.id;
    } catch { return null; }
  }

  try {
    const vatRateId = await getVatRateId();
    let customerId = partner.stripe_customer_id || undefined;
    if (!customerId) {
      const cust = await stripe(key, "customers", { email: partner.email || undefined, name: partner.name || undefined, metadata: { partner_id: partner.id } });
      customerId = cust.id;
      await admin.from("qv_partners").update({ stripe_customer_id: customerId }).eq("id", partner.id);
    }
    const session = await stripe(key, "checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      line_items: [{ quantity: 1, ...(vatRateId ? { tax_rates: [vatRateId] } : {}), price_data: { currency: "aed", unit_amount: amountFils, recurring: { interval: "month" }, product_data: { name: "Quvera Partner Plan" } } }],
      metadata: { partner_id: partner.id },
      subscription_data: { metadata: { partner_id: partner.id } },
      success_url: `${origin}/?partner_paid=1`,
      cancel_url: `${origin}/?partner_pay_cancelled=1`,
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e && (e as any).message) || e) }, 500);
  }
});
