// Projects & Ops — projects (from won quotes), material requests and site
// expenses with a budget/profit summary. Company-scoped (RLS).
import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import HeroActions from '../components/HeroActions'

const PSTATUS = {
  planning:       { label: 'Planning',           color: '#64748b', icon: 'ti-pencil' },
  designing:      { label: 'Designing',          color: '#6366f1', icon: 'ti-ruler-2' },
  production:     { label: 'Production',         color: '#0ea5e9', icon: 'ti-building-factory-2' },
  ready_delivery: { label: 'Ready for delivery', color: '#eab308', icon: 'ti-package-export' },
  site_install:   { label: 'Site installation',  color: '#f97316', icon: 'ti-hammer' },
  ongoing:        { label: 'Ongoing',            color: '#0099cc', icon: 'ti-progress' },
  snagging:       { label: 'Snagging',           color: '#a855f7', icon: 'ti-tool' },
  handover:       { label: 'Handover',           color: '#14b8a6', icon: 'ti-key' },
  completed:      { label: 'Completed',          color: '#22c55e', icon: 'ti-circle-check' },
  on_hold:        { label: 'On Hold',            color: '#f59e0b', icon: 'ti-player-pause' },
  cancelled:      { label: 'Cancelled',          color: '#ef4444', icon: 'ti-x' },
}
const MSTATUS = { requested: { l: 'Requested', c: '#64748b' }, approved: { l: 'Approved', c: '#0099cc' }, ordered: { l: 'Ordered', c: '#f59e0b' }, received: { l: 'Received', c: '#22c55e' } }
// kinds of project-history updates (Overview timeline)
const UPD_KIND = {
  meeting:     { l: 'Meeting',          c: '#0099cc', icon: 'ti-users' },
  note:        { l: 'Note',             c: '#64748b', icon: 'ti-note' },
  requirement: { l: 'Client requirement', c: '#8b5cf6', icon: 'ti-star' },
  material:    { l: 'Material change',  c: '#f59e0b', icon: 'ti-package' },
  timeline:    { l: 'Timeline change',  c: '#ef4444', icon: 'ti-calendar-stats' },
  decision:    { l: 'Client decision',  c: '#14b8a6', icon: 'ti-checkbox' },
}
const APPROVAL = { none: null, pending: { l: 'Awaiting client', c: '#f59e0b' }, approved: { l: 'Client approved', c: '#22c55e' }, rejected: { l: 'Client rejected', c: '#ef4444' } }
const ECAT = { labour: { l: 'Labour', c: '#8b5cf6' }, material: { l: 'Material', c: '#0099cc' }, transport: { l: 'Transport', c: '#f59e0b' }, misc: { l: 'Misc', c: '#64748b' } }
const SSTATUS = { ongoing: { l: 'Ongoing', c: '#0099cc' }, completed: { l: 'Completed', c: '#22c55e' }, on_hold: { l: 'On Hold', c: '#f59e0b' } }
const MILESTONE_ST = { pending: { l: 'Pending', c: '#64748b', ic: 'ti-circle' }, in_progress: { l: 'In progress', c: '#0099cc', ic: 'ti-progress' }, done: { l: 'Done', c: '#22c55e', ic: 'ti-circle-check-filled' } }
// The project's live status comes from the timeline: the current (in-progress / next) stage,
// or "Completed" when every stage is done. Single source of truth — no separate status to set.
function timelineStage(ms) {
  if (!ms || !ms.length) return null
  const list = [...ms].sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0))
  const total = list.length
  const done = list.filter(m => m.status === 'done').length
  if (done >= total) return { label: 'Completed', color: '#22c55e', icon: 'ti-circle-check', complete: true, done, total }
  const inProg = list.find(m => m.status === 'in_progress')
  const cur = inProg || list.find(m => m.status !== 'done')
  const started = done > 0 || !!inProg
  return { label: cur ? cur.title : 'In progress', color: started ? '#0099cc' : '#64748b', icon: started ? 'ti-progress' : 'ti-pencil', complete: false, done, total }
}
// No timeline yet -> show a clean coarse status instead of stale granular labels.
function coarseStatus(p) {
  const s = p?.status
  if (s === 'on_hold') return { label: 'On hold', color: '#f59e0b', icon: 'ti-player-pause' }
  if (s === 'cancelled') return { label: 'Cancelled', color: '#ef4444', icon: 'ti-x' }
  const pct = Math.max(0, Math.min(100, Number(p?.progress) || 0))
  if (s === 'completed' || pct >= 100) return { label: 'Completed', color: '#22c55e', icon: 'ti-circle-check' }
  if (pct > 0 || (s && s !== 'planning')) return { label: 'Ongoing', color: '#0099cc', icon: 'ti-progress' }
  return { label: 'Planning', color: '#64748b', icon: 'ti-pencil' }
}
// default interior fit-out stages with typical weights (sum = 100%)
const DEFAULT_STAGES = [
  { title: 'Site survey & measurement', weight: 3 },
  { title: 'Design & drawing approval', weight: 7 },
  { title: 'Demolition / site prep', weight: 5 },
  { title: 'MEP first fix', weight: 12 },
  { title: 'Gypsum & false ceiling', weight: 15 },
  { title: 'Flooring & tiling', weight: 15 },
  { title: 'Joinery & carpentry', weight: 20 },
  { title: 'Painting & finishes', weight: 10 },
  { title: 'MEP second fix & fixtures', weight: 8 },
  { title: 'Snagging', weight: 3 },
  { title: 'Handover', weight: 2 },
]
const TRADES = ['MEP', 'Electrical', 'Plumbing', 'HVAC', 'Gypsum / Ceiling', 'Tiles / Flooring', 'Joinery', 'Painting', 'Civil', 'Glass / Aluminium', 'Furniture', 'Other']
const AED = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
const fmtD = d => d ? new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function ProjectsPage({ onNavigate, subRoute, setSubRoute }) {
  const { company, user, staff } = useAuth()
  const myName = staff?.name || company?.name || (user?.email || '').split('@')[0] || 'Staff'
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [projects, setProjects] = useState([])
  const [recvByProject, setRecvByProject] = useState({}) // projectId -> client amount received (from invoices)
  const [costByProject, setCostByProject] = useState({}) // projectId -> total cost (subs + site + matching purchases)
  const [summary, setSummary] = useState(null)           // company-wide rollup for the dashboard
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')
  const [active, setActive] = useState(null)
  const [tab, setTab] = useState('overview')
  const [materials, setMaterials] = useState([])
  const [expenses, setExpenses] = useState([])
  const [subs, setSubs] = useState([])
  const [subDirectory, setSubDirectory] = useState([])   // saved subcontractors (reuse across projects)
  const [subForm, setSubForm] = useState(null)
  const [scope, setScope] = useState([])
  const [scopeForm, setScopeForm] = useState(null)
  const [assignDrafts, setAssignDrafts] = useState({}) // per-scope-id { sub_id, sub_amount } before committing
  const [editScopeId, setEditScopeId] = useState(null) // which already-assigned scope is being re-edited
  const [projModal, setProjModal] = useState(null)
  const [matForm, setMatForm] = useState(null)
  const [expForm, setExpForm] = useState(null)
  const [payModal, setPayModal] = useState(null)   // the sub whose payment ledger is open
  const [payList, setPayList] = useState([])
  const [payForm, setPayForm] = useState(null)
  const [invoices, setInvoices] = useState([])     // invoices linked to this project (client cash-in lives here)
  const [purchases, setPurchases] = useState([])   // purchase bills tagged to this project's client
  const [projVos, setProjVos] = useState([])       // approved Variation Orders on this project's quote
  const [milestones, setMilestones] = useState([])
  const [stageByProject, setStageByProject] = useState({}) // projectId -> timeline current stage (for list cards)
  const [msForm, setMsForm] = useState(null)
  const [updates, setUpdates] = useState([])   // project history / timeline entries
  const [updForm, setUpdForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [cDays, setCDays] = useState('')   // committed duration (days) — start_date + cDays = target end

  useEffect(() => { if (company?.id) loadProjects() }, [company?.id])
  // keep the committed-days field showing the current start→end span (recomputes when either date changes / project switches)
  useEffect(() => {
    if (active?.start_date && active?.end_date) setCDays(String(Math.max(0, Math.round((new Date(active.end_date) - new Date(active.start_date)) / 86400000))))
    else setCDays('')
  }, [active?.id, active?.start_date, active?.end_date])
  // keep project progress + status in sync with the timeline — covers every edit path
  useEffect(() => {
    if (view !== 'detail' || !active || !milestones.length) return
    const pct = weightedPct(milestones)
    const patch = {}
    if (pct !== (Number(active.progress) || 0)) patch.progress = pct
    // coarse status follows the timeline (for dashboard counts), but never overrides a manual hold/cancel
    if (active.status !== 'on_hold' && active.status !== 'cancelled') {
      const desired = pct >= 100 ? 'completed' : 'ongoing'
      if (active.status !== desired) patch.status = desired
    }
    if (Object.keys(patch).length) patchActive(patch)
    // refresh this project's card stage immediately
    const s = timelineStage(milestones)
    if (s) setStageByProject(prev => ({ ...prev, [active.id]: s }))
  }, [milestones, active?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProjects() {
    setLoading(true)
    await backfillFromQuotes()
    const { data } = await supabase.from('ops_projects').select('*').eq('company_id', company.id).order('created_at', { ascending: false }).limit(500)
    const projs = data || []
    setProjects(projs); setLoading(false)
    // received per project from linked invoices (for the card payment bar)
    try {
      const { data: invs } = await supabase.from('invoices').select('quotation_id,client_id,payments').eq('company_id', company.id).limit(2000)
      const sumPay = iv => (Array.isArray(iv.payments) ? iv.payments : []).reduce((a, x) => a + (Number(x.amount) || 0), 0)
      const recv = {}
      projs.forEach(p => {
        const matched = (invs || []).filter(iv => (p.quote_id && iv.quotation_id === p.quote_id) || (!p.quote_id && p.client_id && iv.client_id === p.client_id))
        recv[p.id] = matched.reduce((s, iv) => s + sumPay(iv), 0)
      })
      setRecvByProject(recv)
      // company-wide rollup for the dashboard + per-project cost (incl. matching purchases)
      const [{ data: allSubs }, { data: allExp }, { data: allPur }] = await Promise.all([
        supabase.from('project_subcontractors').select('name,project_id,contract_amount,paid_amount').eq('company_id', company.id).limit(5000),
        supabase.from('site_expenses').select('project_id,amount').eq('company_id', company.id).limit(5000),
        supabase.from('purchase_invoices').select('client_id,client_name,total').eq('company_id', company.id).limit(5000),
      ])
      const num = v => Number(v) || 0
      // per-project cost: subcontractor contracts + site expenses + purchase bills tagged to this project's client
      const cost = {}
      projs.forEach(p => { cost[p.id] = 0 })
      ;(allSubs || []).forEach(x => { if (cost[x.project_id] != null) cost[x.project_id] += num(x.contract_amount) })
      ;(allExp || []).forEach(x => { if (cost[x.project_id] != null) cost[x.project_id] += num(x.amount) })
      ;(allPur || []).forEach(x => {
        const p = projs.find(pp => (x.client_id && pp.client_id && String(pp.client_id) === String(x.client_id)) || (x.client_name && pp.client_name && pp.client_name.trim().toLowerCase() === x.client_name.trim().toLowerCase()))
        if (p) cost[p.id] += num(x.total)
      })
      setCostByProject(cost)
      // timeline current-stage per project (so each dashboard card shows the live status)
      try {
        const { data: allMs } = await supabase.from('project_milestones')
          .select('project_id,title,status,weight,sort').eq('company_id', company.id)
          .order('sort', { ascending: true }).limit(8000)
        const byProj = {}
        ;(allMs || []).forEach(m => { (byProj[m.project_id] = byProj[m.project_id] || []).push(m) })
        const stageMap = {}
        Object.entries(byProj).forEach(([pid, list]) => { const s = timelineStage(list); if (s) stageMap[pid] = s })
        setStageByProject(stageMap)
      } catch { /* timeline status is optional */ }
      // directory of saved subcontractors (dedupe by name, keep latest) — reuse across projects
      try {
        const { data: dirRows } = await supabase.from('project_subcontractors')
          .select('name,trade,phone,contact_person,vat_no,owner_name,owner_mobile,apply_vat,payment_days,payment_schedule,notes,created_at')
          .eq('company_id', company.id).order('created_at', { ascending: false }).limit(5000)
        const dmap = {}
        ;(dirRows || []).forEach(r => { const k = (r.name || '').trim().toLowerCase(); if (!k || dmap[k]) return; dmap[k] = r })
        setSubDirectory(Object.values(dmap))
      } catch { /* directory is optional */ }
      const totalContract = projs.reduce((s, p) => s + num(p.contract_value), 0)
      const totalReceived = Object.values(recv).reduce((s, v) => s + num(v), 0)
      const subContract = (allSubs || []).reduce((s, x) => s + num(x.contract_amount), 0)
      const subPaid = (allSubs || []).reduce((s, x) => s + num(x.paid_amount), 0)
      const siteSpend = (allExp || []).reduce((s, x) => s + num(x.amount), 0)
      const totalCost = Object.values(cost).reduce((s, v) => s + num(v), 0)
      // top subcontractors by outstanding balance (merge same names across projects)
      const map = {}
      ;(allSubs || []).forEach(x => { const k = (x.name || '').trim().toLowerCase(); if (!k) return; const m = map[k] || { name: x.name, contract: 0, paid: 0 }; m.contract += num(x.contract_amount); m.paid += num(x.paid_amount); map[k] = m })
      const topSubs = Object.values(map).map(m => ({ ...m, balance: m.contract - m.paid })).sort((a, b) => b.balance - a.balance).slice(0, 5)
      setSummary({
        totalContract, totalReceived, totalOutstanding: Math.max(0, totalContract - totalReceived),
        subContract, subPaid, subBalance: subContract - subPaid, siteSpend, totalCost,
        profit: totalContract - totalCost,
        counts: { total: projs.length, ongoing: projs.filter(p => p.status === 'ongoing').length, completed: projs.filter(p => p.status === 'completed').length, planning: projs.filter(p => p.status === 'planning').length, on_hold: projs.filter(p => p.status === 'on_hold').length },
        topSubs,
      })
    } catch (e) { console.error('summary', e) }
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
    if (setSubRoute) setSubRoute(p.id)
  }
  // restore the open project from the URL on refresh / direct link
  useEffect(() => {
    if (!subRoute || !projects.length) return
    if (active && active.id === subRoute) return
    const p = projects.find(x => x.id === subRoute)
    if (p) { setActive(p); setTab('overview'); setView('detail'); setMaterials([]); setExpenses([]); reloadChildren(p.id) }
  }, [subRoute, projects]) // eslint-disable-line react-hooks/exhaustive-deps
  async function reloadChildren(pid) {
    const id = pid || active?.id; if (!id) return
    const proj = projects.find(x => x.id === id) || active
    const [m, e, s, sc, ms] = await Promise.all([
      supabase.from('material_requests').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('site_expenses').select('*').eq('project_id', id).order('spent_on', { ascending: false }),
      supabase.from('project_subcontractors').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('project_scope').select('*').eq('project_id', id).order('created_at', { ascending: true }),
      supabase.from('project_milestones').select('*').eq('project_id', id).order('sort', { ascending: true }).order('created_at', { ascending: true }),
    ])
    setMaterials(m.data || []); setExpenses(e.data || []); setSubs(s.data || []); setScope(sc.data || []); setMilestones(ms.data || [])
    try {
      const { data: upd } = await supabase.from('project_updates').select('*').eq('project_id', id).order('event_date', { ascending: false }).order('created_at', { ascending: false })
      setUpdates(upd || [])
    } catch (e) { setUpdates([]) }
    // Client cash-in lives in the Invoices module — pull the linked invoices (single source of truth).
    let inv = []
    if (proj?.quote_id) { const { data } = await supabase.from('invoices').select('id,invoice_number,total,payments,status,kind,milestone_label,issue_date,due_date').eq('company_id', company.id).eq('quotation_id', proj.quote_id).order('issue_date', { ascending: false }); inv = data || [] }
    else if (proj?.client_id) { const { data } = await supabase.from('invoices').select('id,invoice_number,total,payments,status,kind,milestone_label,issue_date,due_date').eq('company_id', company.id).eq('client_id', proj.client_id).order('issue_date', { ascending: false }); inv = data || [] }
    setInvoices(inv)
    // Approved Variation Orders on the linked quote → revised contract value
    let voList = []
    try { if (proj?.quote_id) { const { data } = await supabase.from('quotation_variations').select('total, status').eq('company_id', company.id).eq('quotation_id', proj.quote_id).eq('status', 'approved'); voList = data || [] } } catch (e) { /* VOs optional */ }
    setProjVos(voList)
    // Purchase bills tagged to this project's client (counted in project cost)
    let pur = []
    try {
      if (proj?.client_id) { const { data } = await supabase.from('purchase_invoices').select('id,supplier_name,invoice_number,invoice_date,total').eq('company_id', company.id).eq('client_id', proj.client_id).order('invoice_date', { ascending: false }); pur = data || [] }
      else if (proj?.client_name) { const { data } = await supabase.from('purchase_invoices').select('id,supplier_name,invoice_number,invoice_date,total').eq('company_id', company.id).ilike('client_name', proj.client_name.trim()); pur = data || [] }
    } catch (e) { /* purchases optional */ }
    setPurchases(pur)
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
      toast.success('Project deleted'); setView('list'); setActive(null); if (setSubRoute) setSubRoute(''); loadProjects()
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

  async function saveSub() {
    const x = subForm
    if (!x.name?.trim()) { toast.error('Subcontractor name is required'); return }
    setSaving(true)
    try {
      // contract_amount comes from assigned scope, paid_amount from the payment ledger — not edited here.
      const numOr = (v, d) => { const z = Number(v); return Number.isFinite(z) ? z : d }
      const schedule = (Array.isArray(x.payment_schedule) ? x.payment_schedule : [])
        .map(r => ({ label: (r.label || '').trim(), pct: numOr(r.pct, 0) }))
        .filter(r => r.label || r.pct)
      const payload = { company_id: company.id, project_id: active.id, name: x.name.trim(), trade: x.trade || null, phone: x.phone || null, status: x.status || 'ongoing', notes: x.notes || null,
        contact_person: x.contact_person?.trim() || null, owner_name: x.owner_name?.trim() || null, owner_mobile: x.owner_mobile?.trim() || null, vat_no: x.vat_no?.trim() || null, project_code: x.project_code?.trim() || null, apply_vat: !!x.apply_vat,
        payment_days: numOr(x.payment_days, 30), payment_schedule: schedule, full_project: !!x.full_project }
      if (x.id) { const { error } = await supabase.from('project_subcontractors').update(payload).eq('id', x.id).eq('company_id', company.id); if (error) throw error }
      else { const { error } = await supabase.from('project_subcontractors').insert(payload); if (error) throw error }
      setSubForm(null); toast.success('Saved ✓'); reloadChildren()
    } catch (e) { console.error(e); toast.error('Save failed: ' + (e?.message || e)) } finally { setSaving(false) }
  }
  async function delSub(id) { try { await supabase.from('sub_payments').delete().eq('sub_id', id).eq('company_id', company.id); await supabase.from('project_subcontractors').delete().eq('id', id).eq('company_id', company.id); reloadChildren() } catch (e) { toast.error('Delete failed') } }

  // ----- subcontractor payment ledger -----
  async function openPayments(sub) {
    setPayModal(sub); setPayForm(null); setPayList([])
    const { data } = await supabase.from('sub_payments').select('*').eq('sub_id', sub.id).eq('company_id', company.id).order('paid_on', { ascending: false })
    setPayList(data || [])
  }
  async function recomputeSubPaid(subId, rows) {
    const total = (rows || []).reduce((a, p) => a + (Number(p.amount) || 0), 0)
    await supabase.from('project_subcontractors').update({ paid_amount: total }).eq('id', subId).eq('company_id', company.id)
    setSubs(ss => ss.map(s => s.id === subId ? { ...s, paid_amount: total } : s))
  }
  async function savePayment() {
    const x = payForm
    if (!(Number(x.amount) > 0)) { toast.error('Enter an amount'); return }
    setSaving(true)
    try {
      const payload = { company_id: company.id, project_id: active.id, sub_id: payModal.id, amount: Number(x.amount) || 0, paid_on: x.paid_on || null, method: x.method || null, reference: x.reference || null, note: x.note || null }
      if (x.id) { const { error } = await supabase.from('sub_payments').update(payload).eq('id', x.id).eq('company_id', company.id); if (error) throw error }
      else { const { error } = await supabase.from('sub_payments').insert(payload); if (error) throw error }
      const { data } = await supabase.from('sub_payments').select('*').eq('sub_id', payModal.id).eq('company_id', company.id).order('paid_on', { ascending: false })
      setPayList(data || []); await recomputeSubPaid(payModal.id, data || []); setPayForm(null); toast.success('Payment saved ✓')
    } catch (e) { console.error(e); toast.error('Save failed: ' + (e?.message || e)) } finally { setSaving(false) }
  }
  async function delPayment(id) {
    try {
      await supabase.from('sub_payments').delete().eq('id', id).eq('company_id', company.id)
      const next = payList.filter(p => p.id !== id); setPayList(next); await recomputeSubPaid(payModal.id, next)
    } catch (e) { toast.error('Delete failed') }
  }

  async function recomputeSubContract(subId, rows) {
    if (!subId) return
    const total = (rows || scope).filter(s => s.sub_id === subId).reduce((a, s) => a + (Number(s.sub_amount) || 0), 0)
    await supabase.from('project_subcontractors').update({ contract_amount: total }).eq('id', subId).eq('company_id', company.id)
  }
  async function assignScope(item, subId, amount) {
    try {
      const sub_amount = amount != null ? (Number(amount) || 0) : (Number(item.sub_amount) || 0)
      const prevSub = item.sub_id
      await supabase.from('project_scope').update({ sub_id: subId || null, sub_amount }).eq('id', item.id).eq('company_id', company.id)
      const next = scope.map(s => s.id === item.id ? { ...s, sub_id: subId || null, sub_amount } : s)
      setScope(next)
      if (subId) await recomputeSubContract(subId, next)
      if (prevSub && prevSub !== subId) await recomputeSubContract(prevSub, next)
      reloadChildren()
    } catch (e) { console.error(e); toast.error('Assign failed') }
  }
  // Commit an assignment only when a subcontractor AND a positive amount are given.
  async function doAssign(item, draft) {
    if (!draft.sub_id) { toast.error('Select a subcontractor first'); return }
    if (!(Number(draft.sub_amount) > 0)) { toast.error('Enter the amount before assigning'); return }
    await assignScope(item, draft.sub_id, draft.sub_amount)
    setAssignDrafts(d => { const n = { ...d }; delete n[item.id]; return n })
    setEditScopeId(null)
  }
  async function unassign(item) {
    await assignScope(item, null, 0)
    setAssignDrafts(d => { const n = { ...d }; delete n[item.id]; return n })
    setEditScopeId(null)
  }
  async function importScopeFromQuote() {
    if (!active?.quote_id) { toast.error('This project has no linked quotation'); return }
    try {
      const { data: q } = await supabase.from('quotations').select('items').eq('id', active.quote_id).eq('company_id', company.id).maybeSingle()
      const items = Array.isArray(q?.items) ? q.items : []
      if (!items.length) { toast.error('Quotation has no line items'); return }
      const rows = items.map(it => ({ company_id: company.id, project_id: active.id, description: it.desc || '', unit: it.unit || null, quantity: Number(it.qty) || 1, client_amount: (Number(it.qty) || 0) * (Number(it.rate) || 0), trade: it.trade || null })).filter(r => r.description)
      if (rows.length) { const { error } = await supabase.from('project_scope').insert(rows); if (error) throw error }
      toast.success(`Imported ${rows.length} scope items ✓`); reloadChildren()
    } catch (e) { console.error(e); toast.error('Import failed: ' + (e?.message || e)) }
  }
  async function saveScopeItem() {
    const x = scopeForm
    if (!x.description?.trim()) { toast.error('Description is required'); return }
    setSaving(true)
    try {
      const payload = { company_id: company.id, project_id: active.id, description: x.description.trim(), unit: x.unit || null, quantity: Number(x.quantity) || 1, client_amount: Number(x.client_amount) || 0, trade: x.trade || null }
      if (x.id) { const { error } = await supabase.from('project_scope').update(payload).eq('id', x.id).eq('company_id', company.id); if (error) throw error }
      else { const { error } = await supabase.from('project_scope').insert(payload); if (error) throw error }
      setScopeForm(null); toast.success('Saved ✓'); reloadChildren()
    } catch (e) { console.error(e); toast.error('Save failed') } finally { setSaving(false) }
  }
  async function delScopeItem(it) { try { await supabase.from('project_scope').delete().eq('id', it.id).eq('company_id', company.id); if (it.sub_id) await recomputeSubContract(it.sub_id, scope.filter(s => s.id !== it.id)); reloadChildren() } catch (e) { toast.error('Delete failed') } }
  async function toggleContract(sub) {
    try {
      const signed = !sub.contract_signed
      await supabase.from('project_subcontractors').update({ contract_signed: signed, contract_date: signed ? new Date().toISOString().slice(0, 10) : null }).eq('id', sub.id).eq('company_id', company.id)
      reloadChildren()
    } catch (e) { toast.error('Update failed') }
  }
  async function generateLPO(sub) {
    let lpo = sub.lpo_number
    if (!lpo) { lpo = 'LPO-' + String(Date.now()).slice(-6); await supabase.from('project_subcontractors').update({ lpo_number: lpo, lpo_date: new Date().toISOString().slice(0, 10) }).eq('id', sub.id).eq('company_id', company.id); reloadChildren() }
    let mySubScope = scope.filter(s => s.sub_id === sub.id)
    // pull reference photos from the linked quotation (visual quote) — matched by description
    if (active?.quote_id) {
      try {
        const { data: q } = await supabase.from('quotations').select('items').eq('id', active.quote_id).eq('company_id', company.id).maybeSingle()
        const imgByDesc = {}
        ;(Array.isArray(q?.items) ? q.items : []).forEach(it => { if (it?.img && it?.desc) imgByDesc[String(it.desc).trim().toLowerCase()] = it.img })
        if (Object.keys(imgByDesc).length) mySubScope = mySubScope.map(s => ({ ...s, img: imgByDesc[String(s.description || '').trim().toLowerCase()] || null }))
      } catch { /* photos are best-effort */ }
    }
    printLPOandNDA(company, active, sub, mySubScope, lpo, subs.filter(x => x.id !== sub.id), toast)
  }

  // ----- milestones / timeline -----
  // weighted % — each stage carries its own weight; falls back to equal weighting if none set
  function weightedPct(rows) {
    const list = rows || milestones
    if (!list.length) return 0
    const totalW = list.reduce((a, m) => a + (Number(m.weight) || 0), 0)
    if (totalW > 0) {
      const doneW = list.filter(m => m.status === 'done').reduce((a, m) => a + (Number(m.weight) || 0), 0)
      return Math.round((doneW / totalW) * 100)
    }
    return Math.round((list.filter(m => m.status === 'done').length / list.length) * 100)
  }
  async function saveUpdate() {
    const x = updForm
    if (!x.title?.trim() && !x.body?.trim()) { toast.error('Add a title or details'); return }
    setSaving(true)
    try {
      const isTimeline = x.kind === 'timeline'
      const payload = {
        company_id: company.id, project_id: active.id,
        kind: x.kind || 'note', title: x.title?.trim() || null, body: x.body?.trim() || null,
        event_date: x.event_date || new Date().toISOString().slice(0, 10),
        old_date: isTimeline ? (x.old_date || null) : null,
        new_date: isTimeline ? (x.new_date || null) : null,
        client_visible: x.client_visible !== false,
        needs_approval: !!x.needs_approval,
        approval_status: x.needs_approval ? (x.approval_status && x.approval_status !== 'none' ? x.approval_status : 'pending') : 'none',
      }
      if (x.id) { const { error } = await supabase.from('project_updates').update(payload).eq('id', x.id).eq('company_id', company.id); if (error) throw error }
      else { payload.created_by_email = user?.email || null; payload.created_by_name = myName; const { error } = await supabase.from('project_updates').insert(payload); if (error) throw error }
      // a confirmed timeline change updates the project's target end date too
      if (isTimeline && x.new_date && (!x.needs_approval || payload.approval_status === 'approved')) {
        await patchActive({ end_date: x.new_date })
      }
      setUpdForm(null); toast.success('Update saved ✓'); await reloadChildren()
    } catch (e) { console.error(e); toast.error(/project_updates/.test(e?.message || '') ? 'Run the migration first (db/2026-06-17_project_updates.sql)' : 'Save failed: ' + (e?.message || e)) } finally { setSaving(false) }
  }
  async function delUpdate(id) {
    try { await supabase.from('project_updates').delete().eq('id', id).eq('company_id', company.id); setUpdForm(null); await reloadChildren() } catch (e) { toast.error('Delete failed') }
  }
  function exportComms() {
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const st = PSTATUS[active.status] || PSTATUS.planning
    const rows = updates.map(u => {
      const k = UPD_KIND[u.kind] || UPD_KIND.note
      const meta = `${esc(fmtD(u.event_date))} · ${u.from_client ? 'Client' : esc(k.l)}${u.approval_status && u.approval_status !== 'none' ? ' · ' + esc(u.approval_status) : ''}${u.client_visible ? ' · shared' : ' · internal'}`
      return `<div style="border-left:3px solid ${u.from_client ? '#0a6f8f' : k.c};padding:8px 12px;margin-bottom:8px;background:#fafbfc;border-radius:6px;">
        <div style="font-size:11px;color:#888;">${meta}</div>
        ${u.title ? `<div style="font-weight:700;font-size:13px;margin-top:2px;">${esc(u.title)}</div>` : ''}
        ${u.body ? `<div style="font-size:12px;color:#444;margin-top:2px;white-space:pre-wrap;">${esc(u.body)}</div>` : ''}
        ${u.kind === 'timeline' && (u.old_date || u.new_date) ? `<div style="font-size:11px;color:#c0392b;margin-top:3px;">${esc(fmtD(u.old_date))} &rarr; ${esc(fmtD(u.new_date))}</div>` : ''}
        ${u.client_comment ? `<div style="font-size:11.5px;color:#0a6f8f;margin-top:3px;">Client: ${esc(u.client_comment)}</div>` : ''}
      </div>`
    }).join('')
    const inner = `<div style="font-family:Arial,Helvetica,sans-serif;padding:30px;color:#1a1a1a;">
      <div style="border-bottom:2px solid #0099cc;padding-bottom:10px;margin-bottom:14px;">
        <div style="font-size:18px;font-weight:800;">${esc(company?.name || '')}</div>
        <div style="font-size:13px;color:#666;margin-top:2px;">Project communication — ${esc(active.name)}</div>
        <div style="font-size:11px;color:#999;margin-top:2px;">${esc(active.client_name || '')} · Status: ${esc(st.label)} · ${esc(fmtD(active.start_date))} &rarr; ${esc(fmtD(active.end_date))}</div>
      </div>
      ${rows || '<div style="color:#999;font-size:12px;">No updates yet.</div>'}
    </div>`
    printDocs(`${active.name} — communication`, [inner], toast)
  }
  async function saveMilestone() {
    const x = msForm
    if (!x.title?.trim()) { toast.error('Milestone title is required'); return }
    setSaving(true)
    try {
      const payload = { company_id: company.id, project_id: active.id, title: x.title.trim(), target_date: x.target_date || null, status: x.status || 'pending', weight: Number(x.weight) || 0, note: x.note || null, sort: Number(x.sort) || 0 }
      if (x.status === 'done' && !x.done_on) payload.done_on = new Date().toISOString().slice(0, 10)
      if (x.id) { const { error } = await supabase.from('project_milestones').update(payload).eq('id', x.id).eq('company_id', company.id); if (error) throw error }
      else { payload.sort = milestones.length; const { error } = await supabase.from('project_milestones').insert(payload); if (error) throw error }
      setMsForm(null); toast.success('Saved ✓'); await reloadChildren()
    } catch (e) { console.error(e); toast.error('Save failed: ' + (e?.message || e)) } finally { setSaving(false) }
  }
  async function delMilestone(id) {
    try {
      await supabase.from('project_milestones').delete().eq('id', id).eq('company_id', company.id)
      const next = milestones.filter(m => m.id !== id); setMilestones(next)
    } catch (e) { toast.error('Delete failed') }
  }
  async function cycleMilestone(m) {
    const order = ['pending', 'in_progress', 'done']
    const status = order[(order.indexOf(m.status) + 1) % order.length]
    const patch = { status, done_on: status === 'done' ? new Date().toISOString().slice(0, 10) : null }
    try {
      await supabase.from('project_milestones').update(patch).eq('id', m.id).eq('company_id', company.id)
      const next = milestones.map(x => x.id === m.id ? { ...x, ...patch } : x)
      setMilestones(next)
    } catch (e) { toast.error('Update failed') }
  }
  async function seedDefaultStages() {
    try {
      const rows = DEFAULT_STAGES.map((s, i) => ({ company_id: company.id, project_id: active.id, title: s.title, weight: s.weight, status: 'pending', sort: i }))
      const { error } = await supabase.from('project_milestones').insert(rows); if (error) throw error
      toast.success('Added 11 default stages ✓'); reloadChildren()
    } catch (e) { console.error(e); toast.error('Failed: ' + (e?.message || e)) }
  }

  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const totalMaterials = materials.reduce((s, m) => s + (Number(m.est_cost) || 0), 0)
  const totalSubs = subs.reduce((s, x) => s + (Number(x.contract_amount) || 0), 0)
  const subsPaid = subs.reduce((s, x) => s + (Number(x.paid_amount) || 0), 0)
  const voAdj = projVos.reduce((s, v) => s + (Number(v.total) || 0), 0)   // + additions / − omissions
  const origValue = Number(active?.contract_value) || 0
  const value = origValue + voAdj                                          // revised contract value
  const totalPurchases = purchases.reduce((s, x) => s + (Number(x.total) || 0), 0)
  const totalCost = totalSubs + totalExpenses + totalPurchases
  const margin = value - totalCost
  const marginPct = value > 0 ? Math.round((margin / value) * 100) : 0
  // client cash-in (from linked invoices)
  const invPaid = inv => (Array.isArray(inv.payments) ? inv.payments : []).reduce((a, p) => a + (Number(p.amount) || 0), 0)
  // cancelled / on-hold invoices don't count toward billed or received
  const liveInvoices = invoices.filter(i => i.status !== 'cancelled' && i.status !== 'hold')
  const totalInvoiced = liveInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0)
  const clientReceived = liveInvoices.reduce((s, i) => s + invPaid(i), 0)
  const clientOutstanding = Math.max(0, value - clientReceived)   // vs the contract value
  const netCash = clientReceived - subsPaid - totalExpenses        // actual money position
  const workPct = milestones.length ? weightedPct(milestones) : (Number(active?.progress) || 0)
  const paymentPct = value > 0 ? Math.min(100, Math.round((clientReceived / value) * 100)) : 0

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }
  const heroBg = 'linear-gradient(135deg, #0a2540 0%, #0d6e8f 45%, #6d28d9 130%)'
  const FX = `
    .fx-proj{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;position:relative;overflow:hidden}
    .fx-proj:hover{transform:translateY(-3px);box-shadow:0 14px 32px rgba(0,0,0,.20);border-color:rgba(0,153,204,.55)}
    .fx-stat{transition:transform .15s ease,box-shadow .15s ease}
    .fx-stat:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.12)}
    .fx-hero{position:relative;overflow:hidden}
    .fx-hero::after{content:'';position:absolute;top:-60px;right:-40px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.22),transparent 70%);pointer-events:none}
    .fx-hero::before{content:'';position:absolute;bottom:-80px;left:30%;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(109,40,217,.35),transparent 70%);pointer-events:none}
  `
  // futuristic stat tile — gradient wash + accent + icon
  const StatTile = ({ icon, label, value, color }) => (
    <div className="fx-stat" style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 15px', background: `linear-gradient(135deg, ${color}1f, ${color}07)`, border: `1px solid ${color}2e` }}>
      <div style={{ position: 'absolute', top: -14, right: -10, width: 60, height: 60, borderRadius: '50%', background: color + '14' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, position: 'relative' }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: color + '24', color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={'ti ' + icon} style={{ fontSize: 15 }} /></span>
        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, color, position: 'relative', letterSpacing: '-.3px' }}>{value}</div>
    </div>
  )
  const input = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2,rgba(127,127,127,0.05))', color: 'var(--text)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl = { fontSize: 11.5, color: 'var(--text2)', display: 'block', marginBottom: 5, fontWeight: 600 }
  const Badge = ({ c, children }) => <span style={{ background: c + '1f', color: c, fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 99 }}>{children}</span>

  // ===== LIST =====
  if (view === 'list') {
    const totals = { value: projects.reduce((s, p) => s + (Number(p.contract_value) || 0), 0), ongoing: projects.filter(p => p.status === 'ongoing').length }
    const totalCompleted = projects.filter(p => p.status === 'completed').length
    return (
      <div style={{ color: 'var(--text)' }}>
        <style>{FX}</style>
        <HeroActions>
          <button onClick={newProject} className="btn btn-primary"><i className="ti ti-plus" style={{ fontSize: 16 }} /> New project</button>
        </HeroActions>

        {projects.length > 0 && (() => {
          const s = summary || { totalContract: totals.value, totalReceived: 0, totalOutstanding: totals.value, totalCost: 0, profit: totals.value, subBalance: 0, siteSpend: 0, counts: { total: projects.length, ongoing: totals.ongoing, completed: totalCompleted, planning: 0, on_hold: 0 }, topSubs: [] }
          const mPct = s.totalContract > 0 ? Math.round((s.profit / s.totalContract) * 100) : 0
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px,1fr))', gap: 10, marginBottom: 10 }}>
                <StatTile icon="ti-wallet" label="Total value" value={AED(s.totalContract)} color="#0099cc" />
                <StatTile icon="ti-cash" label="Received" value={AED(s.totalReceived)} color="#22c55e" />
                <StatTile icon="ti-clock-dollar" label="Outstanding" value={AED(s.totalOutstanding)} color="#f59e0b" />
                <StatTile icon="ti-receipt" label="Total cost" value={AED(s.totalCost)} color="#ef4444" />
                <StatTile icon={s.profit >= 0 ? 'ti-trending-up' : 'ti-trending-down'} label={s.profit >= 0 ? 'Profit' : 'Loss'} value={AED(Math.abs(s.profit)) + (s.totalContract > 0 ? ` · ${mPct}%` : '')} color={s.profit >= 0 ? '#22c55e' : '#ef4444'} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px,1fr))', gap: 10 }}>
                <div style={{ ...card, padding: '13px 15px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}><i className="ti ti-chart-pie" style={{ color: '#0099cc' }} /> Project status</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                    {[['Total', s.counts.total, 'var(--text)'], ['Ongoing', s.counts.ongoing, '#0099cc'], ['Completed', s.counts.completed, '#22c55e'], ['Planning', s.counts.planning, '#64748b'], ['On hold', s.counts.on_hold, '#f59e0b']].map(([k, v, c]) => (
                      <div key={k}><div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div><div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{k}</div></div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--border)' }}>
                    <div><div style={{ fontSize: 13.5, fontWeight: 700, color: '#8b5cf6' }}>{AED(s.subBalance)}</div><div style={{ fontSize: 10.5, color: 'var(--text3)' }}>Owed to subs</div></div>
                    <div><div style={{ fontSize: 13.5, fontWeight: 700, color: '#f59e0b' }}>{AED(s.siteSpend)}</div><div style={{ fontSize: 10.5, color: 'var(--text3)' }}>Site spend</div></div>
                  </div>
                </div>
                <div style={{ ...card, padding: '13px 15px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}><i className="ti ti-users-group" style={{ color: '#8b5cf6' }} /> Top subcontractors · balance owed</div>
                  {s.topSubs.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>No subcontractors yet.</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {s.topSubs.map((t, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12.5, fontWeight: 700, color: t.balance > 0 ? '#ef4444' : '#22c55e' }}>{AED(t.balance)}</div></div>
                        </div>
                      ))}
                    </div>}
                </div>
              </div>
            </div>
          )
        })()}

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
                const tl = stageByProject[p.id]
                const st = (p.status === 'on_hold' || p.status === 'cancelled' || !tl)
                  ? coarseStatus(p) : tl
                const recv = Number(recvByProject[p.id]) || 0
                const cv = Number(p.contract_value) || 0
                const payPct = cv > 0 ? Math.min(100, Math.round((recv / cv) * 100)) : 0
                const spent = Number(costByProject[p.id]) || 0
                const prof = cv - spent
                const profPct = cv > 0 ? Math.round((prof / cv) * 100) : 0
                const prog = Math.max(0, Math.min(100, p.progress || 0))
                const RC = 2 * Math.PI * 20
                const fmtShort = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null
                const s1 = fmtShort(p.start_date), s2 = fmtShort(p.end_date)
                const row = (top) => ({ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderTop: top ? '1px solid var(--border)' : 'none' })
                const lbl = { fontSize: 11.5, color: 'var(--text2)' }
                const val = { marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--text)' }
                return (
                  <div key={p.id} className="fx-proj" onClick={() => openProject(p)}
                    style={{ cursor: 'pointer', background: `radial-gradient(130% 85% at 50% -10%, ${st.color}24, transparent 55%), var(--card)`, border: '1px solid var(--border)', borderRadius: 16, padding: 14, boxShadow: 'var(--shadow-md)' }}>
                    {/* status + contract value */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: st.color, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: '.4px', boxShadow: `0 3px 10px ${st.color}55`, minWidth: 0, maxWidth: '72%' }}>
                        <i className={'ti ' + st.icon} style={{ fontSize: 12, flexShrink: 0 }} /> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label}</span>
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#0099cc', letterSpacing: '-.3px' }}>{AED(cv)}</span>
                    </div>
                    {/* name + progress ring */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, wordBreak: 'break-word' }}>{p.name}</div>
                      <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
                        <svg width="52" height="52" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="26" cy="26" r="20" fill="none" stroke="var(--border)" strokeWidth="4" />
                          <circle cx="26" cy="26" r="20" fill="none" stroke={st.color} strokeWidth="4" strokeLinecap="round" strokeDasharray={RC} strokeDashoffset={RC * (1 - prog / 100)} style={{ transition: 'stroke-dashoffset .4s' }} />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{prog}<span style={{ fontSize: 8 }}>%</span></span>
                          <span style={{ fontSize: 7, fontWeight: 700, color: 'var(--text3)', letterSpacing: '.3px' }}>DONE</span>
                        </div>
                      </div>
                    </div>
                    {/* client + location */}
                    {(p.client_name || p.location) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 9, background: st.color + '1f', color: st.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="ti ti-user" style={{ fontSize: 15 }} /></div>
                        <div style={{ minWidth: 0 }}>
                          {p.client_name && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.25, wordBreak: 'break-word' }}>{p.client_name}</div>}
                          {p.location && <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.25 }}>{p.location}</div>}
                        </div>
                      </div>
                    )}
                    {/* money rows */}
                    <div style={{ marginTop: 11, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={row(false)}><i className="ti ti-cash" style={{ fontSize: 14, color: '#0099cc' }} /><span style={lbl}>Paid</span><span style={val}>{payPct}% · {AED(recv)}</span></div>
                      <div style={row(true)}><i className="ti ti-coin" style={{ fontSize: 14, color: '#f59e0b' }} /><span style={lbl}>Spent</span><span style={val}>{AED(spent)}</span></div>
                      <div style={row(true)}><i className={'ti ' + (prof >= 0 ? 'ti-trending-up' : 'ti-trending-down')} style={{ fontSize: 14, color: prof >= 0 ? '#22c55e' : '#ef4444' }} /><span style={lbl}>{prof >= 0 ? 'Profit' : 'Loss'}</span><span style={{ ...val, color: prof >= 0 ? '#22c55e' : '#ef4444' }}>{AED(Math.abs(prof))}{cv > 0 ? ` · ${profPct}%` : ''}</span></div>
                    </div>
                    {/* timeline */}
                    {(s1 || s2) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 11, padding: '9px 11px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                        <i className="ti ti-calendar-event" style={{ fontSize: 16, color: st.color, flexShrink: 0 }} />
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{s1 || '—'} <span style={{ color: 'var(--text3)' }}>→</span> {s2 || '—'}</div>
                      </div>
                    )}
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
  const activeStage = timelineStage(milestones)
  const st = (active.status === 'on_hold' || active.status === 'cancelled' || !activeStage)
    ? coarseStatus(active) : activeStage
  return (
    <div style={{ color: 'var(--text)' }}>
      <style>{FX}</style>
      <div className="fx-hero" style={{ borderRadius: 18, padding: '18px 20px', marginBottom: 16, background: heroBg, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap', position: 'relative' }}>
          <button onClick={() => { setView('list'); setActive(null); if (setSubRoute) setSubRoute('') }} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.12)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}><i className="ti ti-arrow-left" style={{ fontSize: 16 }} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <h1 className="font-syne fw-700" style={{ fontSize: 21, margin: 0, wordBreak: 'break-word', letterSpacing: '-.4px' }}>{active.name}</h1>
              <span style={{ background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, border: '1px solid rgba(255,255,255,.25)' }}>{st.label}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.78)', marginTop: 2 }}><i className="ti ti-user" style={{ fontSize: 13, verticalAlign: '-1px' }} /> {active.client_name || 'No client'}{active.location ? ' · ' + active.location : ''}</div>
          </div>
          <button onClick={() => editProject(active)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '9px 15px', borderRadius: 10, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.12)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}><i className="ti ti-edit" /> Edit</button>
          <button onClick={() => deleteProject(active.id)} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(239,68,68,0.25)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}><i className="ti ti-trash" style={{ fontSize: 15 }} /></button>
        </div>
      </div>

      {/* budget summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: voAdj !== 0 ? 8 : 16 }}>
        <StatTile icon="ti-wallet" label={voAdj !== 0 ? 'Contract (revised)' : 'Contract value'} value={AED(value)} color="#0099cc" />
        <StatTile icon="ti-users-group" label="Subcontractors" value={AED(totalSubs)} color="#8b5cf6" />
        <StatTile icon="ti-coin" label="Site expenses" value={AED(totalExpenses)} color="#f59e0b" />
        {totalPurchases > 0 && <StatTile icon="ti-shopping-cart" label="Purchases" value={AED(totalPurchases)} color="#9a3412" />}
        <StatTile icon="ti-receipt" label="Total cost" value={AED(totalCost)} color="#ef4444" />
        <StatTile icon={margin >= 0 ? 'ti-trending-up' : 'ti-trending-down'} label={margin >= 0 ? 'Profit' : 'Loss'} value={AED(Math.abs(margin)) + (value > 0 ? ` · ${marginPct}%` : '')} color={margin >= 0 ? '#22c55e' : '#ef4444'} />
      </div>
      {voAdj !== 0 && (
        <div style={{ ...card, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12.5 }}>
          <span style={{ color: 'var(--text2)' }}>Original {AED(origValue)} <span style={{ color: voAdj < 0 ? '#b45309' : '#0f6e56', fontWeight: 600 }}>{voAdj < 0 ? '−' : '+'} {AED(Math.abs(voAdj))} variations</span> = <b style={{ color: 'var(--text)' }}>{AED(value)} revised</b></span>
          {active.quote_id && <button onClick={() => onNavigate && onNavigate('quotations')} className="btn btn-secondary btn-sm"><i className="ti ti-git-branch" /> Manage VOs</button>}
        </div>
      )}

      {/* live progress bars — work (from timeline) + payment (from invoices) */}
      <div style={{ ...card, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 16 }}>
        {[
          { ic: 'ti-progress-check', label: 'Work progress', sub: milestones.length ? `${milestones.filter(m => m.status === 'done').length}/${milestones.length} stages` : 'No stages yet', pct: workPct, color: '#22c55e' },
          { ic: 'ti-cash', label: 'Payment received', sub: `${AED(clientReceived)} of ${AED(value)}`, pct: paymentPct, color: '#0099cc' },
        ].map(b => (
          <div key={b.label}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}><i className={'ti ' + b.ic} style={{ color: b.color, fontSize: 15 }} /> {b.label}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: b.color }}>{b.pct}%</span>
            </div>
            <div style={{ height: 9, background: 'var(--bg2)', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: b.pct + '%', height: '100%', background: `linear-gradient(90deg, ${b.color}, ${b.color}aa)`, borderRadius: 99, transition: 'width .35s ease' }} /></div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>{b.sub}</div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {[['overview', 'Overview', 'ti-layout'], ['timeline', `Timeline (${milestones.length})`, 'ti-timeline-event'], ['scope', `Scope (${scope.length})`, 'ti-list-check'], ['subs', `Subcontractors (${subs.length})`, 'ti-users-group'], ['payments', `Client payments (${invoices.length})`, 'ti-cash'], ['materials', `Materials (${materials.length})`, 'ti-package'], ['expenses', `Expenses (${expenses.length})`, 'ti-coin']].map(([k, l, ic]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 15px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', color: tab === k ? 'var(--primary)' : 'var(--text2)', borderBottom: tab === k ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }}><i className={'ti ' + ic} style={{ fontSize: 15, verticalAlign: '-2px', marginRight: 4 }} />{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
        <div style={{ ...card }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14 }}>
            <div>
              <label style={lbl}>Status <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· auto from timeline</span></label>
              <div style={{ marginBottom: 7 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 11px', borderRadius: 99, background: st.color, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}><i className={'ti ' + (st.icon || 'ti-progress')} style={{ flexShrink: 0 }} /> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label}</span></span>
              </div>
              <select value={(active.status === 'on_hold' || active.status === 'cancelled') ? active.status : 'active'}
                onChange={e => patchActive({ status: e.target.value === 'active' ? (activeStage?.complete ? 'completed' : 'ongoing') : e.target.value })} style={input}>
                <option value="active">Active — follow timeline</option>
                <option value="on_hold">On hold</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 5, lineHeight: 1.4 }}>{activeStage ? 'Status updates as you advance stages in the Timeline tab.' : 'Add stages in the Timeline tab to drive the status.'}</div>
            </div>
            <div><label style={lbl}>Start date</label><input type="date" value={active.start_date || ''} onChange={e => patchActive({ start_date: e.target.value || null })} style={input} /></div>
            <div>
              <label style={lbl}>Committed (days)</label>
              <input type="number" min="0" value={cDays} placeholder="e.g. 15"
                onChange={e => setCDays(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                onBlur={() => {
                  if (cDays === '') return
                  if (!active.start_date) { toast.error('Set a start date first'); return }
                  const d = parseInt(cDays)
                  if (!(d >= 0)) return
                  const end = new Date(new Date(active.start_date).getTime() + d * 86400000)
                  patchActive({ end_date: end.toISOString().slice(0, 10) })
                }}
                style={input} title="Days from start date — auto-fills Target end" />
            </div>
            <div><label style={lbl}>Target end</label><input type="date" value={active.end_date || ''} onChange={e => patchActive({ end_date: e.target.value || null })} style={input} /></div>
          </div>
          <label style={{ ...lbl, marginTop: 14 }}>Notes</label>
          <textarea value={active.notes || ''} onChange={e => setActive(a => ({ ...a, notes: e.target.value }))} onBlur={e => patchActive({ notes: e.target.value || null })} rows={3} style={{ ...input, resize: 'vertical', minHeight: 70 }} placeholder="Scope, site details, key dates…" />
          {active.quote_id && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10 }}><i className="ti ti-file-invoice" /> Linked to a quotation</div>}
        </div>

        {/* Client access — share the link + access code over WhatsApp; client follows the project & approves changes */}
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}><i className="ti ti-user-share" style={{ color: '#0099cc', fontSize: 17 }} /> Client access</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>Send the project link + access code to your client on WhatsApp. The primary number is locked to the client on record (no leaks); add more numbers if needed.</div>
          {active.public_token
            ? (() => {
                const link = `${window.location.origin}/#project/${active.public_token}`
                const msg = `Track your project "${active.name}" live here:\n${link}\nAccess code: ${active.access_code || ''}`
                const sendTo = (num) => { const ph = (num || '').replace(/\D/g, ''); if (!ph) { toast.error('No number'); return } window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank') }
                const extras = (active.extra_phones || '').split(',').map(s => s.trim()).filter(Boolean)
                const waBtn = (num, label) => <button key={num + label} onClick={() => sendTo(num)} className="btn btn-sm" style={{ background: '#22c55e', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}><i className="ti ti-brand-whatsapp" /> {label}</button>
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={lbl}>Primary WhatsApp <i className="ti ti-lock" style={{ fontSize: 11, verticalAlign: '-1px' }} /> <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(from client)</span></label>
                        {active.client_phone
                          ? <input readOnly value={active.client_phone} style={{ ...input, background: 'var(--bg2)', color: 'var(--text2)' }} title="Locked to the client on record" />
                          : <input value={active.client_phone || ''} onChange={e => setActive(a => ({ ...a, client_phone: e.target.value }))} onBlur={e => patchActive({ client_phone: e.target.value.trim() || null })} style={input} placeholder="+9715XXXXXXXX (set once)" />}
                      </div>
                      <div><label style={lbl}>Access code</label><input readOnly value={active.access_code || '—'} style={{ ...input, fontWeight: 800, letterSpacing: 3 }} /></div>
                    </div>
                    <label style={lbl}>Additional numbers <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(comma-separated)</span></label>
                    <input value={active.extra_phones || ''} onChange={e => setActive(a => ({ ...a, extra_phones: e.target.value }))} onBlur={e => patchActive({ extra_phones: e.target.value.trim() || null })} style={{ ...input, marginBottom: 12 }} placeholder="+97150…, +97155…" />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => { navigator.clipboard?.writeText(`${link}\nAccess code: ${active.access_code || ''}`); toast.success('Link + code copied ✓') }} className="btn btn-secondary btn-sm"><i className="ti ti-copy" /> Copy link + code</button>
                      {active.client_phone && waBtn(active.client_phone, 'Send to client')}
                      {extras.map((num, i) => waBtn(num, 'Send · ' + num))}
                    </div>
                  </>
                )
              })()
            : <div style={{ fontSize: 11.5, color: 'var(--text3)' }}><i className="ti ti-info-circle" style={{ verticalAlign: '-2px' }} /> Run db/2026-06-17_project_client_code.sql to enable client access.</div>}
        </div>

        {/* Project history & updates — meetings, client requirements, material/timeline changes */}
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}><i className="ti ti-history" style={{ color: '#0099cc', fontSize: 17 }} /> Project history &amp; updates</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {updates.length > 0 && <button onClick={exportComms} className="btn btn-secondary btn-sm"><i className="ti ti-file-download" /> Export PDF</button>}
              <button onClick={() => setUpdForm({ kind: 'meeting', title: '', body: '', event_date: new Date().toISOString().slice(0, 10), client_visible: true, needs_approval: false })} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> Add update</button>
            </div>
          </div>
          {updates.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '26px 16px', fontSize: 13 }}><i className="ti ti-history" style={{ fontSize: 26, display: 'block', marginBottom: 8 }} />No updates yet. Log meetings, client requirements, material or timeline changes — they appear here as a timeline.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {updates.map(u => {
                  const k = UPD_KIND[u.kind] || UPD_KIND.note
                  const ap = APPROVAL[u.approval_status] || null
                  const fc = u.from_client, ac = fc ? '#0a6f8f' : k.c
                  return (
                    <div key={u.id} onClick={() => { if (!fc) setUpdForm({ ...u, event_date: u.event_date || '', old_date: u.old_date || '', new_date: u.new_date || '' }) }}
                      style={{ display: 'flex', gap: 11, padding: '11px 12px', border: '1px solid var(--border)', borderLeft: '3px solid ' + ac, borderRadius: 12, background: fc ? 'rgba(10,111,143,0.05)' : 'var(--card)', cursor: fc ? 'default' : 'pointer' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: ac + '1f', color: ac, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={'ti ' + (fc ? 'ti-user' : k.icon)} style={{ fontSize: 17 }} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: ac, background: ac + '1f', padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.3px' }}>{fc ? 'From client' : k.l}</span>
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtD(u.event_date)}</span>
                          {!fc && (u.created_by_name || u.created_by_email) && <span style={{ fontSize: 11, color: 'var(--text3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><i className="ti ti-user-circle" style={{ fontSize: 13, verticalAlign: '-2px' }} /> {u.created_by_name || (u.created_by_email || '').split('@')[0]}</span>}
                          {!fc && u.client_visible && <span style={{ fontSize: 9, fontWeight: 700, color: '#0099cc', display: 'inline-flex', alignItems: 'center', gap: 3 }}><i className="ti ti-eye" style={{ fontSize: 12 }} /> Client</span>}
                          {ap && <span style={{ fontSize: 9, fontWeight: 700, color: ap.c, background: ap.c + '1f', padding: '2px 7px', borderRadius: 99 }}>{ap.l}</span>}
                        </div>
                        {u.title && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 3 }}>{u.title}</div>}
                        {u.body && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{u.body}</div>}
                        {u.kind === 'timeline' && (u.old_date || u.new_date) && <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 4 }}><i className="ti ti-calendar-stats" style={{ fontSize: 13, verticalAlign: '-2px', color: '#ef4444' }} /> {fmtD(u.old_date) || '—'} <span style={{ color: 'var(--text3)' }}>→</span> <b>{fmtD(u.new_date) || '—'}</b></div>}
                        {u.client_comment && <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 5, background: 'var(--bg2)', borderRadius: 8, padding: '6px 9px', borderLeft: '2px solid #0a6f8f' }}><i className="ti ti-message-2" style={{ verticalAlign: '-2px', color: '#0a6f8f' }} /> Client: {u.client_comment}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>}
        </div>
        </>
      )}

      {tab === 'timeline' && (() => {
        const done = milestones.filter(m => m.status === 'done').length
        const pct = weightedPct(milestones)
        const totalW = milestones.reduce((a, m) => a + (Number(m.weight) || 0), 0)
        const today = new Date().toISOString().slice(0, 10)
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>{done}/{milestones.length} stages done · <b style={{ color: '#22c55e' }}>{pct}%</b> complete{totalW > 0 && Math.round(totalW) !== 100 ? <span style={{ color: '#f59e0b' }}> · weights = {Math.round(totalW)}% (aim for 100%)</span> : ''}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {milestones.length === 0 && <button onClick={seedDefaultStages} className="btn btn-secondary btn-sm"><i className="ti ti-sparkles" /> Add default stages</button>}
                <button onClick={() => setMsForm({ title: '', target_date: '', status: 'pending', weight: '', note: '' })} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> Add stage</button>
              </div>
            </div>
            {milestones.length > 0 && <div style={{ height: 8, background: 'var(--bg2)', borderRadius: 99, overflow: 'hidden', marginBottom: 18 }}><div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,#22c55e,#16a34a)', borderRadius: 99, transition: 'width .3s ease' }} /></div>}
            {milestones.length === 0 ? <div style={{ ...card, textAlign: 'center', color: 'var(--text3)', padding: '34px 16px' }}><i className="ti ti-timeline-event" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />No stages yet. Add the default fit-out stages or create your own.</div>
              : <div style={{ position: 'relative', paddingLeft: 8 }}>
                {milestones.map((m, i) => {
                  const ms = MILESTONE_ST[m.status] || MILESTONE_ST.pending
                  const overdue = m.status !== 'done' && m.target_date && m.target_date < today
                  const last = i === milestones.length - 1
                  return (
                    <div key={m.id} style={{ position: 'relative', display: 'flex', gap: 13, paddingBottom: last ? 0 : 16 }}>
                      {!last && <div style={{ position: 'absolute', left: 14, top: 30, bottom: 0, width: 2, background: 'var(--border)' }} />}
                      <button onClick={() => cycleMilestone(m)} title="Click to advance status" style={{ width: 30, height: 30, borderRadius: '50%', border: `2px solid ${ms.c}`, background: m.status === 'done' ? ms.c : 'var(--card)', color: m.status === 'done' ? '#fff' : ms.c, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, padding: 0 }}><i className={'ti ' + ms.ic} style={{ fontSize: 15 }} /></button>
                      <div style={{ ...card, flex: 1, padding: '11px 13px', borderColor: overdue ? 'rgba(239,68,68,0.4)' : 'var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 150 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, textDecoration: m.status === 'done' ? 'line-through' : 'none', opacity: m.status === 'done' ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>{m.title}{Number(m.weight) > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.12)', borderRadius: 99, padding: '1px 7px' }}>{Math.round(Number(m.weight))}%</span>}</div>
                            <div style={{ fontSize: 11.5, color: overdue ? '#ef4444' : 'var(--text3)', marginTop: 2 }}>
                              {m.target_date ? <><i className="ti ti-calendar" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {fmtD(m.target_date)}{overdue ? ' · overdue' : ''}</> : 'No target date'}
                              {m.status === 'done' && m.done_on ? ' · done ' + fmtD(m.done_on) : ''}
                              {m.note ? ' · ' + m.note : ''}
                            </div>
                          </div>
                          <span style={{ display: 'inline-flex' }}><Badge c={ms.c}>{ms.l}</Badge></span>
                          <button onClick={() => setMsForm({ ...m, target_date: m.target_date || '' })} style={iconBtn}><i className="ti ti-edit" style={{ fontSize: 14 }} /></button>
                          <button onClick={() => delMilestone(m.id)} style={{ ...iconBtn, color: '#ef4444' }}><i className="ti ti-trash" style={{ fontSize: 14 }} /></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>}
            {milestones.length > 0 && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 12 }}><i className="ti ti-info-circle" /> Click a circle to advance Pending → In progress → Done. Project progress updates automatically.</div>}
          </div>
        )
      })()}

      {tab === 'scope' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>Assign each scope line to a subcontractor with an amount.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {active.quote_id && scope.length === 0 && <button onClick={importScopeFromQuote} className="btn btn-secondary btn-sm"><i className="ti ti-download" /> Import from quote</button>}
              <button onClick={() => setScopeForm({ description: '', unit: '', quantity: 1, client_amount: 0, trade: '' })} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> Add item</button>
            </div>
          </div>
          {scope.length === 0 ? <div style={{ ...card, textAlign: 'center', color: 'var(--text3)', padding: '34px 16px' }}>{active.quote_id ? 'Import the scope from the linked quote, or add items manually.' : 'Add scope-of-work items.'}</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scope.map(it => { const assignedSub = subs.find(s => s.id === it.sub_id); return (
                <div key={it.id} style={{ ...card, padding: '11px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, wordBreak: 'break-word' }}>{it.description}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>{it.quantity} {it.unit || ''}{it.trade ? ' · ' + it.trade : ''}{it.client_amount ? ' · client ' + AED(it.client_amount) : ''}</div>
                    </div>
                    <button onClick={() => setScopeForm({ ...it })} style={iconBtn}><i className="ti ti-edit" style={{ fontSize: 14 }} /></button>
                    <button onClick={() => delScopeItem(it)} style={{ ...iconBtn, color: '#ef4444' }}><i className="ti ti-trash" style={{ fontSize: 14 }} /></button>
                  </div>
                  {(() => {
                    const isAssigned = !!it.sub_id
                    const editing = editScopeId === it.id
                    if (isAssigned && !editing) {
                      return (
                        <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 99, padding: '5px 11px' }}><i className="ti ti-user-check" style={{ fontSize: 14 }} /> {assignedSub ? assignedSub.name : 'Subcontractor'} · {AED(it.sub_amount)}</span>
                          <button onClick={() => { setEditScopeId(it.id); setAssignDrafts(d => ({ ...d, [it.id]: { sub_id: it.sub_id, sub_amount: it.sub_amount } })) }} style={{ ...iconBtn, width: 'auto', height: 28, padding: '0 11px', fontSize: 12, fontWeight: 600 }}><i className="ti ti-switch-horizontal" style={{ fontSize: 13, verticalAlign: '-2px', marginRight: 3 }} /> Change</button>
                          <button onClick={() => unassign(it)} style={{ ...iconBtn, width: 'auto', height: 28, padding: '0 11px', fontSize: 12, fontWeight: 600, color: '#ef4444' }}><i className="ti ti-user-minus" style={{ fontSize: 13, verticalAlign: '-2px', marginRight: 3 }} /> Remove</button>
                        </div>
                      )
                    }
                    const draft = assignDrafts[it.id] || { sub_id: '', sub_amount: '' }
                    const setDraft = patch => setAssignDrafts(d => ({ ...d, [it.id]: { ...draft, ...patch } }))
                    return (
                      <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}><i className="ti ti-user-plus" style={{ fontSize: 13, verticalAlign: '-2px' }} /> Assign</span>
                        <select value={draft.sub_id} onChange={e => setDraft({ sub_id: e.target.value })} style={{ ...input, width: 'auto', flex: '1 1 150px', padding: '6px 9px', fontSize: 12 }}>
                          <option value="">— Select subcontractor —</option>
                          {subs.map(s => <option key={s.id} value={s.id}>{s.name}{s.trade ? ' (' + s.trade + ')' : ''}</option>)}
                        </select>
                        <input type="number" value={draft.sub_amount} onChange={e => setDraft({ sub_amount: e.target.value })} placeholder="Amount (AED)" style={{ ...input, width: 130, padding: '6px 9px', fontSize: 12 }} />
                        <button onClick={() => doAssign(it, draft)} style={{ height: 30, padding: '0 14px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}><i className="ti ti-check" style={{ fontSize: 14, verticalAlign: '-2px', marginRight: 3 }} /> Assign</button>
                        {editing && <button onClick={() => { setEditScopeId(null); setAssignDrafts(d => { const n = { ...d }; delete n[it.id]; return n }) }} style={{ ...iconBtn, width: 'auto', height: 30, padding: '0 11px', fontSize: 12, fontWeight: 600 }}>Cancel</button>}
                      </div>
                    )
                  })()}
                </div>
              ) })}
            </div>}
          {subs.length === 0 && scope.length > 0 && <div style={{ fontSize: 11.5, color: '#f59e0b', marginTop: 10 }}><i className="ti ti-info-circle" /> Add subcontractors first (Subcontractors tab) to assign scope to them.</div>}
        </div>
      )}

      {tab === 'subs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>Contracts: <b style={{ color: '#8b5cf6' }}>{AED(totalSubs)}</b> · Paid: <b style={{ color: '#22c55e' }}>{AED(subsPaid)}</b> · Balance: <b style={{ color: '#ef4444' }}>{AED(totalSubs - subsPaid)}</b></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(company?.plan === 'gold' || company?.plan === 'platinum') && (
                <button onClick={() => {
                  try { localStorage.setItem('qv_mkt_prefill', JSON.stringify({ projectId: active.id, title: active.name, location: active.location || '' })) } catch {}
                  try { localStorage.setItem('lead_main_tab', 'subcontract') } catch {}
                  onNavigate ? onNavigate('leads') : (window.location.hash = 'leads')
                }} className="btn btn-secondary btn-sm"><i className="ti ti-building-store" style={{ verticalAlign: '-2px', marginRight: 3 }} /> Find on Marketplace</button>
              )}
              <button onClick={() => setSubForm({ name: '', trade: 'MEP', phone: '', status: 'ongoing', notes: '', apply_vat: true, payment_days: 30, payment_schedule: [{ label: 'Advance on signing', pct: 40 }, { label: 'On delivery to site', pct: 30 }, { label: 'On completion & handover', pct: 30 }] })} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> Add subcontractor</button>
            </div>
          </div>
          {subs.length === 0 ? <div style={{ ...card, textAlign: 'center', color: 'var(--text3)', padding: '34px 16px' }}>No subcontractors yet. Add MEP, Gypsum, Tiles…</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {subs.map(s => { const ss = SSTATUS[s.status] || SSTATUS.ongoing; const bal = (Number(s.contract_amount) || 0) - (Number(s.paid_amount) || 0); return (
                <div key={s.id} style={{ ...card, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{s.name}</span>
                        {s.trade && <Badge c="#8b5cf6">{s.trade}</Badge>}
                        <Badge c={ss.c}>{ss.l}</Badge>
                      </div>
                      {s.phone && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}><i className="ti ti-phone" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {s.phone}{s.notes ? ' · ' + s.notes : ''}</div>}
                    </div>
                    <button onClick={() => setSubForm({ ...s, apply_vat: s.apply_vat ?? true, payment_days: s.payment_days ?? 30, payment_schedule: (Array.isArray(s.payment_schedule) && s.payment_schedule.length) ? s.payment_schedule : [{ label: 'Advance on signing', pct: 40 }, { label: 'On delivery to site', pct: 30 }, { label: 'On completion & handover', pct: 30 }] })} style={iconBtn}><i className="ti ti-edit" style={{ fontSize: 15 }} /></button>
                    <button onClick={() => delSub(s.id)} style={{ ...iconBtn, color: '#ef4444' }}><i className="ti ti-trash" style={{ fontSize: 15 }} /></button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginTop: 10 }}>
                    {[['Contract', AED(s.contract_amount), 'var(--text)'], ['Paid', AED(s.paid_amount), '#22c55e'], ['Balance', AED(bal), bal > 0 ? '#ef4444' : '#22c55e']].map(([k, v, c]) => (
                      <div key={k} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 10, color: 'var(--text3)' }}>{k}</div><div style={{ fontSize: 13.5, fontWeight: 700, color: c }}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => openPayments(s)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><i className="ti ti-cash" /> Payments</button>
                    <button onClick={() => generateLPO(s)} className="btn btn-secondary btn-sm"><i className="ti ti-files" style={{ verticalAlign: '-2px', marginRight: 4 }} />{s.lpo_number ? 'LPO + NDA · ' + s.lpo_number : 'Generate LPO + NDA'}</button>
                    <button onClick={() => toggleContract(s)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: `1px solid ${s.contract_signed ? '#22c55e' : 'var(--border)'}`, background: s.contract_signed ? 'rgba(34,197,94,0.1)' : 'transparent', color: s.contract_signed ? '#22c55e' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><i className={'ti ' + (s.contract_signed ? 'ti-circle-check-filled' : 'ti-writing-sign')} /> {s.contract_signed ? 'Contract signed' : 'Mark contract signed'}</button>
                    {scope.filter(x => x.sub_id === s.id).length > 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{scope.filter(x => x.sub_id === s.id).length} scope items assigned</span>}
                  </div>
                </div>
              ) })}
            </div>}
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

      {tab === 'payments' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
            <StatTile icon="ti-wallet" label="Contract value" value={AED(value)} color="#0099cc" />
            <StatTile icon="ti-file-invoice" label="Invoiced" value={AED(totalInvoiced)} color="#8b5cf6" />
            <StatTile icon="ti-cash" label="Received" value={AED(clientReceived)} color="#22c55e" />
            <StatTile icon="ti-clock-dollar" label="Outstanding" value={AED(clientOutstanding)} color="#ef4444" />
          </div>
          <div style={{ ...card, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: `linear-gradient(135deg, ${netCash >= 0 ? '#22c55e' : '#ef4444'}14, transparent)` }}>
            <i className={'ti ' + (netCash >= 0 ? 'ti-trending-up' : 'ti-trending-down')} style={{ fontSize: 22, color: netCash >= 0 ? '#22c55e' : '#ef4444' }} />
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>Net cash position <span style={{ color: 'var(--text3)' }}>(received − sub paid − site spend)</span></div>
              <div style={{ fontSize: 18, fontWeight: 800, color: netCash >= 0 ? '#22c55e' : '#ef4444' }}>{AED(netCash)}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>Paid to subs {AED(subsPaid)}<br />Site spend {AED(totalExpenses)}</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>Receipts come from the linked invoices — managed in the Invoices module.</div>
            <button onClick={() => onNavigate && onNavigate('invoices')} className="btn btn-primary btn-sm"><i className="ti ti-external-link" style={{ verticalAlign: '-2px', marginRight: 4 }} /> Open Invoices</button>
          </div>
          {invoices.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--text3)', padding: '34px 16px' }}>
              <i className="ti ti-file-invoice" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
              No invoices raised for this project yet.<br />
              <span style={{ fontSize: 12 }}>Create one from the approved quote in the Invoices page — payments recorded there show up here.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {invoices.map(iv => {
                const paid = invPaid(iv); const tot = Number(iv.total) || 0; const bal = Math.max(0, tot - paid)
                const voided = iv.status === 'cancelled' || iv.status === 'hold'
                const ist = iv.status === 'paid' ? { c: '#22c55e', l: 'Paid' } : iv.status === 'partial' ? { c: '#f59e0b', l: 'Partial' } : iv.status === 'hold' ? { c: '#7c5c00', l: 'On hold' } : iv.status === 'cancelled' ? { c: '#9ca3af', l: 'Cancelled' } : { c: '#ef4444', l: 'Unpaid' }
                return (
                  <div key={iv.id} onClick={() => onNavigate && onNavigate('invoices')} style={{ ...card, padding: '12px 14px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{iv.invoice_number}</span>
                          <Badge c={ist.c}>{ist.l}</Badge>
                          {iv.milestone_label && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{iv.milestone_label}</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Issued {fmtD(iv.issue_date)}{iv.due_date ? ' · due ' + fmtD(iv.due_date) : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, textDecoration: iv.status === 'cancelled' ? 'line-through' : 'none', opacity: voided ? 0.6 : 1 }}>{AED(tot)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{voided ? ist.l : (<><span style={{ color: '#22c55e' }}>{AED(paid)} paid</span>{bal > 0 ? ` · ${AED(bal)} due` : ''}</>)}</div>
                      </div>
                    </div>
                    {tot > 0 && <div style={{ height: 5, background: 'var(--bg2)', borderRadius: 99, overflow: 'hidden', marginTop: 9 }}><div style={{ width: Math.min(100, (paid / tot) * 100) + '%', height: '100%', background: ist.c, borderRadius: 99 }} /></div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {projModal && ProjectModal()}
      {matForm && <FormModal title={matForm.id ? 'Edit material' : 'Add material'} onClose={() => setMatForm(null)} onSave={saveMaterial} saving={saving}>
        <label style={lbl}>Item</label><input autoFocus value={matForm.item} onChange={e => setMatForm(m => ({ ...m, item: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. MDF board 18mm" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Quantity</label><input type="number" value={matForm.quantity} onChange={e => setMatForm(m => ({ ...m, quantity: e.target.value }))} style={input} /></div>
          <div><label style={lbl}>Unit</label><input value={matForm.unit} onChange={e => setMatForm(m => ({ ...m, unit: e.target.value }))} style={input} placeholder="Nos / m² / kg" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Vendor</label><input value={matForm.vendor} onChange={e => setMatForm(m => ({ ...m, vendor: e.target.value }))} style={input} /></div>
          <div><label style={lbl}>Est. cost (AED)</label><input type="number" value={matForm.est_cost} onChange={e => setMatForm(m => ({ ...m, est_cost: e.target.value }))} style={input} /></div>
        </div>
        <label style={lbl}>Status</label><select value={matForm.status} onChange={e => setMatForm(m => ({ ...m, status: e.target.value }))} style={input}>{Object.entries(MSTATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
      </FormModal>}
      {expForm && <FormModal title={expForm.id ? 'Edit expense' : 'Add expense'} onClose={() => setExpForm(null)} onSave={saveExpense} saving={saving}>
        <label style={lbl}>Category</label><select value={expForm.category} onChange={e => setExpForm(x => ({ ...x, category: e.target.value }))} style={{ ...input, marginBottom: 10 }}>{Object.entries(ECAT).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
        <label style={lbl}>Description</label><input autoFocus value={expForm.description} onChange={e => setExpForm(x => ({ ...x, description: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. Carpenter — 2 days" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          <div><label style={lbl}>Amount (AED)</label><input type="number" autoFocus value={expForm.amount} onChange={e => setExpForm(x => ({ ...x, amount: e.target.value }))} style={input} /></div>
          <div><label style={lbl}>Date</label><input type="date" value={expForm.spent_on} onChange={e => setExpForm(x => ({ ...x, spent_on: e.target.value }))} style={input} /></div>
        </div>
      </FormModal>}
      {msForm && <FormModal title={msForm.id ? 'Edit stage' : 'Add stage'} onClose={() => setMsForm(null)} onSave={saveMilestone} saving={saving}>
        <label style={lbl}>Stage / milestone</label><input autoFocus value={msForm.title} onChange={e => setMsForm(s => ({ ...s, title: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. Gypsum & false ceiling" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Target date</label><input type="date" value={msForm.target_date} onChange={e => setMsForm(s => ({ ...s, target_date: e.target.value }))} style={input} /></div>
          <div><label style={lbl}>Weight (% of project)</label><input type="number" value={msForm.weight} onChange={e => setMsForm(s => ({ ...s, weight: e.target.value }))} style={input} placeholder="e.g. 20" /></div>
        </div>
        <label style={lbl}>Status</label><select value={msForm.status} onChange={e => setMsForm(s => ({ ...s, status: e.target.value }))} style={{ ...input, marginBottom: 10 }}>{Object.entries(MILESTONE_ST).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
        <label style={lbl}>Note</label><input value={msForm.note || ''} onChange={e => setMsForm(s => ({ ...s, note: e.target.value }))} style={input} placeholder="Optional detail…" />
      </FormModal>}
      {updForm && <FormModal title={updForm.id ? 'Edit update' : 'Add project update'} onClose={() => setUpdForm(null)} onSave={saveUpdate} saving={saving} onDelete={updForm.id ? () => delUpdate(updForm.id) : undefined}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Type</label><select value={updForm.kind} onChange={e => setUpdForm(s => ({ ...s, kind: e.target.value }))} style={input}>{Object.entries(UPD_KIND).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select></div>
          <div><label style={lbl}>Date</label><input type="date" value={updForm.event_date || ''} onChange={e => setUpdForm(s => ({ ...s, event_date: e.target.value }))} style={input} /></div>
        </div>
        <label style={lbl}>Title</label><input autoFocus value={updForm.title || ''} onChange={e => setUpdForm(s => ({ ...s, title: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. Site meeting — kitchen layout" />
        <label style={lbl}>Details</label><textarea value={updForm.body || ''} onChange={e => setUpdForm(s => ({ ...s, body: e.target.value }))} rows={4} style={{ ...input, marginBottom: 10, resize: 'vertical', minHeight: 80 }} placeholder="What was discussed / decided / changed…" />
        {updForm.kind === 'timeline' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>Previous date</label><input type="date" value={updForm.old_date || active.end_date || ''} onChange={e => setUpdForm(s => ({ ...s, old_date: e.target.value }))} style={input} /></div>
            <div><label style={lbl}>New date</label><input type="date" value={updForm.new_date || ''} onChange={e => setUpdForm(s => ({ ...s, new_date: e.target.value }))} style={input} /></div>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
          <input type="checkbox" checked={updForm.client_visible !== false} onChange={e => setUpdForm(s => ({ ...s, client_visible: e.target.checked }))} style={{ width: 16, height: 16 }} />
          <span><i className="ti ti-eye" style={{ fontSize: 14, verticalAlign: '-2px', marginRight: 4, color: '#0099cc' }} />Visible to client</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 0', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
          <input type="checkbox" checked={!!updForm.needs_approval} onChange={e => setUpdForm(s => ({ ...s, needs_approval: e.target.checked }))} style={{ width: 16, height: 16 }} />
          <span><i className="ti ti-checkbox" style={{ fontSize: 14, verticalAlign: '-2px', marginRight: 4, color: '#f59e0b' }} />Needs client approval</span>
        </label>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>Client visibility &amp; approval apply once the client view is live (Phase 3). A timeline change updates the project Target end{updForm.needs_approval ? ' after the client approves' : ''}.</div>
      </FormModal>}
      {subForm && <FormModal title={subForm.id ? 'Edit subcontractor' : 'Add subcontractor'} onClose={() => setSubForm(null)} onSave={saveSub} saving={saving}>
        {!subForm.id && (() => {
          const usedNames = new Set(subs.map(s => (s.name || '').trim().toLowerCase()))
          const pickable = subDirectory.filter(r => !usedNames.has((r.name || '').trim().toLowerCase()))
          if (!pickable.length) return null
          return (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 9, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)' }}>
              <label style={{ ...lbl, color: '#8b5cf6' }}><i className="ti ti-address-book" /> Pick a saved subcontractor</label>
              <select value="" onChange={e => {
                const r = pickable.find(x => x.name === e.target.value); if (!r) return
                setSubForm(s => ({ ...s,
                  name: r.name, trade: r.trade || s.trade, phone: r.phone || '', contact_person: r.contact_person || '',
                  vat_no: r.vat_no || '', owner_name: r.owner_name || '', owner_mobile: r.owner_mobile || '',
                  apply_vat: r.apply_vat ?? s.apply_vat, payment_days: r.payment_days ?? s.payment_days,
                  payment_schedule: (Array.isArray(r.payment_schedule) && r.payment_schedule.length) ? r.payment_schedule : s.payment_schedule,
                  notes: r.notes || s.notes,
                }))
              }} style={input}>
                <option value="">— Select from your subcontractors —</option>
                {pickable.map((r, i) => <option key={i} value={r.name}>{r.name}{r.trade ? ' · ' + r.trade : ''}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Auto-fills their details. Or type a new one below — it's saved for next time.</div>
            </div>
          )
        })()}
        <label style={lbl}>Name</label><input autoFocus value={subForm.name} onChange={e => setSubForm(s => ({ ...s, name: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. Al Noor MEP Works" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Trade / scope</label><select value={subForm.trade} onChange={e => setSubForm(s => ({ ...s, trade: e.target.value }))} style={input}>{TRADES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label style={lbl}>Phone</label><input value={subForm.phone} onChange={e => setSubForm(s => ({ ...s, phone: e.target.value }))} style={input} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Contact person</label><input value={subForm.contact_person || ''} onChange={e => setSubForm(s => ({ ...s, contact_person: e.target.value }))} style={input} placeholder="On-site contact" /></div>
          <div><label style={lbl}>VAT / TRN no</label><input value={subForm.vat_no || ''} onChange={e => setSubForm(s => ({ ...s, vat_no: e.target.value }))} style={input} placeholder="100xxxxxxxxxxxx" /></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, cursor: 'pointer', background: subForm.apply_vat ? 'rgba(0,153,204,0.08)' : 'var(--bg2)', border: '1px solid ' + (subForm.apply_vat ? 'rgba(0,153,204,0.4)' : 'var(--border)'), borderRadius: 9, padding: '9px 12px' }}>
          <input type="checkbox" checked={!!subForm.apply_vat} onChange={e => setSubForm(s => ({ ...s, apply_vat: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#0099cc', cursor: 'pointer' }} />
          <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>Add 5% VAT on the LPO <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· tick if the subcontractor is VAT-registered (has TRN)</span></span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Owner name</label><input value={subForm.owner_name || ''} onChange={e => setSubForm(s => ({ ...s, owner_name: e.target.value }))} style={input} /></div>
          <div><label style={lbl}>Owner mobile</label><input value={subForm.owner_mobile || ''} onChange={e => setSubForm(s => ({ ...s, owner_mobile: e.target.value }))} style={input} /></div>
        </div>
        <label style={lbl}>Project code</label><input value={subForm.project_code || ''} onChange={e => setSubForm(s => ({ ...s, project_code: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. PRJ-2026-014" />
        <label style={lbl}>Status</label><select value={subForm.status} onChange={e => setSubForm(s => ({ ...s, status: e.target.value }))} style={{ ...input, marginBottom: 10 }}>{Object.entries(SSTATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
        <label style={lbl}>Notes / scope detail</label><input value={subForm.notes} onChange={e => setSubForm(s => ({ ...s, notes: e.target.value }))} style={input} placeholder="Scope of work…" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, cursor: 'pointer', background: subForm.full_project ? 'rgba(0,153,204,0.08)' : 'var(--bg2)', border: '1px solid ' + (subForm.full_project ? 'rgba(0,153,204,0.4)' : 'var(--border)'), borderRadius: 9, padding: '10px 12px' }}>
          <input type="checkbox" checked={!!subForm.full_project} onChange={e => setSubForm(s => ({ ...s, full_project: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#0099cc', cursor: 'pointer' }} />
          <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>Responsible for the <b>full project</b><div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>Adds a note on the LPO that this contractor owns the entire project.</div></span>
        </label>
        {(() => {
          const sched = Array.isArray(subForm.payment_schedule) ? subForm.payment_schedule : []
          const totalPct = sched.reduce((a, r) => a + (Number(r.pct) || 0), 0)
          const setSched = (next) => setSubForm(s => ({ ...s, payment_schedule: next }))
          return (
            <>
              <label style={{ ...lbl, marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>Payment schedule <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· shown on the LPO</span></span>
                <span style={{ fontWeight: 700, color: totalPct === 100 ? '#16a34a' : '#e0a000' }}>{totalPct}%{totalPct === 100 ? ' ✓' : ' / 100%'}</span>
              </label>
              {sched.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <input value={r.label} onChange={e => setSched(sched.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Stage — e.g. Advance on signing" style={{ ...input, flex: 1 }} />
                  <input type="number" min="0" max="100" value={r.pct} onChange={e => setSched(sched.map((x, j) => j === i ? { ...x, pct: e.target.value } : x))} placeholder="%" style={{ ...input, width: 64, textAlign: 'center' }} />
                  <button onClick={() => setSched(sched.filter((_, j) => j !== i))} style={{ ...iconBtn, flexShrink: 0 }} title="Remove stage"><i className="ti ti-x" style={{ fontSize: 15 }} /></button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                <button onClick={() => setSched([...sched, { label: '', pct: 0 }])} className="btn btn-secondary btn-sm" style={{ flex: 1 }}><i className="ti ti-plus" /> Add stage</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><label style={{ ...lbl, margin: 0, whiteSpace: 'nowrap' }}>Pay within</label><input type="number" min="0" value={subForm.payment_days ?? 30} onChange={e => setSubForm(s => ({ ...s, payment_days: e.target.value }))} style={{ ...input, width: 60, textAlign: 'center' }} /><span style={{ fontSize: 12, color: 'var(--text3)' }}>days</span></div>
              </div>
            </>
          )
        })()}
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 12, lineHeight: 1.6, background: 'var(--bg2)', borderRadius: 9, padding: '9px 11px' }}><i className="ti ti-info-circle" style={{ color: '#0099cc' }} /> Contract amount auto-fills when you assign Scope-of-Work lines. Record payments from the <b>Payments</b> button on the card.</div>
      </FormModal>}
      {payModal && (() => {
        const sub = subs.find(s => s.id === payModal.id) || payModal
        const contract = Number(sub.contract_amount) || 0
        const paid = payList.reduce((a, p) => a + (Number(p.amount) || 0), 0)
        const bal = contract - paid
        return (
          <div onClick={() => { setPayModal(null); setPayForm(null) }} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 480, padding: 22, maxHeight: '92vh', overflowY: 'auto', color: 'var(--text)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{sub.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Payment ledger{sub.trade ? ' · ' + sub.trade : ''}</div>
                </div>
                <button onClick={() => { setPayModal(null); setPayForm(null) }} style={{ ...iconBtn, width: 30, height: 30 }}><i className="ti ti-x" style={{ fontSize: 15 }} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 14 }}>
                {[['Contract', AED(contract), 'var(--text)'], ['Paid', AED(paid), '#22c55e'], ['Balance', AED(bal), bal > 0 ? '#ef4444' : '#22c55e']].map(([k, v, c]) => (
                  <div key={k} style={{ background: 'var(--bg2)', borderRadius: 9, padding: '9px 11px' }}><div style={{ fontSize: 10, color: 'var(--text3)' }}>{k}</div><div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div></div>
                ))}
              </div>
              {!payForm && <button onClick={() => setPayForm({ amount: bal > 0 ? bal : '', paid_on: new Date().toISOString().slice(0, 10), method: 'Bank', reference: '', note: '' })} className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 12 }}><i className="ti ti-plus" /> Record a payment</button>}
              {payForm && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 13, marginBottom: 12, background: 'var(--bg2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
                    <div><label style={lbl}>Amount (AED)</label><input type="number" autoFocus value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} style={input} /></div>
                    <div><label style={lbl}>Date</label><input type="date" value={payForm.paid_on} onChange={e => setPayForm(p => ({ ...p, paid_on: e.target.value }))} style={input} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
                    <div><label style={lbl}>Method</label><select value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))} style={input}>{['Bank', 'Cash', 'Cheque', 'Online'].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                    <div><label style={lbl}>Reference</label><input value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} style={input} placeholder="Cheque / txn no" /></div>
                  </div>
                  <label style={lbl}>Note</label><input value={payForm.note} onChange={e => setPayForm(p => ({ ...p, note: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. 1st milestone" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setPayForm(null)} style={{ flex: 1, padding: 9, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={savePayment} disabled={saving} style={{ flex: 1, padding: 9, borderRadius: 9, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 600, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save payment'}</button>
                  </div>
                </div>
              )}
              {payList.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '20px 10px' }}>No payments recorded yet.</div>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {payList.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(34,197,94,0.12)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="ti ti-cash" style={{ fontSize: 16 }} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{AED(p.amount)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtD(p.paid_on)}{p.method ? ' · ' + p.method : ''}{p.reference ? ' · ' + p.reference : ''}{p.note ? ' · ' + p.note : ''}</div>
                      </div>
                      <button onClick={() => setPayForm({ ...p, paid_on: p.paid_on || '' })} style={iconBtn}><i className="ti ti-edit" style={{ fontSize: 14 }} /></button>
                      <button onClick={() => delPayment(p.id)} style={{ ...iconBtn, color: '#ef4444' }}><i className="ti ti-trash" style={{ fontSize: 14 }} /></button>
                    </div>
                  ))}
                </div>}
            </div>
          </div>
        )
      })()}
      {scopeForm && <FormModal title={scopeForm.id ? 'Edit scope item' : 'Add scope item'} onClose={() => setScopeForm(null)} onSave={saveScopeItem} saving={saving}>
        <label style={lbl}>Description</label><input autoFocus value={scopeForm.description} onChange={e => setScopeForm(s => ({ ...s, description: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. Gypsum false ceiling — living room" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Qty</label><input type="number" value={scopeForm.quantity} onChange={e => setScopeForm(s => ({ ...s, quantity: e.target.value }))} style={input} /></div>
          <div><label style={lbl}>Unit</label><input value={scopeForm.unit} onChange={e => setScopeForm(s => ({ ...s, unit: e.target.value }))} style={input} placeholder="m² / Nos" /></div>
          <div><label style={lbl}>Trade</label><select value={scopeForm.trade} onChange={e => setScopeForm(s => ({ ...s, trade: e.target.value }))} style={input}><option value="">—</option>{TRADES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        </div>
        <label style={lbl}>Client amount (AED) <span style={{ fontWeight: 400, color: 'var(--text3)' }}>— from the quote (revenue)</span></label><input type="number" value={scopeForm.client_amount} onChange={e => setScopeForm(s => ({ ...s, client_amount: e.target.value }))} style={input} />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Client name</label><input value={p.client_name} onChange={e => set({ client_name: e.target.value })} style={input} /></div>
          <div><label style={lbl}>Client phone</label><input value={p.client_phone} onChange={e => set({ client_phone: e.target.value })} style={input} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Status</label><select value={p.status} onChange={e => set({ status: e.target.value })} style={input}>{Object.entries(PSTATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          <div><label style={lbl}>Contract value (AED)</label><input type="number" value={p.contract_value} onChange={e => set({ contract_value: e.target.value })} style={input} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 10 }}>
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

const __escDoc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

// ----- LPO (Local Purchase Order) sheet -----
function lpoBody(company, project, sub, items, lpo, others = []) {
  const esc = __escDoc
  const n = v => Math.round(Number(v) || 0).toLocaleString('en-AE')
  const total = items.reduce((a, s) => a + (Number(s.sub_amount) || 0), 0)
  // 5% VAT — applied when the "Add 5% VAT" option is ticked for this subcontractor
  const vat = sub?.apply_vat ? Math.round(total * 0.05) : 0
  const grandTotal = total + vat
  // subcontractor payment terms — a custom schedule of stages (label + %), editable per subcontractor
  const payDays = Number(sub?.payment_days ?? 30)
  const DEFAULT_SCHEDULE = [{ label: 'Advance on signing', pct: 40 }, { label: 'On delivery to site', pct: 30 }, { label: 'On completion & handover', pct: 30 }]
  const schedule = (Array.isArray(sub?.payment_schedule) && sub.payment_schedule.length ? sub.payment_schedule : DEFAULT_SCHEDULE).filter(s => s && (s.label || Number(s.pct)))
  // whole-project handover — this subcontractor is responsible for the entire project
  const fullProject = !!sub?.full_project
  const otherList = (others || []).filter(o => o?.name).map(o => esc(o.name) + (o.trade ? ' (' + esc(o.trade) + ')' : '')).join(', ')
  // Project timeline → the subcontractor must finish 15% of the schedule before the project completion date
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null
  const pStart = fmtDate(project?.start_date), pEnd = fmtDate(project?.end_date)
  let subDue = null, bufferDays = 0
  if (project?.start_date && project?.end_date) {
    const totalDays = Math.max(1, Math.round((new Date(project.end_date) - new Date(project.start_date)) / 86400000))
    bufferDays = Math.ceil(totalDays * 0.15)
    subDue = fmtDate(new Date(new Date(project.end_date).getTime() - bufferDays * 86400000))
  } else if (project?.end_date) { subDue = pEnd }
  const NAVY = '#0f2741', ACCENT = '#0099cc', MUT = '#6b7a8d', LINE = '#e7eef4', SOFT = '#f6fafc'
  const serif = "'Playfair Display',Georgia,serif"
  const timelineRow = (pStart || pEnd) ? `<div style="display:flex;gap:12px;margin-bottom:13px;">
      <div style="flex:1;border:1px solid ${LINE};border-radius:8px;padding:10px 13px;background:${SOFT};"><div style="font-size:8px;color:${ACCENT};text-transform:uppercase;letter-spacing:1px;font-weight:700;">Project start</div><div style="font-size:12.5px;font-weight:700;margin-top:3px;color:${NAVY};">${pStart || '—'}</div></div>
      <div style="flex:1;border:1px solid ${LINE};border-radius:8px;padding:10px 13px;background:${SOFT};"><div style="font-size:8px;color:${ACCENT};text-transform:uppercase;letter-spacing:1px;font-weight:700;">Project completion</div><div style="font-size:12.5px;font-weight:700;margin-top:3px;color:${NAVY};">${pEnd || '—'}</div></div>
      <div style="flex:1;background:#fff6f5;border:1px solid #f4cdc9;border-radius:8px;padding:10px 13px;"><div style="font-size:8px;color:#c0392b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Your completion${bufferDays ? ' · ' + bufferDays + 'd early' : ''}</div><div style="font-size:12.5px;font-weight:700;margin-top:3px;color:#c0392b;">${subDue || '—'}</div></div>
    </div>` : ''
  const withImg = items.some(s => s.img)
  const imgCell = s => withImg ? `<td style="padding:7px 10px;border-bottom:1px solid ${LINE};width:52px;">${s.img ? `<img src="${esc(s.img)}" style="width:42px;height:42px;object-fit:cover;border-radius:6px;border:1px solid ${LINE};display:block;" />` : ''}</td>` : ''
  const rows = items.map((s, i) => `<tr style="${i % 2 ? 'background:' + SOFT + ';' : ''}">
      <td style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;color:${MUT};">${i + 1}</td>
      ${imgCell(s)}
      <td style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;color:${NAVY};">${esc(s.description)}</td>
      <td style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;text-align:center;color:${MUT};">${esc(s.quantity || '')} ${esc(s.unit || '')}</td>
      <td style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;text-align:right;font-weight:600;color:${NAVY};">AED ${n(s.sub_amount)}</td></tr>`).join('')
  const term = (t, d) => `<div style="margin-bottom:8px;page-break-inside:avoid;"><div style="font-size:8.5px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">${t}</div><div style="font-size:9.2px;color:#5d6b7a;line-height:1.55;text-align:justify;">${d}</div></div>`
  const logo = company?.logo_url ? `<img src="${esc(company.logo_url)}" style="height:48px;width:48px;object-fit:cover;border-radius:9px;flex-shrink:0;" />` : ''
  return `<div class="__page" style="font-family:'Inter','Segoe UI',sans-serif;color:${NAVY};background:#fff;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="display:flex;gap:13px;align-items:center;">${logo}<div>
        <div style="font-family:${serif};font-size:22px;font-weight:700;color:${NAVY};letter-spacing:.2px;line-height:1.1;">${esc(company?.name || 'Company')}</div>
        <div style="font-size:10px;color:${MUT};margin-top:3px;">${esc(company?.phone || '')}${company?.location ? ' &nbsp;·&nbsp; ' + esc(company.location) : ''}</div>
      </div></div>
      <div style="text-align:right;">
        <div style="font-family:${serif};font-size:20px;font-weight:700;color:${ACCENT};letter-spacing:.3px;line-height:1;">Local Purchase Order</div>
        <div style="font-size:10.5px;color:${MUT};margin-top:5px;">No.&nbsp; <b style="color:${NAVY};font-family:monospace;">${esc(lpo)}</b></div>
        <div style="font-size:10.5px;color:${MUT};margin-top:1px;">Date:&nbsp; <b style="color:${NAVY};">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</b></div>
      </div>
    </div>
    <div style="height:2.5px;background:linear-gradient(90deg,${ACCENT} 0%,${ACCENT} 28%,${ACCENT}1f 100%);margin:12px 0 16px;border-radius:2px;"></div>
    <div style="display:flex;gap:14px;margin-bottom:13px;">
      <div style="flex:1;border:1px solid ${LINE};border-radius:9px;padding:12px 15px;"><div style="font-size:8px;color:${ACCENT};text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">To · Subcontractor</div><div style="font-size:13.5px;font-weight:700;margin-top:4px;color:${NAVY};">${esc(sub.name)}</div><div style="font-size:10.5px;color:${MUT};margin-top:1px;">${esc(sub.trade || '')}${sub.phone ? ' · ' + esc(sub.phone) : ''}</div>${sub.contact_person ? `<div style="font-size:10px;color:${MUT};margin-top:3px;">Contact: <b style="color:${NAVY};">${esc(sub.contact_person)}</b></div>` : ''}${(sub.owner_name || sub.owner_mobile) ? `<div style="font-size:10px;color:${MUT};">Owner: <b style="color:${NAVY};">${esc(sub.owner_name || '')}</b>${sub.owner_mobile ? ' · ' + esc(sub.owner_mobile) : ''}</div>` : ''}${sub.vat_no ? `<div style="font-size:10px;color:${MUT};">TRN: <b style="color:${NAVY};">${esc(sub.vat_no)}</b></div>` : ''}</div>
      <div style="flex:1;border:1px solid ${LINE};border-radius:9px;padding:12px 15px;"><div style="font-size:8px;color:${ACCENT};text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">Project</div><div style="font-size:13.5px;font-weight:700;margin-top:4px;color:${NAVY};">${esc(project.name)}</div><div style="font-size:10.5px;color:${MUT};margin-top:1px;">${esc(project.location || '')}</div>${sub.project_code ? `<div style="font-size:10px;color:${MUT};margin-top:3px;">Project code: <b style="color:${NAVY};">${esc(sub.project_code)}</b></div>` : ''}</div>
    </div>
    ${fullProject ? `<div style="display:flex;gap:11px;align-items:flex-start;border:1.5px solid ${ACCENT}66;background:${SOFT};border-radius:9px;padding:11px 14px;margin-bottom:13px;page-break-inside:avoid;">
      <div style="width:28px;height:28px;border-radius:8px;background:${ACCENT}1f;color:${ACCENT};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;font-weight:700;">✓</div>
      <div><div style="font-size:9px;color:${ACCENT};text-transform:uppercase;letter-spacing:1px;font-weight:700;">Whole-Project Responsibility</div><div style="font-size:10.5px;color:#445;line-height:1.6;margin-top:2px;">This Local Purchase Order is issued for the <b>entire project</b>. The Subcontractor is <b>solely and fully responsible</b> for the complete execution, coordination, supervision and on-time delivery of the whole project through to completion, snagging and handover.</div></div>
    </div>` : ''}
    ${timelineRow}
    <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:13px;border:1px solid ${LINE};border-radius:9px;overflow:hidden;">
      <thead><tr style="background:${NAVY};color:#fff;">
        <th style="padding:10px 11px;text-align:left;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;width:34px;">#</th>
        ${withImg ? `<th style="padding:10px;text-align:left;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;width:52px;">Photo</th>` : ''}
        <th style="padding:10px 11px;text-align:left;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;">Scope of Work</th>
        <th style="padding:10px 11px;text-align:center;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;">Qty</th>
        <th style="padding:10px 11px;text-align:right;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;">Amount</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="${withImg ? 5 : 4}" style="padding:16px;text-align:center;color:#999;font-size:11px;">No scope assigned to this subcontractor yet.</td></tr>`}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:13px;page-break-inside:avoid;">
      <div style="min-width:280px;border:1px solid ${LINE};border-radius:9px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;padding:8px 16px;font-size:11px;color:${MUT};"><span>Subtotal</span><span style="color:${NAVY};font-weight:600;">AED ${n(total)}</span></div>
        ${vat > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 16px;font-size:11px;color:${MUT};border-top:1px solid ${LINE};"><span>VAT (5%)</span><span style="color:${NAVY};font-weight:600;">AED ${n(vat)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;background:${NAVY};color:#fff;"><span style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;opacity:.85;">Total${vat > 0 ? ' (incl. VAT)' : ' Order Value'}</span><span style="font-family:${serif};font-size:17px;font-weight:700;color:#4fd0f5;">AED ${n(grandTotal)}</span></div>
      </div>
    </div>
    <div style="border:1px solid ${LINE};border-radius:9px;overflow:hidden;margin-bottom:13px;page-break-inside:avoid;">
      <div style="background:${SOFT};padding:9px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${LINE};"><span style="font-size:8.5px;font-weight:700;color:${ACCENT};text-transform:uppercase;letter-spacing:1px;">Payment Schedule</span><span style="font-size:9px;color:${MUT};">within ${payDays} days of each certified invoice</span></div>
      ${schedule.map((s, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;${i < schedule.length - 1 ? 'border-bottom:1px solid ' + LINE + ';' : ''}">
        <span style="font-size:11px;color:${NAVY};">${esc(s.label || ('Stage ' + (i + 1)))}</span>
        <span style="display:flex;gap:16px;align-items:center;"><b style="font-size:11px;color:${ACCENT};min-width:34px;text-align:right;">${Number(s.pct) || 0}%</b><span style="font-size:11.5px;font-weight:700;color:${NAVY};min-width:96px;text-align:right;">AED ${n(grandTotal * (Number(s.pct) || 0) / 100)}</span></span>
      </div>`).join('')}
    </div>
    <div style="border-top:1px solid ${LINE};padding-top:12px;margin-bottom:8px;">
      ${term('Payment', `Payment shall be released as per the schedule above, against work actually completed and certified by the Company, within <b>${payDays} days</b> of a correct, undisputed invoice for each stage. Each stage payment is subject to satisfactory progress, snagging clearance and the signed NDA. The Company may set off against any sum due any amount owed by the Subcontractor (including back-charges, damages or liquidated damages).`)}
      ${term('Timeline', `The Subcontractor shall complete all works ${subDue ? 'on or before <b style="color:#c0392b;">' + subDue + '</b>' : 'by the agreed completion date'}${bufferDays ? ', which is ' + bufferDays + ' days (15% of the project schedule) before the project completion date' : ''}, to allow time for inspection, snagging and handover. <b>Time is of the essence.</b>`)}
      ${term('Delay / Liquidated Damages', `If the Subcontractor fails to complete by the date above, the Company may, without prejudice to its other rights, levy liquidated damages of <b>1% of this LPO value for each day</b> of delay (or part thereof), up to a maximum of <b>10%</b> of the LPO value, and/or engage others to complete the works and back-charge the Subcontractor with the cost.`)}
      ${term('Coordination with Other Contractors &amp; Team', `Multiple contractors and trades are engaged on this project. The Subcontractor shall fully coordinate and cooperate with ${otherList ? 'the other contractors on this project (<b>' + otherList + '</b>)' : 'all other contractors and trades'} and with the Company’s site team and project engineer, follow the agreed work sequence, programme and site instructions, share access, scaffolding and services, and shall not obstruct, delay or damage the works of others. The Subcontractor shall attend coordination meetings as required and is liable for any delay, rework or damage it causes to other trades.`)}
      ${term('General', `Work to the satisfaction of ${esc(company?.name || 'the company')}; materials &amp; workmanship per approved specifications. This LPO is issued together with, and is subject to, the signed Non-Disclosure Agreement attached overleaf.`)}
    </div>
    <div style="display:flex;gap:30px;margin-top:20px;page-break-inside:avoid;">
      <div style="flex:1;text-align:center;"><div style="border-bottom:1.5px solid ${NAVY};height:32px;"></div><div style="font-size:9px;color:${MUT};margin-top:5px;">For ${esc(company?.name || 'Company')}</div></div>
      <div style="flex:1;text-align:center;"><div style="border-bottom:1.5px solid ${NAVY};height:34px;"></div><div style="font-size:9px;color:${MUT};margin-top:5px;">Accepted — ${esc(sub.name)}</div></div>
    </div>
  </div>`
}

// ----- NDA sheet — a strong, enforceable confidentiality + non-circumvention agreement -----
function ndaBody(company, project, sub) {
  const esc = __escDoc
  const co = esc(company?.name || 'the Company')
  const subName = esc(sub?.name || 'the Subcontractor')
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const proj = esc(project?.name || '')
  const NAVY = '#0f2741', ACCENT = '#0099cc', MUT = '#6b7a8d'
  const serif = "'Playfair Display',Georgia,serif"
  const c = (t, d) => `<div style="margin-bottom:9px;"><div style="font-size:11px;font-weight:700;color:${NAVY};margin-bottom:2px;">${t}</div><div style="font-size:10px;color:#5d6b7a;line-height:1.65;text-align:justify;">${d}</div></div>`
  return `<div class="__page" style="font-family:'Inter','Segoe UI',sans-serif;color:${NAVY};background:#fff;">
    <div style="text-align:center;padding-bottom:13px;margin-bottom:16px;">
      <div style="font-family:${serif};font-size:21px;font-weight:700;color:${NAVY};">${co}</div>
      <div style="font-size:8.5px;color:${MUT};letter-spacing:1.5px;text-transform:uppercase;margin-top:3px;">${esc(company?.phone || '')}</div>
      <div style="height:2.5px;width:64px;background:${ACCENT};margin:12px auto;border-radius:2px;"></div>
      <div style="font-family:${serif};font-size:17px;font-weight:700;color:${ACCENT};letter-spacing:.4px;">Non-Disclosure &amp; Non-Circumvention Agreement</div>
    </div>
    <div style="font-size:10px;color:#444;line-height:1.65;margin-bottom:13px;text-align:justify;">
      This Non-Disclosure &amp; Non-Circumvention Agreement (the “Agreement”) is made on <b>${dateStr}</b> between <b>${co}</b> (the “Disclosing Party”) and <b>${subName}</b>${sub?.trade ? ' (' + esc(sub.trade) + ')' : ''} (the “Receiving Party”), in connection with the works${proj ? ' on the project <b>' + proj + '</b>' : ''} and any related or future engagement. In consideration of being engaged and given access to the Disclosing Party’s confidential information and clients, the Receiving Party agrees as follows:
    </div>
    ${c('1. Confidential Information', `“Confidential Information” means any and all non-public information of the Disclosing Party in any form (oral, written, visual or electronic), whether or not marked confidential, including without limitation: client and customer names, leads, prospects and contact details; designs, drawings, BOQs, specifications and samples; quotations, rates, costs, margins and pricing; supplier and vendor details; project plans, methods, processes and know-how; financial, commercial and business information; and any trade secrets of the Disclosing Party.`)}
    ${c('2. Confidentiality Obligations', `The Receiving Party shall: (a) keep all Confidential Information strictly secret and secure; (b) use it solely to perform the agreed works for the Disclosing Party and for no other purpose; (c) disclose it only to those of its personnel who strictly need it and who are bound by obligations no less protective than these; and (d) not copy, store on personal devices, publish, reverse-engineer or disclose it to any third party without the Disclosing Party’s prior written consent. The Receiving Party is fully liable for any breach by its partners, employees, workers or agents.`)}
    ${c('3. Non-Circumvention &amp; Non-Solicitation of Clients', `During the engagement and for <b>twenty-four (24) months</b> after its completion or termination, the Receiving Party shall not, whether directly or indirectly (including through relatives, associates or any other entity), approach, solicit, contact, quote to, accept work from, or transact with any client, customer, lead or prospect of the Disclosing Party that the Receiving Party became aware of or was introduced to through this engagement, for the same or similar works.`)}
    ${c('4. No Bypass', `The Receiving Party shall not attempt to bypass, circumvent or compete with the Disclosing Party in respect of the project or its end client, nor enter into any direct or indirect arrangement with the end client that deprives the Disclosing Party of its business, fees or margin.`)}
    ${c('5. Non-Solicitation of Staff &amp; Suppliers', `During the engagement and for twelve (12) months thereafter, the Receiving Party shall not solicit or entice away any employee, worker or supplier of the Disclosing Party.`)}
    ${c('6. Intellectual Property &amp; Ownership', `All Confidential Information, designs, drawings and documents remain the exclusive property of the Disclosing Party. No licence or right of any kind is granted to the Receiving Party except the limited right to use them strictly for the agreed works.`)}
    ${c('7. Exclusions', `These obligations do not apply to information that the Receiving Party can prove: (a) is or becomes public other than through its breach; (b) was lawfully known to it before disclosure; or (c) is required to be disclosed by law or a competent court, provided the Receiving Party gives prompt written notice and discloses only the minimum required.`)}
    ${c('8. Return &amp; Destruction', `On completion or termination, or on demand, the Receiving Party shall promptly return or, at the Disclosing Party’s option, permanently destroy all materials (and copies) containing Confidential Information and certify such destruction in writing.`)}
    ${c('9. Term &amp; Survival', `This Agreement takes effect on the date above and the confidentiality obligations survive for twenty-four (24) months after completion or termination of the works, and indefinitely in respect of trade secrets.`)}
    ${c('10. Remedies &amp; Injunctive Relief', `The Receiving Party acknowledges that any breach would cause the Disclosing Party irreparable harm for which damages alone are inadequate. The Disclosing Party shall be entitled, without the need to post any bond, to injunctive relief in addition to all other remedies, and to recover all resulting losses, lost profits, and legal and enforcement costs.`)}
    ${c('11. Indemnity', `The Receiving Party shall indemnify and hold the Disclosing Party harmless against all losses, damages, claims and expenses arising out of or in connection with any breach of this Agreement by the Receiving Party or its personnel.`)}
    ${c('12. General', `This Agreement is the entire agreement between the parties on its subject matter and supersedes any prior understanding. No failure to enforce any term is a waiver of it. If any provision is held invalid, the remainder stays in full force. Any amendment must be in writing and signed by both parties.`)}
    ${c('13. Governing Law &amp; Jurisdiction', `This Agreement is governed by the laws of the United Arab Emirates, and the parties irrevocably submit to the exclusive jurisdiction of the competent courts of the Emirate in which the Disclosing Party is registered.`)}
    <div style="display:flex;gap:30px;margin-top:24px;">
      <div style="flex:1;"><div style="font-size:9px;color:#0077a3;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:24px;">Disclosing Party</div><div style="border-bottom:1px solid #1a1a1a;"></div><div style="font-size:10px;color:#444;margin-top:4px;font-weight:700;">${co}</div><div style="font-size:8.5px;color:#999;">Name · Signature · Date · Stamp</div></div>
      <div style="flex:1;"><div style="font-size:9px;color:#0077a3;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:24px;">Receiving Party</div><div style="border-bottom:1px solid #1a1a1a;"></div><div style="font-size:10px;color:#444;margin-top:4px;font-weight:700;">${subName}</div><div style="font-size:8.5px;color:#999;">Name · Signature · Date · Emirates ID</div></div>
    </div>
  </div>`
}

// Open one print window holding several A4 sheets (each on its own page).
function printDocs(titleText, sheets, toast) {
  const esc = __escDoc
  const w = window.open('', '_blank')
  if (!w) { toast?.error?.('Allow pop-ups to print the document'); return }
  const sheetHtml = sheets.map((h, i) => `<div class="__sheet"${i < sheets.length - 1 ? ' style="page-break-after:always;"' : ''}>${h}</div>`).join('')
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(titleText)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
      *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box}
      html,body{margin:0}
      body{background:#e9eef3;padding-top:54px;font-family:'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif}
      /* real page margins → every printed page gets clean margins (works for 1 or 2 pages) */
      @page{size:A4;margin:11mm}
      /* on screen: show each sheet as a real A4 page with inner padding */
      .__sheet{width:794px;min-height:1123px;margin:20px auto;background:#fff;box-shadow:0 12px 44px rgba(15,30,50,.22);border-radius:2px}
      .__page{padding:30px 38px}
      .__bar{position:fixed;top:0;left:0;right:0;height:54px;background:#0f1d3a;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 18px;z-index:99}
      .__bar button{padding:8px 16px;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit;font-size:13px}
      @media print{
        .__bar{display:none}
        body{background:#fff;padding:0}
        .__sheet{box-shadow:none!important;border-radius:0!important;margin:0!important;width:auto!important;min-height:0!important}
        .__page{padding:0!important}
      }
    </style></head><body>
    <div class="__bar"><span style="font-size:14px;font-weight:600;letter-spacing:.2px;">${esc(titleText)}</span><span><button onclick="window.print()" style="background:#0099cc;color:#fff;">Print / Save PDF</button> <button onclick="window.close()" style="background:rgba(255,255,255,.16);color:#fff;margin-left:8px;">Close</button></span></div>
    ${sheetHtml}</body></html>`)
  w.document.close()
}

// LPO + NDA, printed together (one window, LPO on page 1, NDA on the next pages).
function printLPOandNDA(company, project, sub, items, lpo, others, toast) {
  printDocs(`${lpo} + NDA · ${sub?.name || 'Subcontractor'}`, [lpoBody(company, project, sub, items, lpo, others), ndaBody(company, project, sub)], toast)
}
