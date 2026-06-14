// Tritova AI Assistant — drafts a lead reply + scores the lead using Claude API.
// Requires secret: ANTHROPIC_API_KEY (set in Edge Functions → Secrets)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "AI not configured. Add ANTHROPIC_API_KEY secret." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const {
      action = "reply", // "reply" | "score" | "both" | "quote"
      companyName = "our company",
      companyCategory = "",
      lead = {},
      tone = "professional",
      description = "",      // for action "quote": the project description
      library = [],          // for action "quote": [{ description, unit, default_rate, trade_section }]
      mode = "simple",       // for action "quote": "simple" | "advanced" | "boq"
      conversation = [],     // for action "reply": [{ from: "customer"|"company", text }]
      channel = "chat",      // for action "reply": "chat" | "whatsapp"
    } = body;

    const leadText = [
      lead.name ? `Name: ${lead.name}` : "",
      lead.message ? `Message: ${lead.message}` : "",
      lead.project_type ? `Project type: ${lead.project_type}` : "",
      lead.budget ? `Budget: ${lead.budget}` : "",
      lead.area ? `Area/Location: ${lead.area}` : "",
      lead.source ? `Source: ${lead.source}` : "",
    ].filter(Boolean).join("\n");

    const convoText = (Array.isArray(conversation) ? conversation : [])
      .slice(-12)
      .map((m) => `${m.from === "company" ? "Us" : (lead.name || "Customer")}: ${m.text}`)
      .join("\n");

    let system = "";
    let userPrompt = "";

    if (action === "quote") {
      const libText = (Array.isArray(library) ? library : []).slice(0, 90)
        .map((li) => `- ${li.description} | unit: ${li.unit || "Nos"} | rate: ${li.default_rate || 0}${li.trade_section ? " | trade: " + li.trade_section : ""}`)
        .join("\n");
      const grouped = mode !== "simple";
      system = `You are a senior quantity surveyor / estimator for ${companyName}${companyCategory ? `, a ${companyCategory} business` : ""} in Dubai (UAE). You produce detailed, realistic itemized quotations for construction, interior and fit-out projects. All prices in AED.`;
      userPrompt = `Create an itemized quotation for the project below. Return ONLY compact JSON (no markdown, no extra text) in this exact shape:
{"items":[{"desc":"...","unit":"Nos|m²|m|Lump Sum|Set|Hour|Day","qty":number,"rate":number${grouped ? ',"trade":"section or trade name"' : ""}}]}

Rules:
- 6 to 16 realistic line items covering the full scope.
- Prefer the company's library items and KEEP their rates where they match the scope. For new items, estimate fair current Dubai market rates in AED.
- "qty" and "rate" are plain numbers (no currency symbols or commas).
- Clear, professional descriptions.
${grouped ? '- Group items under a "trade" (e.g. Civil, MEP, Joinery, Painting, Flooring — or room names like Kitchen, Living Room).' : "- Do not include a trade field."}

Company library (reuse these rates where relevant):
${libText || "(no saved library items — estimate fair Dubai market rates)"}

Project:
${description || "General interior fit-out work"}`;
    } else if (action === "score") {
      system = `You are a lead-qualification assistant for ${companyName}${companyCategory ? `, a ${companyCategory} business` : ""} in Dubai. Score how promising a sales lead is.`;
      userPrompt = `Given this lead, return ONLY a compact JSON object (no markdown, no extra text) with keys:
"score" (integer 0-100), "temperature" ("hot"|"warm"|"cold"), "reason" (one short sentence).

Lead:
${leadText || "No details provided."}`;
    } else {
      const isWa = channel === "whatsapp";
      system = `You are a helpful sales assistant for ${companyName}${companyCategory ? `, a ${companyCategory} business` : ""} in Dubai. Write a ${isWa ? "WhatsApp " : ""}reply to a customer enquiry.
Rules:
- Warm, ${tone}, and concise (max 60 words).
- ${isWa ? "WhatsApp style: friendly and natural; at most one emoji." : "Professional chat style; no emojis."}
- Greet the customer by first name only if there are no prior messages yet.
- If a conversation is shown, continue it naturally and answer their latest message; do not repeat earlier greetings or info.
- Acknowledge their need, give a helpful next step (free site visit / call / quote).
- Never invent prices. Use AED if money is mentioned.
- End by proposing a simple next step or asking one qualifying question.
- Plain text only. No markdown.`;
      if (action === "both") {
        userPrompt = `Reply to this lead, AND also score it.
Return ONLY compact JSON (no markdown) with keys:
"reply" (the message text), "score" (integer 0-100), "temperature" ("hot"|"warm"|"cold"), "reason" (one short sentence).

Lead:
${leadText || "No details provided."}${convoText ? `\n\nConversation so far:\n${convoText}` : ""}`;
      } else {
        userPrompt = `Write the next ${isWa ? "WhatsApp " : ""}reply message. Return ONLY the message text, nothing else.

Lead:
${leadText || "No details provided."}
${convoText ? `\nConversation so far:\n${convoText}` : "\n(No messages yet — this is the first outreach.)"}`;
      }
    }

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: action === "quote" ? 2400 : 600,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      console.error("Anthropic error", aiRes.status, errTxt);
      // try to extract a useful message
      let detail = "";
      try { const j = JSON.parse(errTxt); detail = j?.error?.message || j?.message || ""; } catch { detail = errTxt.slice(0, 200); }
      const lc = (detail || "").toLowerCase();
      let code = "ai_failed";
      if (aiRes.status === 400 && (lc.includes("credit") || lc.includes("balance"))) code = "no_credit";
      else if (aiRes.status === 401 || aiRes.status === 403) code = "bad_key";
      else if (aiRes.status === 429) code = "rate_limit";
      else if (lc.includes("credit") || lc.includes("balance")) code = "no_credit";
      return json({ error: "AI request failed", code, status: aiRes.status, detail }, 502);
    }

    const data = await aiRes.json();
    const text = (data?.content?.[0]?.text || "").trim();

    if (action === "quote") {
      const parsed = safeJson(text);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      return json({ ok: true, items }, 200);
    }

    if (action === "score" || action === "both") {
      const parsed = safeJson(text);
      if (parsed) return json({ ok: true, ...parsed }, 200);
      if (action === "both") return json({ ok: true, reply: text }, 200);
      return json({ ok: true, raw: text }, 200);
    }

    return json({ ok: true, reply: text }, 200);
  } catch (e) {
    console.error("trustdubai-ai error", e);
    return json({ error: String((e && e.message) || e) }, 500);
  }
});

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function safeJson(text) {
  if (!text) return null;
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try { return JSON.parse(t); } catch { return null; }
}
