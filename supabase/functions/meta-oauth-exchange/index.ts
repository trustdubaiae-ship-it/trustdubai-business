// Meta OAuth exchange — called by src/pages/MetaConnect.jsx after the user signs
// in with Facebook. Takes the short-lived user token, and:
//   1) upgrades it to a long-lived token
//   2) lists the user's Pages (+ Instagram) and their page tokens
//   3) subscribes OUR app to each Page's `leadgen` field (so lead ads webhook fires)
//   4) lists ad accounts (best-effort, for the Marketing Agent later)
//   5) saves per-page routing rows (meta_pages) + a company summary (meta_connections)
//
// Auth: invoked WITH the caller's JWT. We verify the caller actually owns
// `company_id` before writing anything with the service role.
//
// Deploy:  supabase functions deploy meta-oauth-exchange
// Env:     META_APP_ID, META_APP_SECRET, APP_SUPABASE_URL, APP_SERVICE_ROLE_KEY
//          (SUPABASE_URL / SUPABASE_ANON_KEY are auto-injected)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";
const APP_ID     = Deno.env.get("META_APP_ID") || Deno.env.get("WHATSAPP_APP_ID") || "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") || Deno.env.get("WHATSAPP_APP_SECRET") || "";
const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("APP_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!APP_ID || !APP_SECRET) return json({ ok: false, error: "Server not configured (META_APP_ID / META_APP_SECRET)" }, 500);

  let companyId = "", token = "";
  try {
    const b = await req.json();
    companyId = String(b.company_id || ""); token = String(b.token || "");
  } catch { return json({ ok: false, error: "Bad request" }, 400); }
  if (!companyId || !token) return json({ ok: false, error: "Missing company_id / token" }, 400);

  // --- authorize: the caller must own company_id -----------------------------
  const authHeader = req.headers.get("Authorization") || "";
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  try {
    const { data: cids, error: cErr } = await caller.rpc("current_company_ids");
    if (cErr) return json({ ok: false, error: "Auth check failed" }, 401);
    const ids = (cids || []).map((x: any) => (typeof x === "string" ? x : x?.cid)).filter(Boolean).map(String);
    if (!ids.includes(String(companyId))) return json({ ok: false, error: "Not your company" }, 403);
  } catch { return json({ ok: false, error: "Auth check failed" }, 401); }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    // 1) long-lived user token
    let userToken = token;
    try {
      const llRes = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(token)}`);
      const ll = await llRes.json();
      if (ll?.access_token) userToken = ll.access_token;
    } catch { /* fall back to short-lived */ }

    // 2) the user's Pages (+ IG + page tokens)
    const pagesRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{username}&limit=100&access_token=${encodeURIComponent(userToken)}`);
    const pagesJson = await pagesRes.json();
    if (pagesJson?.error) return json({ ok: false, error: "Could not read Pages", detail: pagesJson.error }, 400);
    const pages = Array.isArray(pagesJson?.data) ? pagesJson.data : [];
    if (!pages.length) return json({ ok: false, error: "No Facebook Pages found on this account" }, 400);

    // 3) subscribe our app to each Page's leadgen field + persist routing rows
    const connected: any[] = [];
    for (const p of pages) {
      const pageId = String(p.id);
      const pageToken = String(p.access_token || "");
      const igUser = p?.instagram_business_account?.username || null;
      const igId = p?.instagram_business_account?.id || null;
      let subscribed = false;
      if (pageToken) {
        try {
          const subRes = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscribed_fields: "leadgen", access_token: pageToken }),
          });
          const sub = await subRes.json();
          subscribed = !!(sub?.success ?? subRes.ok);
        } catch { /* leave unsubscribed */ }
      }
      await admin.from("meta_pages").upsert({
        company_id: companyId, page_id: pageId, page_name: p.name || null,
        page_access_token: pageToken || null, ig_id: igId, subscribed,
      }, { onConflict: "page_id" });
      connected.push({ page_id: pageId, page_name: p.name || null, ig_username: igUser, subscribed });
    }

    // 4) ad accounts (best-effort — used by the Marketing Agent later)
    let adAccountId = null as string | null, adAccountName = null as string | null;
    try {
      const aaRes = await fetch(`${GRAPH}/me/adaccounts?fields=account_id,name&limit=1&access_token=${encodeURIComponent(userToken)}`);
      const aa = await aaRes.json();
      const first = Array.isArray(aa?.data) ? aa.data[0] : null;
      if (first) { adAccountId = first.account_id ? `act_${first.account_id}` : null; adAccountName = first.name || null; }
    } catch { /* ignore */ }

    // 5) company summary row (primary = first page)
    const primary = pages[0];
    await admin.from("meta_connections").upsert({
      company_id: companyId,
      connected: true,
      page_id: String(primary.id),
      page_name: primary.name || null,
      ig_username: primary?.instagram_business_account?.username || null,
      ad_account_id: adAccountId,
      ad_account_name: adAccountName,
      page_access_token: primary.access_token || null,
      user_access_token: userToken,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id" });

    return json({ ok: true, connected });
  } catch (e) {
    return json({ ok: false, error: "Connect failed", detail: String(e) }, 500);
  }
});
