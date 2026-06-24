// Quvera — partner payout onboarding via Stripe Connect.
// Uses the Stripe REST API directly (raw fetch) — the Node SDK is unreliable in the
// Supabase Edge (Deno) runtime. The calling partner (JWT) gets/creates a connected
// account + onboarding link; we cache stripe_account_id + payouts_enabled.
// Secrets: STRIPE_SECRET_KEY. SUPABASE_* auto-injected. Deploy: supabase functions deploy partner-connect
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// flatten nested objects into Stripe's bracketed form-encoding
function toForm(obj: any, prefix = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) toForm(v, key, out);
    else out[key] = String(v);
  }
  return out;
}
async function stripe(secret: string, method: string, path: string, params?: any) {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method,
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(toForm(params)).toString() : undefined,
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
  const authHeader = req.headers.get("Authorization") || "";
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: rows } = await caller.from("qv_partners").select("id, name, email, stripe_account_id, status").limit(1);
  const partner = rows?.[0];
  if (!partner) return json({ error: "Not a partner — sign in as a partner." }, 403);

  let body: any = {}; try { body = await req.json(); } catch { /* ok */ }
  const origin = String(body.origin || "").replace(/\/$/, "");

  try {
    let acctId = partner.stripe_account_id as string | null;
    if (!acctId) {
      const acct = await stripe(key, "POST", "accounts", {
        type: "express",
        country: "AE",
        email: partner.email || undefined,
        capabilities: { transfers: { requested: true } },
        metadata: { partner_id: partner.id },
      });
      acctId = acct.id;
      await admin.from("qv_partners").update({ stripe_account_id: acctId }).eq("id", partner.id);
    }

    const acct = await stripe(key, "GET", "accounts/" + acctId);
    const enabled = !!acct.payouts_enabled;
    await admin.from("qv_partners").update({ payouts_enabled: enabled }).eq("id", partner.id);
    if (enabled) return json({ payouts_enabled: true });

    const link = await stripe(key, "POST", "account_links", {
      account: acctId,
      refresh_url: `${origin}/?connect_refresh=1`,
      return_url: `${origin}/?connect_done=1`,
      type: "account_onboarding",
    });
    return json({ payouts_enabled: false, url: link.url });
  } catch (e) {
    const msg = String((e && (e as any).message) || e);
    console.error("partner-connect STRIPE error:", msg);
    return json({ error: msg }, 500);
  }
});
