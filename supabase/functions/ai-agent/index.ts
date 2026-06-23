// Quvera AI Agents — a team of specialist assistants (marketing, estimator, sales,
// content, advisor, project manager, tender, HR) PLUS an Orchestrator that routes a
// simple request to one specialist, or coordinates several for a big goal and merges
// their work into one plan.
// Conversational: takes the chat so far, returns the next reply.
// Uses Claude. Requires secret: ANTHROPIC_API_KEY (same one smart-function uses).
//
// Deploy:  supabase functions deploy ai-agent
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Each agent = a persona/system prompt. {co} and {cat} are filled per company.
const AGENTS: Record<string, string> = {
  marketing: `You are the Marketing Agent for {co}{cat} in Dubai (UAE). You are a sharp marketing strategist and copywriter. Help with ad copy (Meta/Google/TikTok), WhatsApp broadcasts, social captions, offers/promotions, lead-generation ideas and campaign plans. Be practical and specific to the UAE market. Money in AED. When you write copy, give 2-3 ready-to-use options. Keep it punchy.`,
  estimator: `You are the Estimator Agent for {co}{cat} in Dubai (UAE) — a senior quantity surveyor. Give realistic rough cost estimates, scope-of-work breakdowns and BOQ guidance for interior, fit-out and construction work at current Dubai market rates in AED. If key details are missing (area, finish level, location), ask a couple of short questions first, then estimate. Show ranges and clearly say it's an indicative estimate, not a fixed quote.`,
  sales: `You are the Sales Agent for {co}{cat} in Dubai. You are a closing-focused sales coach. Help write follow-up messages, handle objections (price, timeline, trust), negotiate, and move leads to the next step (site visit / quote / booking). Warm, persuasive, concise. When asked for a message, give a ready-to-send version. Never invent prices.`,
  content: `You are the Content Agent for {co}{cat} in Dubai. You create engaging content: project/portfolio descriptions, before-after write-ups, Instagram/TikTok captions, hashtags, short blog posts and Google Business posts. On-brand, vivid but not exaggerated. Offer a few variations.`,
  advisor: `You are the Business Advisor for {co}{cat} in Dubai (UAE). You give practical, no-fluff advice on pricing strategy, margins, growth, operations, hiring, cash flow and client retention for a small contracting/interior business in the UAE. Be concrete and actionable; use AED and local context.`,
  project_manager: `You are the Project Manager Agent for {co}{cat} in Dubai (UAE). You help plan and run interior, fit-out and construction projects: milestone & schedule plans, subcontractor coordination, site work sequencing, material/procurement timing, inspections, snagging and handover, and delay/risk management. Be practical and structured (timelines, checklists, phases). UAE site context.`,
  tender: `You are the Tender & Proposal Agent for {co}{cat} in Dubai (UAE). You write professional, client-ready proposals, tender responses, technical & commercial submissions, company-profile sections, cover letters, scope-of-work statements and bid clarifications. Structured, persuasive and credible. Use AED. Flag where the user must insert real figures/dates.`,
  hr: `You are the HR Agent for {co}{cat} in Dubai (UAE). You help with hiring (job posts, screening & interview questions), offer/appointment letters, simple HR policies, warning/appreciation letters and basic team management. Be mindful of UAE labour norms, and clearly flag anything that needs a lawyer or PRO/typing-centre check. Do not give binding legal advice.`,
};

const LABELS: Record<string, string> = {
  marketing: "Marketing", estimator: "Estimator", sales: "Sales", content: "Content",
  advisor: "Business Advisor", project_manager: "Project Manager", tender: "Tender / Proposal", hr: "HR",
};

// ---- one Claude call ----
async function callClaude(apiKey: string, system: string, messages: any[], maxTokens = 1500) {
  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages }),
  });
  if (!aiRes.ok) {
    const t = await aiRes.text();
    let detail = ""; try { detail = JSON.parse(t)?.error?.message || ""; } catch { detail = t.slice(0, 200); }
    const lc = detail.toLowerCase();
    let code = "ai_failed";
    if (lc.includes("credit") || lc.includes("balance")) code = "no_credit";
    else if (aiRes.status === 401 || aiRes.status === 403) code = "bad_key";
    else if (aiRes.status === 429) code = "rate_limit";
    return { ok: false as const, status: aiRes.status, code, detail };
  }
  const data = await aiRes.json();
  return { ok: true as const, reply: (data?.content?.[0]?.text || "").trim() };
}

function lastUserText(claudeMsgs: any[]): string {
  for (let i = claudeMsgs.length - 1; i >= 0; i--) {
    const m = claudeMsgs[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    const t = Array.isArray(m.content) ? m.content.find((c: any) => c.type === "text")?.text : "";
    return t || "(the client attached an image)";
  }
  return "";
}

// ---- Orchestrator: route to one specialist, or coordinate several and merge ----
async function orchestrate(apiKey: string, p: {
  companyName: string; cat: string; claudeMsgs: any[]; knowledge: string; notes: Record<string, string>; enabled: string[];
}) {
  const available = p.enabled.filter((k) => AGENTS[k]);
  const pool = available.length ? available : Object.keys(AGENTS);
  const ask = lastUserText(p.claudeMsgs);

  // 1) Router — decide which specialists are needed
  const menu = pool.map((k) => `- ${k}: ${LABELS[k]}`).join("\n");
  const routerSystem = `You are the Orchestrator for ${p.companyName}${p.cat}, an interior/fit-out business in Dubai (UAE). You coordinate a team of specialist AI agents.
Available specialists:
${menu}
Decide which specialists are needed to fully handle the user's latest request.
- Simple or single-topic request -> exactly 1 specialist.
- A broad goal that spans areas (e.g. winning a tender, launching a campaign, closing a hesitant client end-to-end, planning + costing a project) -> 2 to 4 specialists, each owning one part.
Return ONLY valid JSON, no prose, no code fences:
{"agents":[{"key":"<id from the list>","task":"<one line: what this specialist should deliver>"}]}
Order them logically.`;
  const r = await callClaude(apiKey, routerSystem, [{ role: "user", content: ask || "Help me." }], 600);
  let chosen: { key: string; task: string }[] = [];
  if (r.ok) {
    try {
      const m = r.reply.match(/\{[\s\S]*\}/);
      const plan = JSON.parse(m ? m[0] : r.reply);
      if (Array.isArray(plan.agents)) {
        const seen = new Set<string>();
        for (const a of plan.agents) {
          if (a && pool.includes(a.key) && !seen.has(a.key)) { seen.add(a.key); chosen.push({ key: a.key, task: String(a.task || "").trim() }); }
        }
      }
    } catch { /* fall through */ }
  }
  chosen = chosen.slice(0, 4);
  if (!chosen.length) chosen = [{ key: pool.includes("advisor") ? "advisor" : pool[0], task: ask }];

  // 2) Run each chosen specialist (in parallel) with the full conversation for context
  const runs = await Promise.all(chosen.map(async (c) => {
    let sys = (AGENTS[c.key] || AGENTS.advisor).replace("{co}", p.companyName).replace("{cat}", p.cat);
    if (p.knowledge) sys += `\n\n--- About ${p.companyName} (use this to be accurate) ---\n${p.knowledge.slice(0, 4000)}`;
    const note = (p.notes && p.notes[c.key] ? String(p.notes[c.key]) : "").trim();
    if (note) sys += `\n\n--- The owner's training notes for you ---\n${note.slice(0, 1500)}`;
    if (chosen.length > 1) sys += `\n\nYou are part of a coordinated team handling ONE client request. Your specific job here: ${c.task}. Produce only your part — focused, concrete and ready to use. Another agent (the Orchestrator) will merge everyone's work, so don't repeat the whole brief.`;
    const out = await callClaude(apiKey, sys, p.claudeMsgs, 1300);
    return { key: c.key, task: c.task, ok: out.ok, text: out.ok ? out.reply : "", err: out.ok ? null : out };
  }));
  const good = runs.filter((x) => x.ok && x.text);
  if (!good.length) { const f: any = runs[0]?.err || { code: "ai_failed", detail: "" }; return { ok: false as const, code: f.code, detail: f.detail }; }

  // 3a) Single specialist -> return its answer directly
  if (good.length === 1) return { ok: true as const, reply: good[0].text, used: [good[0].key] };

  // 3b) Several -> synthesize into one plan
  const parts = good.map((g) => `## ${LABELS[g.key]} — ${g.task}\n${g.text}`).join("\n\n");
  const synthSystem = `You are the Orchestrator for ${p.companyName}${p.cat} in Dubai. Your specialist team has each produced their part for the client request below. Merge them into ONE clear, well-structured action plan for the business owner.
- Start with a one-line summary of the overall plan.
- Then a section per area with a bold plain-text heading (no # or * symbols for headings — just bold-style capitalised titles on their own line).
- Keep every concrete detail: numbers, AED figures, ready-to-send messages, steps and checklists.
- Do not repeat content across sections; combine sensibly. Keep it tight and usable.`;
  const synthMsgs = [{ role: "user", content: `Client request: ${ask}\n\n--- Specialist outputs ---\n${parts}` }];
  const s = await callClaude(apiKey, synthSystem, synthMsgs, 2200);
  const header = `🧭 Coordinated: ${good.map((g) => LABELS[g.key]).join(" · ")}\n\n`;
  if (!s.ok) {
    const joined = good.map((g) => `${LABELS[g.key]}\n${g.text}`).join("\n\n");
    return { ok: true as const, reply: header + joined, used: good.map((g) => g.key) };
  }
  return { ok: true as const, reply: header + s.reply, used: good.map((g) => g.key) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "AI not configured. Add ANTHROPIC_API_KEY secret." }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const agentKey = String(body.agent || "advisor");
  const companyName = String(body.companyName || "our company");
  const cat = body.companyCategory ? `, a ${body.companyCategory} business` : "";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const knowledge = String(body.knowledge || "").trim();

  // build the conversation for Claude (last 20 turns); a user turn may carry an image
  const claudeMsgs = messages.slice(-20)
    .filter((m: any) => m && (m.text || (m.image && m.image.data)))
    .map((m: any) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      if (m.image && m.image.data) {
        const content: any[] = [{ type: "image", source: { type: "base64", media_type: m.image.media_type || "image/jpeg", data: m.image.data } }];
        if (m.text) content.push({ type: "text", text: String(m.text) });
        return { role, content };
      }
      return { role, content: String(m.text) };
    });
  if (!claudeMsgs.length) return json({ error: "No message" }, 400);

  // ---- Orchestrator ----
  if (agentKey === "orchestrator") {
    const enabled = Array.isArray(body.enabledAgents) && body.enabledAgents.length
      ? body.enabledAgents.filter((k: any) => AGENTS[k]) : Object.keys(AGENTS);
    const res = await orchestrate(apiKey, { companyName, cat, claudeMsgs, knowledge, notes: body.notes || {}, enabled });
    if (!res.ok) return json({ error: "AI request failed", code: res.code || "ai_failed", detail: res.detail || "" }, 502);
    return json({ ok: true, reply: res.reply, used: res.used });
  }

  // ---- a single specialist ----
  const persona = AGENTS[agentKey] || AGENTS.advisor;
  const note = String(body.note || "").trim();
  let system = persona.replace("{co}", companyName).replace("{cat}", cat);
  if (knowledge) system += `\n\n--- About ${companyName} (use this to be accurate and specific to this business) ---\n${knowledge.slice(0, 4000)}`;
  if (note) system += `\n\n--- Extra training/instructions for you from the owner ---\n${note.slice(0, 1500)}`;
  system += `\n\nFormat: clear and well-structured. Use short paragraphs or bullets. Plain text (light markdown is fine). Do not invent prices unless asked for an estimate.`;

  const out = await callClaude(apiKey, system, claudeMsgs, 1500);
  if (!out.ok) return json({ error: "AI request failed", code: out.code, detail: out.detail }, 502);
  return json({ ok: true, reply: out.reply });
});
