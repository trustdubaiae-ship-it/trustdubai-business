// Projects & Ops — projects (from won quotes), material requests and site
// expenses with a budget/profit summary. Company-scoped (RLS).
import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

const PSTATUS = {
  planning:  { label: 'Planning',  color: '#64748b' },
  ongoing:   { label: 'Ongoing',   color: '#0099cc' },
  on_hold:   { label: 'On Hold',   color: '#f59e0b' },
  completed: { label: 'Completed', color: '#22c55e' },
  cancelled: { label: 'Cancelled', color: '#ef4444' },
}
const MSTATUS = { requested: { l: 'Requested', c: '#64748b' }, approved: { l: 'Approved', c: '#0099cc' }, ordered: { l: 'Ordered', c: '#f59e0b' }, received: { l: 'Received', c: '#22c55e' } }
const ECAT = { labour: { l: 'Labour', c: '#8b5cf6' }, material: { l: 'Material', c: '#0099cc' }, transport: { l: 'Transport', c: '#f59e0b' }, misc: { l: 'Misc', c: '#64748b' } }
const AED = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
const fmtD = d => d ? new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function ProjectsPage({ onNavigate }) {
  const { company, user } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')
  const [active, setActive] = useState(null)
  const [tab, setTab] = useState('overview')
  const [materials, setMaterials] = useState([])
  const [expenses, setExpenses] = useState([])
  const [projModal, setProjModal] = useState(null)
  const [matForm, setMatForm] = useState(null)
  const [expForm, setExpForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (company?.id) loadProjects() }, [company?.id])

  async function loadProjects() {
    setLoading(true)
    await backfillFromQuotes()
    const { data } = await supabase.from('ops_projects').select('*').eq('company_id', company.id).order('created_at', { ascending: false }).limit(500)
    setProjects(data || []); setLoading(false)
  }
  // Auto-create a project for any approved quotation that doesn't have one yet.
  async function backfillFromQuotes() {
    try {
      const { data: quotes } = await supabase.from('quotations')
        .select('id,project_title,client_id,client_name,client_phone,total,location')
        .eq('company_id', company.id).eq('status', 'approved').limit(500)
      if (!quotes?.length) return
      const { data: existing } = await supabase.from('ops_projects').select('quote_id').eq('company_id', company.id).not('quote_id', 'is', null)
      const have = new Set((existing || []).map(p => p.quote_id))
      const rows = quotes.filter(q => !have.has(q.id)).map(q => ({
        company_id: company.id, quote_id: q.id,
        name: q.project_title || `Project — ${q.client_name || 'Client'}`,
        client_id: q.client_id || null, client_name: q.client_name || null, client_phone: q.client_phone || null,
        status: 'planning', contract_value: Number(q.total) || 0, location: q.location || null,
        created_by_email: user?.email || null,
      }))
      if (rows.length) await supabase.from('ops_projects').insert(rows)
    } catch (e) { console.error('backfillFromQuotes', e) }
  }
  async function openProject(p) {
    setActive(p); setTab('overview'); setView('detail'); setMaterials([]); setExpenses([])
    reloadChildren(p.id)
  }
  async function reloadChildren(pid) {
    const id = pid || active?.id; if (!id) return
    const [m, e] = await Promise.all([
      supabase.from('material_requests').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('site_expenses').select('*').eq('project_id', id).order('spent_on', { ascending: false }),
    ])
    setMaterials(m.data || []); setExpenses(e.data || [])
  }

  function newProject() { setProjModal({ isNew: true, p: { name: '', client_name: '', client_phone: '', status: 'planning', contract_value: 0, start_date: '', end_date: '', location: '', notes: '', progress: 0 } }) }
  function editProject(p) { setProjModal({ isNew: false, p: { ...p, start_date: p.start_date || '', end_date: p.end_date || '' } }) }
  async function saveProject() {
    const p = projModal.p
    if (!p.name?.trim()) { toast.error('Project name is required'); return }
    setSaving(true)
    try {
      const payload = { company_id: company.id, name: p.name.trim(), client_name: p.client_name || null, client_phone: p.client_phone || null, status: p.status || 'planning', contract_value: Number(p.contract_value) || 0, start_date: p.start_date || null, end_date: p.end_date || null, progress: parseInt(p.progress) || 0, location: p.location || null, notes: p.notes || null, updated_at: new Date().toISOString() }
      if (projModal.isNew) { payload.created_by_email = user?.email || null; const { error } = await supabase.from('ops_projects').insert(payload); if (error) throw error }
      else { const { error } = await supabase.from('ops_projects').update(payload).eq('id', p.id).eq('company_id', company.id); if (error) throw error; if (active?.id === p.id) setActive({ ...active, ...payload }) }
      setProjModal(null); toast.success('Project saved ✓'); await loadProjects()
    } catch (e) { console.error(e); toast.error('Save failed: ' + (e?.message || e)) } finally { setSaving(false) }
  }
  async function deleteProject(id) {
    if (!window.confirm('Delete this project with all its materials & expenses? This cannot be undone.')) return
    try {
      await supabase.from('site_expenses').delete().eq('project_id', id).eq('company_id', company.id)
      await supabase.from('material_requests').delete().eq('project_id', id).eq('company_id', company.id)
      await supabase.from('ops_projects').delete().eq('id', id).eq('company_id', company.id)
      toast.success('Project deleted'); setView('list'); setActive(null); loadProjects()
    } catch (e) { console.error(e); toast.error('Delete failed') }
  }
  async function patchActive(patch) {
    if (!active) return
    const { error } = await supabase.from('ops_projects').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', active.id).eq('company_id', company.id)
    if (error) { toast.error('Update failed'); return }
    setActive(a => ({ ...a, ...patch })); setProjects(ps => ps.map(x => x.id === active.id ? { ...x, ...patch } : x))
  }

  async function saveMaterial() {
    const m = matForm
    if (!m.item?.trim()) { toast.error('Item is required'); return }
    setSaving(true)
    try {
      const payload = { company_id: company.id, project_id: active.id, item: m.item.trim(), quantity: Number(m.quantity) || 1, unit: m.unit || null, vendor: m.vendor || null, est_cost: Number(m.est_cost) || 0, status: m.status || 'requested', notes: m.notes || null }
      if (m.id) { const { error } = await supabase.from('material_requests').update(payload).eq('id', m.id).eq('company_id', company.id); if (error) throw error }
      else { const { error } = await supabase.from('material_requests').insert(payload); if (error) throw error }
      setMatForm(null); toast.success('Saved ✓'); reloadChildren()
    } catch (e) { console.error(e); toast.error('Save failed: ' + (e?.message || e)) } finally { setSaving(false) }
  }
  async function delMaterial(id) { try { await supabase.from('material_requests').delete().eq('id', id).eq('company_id', company.id); reloadChildren() } catch (e) { toast.error('Delete failed') } }
  async function setMatStatus(m, st) { try { await supabase.from('material_requests').update({ status: st }).eq('id', m.id).eq('company_id', company.id); reloadChildren() } catch (e) { toast.error('Update failed') } }

  async function saveExpense() {
    const x = expForm
    if (!(Number(x.amount) > 0)) { toast.error('Enter an amount'); return }
    setSaving(true)
    try {
      const payload = { company_id: company.id, project_id: active.id, category: x.category || 'material', description: x.description || null, amount: Number(x.amount) || 0, spent_on: x.spent_on || null }
      if (x.id) { const { error } = await supabase.from('site_expenses').update(payload).eq('id', x.id).eq('company_id', company.id); if (error) throw error }
      else { const { error } = await supabase.from('site_expenses').insert(payload); if (error) throw error }
      setExpForm(null); toast.success('Saved ✓'); reloadChildren()
    } catch (e) { console.error(e); toast.error('Save failed: ' + (e?.message || e)) } finally { setSaving(false) }
  }
  async function delExpense(id) { try { await supabase.from('site_expenses').delete().eq('id', id).eq('company_id', company.id); reloadChildren() } catch (e) { toast.error('Delete failed') } }

  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const totalMaterials = materials.reduce((s, m) => s + (Number(m.est_cost) || 0), 0)
  const value = Number(active?.contract_value) || 0
  const margin = value - totalExpenses
  const marginPct = value > 0 ? Math.round((margin / value) * 100) : 0

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }
  const input = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2,rgba(127,127,127,0.05))', color: 'var(--text)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl = { fontSize: 11.5, color: 'var(--text2)', display: 'block', marginBottom: 5, fontWeight: 600 }
  const Badge = ({ c, children }) => <span style={{ background: c + '1f', color: c, fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 99 }}>{children}</span>

  // ===== LIST =====
  if (view === 'list') {
    const totals = { value: projects.reduce((s, p) => s + (Number(p.contract_value) || 0), 0), ongoing: projects.filter(p => p.status === 'ongoing').length }
    return (
      <div style={{ color: 'var(--text)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 className="font-syne fw-700" style={{ fontSize: 23, margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}><i className="ti ti-briefcase" style={{ color: '#0099cc' }} /> Projects</h1>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Track jobs, materials & site expenses — profit at a glance.</p>
          </div>
          <button onClick={newProject} className="btn btn-primary"><i className="ti ti-plus" style={{ verticalAlign: '-2px', marginRight: 4 }} /> New project</button>
        </div>

        {projects.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
            {[['Projects', projects.length], ['Ongoing', totals.ongoing], ['Total value', AED(totals.value)]].map(([k, v]) => (
              <div key={k} style={{ ...card, padding: '12px 14px' }}><div style={{ fontSize: 11, color: 'var(--text2)' }}>{k}</div><div style={{ fontSize: 19, fontWeight: 700, marginTop: 2 }}>{v}</div></div>
            ))}
          </div>
        )}

        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading…</div>
          : projects.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '50px 20px' }}>
              <i className="ti ti-briefcase-off" style={{ fontSize: 34, color: 'var(--text3)', display: 'block', marginBottom: 10 }} />
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>No projects yet</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Approve a quotation to auto-create a project, or add one manually.</div>
              <button onClick={newProject} className="btn btn-primary"><i className="ti ti-plus" /> New project</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
              {projects.map(p => {
                const st = PSTATUS[p.status] || PSTATUS.planning
                return (
                  <div key={p.id} onClick={() => openProject(p)} style={{ ...card, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, wordBreak: 'break-word' }}>{p.name}</div>
                      <Badge c={st.color}>{st.label}</Badge>
                    </div>
                    {p.client_name && <div style={{ fontSize: 12.5, color: 'var(--text2)' }}><i className="ti ti-user" style={{ fontSize: 13, verticalAlign: '-1px' }} /> {p.client_name}</div>}
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0099cc' }}>{AED(p.contract_value)}</div>
                    <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: (p.progress || 0) + '%', height: '100%', background: st.color }} /></div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', justifyContent: 'space-between' }}><span>{p.progress || 0}% done</span><span>{fmtD(p.end_date)}</span></div>
                  </div>
                )
              })}
            </div>
          )}

        {projModal && ProjectModal()}
      </div>
    )
  }

  // ===== DETAIL =====
  const st = PSTATUS[active.status] || PSTATUS.planning
  return (
    <div style={{ color: 'var(--text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => { setView('list'); setActive(null) }} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', cursor: 'pointer', flexShrink: 0 }}><i className="ti ti-arrow-left" style={{ fontSize: 16 }} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="font-syne fw-700" style={{ fontSize: 20, margin: 0, wordBreak: 'break-word' }}>{active.name}</h1>
          <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>{active.client_name || 'No client'}{active.location ? ' · ' + active.location : ''}</div>
        </div>
        <button onClick={() => editProject(active)} className="btn btn-secondary btn-sm"><i className="ti ti-edit" /> Edit</button>
        <button onClick={() => deleteProject(active.id)} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}><i className="ti ti-trash" style={{ fontSize: 15 }} /></button>
      </div>

      {/* budget summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {[['Contract value', AED(value), '#0099cc'], ['Spent', AED(totalExpenses), '#ef4444'], ['Materials (est)', AED(totalMaterials), '#f59e0b'], [margin >= 0 ? 'Profit' : 'Loss', AED(Math.abs(margin)) + (value > 0 ? ` · ${marginPct}%` : ''), margin >= 0 ? '#22c55e' : '#ef4444']].map(([k, v, c]) => (
          <div key={k} style={{ ...card, padding: '12px 14px' }}><div style={{ fontSize: 11, color: 'var(--text2)' }}>{k}</div><div style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: c }}>{v}</div></div>
        ))}
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {[['overview', 'Overview', 'ti-layout'], ['materials', `Materials (${materials.length})`, 'ti-package'], ['expenses', `Expenses (${expenses.length})`, 'ti-coin']].map(([k, l, ic]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 15px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', color: tab === k ? 'var(--primary)' : 'var(--text2)', borderBottom: tab === k ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }}><i className={'ti ' + ic} style={{ fontSize: 15, verticalAlign: '-2px', marginRight: 4 }} />{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ ...card }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14 }}>
            <div>
              <label style={lbl}>Status</label>
              <select value={active.status} onChange={e => patchActive({ status: e.target.value })} style={input}>
                {Object.entries(PSTATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Progress · {active.progress || 0}%</label>
              <input type="range" min={0} max={100} step={5} value={active.progress || 0} onChange={e => setActive(a => ({ ...a, progress: Number(e.target.value) }))} onMouseUp={e => patchActive({ progress: Number(e.target.value) })} onTouchEnd={e => patchActive({ progress: Number(e.target.value) })} style={{ width: '100%' }} />
            </div>
            <div><label style={lbl}>Start date</label><input type="date" value={active.start_date || ''} onChange={e => patchActive({ start_date: e.target.value || null })} style={input} /></div>
            <div><label style={lbl}>Target end</label><input type="date" value={active.end_date || ''} onChange={e => patchActive({ end_date: e.target.value || null })} style={input} /></div>
          </div>
          <label style={{ ...lbl, marginTop: 14 }}>Notes</label>
          <textarea value={active.notes || ''} onChange={e => setActive(a => ({ ...a, notes: e.target.value }))} onBlur={e => patchActive({ notes: e.target.value || null })} rows={3} style={{ ...input, resize: 'vertical', minHeight: 70 }} placeholder="Scope, site details, key dates…" />
          {active.quote_id && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10 }}><i className="ti ti-file-invoice" /> Linked to a quotation</div>}
        </div>
      )}

      {tab === 'materials' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>Estimated materials cost: <b style={{ color: 'var(--text)' }}>{AED(totalMaterials)}</b></div>
            <button onClick={() => setMatForm({ item: '', quantity: 1, unit: '', vendor: '', est_cost: 0, status: 'requested' })} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> Add material</button>
          </div>
          {materials.length === 0 ? <div style={{ ...card, textAlign: 'center', color: 'var(--text3)', padding: '34px 16px' }}>No material requests yet.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {materials.map(m => { const ms = MSTATUS[m.status] || MSTATUS.requested; return (
                <div key={m.id} style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.item}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{m.quantity} {m.unit || ''}{m.vendor ? ' · ' + m.vendor : ''}{m.est_cost ? ' · ' + AED(m.est_cost) : ''}</div>
                  </div>
                  <select value={m.status} onChange={e => setMatStatus(m, e.target.value)} style={{ ...input, width: 'auto', padding: '6px 9px', fontSize: 12 }}>
                    {Object.entries(MSTATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
                  </select>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}><Badge c={ms.c}>{ms.l}</Badge></span>
                  <button onClick={() => setMatForm({ ...m })} style={iconBtn}><i className="ti ti-edit" style={{ fontSize: 15 }} /></button>
                  <button onClick={() => delMaterial(m.id)} style={{ ...iconBtn, color: '#ef4444' }}><i className="ti ti-trash" style={{ fontSize: 15 }} /></button>
                </div>
              ) })}
            </div>}
        </div>
      )}

      {tab === 'expenses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>Total spent: <b style={{ color: '#ef4444' }}>{AED(totalExpenses)}</b></div>
            <button onClick={() => setExpForm({ category: 'material', description: '', amount: '', spent_on: new Date().toISOString().slice(0, 10) })} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> Add expense</button>
          </div>
          {expenses.length === 0 ? <div style={{ ...card, textAlign: 'center', color: 'var(--text3)', padding: '34px 16px' }}>No expenses logged yet.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {expenses.map(x => { const ec = ECAT[x.category] || ECAT.misc; return (
                <div key={x.id} style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex' }}><Badge c={ec.c}>{ec.l}</Badge></span>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{x.description || ec.l}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{fmtD(x.spent_on)}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>{AED(x.amount)}</div>
                  <button onClick={() => setExpForm({ ...x, spent_on: x.spent_on || '' })} style={iconBtn}><i className="ti ti-edit" style={{ fontSize: 15 }} /></button>
                  <button onClick={() => delExpense(x.id)} style={{ ...iconBtn, color: '#ef4444' }}><i className="ti ti-trash" style={{ fontSize: 15 }} /></button>
                </div>
              ) })}
            </div>}
        </div>
      )}

      {projModal && ProjectModal()}
      {matForm && <FormModal title={matForm.id ? 'Edit material' : 'Add material'} onClose={() => setMatForm(null)} onSave={saveMaterial} saving={saving}>
        <label style={lbl}>Item</label><input autoFocus value={matForm.item} onChange={e => setMatForm(m => ({ ...m, item: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. MDF board 18mm" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Quantity</label><input type="number" value={matForm.quantity} onChange={e => setMatForm(m => ({ ...m, quantity: e.target.value }))} style={input} /></div>
          <div><label style={lbl}>Unit</label><input value={matForm.unit} onChange={e => setMatForm(m => ({ ...m, unit: e.target.value }))} style={input} placeholder="Nos / m² / kg" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Vendor</label><input value={matForm.vendor} onChange={e => setMatForm(m => ({ ...m, vendor: e.target.value }))} style={input} /></div>
          <div><label style={lbl}>Est. cost (AED)</label><input type="number" value={matForm.est_cost} onChange={e => setMatForm(m => ({ ...m, est_cost: e.target.value }))} style={input} /></div>
        </div>
        <label style={lbl}>Status</label><select value={matForm.status} onChange={e => setMatForm(m => ({ ...m, status: e.target.value }))} style={input}>{Object.entries(MSTATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
      </FormModal>}
      {expForm && <FormModal title={expForm.id ? 'Edit expense' : 'Add expense'} onClose={() => setExpForm(null)} onSave={saveExpense} saving={saving}>
        <label style={lbl}>Category</label><select value={expForm.category} onChange={e => setExpForm(x => ({ ...x, category: e.target.value }))} style={{ ...input, marginBottom: 10 }}>{Object.entries(ECAT).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
        <label style={lbl}>Description</label><input autoFocus value={expForm.description} onChange={e => setExpForm(x => ({ ...x, description: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. Carpenter — 2 days" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Amount (AED)</label><input type="number" autoFocus value={expForm.amount} onChange={e => setExpForm(x => ({ ...x, amount: e.target.value }))} style={input} /></div>
          <div><label style={lbl}>Date</label><input type="date" value={expForm.spent_on} onChange={e => setExpForm(x => ({ ...x, spent_on: e.target.value }))} style={input} /></div>
        </div>
      </FormModal>}
    </div>
  )

  // ----- inline modal components (no hooks → safe to define here) -----
  function ProjectModal() {
    const p = projModal.p
    const set = patch => setProjModal(m => ({ ...m, p: { ...m.p, ...patch } }))
    return (
      <FormModal title={projModal.isNew ? 'New project' : 'Edit project'} onClose={() => setProjModal(null)} onSave={saveProject} saving={saving} onDelete={!projModal.isNew ? () => { setProjModal(null); deleteProject(p.id) } : null}>
        <label style={lbl}>Project name</label><input autoFocus value={p.name} onChange={e => set({ name: e.target.value })} style={{ ...input, marginBottom: 10 }} placeholder="e.g. Villa Fit-out — Palm" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Client name</label><input value={p.client_name} onChange={e => set({ client_name: e.target.value })} style={input} /></div>
          <div><label style={lbl}>Client phone</label><input value={p.client_phone} onChange={e => set({ client_phone: e.target.value })} style={input} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Status</label><select value={p.status} onChange={e => set({ status: e.target.value })} style={input}>{Object.entries(PSTATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          <div><label style={lbl}>Contract value (AED)</label><input type="number" value={p.contract_value} onChange={e => set({ contract_value: e.target.value })} style={input} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Start date</label><input type="date" value={p.start_date} onChange={e => set({ start_date: e.target.value })} style={input} /></div>
          <div><label style={lbl}>Target end</label><input type="date" value={p.end_date} onChange={e => set({ end_date: e.target.value })} style={input} /></div>
        </div>
        <label style={lbl}>Location</label><input value={p.location} onChange={e => set({ location: e.target.value })} style={{ ...input, marginBottom: 10 }} />
        <label style={lbl}>Notes</label><textarea value={p.notes} onChange={e => set({ notes: e.target.value })} rows={2} style={{ ...input, resize: 'vertical', minHeight: 56 }} />
      </FormModal>
    )
  }
}

const iconBtn = { width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', cursor: 'pointer', flexShrink: 0 }

function FormModal({ title, children, onClose, onSave, saving, onDelete }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 480, padding: 22, maxHeight: '92vh', overflowY: 'auto', color: 'var(--text)' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>{title}</div>
        {children}
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 18 }}>
          {onDelete && <button onClick={onDelete} style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}><i className="ti ti-trash" style={{ fontSize: 17 }} /></button>}
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onSave} disabled={saving} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#0099cc', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
