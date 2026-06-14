// Calendar sync feed — serves a company's meetings as an iCalendar (.ics) feed.
// A phone Calendar app subscribes to:  .../calendar-feed?token=<companies.calendar_token>
// It refreshes periodically, so meetings sync automatically and the phone fires
// its own native reminders. Deploy WITHOUT JWT verification:
//   supabase functions deploy calendar-feed --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("APP_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const KIND: Record<string, string> = { meeting: "Meeting", site_visit: "Site Visit", call: "Call", followup: "Follow-up" };

function pad(n: number) { return String(n).padStart(2, "0"); }
function icsDate(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function esc(s: string) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
// Fold long lines to <=74 chars per the iCal spec.
function fold(line: string) {
  if (line.length <= 74) return line;
  let out = "", rest = line;
  while (rest.length > 74) { out += rest.slice(0, 74) + "\r\n "; rest = rest.slice(74); }
  return out + rest;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") || "").trim();
  if (!token) return new Response("Missing token", { status: 401 });

  const { data: co, error: coErr } = await admin.from("companies").select("id,name").eq("calendar_token", token).maybeSingle();
  if (coErr) return new Response("Server error", { status: 500 });
  if (!co) return new Response("Invalid token", { status: 401 });

  const { data: rows } = await admin.from("company_meetings")
    .select("id,title,start_at,kind,location,notes,remind_minutes,status,lead_name")
    .eq("company_id", co.id).neq("status", "cancelled")
    .order("start_at", { ascending: true }).limit(2000);

  const stamp = icsDate(new Date());
  const out: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tritova//Planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(co.name || "Tritova")} Planner`), fold(`NAME:${esc(co.name || "Tritova")} Planner`),
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  for (const m of rows || []) {
    if (!m.start_at) continue;
    const start = new Date(m.start_at);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const summary = `${KIND[m.kind] || "Meeting"}: ${m.title || m.lead_name || "Meeting"}`;
    const desc = [m.lead_name ? `Client: ${m.lead_name}` : "", m.notes || ""].filter(Boolean).join("\n");
    out.push("BEGIN:VEVENT");
    out.push(`UID:${m.id}@tritova-planner`);
    out.push(`DTSTAMP:${stamp}`);
    out.push(`DTSTART:${icsDate(start)}`);
    out.push(`DTEND:${icsDate(end)}`);
    out.push(fold(`SUMMARY:${esc(summary)}`));
    if (m.location) out.push(fold(`LOCATION:${esc(m.location)}`));
    if (desc) out.push(fold(`DESCRIPTION:${esc(desc)}`));
    out.push(`STATUS:${m.status === "done" ? "CONFIRMED" : "TENTATIVE"}`);
    const rem = Number(m.remind_minutes) || 0;
    if (rem > 0) {
      out.push("BEGIN:VALARM", `TRIGGER:-PT${rem}M`, "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM");
    }
    out.push("END:VEVENT");
  }
  out.push("END:VCALENDAR");

  return new Response(out.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="tritova-planner.ics"',
      "Cache-Control": "public, max-age=900",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
