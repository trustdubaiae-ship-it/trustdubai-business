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
const SSTATUS = { ongoing: { l: 'Ongoing', c: '#0099cc' }, completed: { l: 'Completed', c: '#22c55e' }, on_hold: { l: 'On Hold', c: '#f59e0b' } }
const MILESTONE_ST = { pending: { l: 'Pending', c: '#64748b', ic: 'ti-circle' }, in_progress: { l: 'In progress', c: '#0099cc', ic: 'ti-progress' }, done: { l: 'Done', c: '#22c55e', ic: 'ti-circle-check-filled' } }
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

export default function ProjectsPage({ onNavigate }) {
  const { company, user } = useAuth()
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
  const [milestones, setMilestones] = useState([])
  const [msForm, setMsForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (company?.id) loadProjects() }, [company?.id])
  // keep project progress in sync with milestone completion (weighted) — covers every edit path
  useEffect(() => {
    if (view !== 'detail' || !active || !milestones.length) return
    const pct = weightedPct(milestones)
    if (pct !== (Number(active.progress) || 0)) patchActive({ progress: pct })
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
  }
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
    // Client cash-in lives in the Invoices module — pull the linked invoices (single source of truth).
    let inv = []
    if (proj?.quote_id) { const { data } = await supabase.from('invoices').select('id,invoice_number,total,payments,status,kind,milestone_label,issue_date,due_date').eq('company_id', company.id).eq('quotation_id', proj.quote_id).order('issue_date', { ascending: false }); inv = data || [] }
    else if (proj?.client_id) { const { data } = await supabase.from('invoices').select('id,invoice_number,total,payments,status,kind,milestone_label,issue_date,due_date').eq('company_id', company.id).eq('client_id', proj.client_id).order('issue_date', { ascending: false }); inv = data || [] }
    setInvoices(inv)
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

  async function saveSub() {
    const x = subForm
    if (!x.name?.trim()) { toast.error('Subcontractor name is required'); return }
    setSaving(true)
    try {
      // contract_amount comes from assigned scope, paid_amount from the payment ledger — not edited here.
      const payload = { company_id: company.id, project_id: active.id, name: x.name.trim(), trade: x.trade || null, phone: x.phone || null, status: x.status || 'ongoing', notes: x.notes || null }
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
    printLPO(company, active, sub, scope.filter(s => s.sub_id === sub.id), lpo, toast)
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
  const value = Number(active?.contract_value) || 0
  const totalPurchases = purchases.reduce((s, x) => s + (Number(x.total) || 0), 0)
  const totalCost = totalSubs + totalExpenses + totalPurchases
  const margin = value - totalCost
  const marginPct = value > 0 ? Math.round((margin / value) * 100) : 0
  // client cash-in (from linked invoices)
  const invPaid = inv => (Array.isArray(inv.payments) ? inv.payments : []).reduce((a, p) => a + (Number(p.amount) || 0), 0)
  const totalInvoiced = invoices.reduce((s, i) => s + (Number(i.total) || 0), 0)
  const clientReceived = invoices.reduce((s, i) => s + invPaid(i), 0)
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
        <div className="fx-hero" style={{ borderRadius: 18, padding: '22px 24px', marginBottom: 16, background: heroBg, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', position: 'relative' }}>
            <div>
              <h1 className="font-syne fw-700" style={{ fontSize: 24, margin: 0, display: 'flex', alignItems: 'center', gap: 10, letterSpacing: '-.4px' }}><i className="ti ti-briefcase" /> Projects</h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,.78)', margin: '5px 0 0' }}>Track jobs, scope, subcontractors & site spend — profit at a glance.</p>
            </div>
            <button onClick={newProject} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 18px', borderRadius: 11, border: 'none', background: '#fff', color: '#0a2540', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,.22)' }}><i className="ti ti-plus" style={{ fontSize: 16 }} /> New project</button>
          </div>
        </div>

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
                const st = PSTATUS[p.status] || PSTATUS.planning
                return (
                  <div key={p.id} className="fx-proj" onClick={() => openProject(p)} style={{ ...card, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 18 }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${st.color}, ${st.color}55)` }} />
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, wordBreak: 'break-word' }}>{p.name}</div>
                      <Badge c={st.color}>{st.label}</Badge>
                    </div>
                    {p.client_name && <div style={{ fontSize: 12.5, color: 'var(--text2)' }}><i className="ti ti-user" style={{ fontSize: 13, verticalAlign: '-1px' }} /> {p.client_name}</div>}
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0099cc', letterSpacing: '-.3px' }}>{AED(p.contract_value)}</div>
                    {(() => {
                      const recv = Number(recvByProject[p.id]) || 0
                      const payPct = Number(p.contract_value) > 0 ? Math.min(100, Math.round((recv / Number(p.contract_value)) * 100)) : 0
                      const spent = Number(costByProject[p.id]) || 0
                      const prof = Number(p.contract_value) - spent
                      const profPct = Number(p.contract_value) > 0 ? Math.round((prof / Number(p.contract_value)) * 100) : 0
                      return (
                        <>
                          <div style={{ height: 7, background: 'var(--bg2)', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: (p.progress || 0) + '%', height: '100%', background: `linear-gradient(90deg, ${st.color}, ${st.color}aa)`, borderRadius: 99, transition: 'width .3s ease' }} /></div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', justifyContent: 'space-between' }}><span><i className="ti ti-progress-check" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {p.progress || 0}% work</span><span><i className="ti ti-flag" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {fmtD(p.end_date)}</span></div>
                          <div style={{ height: 7, background: 'var(--bg2)', borderRadius: 99, overflow: 'hidden', marginTop: 2 }}><div style={{ width: payPct + '%', height: '100%', background: 'linear-gradient(90deg,#0099cc,#0099ccaa)', borderRadius: 99, transition: 'width .3s ease' }} /></div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', justifyContent: 'space-between' }}><span><i className="ti ti-cash" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {payPct}% paid</span><span>{AED(recv)}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 7, borderTop: '1px dashed var(--border)', fontSize: 11.5 }}>
                            <span style={{ color: 'var(--text2)' }}><i className="ti ti-coin" style={{ fontSize: 13, verticalAlign: '-2px', color: '#f59e0b' }} /> Spent {AED(spent)}</span>
                            <span style={{ fontWeight: 700, color: prof >= 0 ? '#22c55e' : '#ef4444' }}>{prof >= 0 ? 'Profit' : 'Loss'} {AED(Math.abs(prof))}{Number(p.contract_value) > 0 ? ` · ${profPct}%` : ''}</span>
                          </div>
                        </>
                      )
                    })()}
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
      <style>{FX}</style>
      <div className="fx-hero" style={{ borderRadius: 18, padding: '18px 20px', marginBottom: 16, background: heroBg, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap', position: 'relative' }}>
          <button onClick={() => { setView('list'); setActive(null) }} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.12)', color: '#fff', cursor: 'pointer', flexShrink: 0 }}><i className="ti ti-arrow-left" style={{ fontSize: 16 }} /></button>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        <StatTile icon="ti-wallet" label="Contract value" value={AED(value)} color="#0099cc" />
        <StatTile icon="ti-users-group" label="Subcontractors" value={AED(totalSubs)} color="#8b5cf6" />
        <StatTile icon="ti-coin" label="Site expenses" value={AED(totalExpenses)} color="#f59e0b" />
        {totalPurchases > 0 && <StatTile icon="ti-shopping-cart" label="Purchases" value={AED(totalPurchases)} color="#9a3412" />}
        <StatTile icon="ti-receipt" label="Total cost" value={AED(totalCost)} color="#ef4444" />
        <StatTile icon={margin >= 0 ? 'ti-trending-up' : 'ti-trending-down'} label={margin >= 0 ? 'Profit' : 'Loss'} value={AED(Math.abs(margin)) + (value > 0 ? ` · ${marginPct}%` : '')} color={margin >= 0 ? '#22c55e' : '#ef4444'} />
      </div>

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
        <div style={{ ...card }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 14 }}>
            <div>
              <label style={lbl}>Status</label>
              <select value={active.status} onChange={e => patchActive({ status: e.target.value })} style={input}>
                {Object.entries(PSTATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Start date</label><input type="date" value={active.start_date || ''} onChange={e => patchActive({ start_date: e.target.value || null })} style={input} /></div>
            <div><label style={lbl}>Target end</label><input type="date" value={active.end_date || ''} onChange={e => patchActive({ end_date: e.target.value || null })} style={input} /></div>
          </div>
          <label style={{ ...lbl, marginTop: 14 }}>Notes</label>
          <textarea value={active.notes || ''} onChange={e => setActive(a => ({ ...a, notes: e.target.value }))} onBlur={e => patchActive({ notes: e.target.value || null })} rows={3} style={{ ...input, resize: 'vertical', minHeight: 70 }} placeholder="Scope, site details, key dates…" />
          {active.quote_id && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10 }}><i className="ti ti-file-invoice" /> Linked to a quotation</div>}
        </div>
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
            <button onClick={() => setSubForm({ name: '', trade: 'MEP', phone: '', status: 'ongoing', notes: '' })} className="btn btn-primary btn-sm"><i className="ti ti-plus" /> Add subcontractor</button>
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
                    <button onClick={() => setSubForm({ ...s })} style={iconBtn}><i className="ti ti-edit" style={{ fontSize: 15 }} /></button>
                    <button onClick={() => delSub(s.id)} style={{ ...iconBtn, color: '#ef4444' }}><i className="ti ti-trash" style={{ fontSize: 15 }} /></button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
                    {[['Contract', AED(s.contract_amount), 'var(--text)'], ['Paid', AED(s.paid_amount), '#22c55e'], ['Balance', AED(bal), bal > 0 ? '#ef4444' : '#22c55e']].map(([k, v, c]) => (
                      <div key={k} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 10, color: 'var(--text3)' }}>{k}</div><div style={{ fontSize: 13.5, fontWeight: 700, color: c }}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => openPayments(s)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><i className="ti ti-cash" /> Payments</button>
                    <button onClick={() => generateLPO(s)} className="btn btn-secondary btn-sm"><i className="ti ti-file-text" style={{ verticalAlign: '-2px', marginRight: 4 }} />{s.lpo_number ? 'LPO · ' + s.lpo_number : 'Generate LPO'}</button>
                    <button onClick={() => printNDA(company, active, s, toast)} className="btn btn-secondary btn-sm"><i className="ti ti-shield-lock" style={{ verticalAlign: '-2px', marginRight: 4 }} />NDA</button>
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
                const ist = iv.status === 'paid' ? { c: '#22c55e', l: 'Paid' } : iv.status === 'partial' ? { c: '#f59e0b', l: 'Partial' } : { c: '#ef4444', l: 'Unpaid' }
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
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{AED(tot)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}><span style={{ color: '#22c55e' }}>{AED(paid)} paid</span>{bal > 0 ? ` · ${AED(bal)} due` : ''}</div>
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
      {msForm && <FormModal title={msForm.id ? 'Edit stage' : 'Add stage'} onClose={() => setMsForm(null)} onSave={saveMilestone} saving={saving}>
        <label style={lbl}>Stage / milestone</label><input autoFocus value={msForm.title} onChange={e => setMsForm(s => ({ ...s, title: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. Gypsum & false ceiling" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Target date</label><input type="date" value={msForm.target_date} onChange={e => setMsForm(s => ({ ...s, target_date: e.target.value }))} style={input} /></div>
          <div><label style={lbl}>Weight (% of project)</label><input type="number" value={msForm.weight} onChange={e => setMsForm(s => ({ ...s, weight: e.target.value }))} style={input} placeholder="e.g. 20" /></div>
        </div>
        <label style={lbl}>Status</label><select value={msForm.status} onChange={e => setMsForm(s => ({ ...s, status: e.target.value }))} style={{ ...input, marginBottom: 10 }}>{Object.entries(MILESTONE_ST).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
        <label style={lbl}>Note</label><input value={msForm.note || ''} onChange={e => setMsForm(s => ({ ...s, note: e.target.value }))} style={input} placeholder="Optional detail…" />
      </FormModal>}
      {subForm && <FormModal title={subForm.id ? 'Edit subcontractor' : 'Add subcontractor'} onClose={() => setSubForm(null)} onSave={saveSub} saving={saving}>
        <label style={lbl}>Name</label><input autoFocus value={subForm.name} onChange={e => setSubForm(s => ({ ...s, name: e.target.value }))} style={{ ...input, marginBottom: 10 }} placeholder="e.g. Al Noor MEP Works" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Trade / scope</label><select value={subForm.trade} onChange={e => setSubForm(s => ({ ...s, trade: e.target.value }))} style={input}>{TRADES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label style={lbl}>Phone</label><input value={subForm.phone} onChange={e => setSubForm(s => ({ ...s, phone: e.target.value }))} style={input} /></div>
        </div>
        <label style={lbl}>Status</label><select value={subForm.status} onChange={e => setSubForm(s => ({ ...s, status: e.target.value }))} style={{ ...input, marginBottom: 10 }}>{Object.entries(SSTATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
        <label style={lbl}>Notes / scope detail</label><input value={subForm.notes} onChange={e => setSubForm(s => ({ ...s, notes: e.target.value }))} style={input} placeholder="Scope of work…" />
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
                {[['Contract', AED(contract), 'var(--text)'], ['Paid', AED(paid), '#22c55e'], ['Balance', AED(bal), bal > 0 ? '#ef4444' : '#22c55e']].map(([k, v, c]) => (
                  <div key={k} style={{ background: 'var(--bg2)', borderRadius: 9, padding: '9px 11px' }}><div style={{ fontSize: 10, color: 'var(--text3)' }}>{k}</div><div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div></div>
                ))}
              </div>
              {!payForm && <button onClick={() => setPayForm({ amount: bal > 0 ? bal : '', paid_on: new Date().toISOString().slice(0, 10), method: 'Bank', reference: '', note: '' })} className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 12 }}><i className="ti ti-plus" /> Record a payment</button>}
              {payForm && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 13, marginBottom: 12, background: 'var(--bg2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div><label style={lbl}>Amount (AED)</label><input type="number" autoFocus value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} style={input} /></div>
                    <div><label style={lbl}>Date</label><input type="date" value={payForm.paid_on} onChange={e => setPayForm(p => ({ ...p, paid_on: e.target.value }))} style={input} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
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

// ----- LPO (Local Purchase Order) print document -----
function printLPO(company, project, sub, items, lpo, toast) {
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const n = v => Math.round(Number(v) || 0).toLocaleString('en-AE')
  const total = items.reduce((a, s) => a + (Number(s.sub_amount) || 0), 0)
  const rows = items.map((s, i) => `<tr>
      <td style="padding:7px 8px;border-bottom:.5px solid #eee;font-size:11px;color:#999;">${i + 1}</td>
      <td style="padding:7px 8px;border-bottom:.5px solid #eee;font-size:11px;">${esc(s.description)}</td>
      <td style="padding:7px 8px;border-bottom:.5px solid #eee;font-size:11px;text-align:center;color:#777;">${esc(s.quantity || '')} ${esc(s.unit || '')}</td>
      <td style="padding:7px 8px;border-bottom:.5px solid #eee;font-size:11px;text-align:right;">AED ${n(s.sub_amount)}</td></tr>`).join('')
  const body = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:30px;background:#fff;">
    <div style="height:5px;background:#0099cc;margin:-30px -30px 18px;"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0099cc;padding-bottom:12px;margin-bottom:16px;">
      <div><div style="font-size:17px;font-weight:700;">${esc(company?.name || 'Company')}</div><div style="font-size:11px;color:#666;">${esc(company?.phone || '')}</div></div>
      <div style="text-align:right;"><div style="font-size:18px;font-weight:700;color:#0099cc;letter-spacing:1px;">LOCAL PURCHASE ORDER</div>
        <div style="font-size:11px;color:#666;font-family:monospace;">${esc(lpo)}</div>
        <div style="font-size:11px;color:#666;">Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div></div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:16px;">
      <div style="flex:1;background:#f6fafc;border-left:2.5px solid #0099cc;padding:10px 13px;"><div style="font-size:9px;color:#0077a3;text-transform:uppercase;letter-spacing:1px;font-weight:700;">To · Subcontractor</div><div style="font-size:13px;font-weight:700;margin-top:2px;">${esc(sub.name)}</div><div style="font-size:11px;color:#666;">${esc(sub.trade || '')}${sub.phone ? ' · ' + esc(sub.phone) : ''}</div></div>
      <div style="flex:1;background:#f6fafc;border-left:2.5px solid #0099cc;padding:10px 13px;"><div style="font-size:9px;color:#0077a3;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Project</div><div style="font-size:13px;font-weight:700;margin-top:2px;">${esc(project.name)}</div><div style="font-size:11px;color:#666;">${esc(project.location || '')}</div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
      <thead><tr style="background:#1a1a1a;color:#fff;"><th style="padding:7px 8px;text-align:left;font-size:10px;">#</th><th style="padding:7px 8px;text-align:left;font-size:10px;">Scope of Work</th><th style="padding:7px 8px;text-align:center;font-size:10px;">Qty</th><th style="padding:7px 8px;text-align:right;font-size:10px;">Amount</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="padding:14px;text-align:center;color:#999;font-size:11px;">No scope assigned to this subcontractor yet.</td></tr>'}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:18px;"><div style="width:240px;"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:8px 10px;background:#1a1a1a;color:#fff;border-radius:4px;"><span>Total</span><span style="color:#0099cc;">AED ${n(total)}</span></div></div></div>
    <div style="font-size:9px;color:#888;line-height:1.7;margin-bottom:20px;"><b>Terms:</b> Work to be completed per the project schedule and to the satisfaction of ${esc(company?.name || 'the company')}. Payment as per agreed milestones. Materials &amp; workmanship as per approved specifications. This LPO is subject to the signed subcontract agreement.</div>
    <div style="display:flex;gap:30px;margin-top:26px;">
      <div style="flex:1;text-align:center;"><div style="border-bottom:1px solid #1a1a1a;height:30px;"></div><div style="font-size:9px;color:#666;margin-top:4px;">For ${esc(company?.name || 'Company')}</div></div>
      <div style="flex:1;text-align:center;"><div style="border-bottom:1px solid #1a1a1a;height:30px;"></div><div style="font-size:9px;color:#666;margin-top:4px;">Accepted — ${esc(sub.name)}</div></div>
    </div>
  </div>`
  const w = window.open('', '_blank')
  if (!w) { toast?.error?.('Allow pop-ups to print the LPO'); return }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(lpo)}</title>
    <style>*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@page{size:A4;margin:12mm}.__bar{position:fixed;top:0;left:0;right:0;height:48px;background:#0f1623;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-family:sans-serif;z-index:99}@media print{.__bar{display:none}.__sheet{box-shadow:none!important;margin:0!important}}.__bar button{padding:7px 14px;border:none;border-radius:7px;font-weight:600;cursor:pointer}</style>
    </head><body style="margin:0;background:#eef2f6;padding-top:48px;">
    <div class="__bar"><span style="font-size:14px;font-weight:600;">${esc(lpo)} · ${esc(sub.name)}</span><span><button onclick="window.print()" style="background:#0099cc;color:#fff;">Print / PDF</button> <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;margin-left:8px;">Close</button></span></div>
    <div class="__sheet" style="max-width:760px;margin:16px auto;background:#fff;box-shadow:0 6px 28px rgba(0,0,0,.28);">${body}</div></body></html>`)
  w.document.close()
}

// Standard mutual confidentiality / non-disclosure agreement for a subcontractor.
function printNDA(company, project, sub, toast) {
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const co = esc(company?.name || 'the Company')
  const subName = esc(sub?.name || 'the Subcontractor')
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const proj = esc(project?.name || '')
  const clause = (t, d) => `<div style="margin-bottom:11px;"><div style="font-size:11.5px;font-weight:700;color:#1a1a1a;margin-bottom:2px;">${t}</div><div style="font-size:10.5px;color:#444;line-height:1.7;text-align:justify;">${d}</div></div>`
  const body = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:32px;background:#fff;">
    <div style="height:5px;background:#0099cc;margin:-32px -32px 18px;"></div>
    <div style="text-align:center;border-bottom:2px solid #0099cc;padding-bottom:12px;margin-bottom:18px;">
      <div style="font-size:18px;font-weight:700;">${co}</div>
      <div style="font-size:9px;color:#888;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">${esc(company?.phone || '')}</div>
      <div style="font-size:19px;font-weight:800;color:#0099cc;letter-spacing:1.5px;margin-top:10px;">NON-DISCLOSURE AGREEMENT</div>
    </div>
    <div style="font-size:10.5px;color:#444;line-height:1.7;margin-bottom:16px;text-align:justify;">
      This Non-Disclosure Agreement (the “Agreement”) is made on <b>${dateStr}</b> between <b>${co}</b> (the “Disclosing Party”) and <b>${subName}</b>${sub?.trade ? ' (' + esc(sub.trade) + ')' : ''} (the “Receiving Party”), in connection with works${proj ? ' on the project <b>' + proj + '</b>' : ''}.
    </div>
    ${clause('1. Confidential Information', `“Confidential Information” means all non-public information disclosed by the Disclosing Party, including client names &amp; contact details, designs, drawings, specifications, quotations, rates &amp; pricing, project plans, business methods, and any information marked or reasonably understood to be confidential.`)}
    ${clause('2. Obligations', `The Receiving Party shall keep all Confidential Information strictly confidential, use it solely to perform the agreed works for the Disclosing Party, and shall not copy, disclose, or share it with any third party without prior written consent.`)}
    ${clause('3. Non-Solicitation of Clients', `The Receiving Party shall not, directly or indirectly, approach, solicit, contact, or deal with the Disclosing Party’s clients introduced through this engagement for the same or similar works, during the engagement and for a period of 24 months thereafter.`)}
    ${clause('4. Term &amp; Survival', `The confidentiality obligations in this Agreement remain in force during the engagement and survive for 24 months after completion or termination of the works.`)}
    ${clause('5. Return of Materials', `On completion or termination, the Receiving Party shall promptly return or, at the Disclosing Party’s option, destroy all materials containing Confidential Information.`)}
    ${clause('6. Breach', `Any breach of this Agreement may cause irreparable harm to the Disclosing Party and may result in legal action, injunctive relief, and liability for damages and costs.`)}
    ${clause('7. Governing Law', `This Agreement is governed by the applicable laws of the United Arab Emirates, and the parties submit to the jurisdiction of its courts.`)}
    <div style="display:flex;gap:30px;margin-top:34px;">
      <div style="flex:1;"><div style="font-size:9px;color:#0077a3;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:26px;">Disclosing Party</div><div style="border-bottom:1px solid #1a1a1a;"></div><div style="font-size:10px;color:#444;margin-top:4px;font-weight:700;">${co}</div><div style="font-size:8.5px;color:#999;">Name · Signature · Date</div></div>
      <div style="flex:1;"><div style="font-size:9px;color:#0077a3;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:26px;">Receiving Party</div><div style="border-bottom:1px solid #1a1a1a;"></div><div style="font-size:10px;color:#444;margin-top:4px;font-weight:700;">${subName}</div><div style="font-size:8.5px;color:#999;">Name · Signature · Date</div></div>
    </div>
  </div>`
  const w = window.open('', '_blank')
  if (!w) { toast?.error?.('Allow pop-ups to print the NDA'); return }
  const ttl = 'NDA · ' + subName
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(ttl)}</title>
    <style>*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@page{size:A4;margin:12mm}.__bar{position:fixed;top:0;left:0;right:0;height:48px;background:#0f1623;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-family:sans-serif;z-index:99}@media print{.__bar{display:none}.__sheet{box-shadow:none!important;margin:0!important}}.__bar button{padding:7px 14px;border:none;border-radius:7px;font-weight:600;cursor:pointer}</style>
    </head><body style="margin:0;background:#eef2f6;padding-top:48px;">
    <div class="__bar"><span style="font-size:14px;font-weight:600;">${esc(ttl)}</span><span><button onclick="window.print()" style="background:#0099cc;color:#fff;">Print / PDF</button> <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;margin-left:8px;">Close</button></span></div>
    <div class="__sheet" style="max-width:760px;margin:16px auto;background:#fff;box-shadow:0 6px 28px rgba(0,0,0,.28);">${body}</div></body></html>`)
  w.document.close()
}
