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
      action = "reply", // "reply" | "score" | "both"
      companyName = "our company",
      companyCategory = "",
      lead = {},
      tone = "professional",
    } = body;

    const leadText = [
      lead.name ? `Name: ${lead.name}` : "",
      lead.message ? `Message: ${lead.message}` : "",
      lead.project_type ? `Project type: ${lead.project_type}` : "",
      lead.budget ? `Budget: ${lead.budget}` : "",
      lead.area ? `Area/Location: ${lead.area}` : "",
      lead.source ? `Source: ${lead.source}` : "",
    ].filter(Boolean).join("\n");

    let system = "";
    let userPrompt = "";

    if (action === "score") {
      system = `You are a lead-qualification assistant for ${companyName}${companyCategory ? `, a ${companyCategory} business` : ""} in Dubai. Score how promising a sales lead is.`;
      userPrompt = `Given this lead, return ONLY a compact JSON object (no markdown, no extra text) with keys:
"score" (integer 0-100), "temperature" ("hot"|"warm"|"cold"), "reason" (one short sentence).

Lead:
${leadText || "No details provided."}`;
    } else {
      system = `You are a helpful sales assistant for ${companyName}${companyCategory ? `, a ${companyCategory} business` : ""} in Dubai. Write a reply to a customer enquiry.
Rules:
- Warm, ${tone}, and concise (max 60 words).
- Greet the customer by first name if given.
- Acknowledge their need, give a helpful next step (free site visit / call / quote).
- Never invent prices. Use AED if money is mentioned.
- End by proposing a simple next step or asking one qualifying question.
- Plain text only. No markdown.`;
      if (action === "both") {
        userPrompt = `Reply to this lead, AND also score it.
Return ONLY compact JSON (no markdown) with keys:
"reply" (the message text), "score" (integer 0-100), "temperature" ("hot"|"warm"|"cold"), "reason" (one short sentence).

Lead:
${leadText || "No details provided."}`;
      } else {
        userPrompt = `Write the reply message for this lead. Return ONLY the message text, nothing else.

Lead:
${leadText || "No details provided."}`;
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
        max_tokens: 600,
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
