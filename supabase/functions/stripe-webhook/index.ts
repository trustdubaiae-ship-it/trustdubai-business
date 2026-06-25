// Quvera — Stripe webhook (raw fetch + manual signature verify; the Node SDK is
// unreliable in the Supabase Edge runtime). Keeps each company's plan in sync with
// its Stripe subscription: activation, monthly auto-renewal, payment failure, cancel.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Deploy with JWT verification OFF.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const te = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function verifyStripeSig(payload: string, header: string, secret: string) {
  try {
    const parts: Record<string, string> = {};
    header.split(",").forEach((p) => { const [k, v] = p.split("="); if (k && v) parts[k.trim()] = v.trim(); });
    const t = parts["t"]; const v1 = parts["v1"];
    if (!t || !v1) return false;
    const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, te.encode(`${t}.${payload}`));
    return hex(sig) === v1;
  } catch { return false; }
}

async function stripeGet(secret: string, path: string) {
  const res = await fetch("https://api.stripe.com/v1/" + path, { headers: { Authorization: "Bearer " + secret } });
  if (!res.ok) throw new Error("stripe " + res.status);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!key || !whSecret) return new Response("Not configured", { status: 500 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") || "";
  if (!(await verifyStripeSig(raw, sig, whSecret))) return new Response("Bad signature", { status: 400 });

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }
  const obj = event.data?.object || {};
  const expiresFrom = (sec: number | null | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);

  try {
    if (event.type === "checkout.session.completed") {
      if (obj.metadata?.kind === "client_payment") {
        // A client paid an invoice by card → record the payment (idempotent by payment_intent).
        const invId = obj.metadata.invoice_id;
        if (invId && obj.payment_status === "paid") {
          const { data: inv } = await admin.from("invoices").select("id, total, payments").eq("id", invId).maybeSingle();
          if (inv) {
            const pays = Array.isArray(inv.payments) ? inv.payments : [];
            const ref = obj.payment_intent || obj.id;
            if (!pays.some((p: any) => p && p.reference === ref)) {
              const amount = (obj.amount_total || 0) / 100;
              const next = [...pays, { amount, date: new Date().toISOString().slice(0, 10), method: "Card (Stripe)", reference: ref, note: "Paid online via card" }];
              const sum = next.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
              const status = sum <= 0 ? "unpaid" : (sum >= Math.round(Number(inv.total) || 0) ? "paid" : "partial");
              await admin.from("invoices").update({ payments: next, status, phase: "tax" }).eq("id", invId);
            }
          }
        }
      } else {
      const partnerId = obj.metadata?.partner_id;
      if (partnerId) {
        await admin.from("qv_partners").update({ stripe_customer_id: obj.customer || null, stripe_subscription_id: obj.subscription || null, payment_status: "active" }).eq("id", partnerId);
      } else {
        const companyId = obj.metadata?.company_id;
        const plan = obj.metadata?.plan;
        const subId = obj.subscription;
        let periodEnd = null, status = "active";
        if (subId) { try { const sub = await stripeGet(key, "subscriptions/" + subId); periodEnd = sub.current_period_end; status = sub.status || "active"; } catch { /* ignore */ } }
        if (companyId) {
          await admin.from("companies").update({
            ...(plan ? { plan } : {}),
            stripe_customer_id: obj.customer || null,
            stripe_subscription_id: subId || null,
            subscription_status: status,
            ...(periodEnd ? { plan_expires_at: expiresFrom(periodEnd) } : {}),
          }).eq("id", companyId);
        }
      }
      }
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const partnerId = obj.metadata?.partner_id;
      if (partnerId) {
        const ps = (obj.status === "active" || obj.status === "trialing") ? "active" : (obj.status === "past_due" ? "past_due" : (obj.status === "canceled" || obj.status === "unpaid") ? "canceled" : obj.status);
        await admin.from("qv_partners").update({ payment_status: ps }).eq("id", partnerId);
      } else {
        const companyId = obj.metadata?.company_id;
        const patch: any = { subscription_status: obj.status, plan_expires_at: expiresFrom(obj.current_period_end) };
        if (obj.status === "canceled" || obj.status === "unpaid") patch.plan = "free";
        const q = admin.from("companies").update(patch);
        if (companyId) await q.eq("id", companyId); else await q.eq("stripe_subscription_id", obj.id);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const partnerId = obj.metadata?.partner_id;
      if (partnerId) { await admin.from("qv_partners").update({ payment_status: "canceled" }).eq("id", partnerId); }
      else {
        const companyId = obj.metadata?.company_id;
        const patch = { subscription_status: "canceled", plan: "free" };
        if (companyId) await admin.from("companies").update(patch).eq("id", companyId);
        else await admin.from("companies").update(patch).eq("stripe_subscription_id", obj.id);
      }
    } else if (event.type === "invoice.payment_failed") {
      const subId = obj.subscription;
      if (subId) {
        await admin.from("companies").update({ subscription_status: "past_due" }).eq("stripe_subscription_id", subId);
        await admin.from("qv_partners").update({ payment_status: "past_due" }).eq("stripe_subscription_id", subId);
      }
    }
  } catch (e) {
    console.error("webhook handler error", String((e as any)?.message || e));
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
