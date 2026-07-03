// Meta Lead Ads webhook — turns Facebook/Instagram lead-ad submissions into leads.
// Meta calls this URL whenever someone submits an instant form on a connected Page.
//
//   GET   → webhook verification handshake (Meta sends hub.challenge once)
//   POST  → leadgen change → fetch full lead → create/refresh a lead_submissions row
//
// Deploy WITHOUT JWT verification (Meta can't send a Supabase JWT):
//   supabase functions deploy meta-leadgen --no-verify-jwt
//
// In Meta App → Webhooks → Page: subscribe the `leadgen` field to this URL,
// using META_VERIFY_TOKEN as the Verify Token.
//
// Env (Supabase → Edge Functions → secrets):
//   APP_SUPABASE_URL, APP_SERVICE_ROLE_KEY   (service role — bypasses RLS)
//   META_VERIFY_TOKEN                         (any random string; also entered in Meta)
//   META_APP_SECRET                           (validates Meta's X-Hub-Signature-256)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";
const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("APP_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") || "";
const APP_SECRET   = Deno.env.get("META_APP_SECRET") || Deno.env.get("WHATSAPP_APP_SECRET") || "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const tail9 = (s: string) => (s || "").replace(/[^0-9]/g, "").slice(-9);

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

// prettify a Meta field key ("full_name" → "Full Name") for the answers blob
const nice = (k: string) => (k || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- 1) Verification handshake ---
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

  // --- 2) Incoming leadgen events ---
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("bad signature", { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("ok", { status: 200 }); }

  try {
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field !== "leadgen") continue;
        const v = change?.value || {};
        const leadgenId = v.leadgen_id || v.id;
        const pageId = String(v.page_id || entry?.id || "");
        if (!leadgenId || !pageId) continue;

        // which company owns this Page?
        const { data: page } = await admin
          .from("meta_pages").select("company_id, page_access_token")
          .eq("page_id", pageId).maybeSingle();
        if (!page?.company_id || !page?.page_access_token) continue;   // page not connected
        const companyId = page.company_id;

        // fetch the full lead (name / phone / email / custom answers)
        let lead: any = {};
        try {
          const r = await fetch(`${GRAPH}/${leadgenId}?access_token=${encodeURIComponent(page.page_access_token)}`);
          lead = await r.json();
        } catch { lead = {}; }
        const fields: any[] = Array.isArray(lead?.field_data) ? lead.field_data : [];

        // map standard fields; stash the rest into answers
        let name = "", phone = "", email = "", firstName = "", lastName = "";
        const extra: Record<string, string> = {};
        for (const f of fields) {
          const key = String(f?.name || "").toLowerCase();
          const val = Array.isArray(f?.values) ? String(f.values[0] ?? "") : "";
          if (!val) continue;
          if (key === "full_name") name = val;
          else if (key === "first_name") firstName = val;
          else if (key === "last_name") lastName = val;
          else if (key.includes("phone")) phone = val;
          else if (key === "email") email = val;
          else extra[nice(key)] = val;
        }
        if (!name) name = [firstName, lastName].filter(Boolean).join(" ").trim();
        if (!name) name = phone ? ("Meta lead " + tail9(phone)) : "Meta lead";
        const normPhone = phone ? ("+" + phone.replace(/[^0-9]/g, "")) : null;

        const answers: Record<string, string> = { Source: "Meta Ads", ...extra };
        if (v.form_id) answers["Form ID"] = String(v.form_id);
        if (v.ad_id) answers["Ad ID"] = String(v.ad_id);

        // de-dupe by phone (same company + same number → refresh)
        let existing: any = null;
        if (normPhone) {
          const { data } = await admin.from("lead_submissions").select("id, answers")
            .eq("company_id", companyId).ilike("phone", `%${tail9(normPhone)}%`).limit(1);
          if (data && data.length) existing = data[0];
        }

        if (existing) {
          await admin.from("lead_submissions")
            .update({ answers: { ...(existing.answers || {}), ...answers }, status_updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await admin.from("lead_submissions").insert({
            company_id: companyId,
            name,
            phone: normPhone,
            email: email || null,
            status: "new",
            status_updated_at: new Date().toISOString(),
            temperature: "warm",
            source: "meta_ads",
            answers,
          });
        }
      }
    }
  } catch (e) {
    console.error("meta-leadgen error:", e);
    // still 200 so Meta doesn't hammer retries
  }

  return new Response("ok", { status: 200 });
});
