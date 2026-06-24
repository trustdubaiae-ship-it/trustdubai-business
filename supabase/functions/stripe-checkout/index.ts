// Quvera — create a Stripe Checkout session for a company's monthly plan subscription.
// The price is read from membership_plans (server-side) so the client can't spoof it.
// Secrets: STRIPE_SECRET_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.
// Deploy: supabase functions deploy stripe-checkout
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
  if (!key) return json({ error: "Stripe not configured (add STRIPE_SECRET_KEY)" }, 500);
  const stripe = new Stripe(key, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const companyId = String(body.companyId || "");
  const planName = String(body.plan || "").toLowerCase();
  const origin = String(body.origin || "").replace(/\/$/, "");
  if (!companyId || !planName) return json({ error: "Missing company or plan" }, 400);

  // company + plan price (trusted from DB, not the client)
  const { data: company } = await admin.from("companies").select("id, name, owner_email, email, stripe_customer_id").eq("id", companyId).maybeSingle();
  if (!company) return json({ error: "Company not found" }, 404);
  const { data: plan } = await admin.from("membership_plans").select("name, price_monthly").ilike("name", planName).maybeSingle();
  if (!plan || !(Number(plan.price_monthly) > 0)) return json({ error: "Plan not available for purchase" }, 400);

  const email = company.owner_email || company.email || undefined;
  const amountFils = Math.round(Number(plan.price_monthly) * 100); // AED -> fils

  try {
    // reuse a Stripe customer if we already have one
    let customerId = company.stripe_customer_id || undefined;
    if (!customerId) {
      const cust = await stripe.customers.create({ email, name: company.name || undefined, metadata: { company_id: companyId } });
      customerId = cust.id;
      await admin.from("companies").update({ stripe_customer_id: customerId }).eq("id", companyId);
    }

    const session = await stripe.checkout.sessions.create({
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
    return json({ error: String((e && (e as any).message) || e) }, 500);
  }
});
