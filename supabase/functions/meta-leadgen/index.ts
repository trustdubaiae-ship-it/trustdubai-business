// Meta Lead Ads webhook — turns Facebook/Instagram lead-ad submissions into leads.
// Single source of truth (supersedes the older out-of-repo `meta-lead-webhook`).
//
//   GET   → webhook verification handshake (Meta sends hub.challenge once)
//   POST  → leadgen change → fetch full lead → create a lead_submissions row
//
// Routing: page_id → company via meta_pages (multi-page) then meta_connections,
// then optional env fallbacks. De-dupe by the exact Meta leadgen_id. Signature
// verified when META_APP_SECRET is set.
//
// Deploy WITHOUT JWT verification (Meta can't send a Supabase JWT):
//   supabase functions deploy meta-leadgen --no-verify-jwt
//
// In Meta App → Webhooks → Page: subscribe `leadgen` to this URL with META_VERIFY_TOKEN.
//
// Env (Supabase → Edge Functions → secrets):
//   APP_SUPABASE_URL, APP_SERVICE_ROLE_KEY   (service role — bypasses RLS)
//   META_VERIFY_TOKEN                         (any random string; also entered in Meta)
//   META_APP_SECRET                           (validates X-Hub-Signature-256; optional)
//   META_PAGE_ACCESS_TOKEN                    (optional fallback token)
//   DEFAULT_COMPANY_ID                        (optional fallback company UUID)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v23.0";
const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("APP_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") || "";
const APP_SECRET   = Deno.env.get("META_APP_SECRET") || Deno.env.get("WHATSAPP_APP_SECRET") || "";
const FALLBACK_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN") || "";
const DEFAULT_COMPANY_ID = Deno.env.get("DEFAULT_COMPANY_ID") || "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const tail9 = (s: string) => (s || "").replace(/[^0-9]/g, "").slice(-9);
const nice = (k: string) => (k || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function validSignature(raw: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) return true;
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return ("sha256=" + hex) === header;
}
// find a value in the flattened fields whose key contains any of `keys`
function pick(fields: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) for (const fk of Object.keys(fields)) if (fk.toLowerCase().includes(k)) return fields[fk];
  return null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === VERIFY_TOKEN) return new Response(challenge || "", { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) return new Response("bad signature", { status: 401 });

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("ok", { status: 200 }); }

  try {
    for (const entry of payload?.entry || []) {
      const pageId = String(entry?.id || "");
      for (const change of entry?.changes || []) {
        if (change?.field !== "leadgen") continue;
        const v = change?.value || {};
        const leadgenId = v.leadgen_id || v.id;
        const formId = v.form_id || null;
        if (!leadgenId) continue;

        // resolve company + page token: meta_pages → meta_connections → env fallback
        let companyId = DEFAULT_COMPANY_ID, pageToken = FALLBACK_TOKEN;
        if (pageId) {
          const { data: page } = await admin.from("meta_pages").select("company_id, page_access_token").eq("page_id", pageId).maybeSingle();
          if (page?.company_id) { companyId = page.company_id; if (page.page_access_token) pageToken = page.page_access_token; }
          else {
            const { data: conn } = await admin.from("meta_connections").select("company_id, page_access_token").eq("page_id", pageId).maybeSingle();
            if (conn?.company_id) { companyId = conn.company_id; if (conn.page_access_token) pageToken = conn.page_access_token; }
          }
        }
        if (!companyId || !pageToken) { console.error("meta-leadgen: no company/token for page", pageId); continue; }

        // fetch the full lead
        const gRes = await fetch(`${GRAPH}/${leadgenId}?fields=field_data,created_time,form_id&access_token=${encodeURIComponent(pageToken)}`);
        const lead = await gRes.json();
        if (!gRes.ok) { console.error("meta-leadgen: graph fetch failed", JSON.stringify(lead)); continue; }

        // flatten field_data → { field: value }
        const fields: Record<string, string> = {};
        for (const f of (lead.field_data || [])) fields[f.name] = Array.isArray(f.values) ? f.values.join(", ") : "";

        const name = pick(fields, ["full_name", "name"]);
        const phoneRaw = pick(fields, ["phone", "whatsapp", "mobile"]);
        const email = pick(fields, ["email"]);
        const phone = phoneRaw ? ("+" + phoneRaw.replace(/[^0-9]/g, "")) : null;

        // de-dupe by exact leadgen_id
        const { data: dup } = await admin.from("lead_submissions").select("id")
          .eq("company_id", companyId).contains("answers", { meta_leadgen_id: String(leadgenId) }).maybeSingle();
        if (dup) continue;

        const answers: Record<string, string> = { Source: "Meta Ads", meta_leadgen_id: String(leadgenId) };
        if (formId) answers["meta_form_id"] = String(formId);
        for (const [k, val] of Object.entries(fields)) if (val) answers[nice(k)] = val;

        const { error: insErr } = await admin.from("lead_submissions").insert({
          company_id: companyId,
          name: name || (phone ? "Meta lead " + tail9(phone) : "Meta Lead"),
          phone, email: email || null,
          source: "meta_ads", status: "new",
          status_updated_at: new Date().toISOString(), temperature: "warm",
          answers,
        });
        if (insErr) { console.error("meta-leadgen: insert failed", insErr.message); continue; }
        console.log("meta-leadgen: imported", leadgenId, "→", companyId);
      }
    }
  } catch (e) {
    console.error("meta-leadgen error:", e);
  }
  return new Response("ok", { status: 200 });
});
