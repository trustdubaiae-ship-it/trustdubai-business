import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Multi-tenant Meta/Zapier lead webhook.
// Each company has a unique lead_webhook_token (companies.lead_webhook_token).
// The caller (Zapier/Make) hits:  .../incoming-lead?token=<that token>
// and we route the lead into THAT company's lead_submissions.

const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("APP_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-webhook-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const KNOWN = new Set(["name", "phone", "email", "company_id", "source", "answers", "external_id", "token"]);

function titleCase(k: string) {
  return k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  // token from URL query, header, or body
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || req.headers.get("x-webhook-token") || body.token || "").toString().trim();
  if (!token) return json({ ok: false, error: "Missing token" }, 401);

  // map token -> company
  const { data: co, error: coErr } = await admin
    .from("companies")
    .select("id")
    .eq("lead_webhook_token", token)
    .maybeSingle();
  if (coErr) { console.error("token lookup failed:", coErr.message); return json({ ok: false, error: "Server error" }, 500); }
  if (!co) return json({ ok: false, error: "Invalid token" }, 401);
  const companyId = co.id;

  const name  = (body.name  ?? "").toString().trim() || null;
  const phone = (body.phone ?? "").toString().trim() || null;
  const email = (body.email ?? "").toString().trim() || null;
  if (!name && !phone && !email) {
    return json({ ok: false, error: "Need at least name, phone or email" }, 400);
  }

  const answers: Record<string, any> = { Source: body.source || "Meta Ads" };
  if (body.answers && typeof body.answers === "object") {
    for (const [k, v] of Object.entries(body.answers)) answers[titleCase(k)] = v;
  }
  for (const [k, v] of Object.entries(body)) {
    if (!KNOWN.has(k)) answers[titleCase(k)] = v;
  }
  const externalId = (body.external_id ?? "").toString().trim();
  if (externalId) answers["external_id"] = externalId;

  try {
    // de-dupe on (company, external_id) so a re-fired Zap doesn't double-insert
    if (externalId) {
      const { data: existing } = await admin
        .from("lead_submissions")
        .select("id")
        .eq("company_id", companyId)
        .contains("answers", { external_id: externalId })
        .maybeSingle();
      if (existing) return json({ ok: true, duplicate: true, id: existing.id }, 200);
    }

    const { data, error } = await admin.from("lead_submissions").insert({
      company_id: companyId,
      name:  name || "Lead",
      phone: phone,
      email: email,
      source: body.source || "Meta",
      status: "new",
      answers,
      created_at: new Date().toISOString(),
    }).select("id").single();

    if (error) {
      console.error("Insert failed:", error.message);
      return json({ ok: false, error: error.message }, 500);
    }
    return json({ ok: true, id: data.id }, 200);
  } catch (e) {
    console.error("Webhook error:", e);
    return json({ ok: false, error: "Server error" }, 500);
  }
});
