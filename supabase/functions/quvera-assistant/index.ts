// trustdubai-business/supabase/functions/quvera-assistant/index.ts
// Quvera Voice Assistant — answers a spoken/typed question via Anthropic.
// Secret: ANTHROPIC_API_KEY (set with `supabase secrets set`). Deploy with JWT on/off
// as you prefer (it's called from the authenticated portal). Raw fetch — no SDK.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `You are the "Quvera Assistant", a helpful voice assistant built into the Quvera Business OS — the platform a UAE renovation / interior fit-out business owner uses to run their company.

Your job: help the owner use the platform. You can explain how things work — Leads, Quotations, Projects, Invoices & Payments, the Marketplace, Reviews and the Trust Score — and give short practical guidance.

Rules:
- Your reply is SPOKEN ALOUD, so keep it SHORT: 1–3 sentences, plain and warm. No markdown, no bullet lists, no emojis.
- Reply in the SAME language the user speaks.
- NEVER invent specific numbers, prices, balances or financial figures. For live business data (revenue, a client's balance, how many leads, project status, etc.) tell the user exactly where to look in the portal instead — e.g. "You can see that on the Command Center" or "Open the Ledger to check that."
- If asked something outside the platform, answer briefly and helpfully.
- Never mention being an AI model, a language model, or which company built you. You are simply the Quvera Assistant.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Assistant is not configured yet." }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const question = String(body?.question || "").trim().slice(0, 1000);
  if (!question) return json({ error: "Please ask a question." }, 400);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: question }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("anthropic error", res.status, data?.error?.message);
      return json({ error: "The assistant is busy right now. Please try again." }, 502);
    }
    const reply = (data?.content || [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join(" ")
      .trim();
    return json({ reply: reply || "Sorry, I didn't catch that. Could you say it again?" });
  } catch (e) {
    console.error("quvera-assistant error", String((e && (e as any).message) || e));
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
// trustdubai-business/supabase/functions/quvera-assistant/index.ts
