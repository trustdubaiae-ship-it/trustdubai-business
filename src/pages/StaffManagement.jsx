// trustdubai-business/src/pages/StaffManagement.jsx
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

const BRAND = "#0099cc";

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
  const { company } = useAuth();
  const [staff, setStaff] = useState([]);
  const [limit, setLimit] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const loadAll = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);

    const planKey = (company.plan || "free").toLowerCase();
    const { data: pl } = await supabase
      .from("plan_limits").select("staff_limit").eq("plan", planKey).maybeSingle();
    setLimit(pl?.staff_limit ?? 1);

    const { data: st } = await supabase
      .from("business_staff").select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true });
    setStaff(st || []);
    setLoading(false);
  }, [company]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const activeCount = staff.filter((s) => s.active).length;
  const slotsLeft = Math.max(0, limit - activeCount);
  const canAdd = slotsLeft > 0;

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Loading staff…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Team / Staff</h1>
        <button
          onClick={() => setShowAdd(true)}
          disabled={!canAdd}
          style={{ padding: "9px 16px", borderRadius: 9, border: "none", color: "#fff",
            fontWeight: 600, fontSize: 13, cursor: canAdd ? "pointer" : "not-allowed",
            opacity: canAdd ? 1 : 0.4, background: BRAND }}
        >
          + Add Staff
        </button>
      </div>

      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        {company?.name} · Plan: <b style={{ textTransform: "capitalize" }}>{company?.plan || "free"}</b> ·{" "}
        <b style={{ color: BRAND }}>{activeCount}/{limit}</b> slots used
        {!canAdd && <span style={{ color: "#d97706" }}> · Limit reached — upgrade plan for more staff</span>}
      </p>

      {staff.length === 0 ? (
        <div style={{ background: "#f8fafc", borderRadius: 16, padding: 40, textAlign: "center", color: "#94a3b8" }}>
          Abhi koi staff nahi. "+ Add Staff" se team member add karo.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staff.map((s) => {
            const badge = STATUS_BADGE[s.status] || STATUS_BADGE.invited;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: 14,
                opacity: s.active ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: BRAND, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>
                    {s.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{s.email}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: "#eff6ff", color: "#1d4ed8", textTransform: "capitalize" }}>{s.role}</span>
                  <span className={badge.cls} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99 }}>{badge.label}</span>
                  <button disabled style={{ fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "default" }}>Manage</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddStaffModal company={company} canAdd={canAdd}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); loadAll(); }} />
      )}
    </div>
  );
}

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

    const { data: dup } = await supabase
      .from("business_staff").select("id")
      .eq("company_id", company.id).ilike("email", cleanEmail).eq("active", true).maybeSingle();
    if (dup) { setSaving(false); setError("Ye email already team mein hai."); return; }

    const { error: insErr } = await supabase.from("business_staff").insert({
      company_id: company.id, name: name.trim(), email: cleanEmail,
      role, status: "invited", active: true,
    });
    setSaving(false);
    if (insErr) { setError(insErr.message); return; }
    onAdded();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, padding: 20 }}>
        <h4 style={{ fontWeight: 700, color: "#0f172a", marginTop: 0, marginBottom: 16 }}>Add Team Member</h4>

        <label style={{ fontSize: 12, color: "#64748b" }}>Full Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ahmed Khan"
          style={inp} />

        <label style={{ fontSize: 12, color: "#64748b" }}>Email (Google account)</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com"
          style={{ ...inp, marginBottom: 4 }} />
        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 0, marginBottom: 12 }}>
          Is email pe invite jaayega. Staff isi Google account se login karega.
        </p>

        <label style={{ fontSize: 12, color: "#64748b" }}>Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} style={inp}>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        {error && <p style={{ fontSize: 12, color: "#dc2626", marginBottom: 12 }}>{error}</p>}

        <button onClick={submit} disabled={saving}
          style={{ width: "100%", padding: "11px", borderRadius: 9, border: "none", color: "#fff",
            fontWeight: 600, background: BRAND, cursor: "pointer", opacity: saving ? 0.5 : 1 }}>
          {saving ? "Adding…" : "Add & Send Invite"}
        </button>
      </div>
    </div>
  );
}

const inp = {
  width: "100%", marginTop: 4, marginBottom: 14, border: "1px solid #e2e8f0",
  borderRadius: 9, padding: "9px 12px", fontSize: 13, boxSizing: "border-box",
};
