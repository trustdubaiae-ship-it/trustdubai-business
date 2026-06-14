// tritova-business/src/pages/StaffManagement.jsx
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { PERMISSIONS, presetForRole, allPermsTrue, allPermsFalse } from "../lib/permissions";

const BRAND = "#0099cc";
const PLAN_RANK = { free:0, silver:1, gold:2, platinum:3 };

const BUILTIN_ROLES = [
  { value: "manager",  label: "Manager" },
  { value: "sales",    label: "Sales" },
  { value: "engineer", label: "Engineer" },
  { value: "staff",    label: "Staff" },
];

const STATUS_BADGE = {
  invited:  { label: "Invited",  bg: "#fef3c7", fg: "#b45309" },
  active:   { label: "Active",   bg: "#dcfce7", fg: "#15803d" },
  inactive: { label: "Inactive", bg: "#e5e7eb", fg: "#6b7280" },
};

export default function StaffManagement() {
  const { company } = useAuth();
  const [staff, setStaff] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [limit, setLimit] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [manageStaff, setManageStaff] = useState(null);

  const planName = (company?.plan || "free").toLowerCase();
  const canCustomRoles = (PLAN_RANK[planName] || 0) >= PLAN_RANK.gold;

  const loadAll = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    const { data: pl } = await supabase
      .from("plan_limits").select("staff_limit").eq("plan", planName).maybeSingle();
    setLimit(pl?.staff_limit ?? 1);

    const { data: st } = await supabase
      .from("business_staff").select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true });
    setStaff(st || []);

    const { data: cr } = await supabase
      .from("company_roles").select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true });
    setCustomRoles(cr || []);

    setLoading(false);
  }, [company, planName]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const activeCount = staff.filter((s) => s.active).length;
  const slotsLeft = Math.max(0, limit - activeCount);
  const canAdd = slotsLeft > 0;

  // active staff list (reassign target ke liye, current ko chhod ke)
  const activeStaff = staff.filter((s) => s.active && s.status !== "inactive");

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Loading staff…</div>;

  return (
    <div style={{ padding: "clamp(16px,4vw,24px)", maxWidth: 880, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Team / Staff</h1>
        <button onClick={() => setShowAdd(true)} disabled={!canAdd}
          style={{ padding: "9px 16px", borderRadius: 9, border: "none", color: "#fff",
            fontWeight: 600, fontSize: 13, cursor: canAdd ? "pointer" : "not-allowed",
            opacity: canAdd ? 1 : 0.4, background: BRAND }}>
          + Add Staff
        </button>
      </div>

      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        {company?.name} · Plan: <b style={{ textTransform: "capitalize" }}>{planName}</b> ·{" "}
        <b style={{ color: BRAND }}>{activeCount}/{limit}</b> slots used
        {!canAdd && <span style={{ color: "#d97706" }}> · Limit reached — upgrade plan for more staff</span>}
      </p>

      {staff.length === 0 ? (
        <div style={{ background: "#f8fafc", borderRadius: 16, padding: 40, textAlign: "center", color: "#94a3b8" }}>
          No staff yet. Click "+ Add Staff" to add a team member.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staff.map((s) => {
            const badge = STATUS_BADGE[s.status] || STATUS_BADGE.invited;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                flexWrap: "wrap", gap: 10,
                background: "#fff", border: "0.5px solid #e2e8f0", borderRadius: 12, padding: 14,
                opacity: s.active ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 180px" }}>
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
                  <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 99, background: badge.bg, color: badge.fg }}>{badge.label}</span>
                  <button onClick={() => setManageStaff(s)}
                    style={{ fontSize: 12, color: BRAND, fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
                    Manage
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddStaffModal company={company} canAdd={canAdd} customRoles={customRoles}
          canCustomRoles={canCustomRoles} onRolesChanged={loadAll}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); loadAll(); }} />
      )}

      {manageStaff && (
        <ManageStaffModal staff={manageStaff} company={company} slotsLeft={slotsLeft}
          customRoles={customRoles} canCustomRoles={canCustomRoles} onRolesChanged={loadAll}
          activeStaff={activeStaff}
          onClose={() => setManageStaff(null)}
          onChanged={() => { setManageStaff(null); loadAll(); }} />
      )}
    </div>
  );
}

/* ---------- Role selector (built-in + custom + add new) ---------- */
function RoleSelect({ role, setRole, customRoles, canCustomRoles, company, onRolesChanged, onPickPreset }) {
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function addRole() {
    setErr("");
    if (!newRoleName.trim()) { setErr("Role name required."); return; }
    setSaving(true);
    const { data, error } = await supabase.from("company_roles").insert({
      company_id: company.id,
      name: newRoleName.trim(),
      permissions: allPermsFalse(),
    }).select("*").maybeSingle();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setNewRoleName(""); setShowAddRole(false);
    if (data) { setRole(data.name); onPickPreset(data.permissions || allPermsFalse()); }
    onRolesChanged();
  }

  function onChange(val) {
    if (val === "__add__") { setShowAddRole(true); return; }
    setRole(val);
    const custom = customRoles.find(r => r.name === val);
    if (custom) onPickPreset(custom.permissions || allPermsFalse());
    else onPickPreset(presetForRole(val));
  }

  return (
    <div>
      <label style={lbl}>Role</label>
      <select value={role} onChange={(e) => onChange(e.target.value)} style={inp}>
        <optgroup label="Built-in">
          {BUILTIN_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </optgroup>
        {customRoles.length > 0 && (
          <optgroup label="Custom">
            {customRoles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </optgroup>
        )}
        {canCustomRoles && <option value="__add__">＋ Add custom role…</option>}
      </select>

      {!canCustomRoles && (
        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: -8, marginBottom: 12 }}>
          Custom roles available on Gold &amp; Platinum plans.
        </p>
      )}

      {showAddRole && (
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <label style={lbl}>New Role Name</label>
          <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="e.g. Site Supervisor" style={inp} />
          {err && <p style={errStyle}>{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setShowAddRole(false); setErr(""); }} style={{ ...outlineBtn, marginBottom: 0, flex: 1 }}>Cancel</button>
            <button onClick={addRole} disabled={saving} style={{ ...primaryBtn, marginBottom: 0, flex: 1, opacity: saving ? 0.5 : 1 }}>
              {saving ? "Adding…" : "Add Role"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Permission tick boxes + Select/Clear ---------- */
function PermissionBoxes({ perms, setPerms }) {
  function toggle(key) { setPerms((p) => ({ ...p, [key]: !p[key] })); }
  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: 12, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: "#64748b" }}>Permissions (what this member can access)</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPerms(allPermsTrue())} style={miniBtn}>Select All</button>
          <button onClick={() => setPerms(allPermsFalse())} style={miniBtn}>Clear All</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {PERMISSIONS.map((p) => (
          <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#0f172a", cursor: "pointer" }}>
            <input type="checkbox" checked={!!perms[p.key]} onChange={() => toggle(p.key)}
              style={{ accentColor: BRAND, width: 15, height: 15 }} />
            {p.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/* ---------- Add Staff ---------- */
function AddStaffModal({ company, canAdd, customRoles, canCustomRoles, onRolesChanged, onClose, onAdded }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales");
  const [perms, setPerms] = useState(presetForRole("sales"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!canAdd) { setError("Plan limit reached."); return; }
    if (!name.trim() || !email.trim()) { setError("Name and email are required."); return; }
    const cleanEmail = email.trim().toLowerCase();
    setSaving(true);
    const { data: dup } = await supabase
      .from("business_staff").select("id")
      .eq("company_id", company.id).ilike("email", cleanEmail).eq("active", true).maybeSingle();
    if (dup) { setSaving(false); setError("This email is already in the team."); return; }

    const { error: insErr } = await supabase.from("business_staff").insert({
      company_id: company.id, name: name.trim(), email: cleanEmail,
      role, permissions: perms, status: "invited", active: true,
    });
    setSaving(false);
    if (insErr) { setError(insErr.message); return; }
    onAdded();
  }

  return (
    <Modal onClose={onClose}>
      <h4 style={{ fontWeight: 700, color: "#0f172a", marginTop: 0, marginBottom: 16 }}>Add Team Member</h4>

      <label style={lbl}>Full Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ahmed Khan" style={inp} />

      <label style={lbl}>Email (Google account)</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" style={{ ...inp, marginBottom: 4 }} />
      <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 0, marginBottom: 12 }}>
        An invite will be sent to this email. The staff member will sign in with this Google account.
      </p>

      <RoleSelect role={role} setRole={setRole} customRoles={customRoles}
        canCustomRoles={canCustomRoles} company={company} onRolesChanged={onRolesChanged}
        onPickPreset={setPerms} />

      <PermissionBoxes perms={perms} setPerms={setPerms} />

      {error && <p style={errStyle}>{error}</p>}

      <button onClick={submit} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.5 : 1 }}>
        {saving ? "Adding…" : "Add & Send Invite"}
      </button>
    </Modal>
  );
}

/* ---------- Manage Staff ---------- */
function ManageStaffModal({ staff, company, slotsLeft, customRoles, canCustomRoles, onRolesChanged, activeStaff, onClose, onChanged }) {
  const [role, setRole] = useState(staff.role);
  const [perms, setPerms] = useState(staff.permissions || presetForRole(staff.role));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showChange, setShowChange] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [confirmDeact, setConfirmDeact] = useState(false);

  // reassign state
  const [pendingCount, setPendingCount] = useState(null);  // null = abhi load nahi
  const [reassignTo, setReassignTo] = useState("");          // "" = owner

  const badge = STATUS_BADGE[staff.status] || STATUS_BADGE.invited;

  // deactivate confirm khulte hi staff ke pending notifications count nikaalo
  useEffect(() => {
    if (!confirmDeact || !staff.id) return;
    supabase.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_staff_id", staff.id)
      .in("status", ["unread", "noted", "in_progress"])
      .then(({ count }) => setPendingCount(count ?? 0));
  }, [confirmDeact, staff.id]);

  // reassign target options (current staff ko chhod ke, active hi)
  const reassignOptions = (activeStaff || []).filter((s) => s.id !== staff.id);

  async function saveRolePerms() {
    setBusy(true); setError("");
    const { error: e } = await supabase.from("business_staff")
      .update({ role, permissions: perms }).eq("id", staff.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onChanged();
  }

  async function changeStaff() {
    setError("");
    if (!newName.trim() || !newEmail.trim()) { setError("New name and email are required."); return; }
    const cleanEmail = newEmail.trim().toLowerCase();
    setBusy(true);
    const { data: dup } = await supabase
      .from("business_staff").select("id")
      .eq("company_id", company.id).ilike("email", cleanEmail).eq("active", true).neq("id", staff.id).maybeSingle();
    if (dup) { setBusy(false); setError("This email is already in the team."); return; }
    const { error: e } = await supabase.from("business_staff").update({
      name: newName.trim(), email: cleanEmail, status: "invited", user_id: null,
    }).eq("id", staff.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onChanged();
  }

  // DEACTIVATE — pending notifications reassign + slot band
  async function deactivate() {
    setBusy(true); setError("");

    // 1) REASSIGN: is staff ke pending notifications doosre ko transfer
    //    reassignTo = "" matlab owner ko (recipient_staff_id null = owner/manager sab dekhte hain)
    const newRecipient = reassignTo || null;
    const { error: rErr } = await supabase.from("notifications")
      .update({ recipient_staff_id: newRecipient })
      .eq("recipient_staff_id", staff.id)
      .in("status", ["unread", "noted", "in_progress"]);
    if (rErr) { setBusy(false); setError(rErr.message); return; }

    // 2) slot band
    const { error: e } = await supabase.from("business_staff").update({
      active: false, status: "inactive", user_id: null,
    }).eq("id", staff.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onChanged();
  }

  async function reactivate() {
    if (slotsLeft <= 0) { setError("No free slot. Deactivate a slot or upgrade your plan first."); return; }
    setBusy(true); setError("");
    const { error: e } = await supabase.from("business_staff").update({
      active: true, status: "invited",
    }).eq("id", staff.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    onChanged();
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: BRAND, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}>
          {staff.name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>{staff.name}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{staff.email}</div>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 11, padding: "3px 9px", borderRadius: 99, background: badge.bg, color: badge.fg }}>
          {badge.label}
        </span>
      </div>

      {error && <p style={errStyle}>{error}</p>}

      <RoleSelect role={role} setRole={setRole} customRoles={customRoles}
        canCustomRoles={canCustomRoles} company={company} onRolesChanged={onRolesChanged}
        onPickPreset={setPerms} />

      <PermissionBoxes perms={perms} setPerms={setPerms} />

      <button onClick={saveRolePerms} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>
        {busy ? "Saving…" : "Save Role & Permissions"}
      </button>

      {!showChange ? (
        <button onClick={() => setShowChange(true)} style={outlineBtn}>
          🔄 Change Staff (replace person, keep slot &amp; data)
        </button>
      ) : (
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 0, marginBottom: 10 }}>
            A new person will take over this slot. The old email login will be disabled, and all data (history/role) stays the same.
          </p>
          <label style={lbl}>New Staff Name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New person name" style={inp} />
          <label style={lbl}>New Email (Google account)</label>
          <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" style={inp} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowChange(false)} style={{ ...outlineBtn, marginBottom: 0, flex: 1 }}>Cancel</button>
            <button onClick={changeStaff} disabled={busy} style={{ ...primaryBtn, marginBottom: 0, flex: 1, opacity: busy ? 0.5 : 1 }}>
              {busy ? "Saving…" : "Confirm Change"}
            </button>
          </div>
        </div>
      )}

      {staff.active ? (
        !confirmDeact ? (
          <button onClick={() => setConfirmDeact(true)} style={dangerBtn}>⛔ Deactivate Slot</button>
        ) : (
          <div style={{ background: "#fef2f2", borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 0, marginBottom: 10 }}>
              Are you sure you want to deactivate? Login will be disabled, data stays safe, and the plan slot will be freed.
            </p>

            {/* Reassign pending notifications */}
            {pendingCount === null ? (
              <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 0, marginBottom: 10 }}>Checking pending tasks…</p>
            ) : pendingCount > 0 ? (
              <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 9, padding: 10, marginBottom: 10 }}>
                <p style={{ fontSize: 12, color: "#0f172a", marginTop: 0, marginBottom: 8 }}>
                  This member has <b>{pendingCount}</b> pending notification{pendingCount > 1 ? "s" : ""}. Transfer them to:
                </p>
                <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} style={{ ...inp, marginBottom: 0 }}>
                  <option value="">Owner / Management</option>
                  {reassignOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "#15803d", marginTop: 0, marginBottom: 10 }}>
                ✓ No pending tasks to transfer.
              </p>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setConfirmDeact(false); setPendingCount(null); }} style={{ ...outlineBtn, marginBottom: 0, flex: 1 }}>Cancel</button>
              <button onClick={deactivate} disabled={busy} style={{ ...dangerBtn, marginBottom: 0, flex: 1, opacity: busy ? 0.5 : 1 }}>
                {busy ? "…" : "Yes, Deactivate"}
              </button>
            </div>
          </div>
        )
      ) : (
        <button onClick={reactivate} disabled={busy} style={{ ...primaryBtn, background: "#15803d", opacity: busy ? 0.5 : 1 }}>
          ♻️ Reactivate Slot
        </button>
      )}
    </Modal>
  );
}

/* ---------- Shared Modal ---------- */
function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, padding: 20, maxHeight: "92vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const lbl = { fontSize: 12, color: "#64748b", display: "block" };
const inp = {
  width: "100%", marginTop: 4, marginBottom: 14, border: "1px solid #e2e8f0",
  borderRadius: 9, padding: "9px 12px", fontSize: 13, boxSizing: "border-box",
};
const primaryBtn = {
  width: "100%", padding: "11px", borderRadius: 9, border: "none", color: "#fff",
  fontWeight: 600, fontSize: 13, background: BRAND, cursor: "pointer", marginBottom: 10,
};
const outlineBtn = {
  width: "100%", padding: "11px", borderRadius: 9, border: "1px solid #e2e8f0", color: "#0f172a",
  fontWeight: 600, fontSize: 13, background: "#fff", cursor: "pointer", marginBottom: 10,
};
const dangerBtn = {
  width: "100%", padding: "11px", borderRadius: 9, border: "none", color: "#fff",
  fontWeight: 600, fontSize: 13, background: "#dc2626", cursor: "pointer", marginBottom: 10,
};
const miniBtn = {
  fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #e2e8f0",
  background: "#fff", color: BRAND, cursor: "pointer", fontWeight: 600,
};
const errStyle = { fontSize: 12, color: "#dc2626", marginBottom: 12 };
