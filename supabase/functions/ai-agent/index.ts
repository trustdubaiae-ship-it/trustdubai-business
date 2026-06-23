// Quvera AI Agents — a set of specialist assistants (marketing, estimator, sales,
// content, advisor). Conversational: takes the chat so far, returns the next reply.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "AI not configured. Add ANTHROPIC_API_KEY secret." }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const agentKey = String(body.agent || "advisor");
  const persona = AGENTS[agentKey] || AGENTS.advisor;
  const companyName = String(body.companyName || "our company");
  const companyCategory = body.companyCategory ? `, a ${body.companyCategory} business` : "";
  const messages = Array.isArray(body.messages) ? body.messages : [];

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

  const knowledge = String(body.knowledge || "").trim();
  const note = String(body.note || "").trim();
  let system = persona.replace("{co}", companyName).replace("{cat}", companyCategory);
  if (knowledge) system += `\n\n--- About ${companyName} (use this to be accurate and specific to this business) ---\n${knowledge.slice(0, 4000)}`;
  if (note) system += `\n\n--- Extra instructions for you from the owner ---\n${note.slice(0, 1500)}`;
  system += `\n\nFormat: clear and well-structured. Use short paragraphs or bullets. Plain text (light markdown is fine). Do not invent prices unless asked for an estimate.`;

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, system, messages: claudeMsgs }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      let detail = ""; try { detail = JSON.parse(t)?.error?.message || ""; } catch { detail = t.slice(0, 200); }
      const lc = detail.toLowerCase();
      let code = "ai_failed";
      if (lc.includes("credit") || lc.includes("balance")) code = "no_credit";
      else if (aiRes.status === 401 || aiRes.status === 403) code = "bad_key";
      else if (aiRes.status === 429) code = "rate_limit";
      return json({ error: "AI request failed", code, detail }, 502);
    }
    const data = await aiRes.json();
    const reply = (data?.content?.[0]?.text || "").trim();
    return json({ ok: true, reply });
  } catch (e) {
    return json({ error: String((e && (e as any).message) || e) }, 500);
  }
});
