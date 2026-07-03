// AI Marketing Agent — generates a full ad campaign (copy + targeting + budget +
// a creative brief) from a company's category & profile, using Claude. This is
// the "brain": the portal renders the branded creative from the brief, and the
// (separate) meta-ads-publish function pushes it to Meta once ads are approved.
//
// Auth: invoked WITH the caller's JWT; we verify the caller owns company_id.
// Deploy:  supabase functions deploy marketing-agent
// Env:     ANTHROPIC_API_KEY, APP_SUPABASE_URL, APP_SERVICE_ROLE_KEY
//          (SUPABASE_URL / SUPABASE_ANON_KEY auto-injected)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("APP_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SCHEMA = `Return ONLY valid JSON (no markdown) with this exact shape:
{
  "name": "short campaign name",
  "objective": "OUTCOME_LEADS" | "OUTCOME_TRAFFIC" | "OUTCOME_AWARENESS",
  "audience": { "locations": ["Dubai"], "radius_km": 40, "age_min": 25, "age_max": 55, "genders": "all"|"male"|"female", "interests": ["home renovation", "interior design"] },
  "daily_budget_aed": 60,
  "ads": [
    { "headline": "≤40 chars", "primary_text": "1-2 punchy sentences", "description": "≤30 chars", "cta": "Get Quote"|"Book Now"|"Learn More"|"Contact Us",
      "creative": { "overlay_text": "≤6 words for the image", "sub_text": "≤8 words", "accent": "#RRGGBB", "photo_hint": "what photo suits this ad" } }
  ],
  "tips": ["1-line optimisation tips"]
}
Give 3 ad variants in "ads". Keep copy specific to the business & Dubai market.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!ANTHROPIC_KEY) return json({ ok: false, error: "Server not configured (ANTHROPIC_API_KEY)" }, 500);

  let companyId = "", goal = "", notes = "";
  try { const b = await req.json(); companyId = String(b.company_id || ""); goal = String(b.goal || ""); notes = String(b.notes || ""); }
  catch { return json({ ok: false, error: "Bad request" }, 400); }
  if (!companyId) return json({ ok: false, error: "Missing company_id" }, 400);

  // authorize
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false } });
  try {
    const { data: cids, error } = await caller.rpc("current_company_ids");
    if (error) return json({ ok: false, error: "Auth check failed" }, 401);
    const ids = (cids || []).map((x: any) => (typeof x === "string" ? x : x?.cid)).filter(Boolean).map(String);
    if (!ids.includes(String(companyId))) return json({ ok: false, error: "Not your company" }, 403);
  } catch { return json({ ok: false, error: "Auth check failed" }, 401); }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: company } = await admin.from("companies").select("name, category, description, location").eq("id", companyId).maybeSingle();
  if (!company) return json({ ok: false, error: "Company not found" }, 404);

  const system =
    `You are an expert Meta (Facebook/Instagram) ads strategist for UAE service & construction businesses. ` +
    `Design a high-performing lead-generation campaign tailored to the business below. Be concrete, use Dubai/UAE context, realistic AED budgets (30-150/day for SMBs). ` + SCHEMA;
  const userMsg =
    `Business: ${company.name}\nCategory: ${company.category || "general services"}\n` +
    `Location: ${company.location || "Dubai"}\nAbout: ${company.description || "-"}\n` +
    (goal ? `Goal: ${goal}\n` : "") + (notes ? `Extra notes: ${notes}\n` : "") +
    `\nGenerate the campaign JSON now.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, system, messages: [{ role: "user", content: userMsg }] }),
    });
    const j = await r.json();
    if (j?.error) return json({ ok: false, error: j.error?.message || "AI error" }, 400);
    let txt = j?.content?.[0]?.text || "";
    // strip any accidental code fences
    txt = txt.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const start = txt.indexOf("{"), end = txt.lastIndexOf("}");
    if (start >= 0 && end > start) txt = txt.slice(start, end + 1);
    let campaign: any;
    try { campaign = JSON.parse(txt); } catch { return json({ ok: false, error: "Could not parse AI output", raw: txt.slice(0, 400) }, 502); }
    return json({ ok: true, campaign, company: { name: company.name, category: company.category } });
  } catch (e) {
    return json({ ok: false, error: "Generation failed", detail: String(e) }, 500);
  }
});
