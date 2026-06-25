// Quvera Partner Program — self-signup.
// Creates a Supabase auth user + a pending qv_partners row, server-side, so it works
// regardless of the project's email-confirmation setting. The partner can sign in
// immediately and sees a "pending approval" screen until an admin activates them.
//
// Uses the service-role key (auto-injected). Deploy: supabase functions deploy partner-signup
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server not configured" }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  const TIERS: Record<string, { fee: number; commission: number }> = {
    starter: { fee: 99, commission: 5 }, growth: { fee: 199, commission: 15 }, pro: { fee: 299, commission: 25 },
  };
  const tier = TIERS[String(body.tier || "starter")] ? String(body.tier) : "starter";

  if (!name) return json({ error: "Please enter your name" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email" }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

  // already a partner with this email?
  const { data: dupe } = await admin.from("qv_partners").select("id").eq("email", email).maybeSingle();
  if (dupe) return json({ error: "A partner account with this email already exists. Just sign in." }, 409);

  // create the auth user (confirmed so they can sign in right away)
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { partner: true, name },
  });
  if (cErr || !created?.user) {
    const msg = (cErr?.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists"))
      return json({ error: "This email is already registered. Sign in instead." }, 409);
    return json({ error: cErr?.message || "Could not create account" }, 400);
  }
  const uid = created.user.id;

  // a readable, unique referral code: NAME + number
  const base = (name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6) || "PART");
  let code = "";
  for (let i = 0; i < 6; i++) {
    const n = 10 + Math.floor(Math.random() * (i < 2 ? 90 : 900));
    const candidate = base + n;
    const { data: exists } = await admin.from("qv_partners").select("id").eq("code", candidate).maybeSingle();
    if (!exists) { code = candidate; break; }
  }
  if (!code) code = base + Date.now().toString().slice(-5);

  const { error: iErr } = await admin.from("qv_partners").insert({
    auth_user_id: uid, name, email, phone: phone || null, code, status: "pending",
    tier, fee_monthly: TIERS[tier].fee, commission_pct: TIERS[tier].commission,
    payment_status: "unpaid", docs_verified: false,
  });
  if (iErr) {
    // best-effort cleanup so they can retry with the same email
    try { await admin.auth.admin.deleteUser(uid); } catch { /* ignore */ }
    return json({ error: "Could not create partner profile: " + iErr.message }, 500);
  }

  return json({ ok: true, code });
});
