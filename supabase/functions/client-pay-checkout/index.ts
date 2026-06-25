// Quvera — let an ENABLED company collect a client's invoice payment by card.
// Raw fetch to Stripe (Node SDK is unreliable in Supabase Edge). One-time payment
// (mode=payment) into the single Renofix Plus Technical Contracting account, so the
// client's statement shows that entity. Gated: only companies with
// client_pay_enabled = true, and only invoices the caller can read (RLS).
// Secret: STRIPE_SECRET_KEY. SUPABASE_* auto-injected. Deploy with JWT verification ON.
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

  let body: any = {}; try { body = await req.json(); } catch { /* ok */ }
  const invoiceId = String(body.invoiceId || "");
  const origin = String(body.origin || "").replace(/\/$/, "");
  if (!invoiceId) return json({ error: "Missing invoice" }, 400);

  // RLS-scoped read: the caller can only see their own company's invoices.
  const { data: inv } = await caller.from("invoices")
    .select("id, company_id, invoice_number, total, payments, status, client_name, client_email")
    .eq("id", invoiceId).maybeSingle();
  if (!inv) return json({ error: "Invoice not found" }, 404);
  if (inv.status === "cancelled" || inv.status === "hold") return json({ error: "This invoice is not open for payment." }, 400);

  // Server-side gate: only companies explicitly enabled for client card payments.
  const { data: comp } = await admin.from("companies").select("id, name, client_pay_enabled").eq("id", inv.company_id).maybeSingle();
  if (!comp?.client_pay_enabled) return json({ error: "Online card payments are not enabled for this company." }, 403);

  const paid = (Array.isArray(inv.payments) ? inv.payments : []).reduce((s: number, p: any) => s + (Number(p?.amount) || 0), 0);
  const outstanding = Math.round(((Number(inv.total) || 0) - paid) * 100); // fils
  if (outstanding <= 0) return json({ error: "This invoice is already fully paid." }, 400);

  try {
    const session = await stripe(key, "checkout/sessions", {
      mode: "payment",
      ...(inv.client_email ? { customer_email: inv.client_email } : {}),
      line_items: [{ quantity: 1, price_data: { currency: "aed", unit_amount: outstanding, product_data: { name: `Invoice ${inv.invoice_number} — ${comp.name}` } } }],
      payment_intent_data: {
        statement_descriptor: "RENOFIX CONTRACTING",
        description: `Invoice ${inv.invoice_number}`,
        metadata: { kind: "client_payment", invoice_id: inv.id, company_id: inv.company_id },
      },
      metadata: { kind: "client_payment", invoice_id: inv.id, company_id: inv.company_id },
      success_url: `${origin}/?invoice_paid=1`,
      cancel_url: `${origin}/?invoice_pay_cancelled=1`,
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e && (e as any).message) || e) }, 500);
  }
});
