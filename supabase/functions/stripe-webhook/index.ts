// Quvera — Stripe webhook. Marks a company as paid when its subscription is created,
// and updates status on changes/cancellations.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. SUPABASE_* auto-injected.
// IMPORTANT: deploy with JWT verification DISABLED (Stripe calls it without a Supabase JWT).
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
import Stripe from "https://esm.sh/stripe@17.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!key || !whSecret) return new Response("Not configured", { status: 500 });
  const stripe = new Stripe(key, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const sig = req.headers.get("stripe-signature") || "";
  const raw = await req.text();
  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, whSecret);
  } catch (e) {
    return new Response("Bad signature: " + String((e as any)?.message || e), { status: 400 });
  }

  try {
    const type = event.type;
    const obj = event.data?.object || {};

    if (type === "checkout.session.completed") {
      const companyId = obj.metadata?.company_id;
      const plan = obj.metadata?.plan;
      if (companyId) {
        await admin.from("companies").update({
          ...(plan ? { plan } : {}),
          stripe_customer_id: obj.customer || null,
          stripe_subscription_id: obj.subscription || null,
          subscription_status: "active",
        }).eq("id", companyId);
      }
    } else if (type === "customer.subscription.updated") {
      const companyId = obj.metadata?.company_id;
      const status = obj.status; // active, past_due, canceled, unpaid, trialing...
      const q = admin.from("companies").update({ subscription_status: status });
      if (companyId) await q.eq("id", companyId);
      else await q.eq("stripe_subscription_id", obj.id);
    } else if (type === "customer.subscription.deleted") {
      const companyId = obj.metadata?.company_id;
      const patch = { subscription_status: "canceled", plan: "free" };
      if (companyId) await admin.from("companies").update(patch).eq("id", companyId);
      else await admin.from("companies").update(patch).eq("stripe_subscription_id", obj.id);
    }
  } catch (e) {
    // log but still 200 so Stripe doesn't retry forever on our own bug
    console.error("webhook handler error", e);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
