// WhatsApp Business (Cloud API) webhook — turns incoming WhatsApp messages into
// leads. Meta calls this URL for every message sent to a connected business number.
//
//   GET   → webhook verification handshake (Meta sends hub.challenge once)
//   POST  → incoming messages → create/refresh a lead in lead_submissions
//
// Deploy WITHOUT JWT verification (Meta can't send a Supabase JWT):
//   supabase functions deploy whatsapp-webhook --no-verify-jwt
//
// Env (set in Supabase → Edge Functions → secrets):
//   APP_SUPABASE_URL, APP_SERVICE_ROLE_KEY   (service role — bypasses RLS)
//   WHATSAPP_VERIFY_TOKEN                     (any random string; also entered in Meta)
//   WHATSAPP_APP_SECRET                       (optional — validates Meta's signature)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("APP_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const APP_SECRET   = Deno.env.get("WHATSAPP_APP_SECRET") || "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// last 9 digits — used to match a wa_id against an existing lead's phone
const tail9 = (s: string) => (s || "").replace(/[^0-9]/g, "").slice(-9);

// Validate Meta's X-Hub-Signature-256 over the raw request body (HMAC-SHA256 of app secret)
async function validSignature(raw: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) return true;                 // not configured → skip
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return ("sha256=" + hex) === header;
}

// pick a short human-readable bit out of a non-text message
function bodyOf(m: any): string {
  if (m?.type === "text") return m.text?.body || "";
  if (m?.type === "interactive") return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "[interactive]";
  if (m?.type === "button") return m.button?.text || "[button]";
  if (m?.image || m?.type === "image") return m.image?.caption || "[photo]";
  if (m?.type) return `[${m.type}]`;
  return "";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- 1) Verification handshake (Meta calls this once when you save the webhook) ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
      return new Response(challenge || "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // --- 2) Incoming events ---
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("bad signature", { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("ok", { status: 200 }); }

  try {
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value;
        const messages = value?.messages;
        if (!Array.isArray(messages) || !messages.length) continue;   // status updates etc.

        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // which company owns this WhatsApp number?
        const { data: acct } = await admin
          .from("whatsapp_accounts").select("company_id")
          .eq("phone_number_id", phoneNumberId).maybeSingle();
        if (!acct?.company_id) continue;          // number not connected to any company
        const companyId = acct.company_id;

        // wa_id → profile name
        const names: Record<string, string> = {};
        for (const c of value?.contacts || []) if (c?.wa_id) names[c.wa_id] = c?.profile?.name || "";

        for (const m of messages) {
          const from = String(m?.from || "");
          if (!from) continue;
          const name = names[from] || ("WhatsApp " + from.slice(-4));
          const text = bodyOf(m);
          const phone = "+" + from.replace(/[^0-9]/g, "");

          // de-dupe: same company + same number → refresh, don't create a second lead
          const t9 = tail9(from);
          const { data: existing } = await admin
            .from("lead_submissions").select("id, answers")
            .eq("company_id", companyId).ilike("phone", `%${t9}%`).limit(1);

          if (existing && existing.length) {
            const ans = { ...(existing[0].answers || {}) };
            if (text) ans["Last message"] = text;
            await admin.from("lead_submissions")
              .update({ answers: ans, status_updated_at: new Date().toISOString() })
              .eq("id", existing[0].id);
          } else {
            await admin.from("lead_submissions").insert({
              company_id: companyId,
              name,
              phone,
              status: "new",
              status_updated_at: new Date().toISOString(),
              temperature: "warm",
              answers: { Source: "WhatsApp", ...(text ? { Notes: text } : {}) },
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("whatsapp-webhook error:", e);
    // still 200 so Meta doesn't hammer retries; we logged it
  }

  return new Response("ok", { status: 200 });
});
