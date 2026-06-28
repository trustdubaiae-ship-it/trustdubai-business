// trustdubai-business/supabase/functions/quvera-assistant/index.ts
// Quvera Voice Assistant — answers a spoken/typed question via Anthropic, and can
// read the caller's OWN live business data (projects, leads, revenue) through
// RLS-scoped tools, so it gives REAL numbers instead of deflecting.
// Secret: ANTHROPIC_API_KEY (already set; shared with ai-agent). SUPABASE_* auto-injected.
// Deploy with JWT verification ON (called from the logged-in portal).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const SYSTEM = `You are the "Quvera Assistant", a helpful voice assistant inside the Quvera Business OS — the platform a UAE renovation / interior fit-out business owner uses to run their company.

You can look up the owner's OWN live business data with the provided tools (projects, leads, revenue). Use a tool whenever the question involves real figures, and answer with the actual numbers (currency AED). NEVER invent or guess numbers — if a tool returns nothing, just say there's no data yet. You can also explain how to use the platform (Leads, Quotations, Projects, Invoices & Payments, the Marketplace, Reviews, Trust Score).

Rules:
- Your reply is SPOKEN ALOUD, so keep it SHORT: 1–3 sentences, plain and warm. No markdown, no bullet lists, no emojis.
- Reply in the SAME language the user speaks.
- Round money to whole AED and speak naturally (e.g. "around 42 thousand dirhams").
- Never mention being an AI model, a language model, tools, or which company built you. You are simply the Quvera Assistant.`;

// ---- Live-data tools (read-only). RLS keeps every query to the caller's company. ----
const TOOLS = [
  {
    name: "get_projects",
    description: "List this company's projects with status, client name, contract value (AED), location, dates and progress %. Use for project status, ongoing work, deadlines or the project pipeline.",
    input_schema: { type: "object", properties: { status: { type: "string", description: "optional filter, e.g. 'ongoing', 'completed'" } } },
  },
  {
    name: "get_leads",
    description: "List recent leads with name, source, status, temperature (hot/warm/cold) and dates. Use for questions about leads, follow-ups, cold leads or the sales pipeline.",
    input_schema: { type: "object", properties: { status: { type: "string", description: "optional filter, e.g. 'new', 'won', 'lost'" } } },
  },
  {
    name: "get_revenue",
    description: "Money summary in AED: total quoted, approved value, total invoiced, total received and outstanding. Use for any revenue, sales, billing or cash-flow question.",
    input_schema: { type: "object", properties: {} },
  },
];

async function runTool(supa: any, companyId: string, name: string, input: any) {
  try {
    if (!supa || !companyId) return { error: "No data access in this session." };
    if (name === "get_projects") {
      let q = supa.from("ops_projects")
        .select("name,status,client_name,location,contract_value,progress,start_date,end_date,created_at")
        .eq("company_id", companyId).order("created_at", { ascending: false }).limit(60);
      if (input?.status) q = q.ilike("status", `%${String(input.status)}%`);
      const { data, error } = await q;
      if (error) throw error;
      return { count: (data || []).length, projects: data || [] };
    }
    if (name === "get_leads") {
      let q = supa.from("lead_distributions")
        .select("status,temperature,follow_up_date,assigned_at,lost_reason,lead_submissions(name,phone,source,created_at)")
        .eq("company_id", companyId).order("assigned_at", { ascending: false }).limit(80);
      if (input?.status) q = q.ilike("status", `%${String(input.status)}%`);
      const { data, error } = await q;
      if (error) throw error;
      const leads = (data || []).map((d: any) => ({
        name: d.lead_submissions?.name || null, source: d.lead_submissions?.source || null,
        status: d.status || null, temperature: d.temperature || null,
        follow_up_date: d.follow_up_date || null,
        created_at: d.lead_submissions?.created_at || d.assigned_at || null, lost_reason: d.lost_reason || null,
      }));
      return { count: leads.length, leads };
    }
    if (name === "get_revenue") {
      const [{ data: quotes }, { data: invs }] = await Promise.all([
        supa.from("quotations").select("status,total,created_at").eq("company_id", companyId).limit(3000),
        supa.from("invoices").select("total,payments,status,created_at").eq("company_id", companyId).limit(3000),
      ]);
      const qAll = quotes || [];
      const approvedValue = qAll.filter((x: any) => String(x.status).toLowerCase() === "approved").reduce((s: number, x: any) => s + num(x.total), 0);
      const invoiced = (invs || []).reduce((s: number, i: any) => s + num(i.total), 0);
      const received = (invs || []).reduce((s: number, i: any) => s + (Array.isArray(i.payments) ? i.payments.reduce((a: number, p: any) => a + num(p.amount), 0) : 0), 0);
      return {
        currency: "AED", total_quoted: qAll.reduce((s: number, x: any) => s + num(x.total), 0),
        approved_quotation_value: approvedValue, total_invoiced: invoiced, total_received: received,
        outstanding: invoiced - received, quotation_count: qAll.length, invoice_count: (invs || []).length,
      };
    }
    return { error: "unknown tool" };
  } catch (e) { return { error: String((e && (e as any).message) || e) }; }
}

async function claudeRaw(apiKey: string, payload: any) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", ...payload }),
  });
  if (!res.ok) {
    const t = await res.text(); let detail = ""; try { detail = JSON.parse(t)?.error?.message || ""; } catch { detail = t.slice(0, 200); }
    return { ok: false as const, status: res.status, detail };
  }
  return { ok: true as const, data: await res.json() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Assistant is not configured yet." }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const question = String(body?.question || "").trim().slice(0, 1000);
  if (!question) return json({ error: "Please ask a question." }, 400);
  const companyId = String(body?.companyId || "");
  const companyName = String(body?.companyName || "your company");

  // RLS-scoped client from the caller's JWT — only sees the caller's own company data.
  let supa: any = null;
  const authHeader = req.headers.get("Authorization") || "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL"); const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (authHeader && companyId && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  }

  const system = `${SYSTEM}\n\nThe business is "${companyName}".`;
  const convo: any[] = [{ role: "user", content: question }];

  try {
    for (let hop = 0; hop < 5; hop++) {
      const payload: any = { max_tokens: 450, system, messages: convo };
      if (supa) payload.tools = TOOLS;
      const r = await claudeRaw(apiKey, payload);
      if (!r.ok) {
        console.error("anthropic error", r.status, r.detail);
        return json({ error: "The assistant is busy right now. Please try again." }, 502);
      }
      const data = r.data;
      if (data.stop_reason === "tool_use") {
        convo.push({ role: "assistant", content: data.content });
        const results: any[] = [];
        for (const blk of data.content) {
          if (blk.type !== "tool_use") continue;
          const out = await runTool(supa, companyId, blk.name, blk.input || {});
          results.push({ type: "tool_result", tool_use_id: blk.id, content: JSON.stringify(out).slice(0, 14000) });
        }
        convo.push({ role: "user", content: results });
        continue;
      }
      const reply = (data?.content || []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join(" ").trim();
      return json({ reply: reply || "Sorry, I didn't catch that. Could you say it again?" });
    }
    return json({ reply: "Sorry, I couldn't work that out. Please try rephrasing." });
  } catch (e) {
    console.error("quvera-assistant error", String((e && (e as any).message) || e));
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
// trustdubai-business/supabase/functions/quvera-assistant/index.ts
