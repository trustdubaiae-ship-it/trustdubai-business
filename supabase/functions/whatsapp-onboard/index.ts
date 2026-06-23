// WhatsApp Embedded Signup — finishes onboarding a company's WhatsApp number.
// The browser runs Meta's Embedded Signup popup and gets back: an auth `code`,
// plus the `waba_id` and `phone_number_id`. This function (server-side, holds the
// app secret) exchanges the code for a token, subscribes OUR app to that WABA's
// webhooks, and registers the number on the Cloud API. It returns the token; the
// client then stores everything in `whatsapp_accounts` (RLS-scoped to its company).
//
// Deploy:  supabase functions deploy whatsapp-onboard
// Env:     WHATSAPP_APP_ID, WHATSAPP_APP_SECRET
const GRAPH = "https://graph.facebook.com/v21.0";
const APP_ID     = Deno.env.get("WHATSAPP_APP_ID") || "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!APP_ID || !APP_SECRET) return json({ error: "Server not configured (WHATSAPP_APP_ID / WHATSAPP_APP_SECRET)" }, 500);

  let code = "", wabaId = "", phoneNumberId = "";
  try {
    const b = await req.json();
    code = String(b.code || ""); wabaId = String(b.waba_id || ""); phoneNumberId = String(b.phone_number_id || "");
  } catch { return json({ error: "Bad request" }, 400); }
  if (!code || !wabaId || !phoneNumberId) return json({ error: "Missing code / waba_id / phone_number_id" }, 400);

  try {
    // 1) auth code → business access token
    const tokRes = await fetch(`${GRAPH}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&code=${encodeURIComponent(code)}`);
    const tok = await tokRes.json();
    if (!tok.access_token) return json({ error: "Token exchange failed", detail: tok }, 400);
    const token = tok.access_token as string;

    // 2) subscribe OUR app to this WABA so the webhook receives its messages
    const subRes = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    const sub = await subRes.json();
    if (!subRes.ok && !sub?.success) {
      return json({ error: "Could not subscribe webhook", detail: sub }, 400);
    }

    // 3) register the number on the Cloud API (idempotent — ignore "already registered")
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const regRes = await fetch(`${GRAPH}/${phoneNumberId}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
    const reg = await regRes.json(); // may fail if already registered — that's fine

    // 4) display number (best-effort)
    let displayNumber = "";
    try {
      const inf = await fetch(`${GRAPH}/${phoneNumberId}?fields=display_phone_number`, { headers: { Authorization: `Bearer ${token}` } });
      const infj = await inf.json(); displayNumber = infj?.display_phone_number || "";
    } catch { /* ignore */ }

    return json({ ok: true, access_token: token, waba_id: wabaId, phone_number_id: phoneNumberId, display_number: displayNumber, register: reg });
  } catch (e) {
    return json({ error: "Onboarding failed", detail: String(e) }, 500);
  }
});
