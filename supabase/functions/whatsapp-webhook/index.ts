// WhatsApp Business (Cloud API) webhook — incoming messages become leads AND
// drive a per-company auto-reply bot (menu/catalogue + Claude AI for free text).
//
//   GET   → webhook verification handshake (Meta sends hub.challenge once)
//   POST  → incoming message → (1) file/refresh a lead, (2) run the bot if enabled
//
// The bot is OFF by default (whatsapp_bot_config.enabled=false). With no config
// row the behaviour is exactly the old lead-only capture — fully backward safe.
//
// Deploy WITHOUT JWT verification (Meta can't send a Supabase JWT):
//   supabase functions deploy whatsapp-webhook --no-verify-jwt
//
// Env (Supabase → Edge Functions → secrets):
//   APP_SUPABASE_URL, APP_SERVICE_ROLE_KEY   (service role — bypasses RLS)
//   WHATSAPP_VERIFY_TOKEN                     (any random string; also entered in Meta)
//   WHATSAPP_APP_SECRET                       (optional — validates Meta's signature)
//   ANTHROPIC_API_KEY                         (for AI free-text replies)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v21.0";
const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("APP_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const APP_SECRET   = Deno.env.get("WHATSAPP_APP_SECRET") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const tail9 = (s: string) => (s || "").replace(/[^0-9]/g, "").slice(-9);
const GREETINGS = ["hi", "hello", "hey", "menu", "start", "hola", "salam", "assalam", "assalamualaikum", "hai"];

async function validSignature(raw: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) return true;
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return ("sha256=" + hex) === header;
}

function bodyOf(m: any): string {
  if (m?.type === "text") return m.text?.body || "";
  if (m?.type === "interactive") return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "[interactive]";
  if (m?.type === "button") return m.button?.text || "[button]";
  if (m?.image || m?.type === "image") return m.image?.caption || "[photo]";
  if (m?.type) return `[${m.type}]`;
  return "";
}
// the id chosen from an interactive (list/button) reply, if any
function replyId(m: any): string {
  return m?.interactive?.list_reply?.id || m?.interactive?.button_reply?.id || "";
}

// ---- WhatsApp Cloud API send helpers ----
async function waSend(phoneNumberId: string, token: string, payload: any) {
  try {
    const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    return await r.json();
  } catch (e) { return { error: String(e) }; }
}
const trunc = (s: string, n: number) => (s || "").slice(0, n);
function textMsg(to: string, body: string) {
  return { to, type: "text", text: { body: trunc(body, 4096) } };
}
// interactive list built from the company's catalogue/menu rows
function listMsg(to: string, header: string, body: string, rows: any[]) {
  return {
    to, type: "interactive",
    interactive: {
      type: "list",
      ...(header ? { header: { type: "text", text: trunc(header, 60) } } : {}),
      body: { text: trunc(body || "Please choose an option:", 1024) },
      action: {
        button: "View options",
        sections: [{
          title: "Menu",
          rows: rows.slice(0, 10).map((r: any, i: number) => ({
            id: String(r.id || ("opt_" + i)),
            title: trunc(r.title || `Option ${i + 1}`, 24),
            ...(r.description ? { description: trunc(r.description, 72) } : {}),
          })),
        }],
      },
    },
  };
}

// ---- Claude AI free-text reply ----
async function aiReply(company: any, cfg: any, history: any[], userText: string): Promise<string> {
  if (!ANTHROPIC_KEY) return "";
  const catalogue = Array.isArray(cfg.menu) && cfg.menu.length
    ? "\nServices / options:\n" + cfg.menu.map((m: any) => `- ${m.title}${m.description ? ": " + m.description : ""}`).join("\n")
    : "";
  const system =
    `You are the WhatsApp assistant for "${company?.name || "our company"}"${company?.category ? `, a ${company.category} business` : ""} in Dubai. ` +
    `Reply in the customer's language, warm and concise (2-4 short sentences, WhatsApp style). ` +
    `Answer questions about services, pricing ranges, timelines and booking. If they seem ready, collect their name, location and requirement so the team can follow up. ` +
    `If you cannot help or they ask for a human, tell them a team member will reach out.` +
    catalogue + (cfg.ai_instructions ? `\nBrand notes: ${cfg.ai_instructions}` : "");
  const messages = [
    ...history.map((h: any) => ({ role: h.direction === "in" ? "user" : "assistant", content: h.body || "" }))
      .filter((m: any) => m.content),
    { role: "user", content: userText },
  ];
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 350, system, messages }),
    });
    const j = await r.json();
    return j?.content?.[0]?.text || "";
  } catch { return ""; }
}

async function logMsg(companyId: string, waId: string, direction: string, type: string, body: string, raw: any) {
  try { await admin.from("whatsapp_messages").insert({ company_id: companyId, wa_id: waId, direction, type, body, raw }); } catch { /* non-fatal */ }
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
      for (const change of entry?.changes || []) {
        const value = change?.value;
        const messages = value?.messages;
        if (!Array.isArray(messages) || !messages.length) continue;

        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // owning company + the token needed to send replies
        const { data: acct } = await admin
          .from("whatsapp_accounts").select("company_id, access_token")
          .eq("phone_number_id", phoneNumberId).maybeSingle();
        if (!acct?.company_id) continue;
        const companyId = acct.company_id;
        const sendToken = acct.access_token || "";

        // bot config (may be absent → bot off, lead-only)
        const { data: cfg } = await admin
          .from("whatsapp_bot_config").select("*").eq("company_id", companyId).maybeSingle();
        const botOn = !!cfg?.enabled && !!sendToken;
        const collectLead = cfg ? cfg.collect_lead !== false : true;

        const names: Record<string, string> = {};
        for (const c of value?.contacts || []) if (c?.wa_id) names[c.wa_id] = c?.profile?.name || "";

        for (const m of messages) {
          const from = String(m?.from || "");
          if (!from) continue;
          const name = names[from] || ("WhatsApp " + from.slice(-4));
          const text = bodyOf(m);
          const phone = "+" + from.replace(/[^0-9]/g, "");

          // ---------- (1) lead capture (unchanged behaviour, gated by collect_lead) ----------
          if (collectLead) {
            const t9 = tail9(from);
            const { data: existing } = await admin
              .from("lead_submissions").select("id, answers")
              .eq("company_id", companyId).ilike("phone", `%${t9}%`).limit(1);
            if (existing && existing.length) {
              const ans = { ...(existing[0].answers || {}) };
              if (text) ans["Last message"] = text;
              await admin.from("lead_submissions").update({ answers: ans, status_updated_at: new Date().toISOString() }).eq("id", existing[0].id);
            } else {
              await admin.from("lead_submissions").insert({
                company_id: companyId, name, phone, status: "new",
                status_updated_at: new Date().toISOString(), temperature: "warm",
                answers: { Source: "WhatsApp", ...(text ? { Notes: text } : {}) },
              });
            }
          }

          // ---------- (2) bot auto-reply ----------
          if (!botOn) continue;
          await logMsg(companyId, from, "in", m?.type || "text", text, m);

          // conversation state (greeted / handover / last handled message)
          const { data: convo } = await admin
            .from("whatsapp_conversations").select("*").eq("company_id", companyId).eq("wa_id", from).maybeSingle();
          const state = convo?.state || {};
          // dedupe Meta webhook retries
          if (m?.id && state.last_msg_id === m.id) continue;
          if (convo?.handover) {                        // a human is handling — stay silent
            await admin.from("whatsapp_conversations").update({ state: { ...state, last_msg_id: m?.id }, updated_at: new Date().toISOString() }).eq("company_id", companyId).eq("wa_id", from);
            continue;
          }

          const menu = Array.isArray(cfg.menu) ? cfg.menu : [];
          const lower = text.trim().toLowerCase();
          const chosenId = replyId(m);
          let out: any = null;

          const handoverWords = String(cfg.handover_keywords || "").split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
          const isHandover = handoverWords.some((w) => w && lower.includes(w));

          if (isHandover) {
            await admin.from("whatsapp_conversations").upsert({ company_id: companyId, wa_id: from, handover: true, state: { ...state, last_msg_id: m?.id }, updated_at: new Date().toISOString() });
            out = textMsg(from, cfg.handover_note || "Thanks! A team member will contact you shortly. 🙌");
          } else if (chosenId) {
            // user picked a catalogue/menu row → send its scripted reply (+ menu again)
            const item = menu.find((x: any) => String(x.id) === chosenId);
            out = textMsg(from, (item?.reply || item?.description || "Great choice! Please share your name & location and our team will help you.") +
              "\n\nType *menu* to see options again, or ask me anything.");
          } else if (!state.greeted || GREETINGS.includes(lower)) {
            // first contact / greeting → welcome + catalogue list
            const greet = (cfg.greeting || "Hi {name}! 👋 Welcome to {company}. How can we help you today?")
              .replace(/\{name\}/g, name.split(" ")[0]).replace(/\{company\}/g, "");
            out = menu.length ? listMsg(from, "", greet, menu) : textMsg(from, greet);
          } else if (cfg.ai_enabled !== false) {
            // free text → Claude, with recent history for context
            const { data: hist } = await admin
              .from("whatsapp_messages").select("direction, body")
              .eq("company_id", companyId).eq("wa_id", from).order("created_at", { ascending: false }).limit(10);
            const history = (hist || []).reverse();
            const company = (await admin.from("companies").select("name, category").eq("id", companyId).maybeSingle()).data;
            const ai = await aiReply(company, cfg, history, text);
            out = ai ? textMsg(from, ai) : (menu.length ? listMsg(from, "", "Here's what we offer:", menu) : textMsg(from, "Thanks for your message! Our team will get back to you shortly."));
          } else {
            // AI off, no selection → re-show the menu
            out = menu.length ? listMsg(from, "", "Please choose an option:", menu) : textMsg(from, "Thanks! Our team will contact you shortly.");
          }

          if (out) {
            const res = await waSend(phoneNumberId, sendToken, out);
            await logMsg(companyId, from, "out", out.type, out.text?.body || "[interactive]", res);
          }
          await admin.from("whatsapp_conversations").upsert({
            company_id: companyId, wa_id: from,
            state: { ...state, greeted: true, last_msg_id: m?.id },
            handover: false, updated_at: new Date().toISOString(),
          });
        }
      }
    }
  } catch (e) {
    console.error("whatsapp-webhook error:", e);
  }

  return new Response("ok", { status: 200 });
});
