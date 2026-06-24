// Quvera — create a Stripe Checkout session for a company's monthly plan subscription.
// Uses the Stripe REST API directly (raw fetch) — the Node SDK is unreliable in the
// Supabase Edge (Deno) runtime. Price is read from membership_plans (server-side) so
// the client can't spoof it.
// Secrets: STRIPE_SECRET_KEY. SUPABASE_* auto-injected. Deploy: supabase functions deploy stripe-checkout
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// flatten nested objects/arrays into Stripe's bracketed form-encoding
function toForm(obj: any, prefix = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") toForm(item, `${key}[${i}]`, out);
        else out[`${key}[${i}]`] = String(item);
      });
    } else if (typeof v === "object") {
      toForm(v, key, out);
    } else {
      out[key] = String(v);
    }
  }
  return out;
}
async function stripe(secret: string, path: string, params: any) {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" },
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
  if (!key) return json({ error: "Stripe not configured (add STRIPE_SECRET_KEY)" }, 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const companyId = String(body.companyId || "");
  const planName = String(body.plan || "").toLowerCase();
  const origin = String(body.origin || "").replace(/\/$/, "");
  if (!companyId || !planName) return json({ error: "Missing company or plan" }, 400);

  const { data: company } = await admin.from("companies").select("id, name, owner_email, email, stripe_customer_id").eq("id", companyId).maybeSingle();
  if (!company) return json({ error: "Company not found" }, 404);
  const { data: plan } = await admin.from("membership_plans").select("name, price_monthly").ilike("name", planName).maybeSingle();
  if (!plan || !(Number(plan.price_monthly) > 0)) return json({ error: "This plan isn't available for online payment." }, 400);

  const email = company.owner_email || company.email || undefined;
  const amountFils = Math.round(Number(plan.price_monthly) * 100); // AED -> fils

  try {
    let customerId = company.stripe_customer_id || undefined;
    if (!customerId) {
      const cust = await stripe(key, "customers", { email, name: company.name || undefined, metadata: { company_id: companyId } });
      customerId = cust.id;
      await admin.from("companies").update({ stripe_customer_id: customerId }).eq("id", companyId);
    }

    const session = await stripe(key, "checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "aed",
          unit_amount: amountFils,
          recurring: { interval: "month" },
          product_data: { name: `Quvera ${plan.name} plan` },
        },
      }],
      metadata: { company_id: companyId, plan: planName },
      subscription_data: { metadata: { company_id: companyId, plan: planName } },
      success_url: `${origin}/?upgraded=1`,
      cancel_url: `${origin}/?upgrade_cancelled=1`,
      allow_promotion_codes: true,
    });
    return json({ url: session.url });
  } catch (e) {
    const msg = String((e && (e as any).message) || e);
    console.error("stripe-checkout error:", msg);
    return json({ error: msg }, 500);
  }
});
