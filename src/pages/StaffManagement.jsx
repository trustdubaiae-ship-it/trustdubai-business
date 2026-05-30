// trustdubai-business/src/pages/StaffManagement.jsx
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

const BRAND = "#0099cc";

// role presets — permissions baad mein 3b/Settings mein detail karenge
const ROLES = [
  { value: "manager",  label: "Manager" },
  { value: "sales",    label: "Sales" },
  { value: "engineer", label: "Engineer" },
  { value: "staff",    label: "Staff" },
];

const STATUS_BADGE = {
  invited:  { label: "Invited",  cls: "bg-amber-100 text-amber-700" },
  active:   { label: "Active",   cls: "bg-green-100 text-green-700" },
  inactive: { label: "Inactive", cls: "bg-gray-200 text-gray-500" },
};

export default function StaffManagement() {
  const [company, setCompany] = useState(null);
  const [staff, setStaff] = useState([]);
  const [limit, setLimit] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState("");

  // current company nikaalo (logged-in owner ka email -> companies.owner_email)
  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Login required."); setLoading(false); return; }

    // company by owner_email
    const { data: comp, error: cErr } = await supabase
      .from("companies")
      .select("id, name, plan, owner_email")
      .ilike("owner_email", user.email)
      .maybeSingle();

    if (cErr || !comp) {
      setErr("Company nahi mili is account se. Owner email check karo.");
      setLoading(false);
      return;
    }
    setCompany(comp);

    // plan limit
    const planKey = (comp.plan || "free").toLowerCase();
    const { data: pl } = await supabase
      .from("plan_limits")
      .select("staff_limit")
      .eq("plan", planKey)
      .maybeSingle();
    setLimit(pl?.staff_limit ?? 1);

    // staff list (active slots — inactive bhi dikhayenge par alag)
    const { data: st } = await supabase
      .from("business_staff")
      .select("*")
      .eq("company_id", comp.id)
      .order("created_at", { ascending: true });
    setStaff(st || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // active slot count = limit ke against ye ginte hain
  const activeCount = staff.filter((s) => s.active).length;
  const slotsLeft = Math.max(0, limit - activeCount);
  const canAdd = slotsLeft > 0;

  if (loading) {
    return <div className="p-8 text-gray-400">Loading staff…</div>;
  }

  if (err) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">{err}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Team / Staff</h1>
        <button
          onClick={() => setShowAdd(true)}
          disabled={!canAdd}
          className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-40 hover:opacity-90 transition"
          style={{ backgroundColor: BRAND }}
        >
          + Add Staff
        </button>
      </div>

      {/* plan usage line */}
      <p className="text-sm text-gray-500 mb-5">
        {company.name} · Plan: <span className="font-medium capitalize">{company.plan || "free"}</span> ·{" "}
        <span className="font-medium" style={{ color: BRAND }}>
          {activeCount}/{limit}
        </span>{" "}
        slots used
        {!canAdd && (
          <span className="text-amber-600"> · Limit reached — upgrade plan for more staff</span>
        )}
      </p>

      {/* staff list */}
      {staff.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-10 text-center text-gray-400">
          Abhi koi staff nahi. “+ Add Staff” se team member add karo.
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map((s) => {
            const badge = STATUS_BADGE[s.status] || STATUS_BADGE.invited;
            return (
              <div
                key={s.id}
                className={`flex items-center justify-between bg-white border border-gray-100 rounded-xl p-4 shadow-sm ${!s.active ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shrink-0"
                    style={{ backgroundColor: BRAND }}
                  >
                    {s.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{s.name}</p>
                    <p className="text-xs text-gray-500 truncate">{s.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 capitalize">
                    {s.role}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full ${badge.cls}`}>
                    {badge.label}
                  </span>
                  {/* 3b mein active karenge */}
                  <button className="text-xs text-gray-400 hover:text-gray-600" disabled>
                    Manage
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Staff modal */}
      {showAdd && (
        <AddStaffModal
          company={company}
          canAdd={canAdd}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); loadAll(); }}
        />
      )}
    </div>
  );
}

/* ---------- Add Staff Modal ---------- */
function AddStaffModal({ company, canAdd, onClose, onAdded }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!canAdd) { setError("Plan limit reached."); return; }
    if (!name.trim() || !email.trim()) { setError("Name aur email zaroori hai."); return; }

    const cleanEmail = email.trim().toLowerCase();

    setSaving(true);

    // duplicate check (same email, same company, active)
    const { data: dup } = await supabase
      .from("business_staff")
      .select("id")
      .eq("company_id", company.id)
      .ilike("email", cleanEmail)
      .eq("active", true)
      .maybeSingle();

    if (dup) {
      setSaving(false);
      setError("Ye email already team mein hai.");
      return;
    }

    // insert as 'invited' — Google login pe 'active' hoga (3c)
    const { error: insErr } = await supabase.from("business_staff").insert({
      company_id: company.id,
      name: name.trim(),
      email: cleanEmail,
      role,
      status: "invited",
      active: true,
    });

    setSaving(false);
    if (insErr) { setError(insErr.message); return; }
    onAdded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-semibold text-gray-900 mb-4">Add Team Member</h4>

        <label className="text-xs text-gray-500">Full Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ahmed Khan"
          className="w-full mt-1 mb-3 border rounded-lg px-3 py-2 text-sm"
        />

        <label className="text-xs text-gray-500">Email (Google account)</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="staff@example.com"
          className="w-full mt-1 mb-1 border rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-[11px] text-gray-400 mb-3">
          Is email pe invite jaayega. Staff isi Google account se login karega.
        </p>

        <label className="text-xs text-gray-500">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full mt-1 mb-4 border rounded-lg px-3 py-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <button
          onClick={submit}
          disabled={saving}
          className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          {saving ? "Adding…" : "Add & Send Invite"}
        </button>
      </div>
    </div>
  );
}
