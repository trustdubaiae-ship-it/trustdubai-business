import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import UpgradeLockModal from '../components/UpgradeLockModal'

const STATUS_STYLE = {
  draft:    { label:'draft',    color:'#64748b', bg:'#f1f5f9' },
  sent:     { label:'sent',     color:'#92400e', bg:'#fef9ed' },
  approved: { label:'approved', color:'#0f6e56', bg:'#e1f5ee' },
  rejected: { label:'rejected', color:'#b91c1c', bg:'#fee2e2' },
}
const MODE_STYLE = {
  simple:   { label:'Simple',   color:'#64748b', bg:'#f1f5f9' },
  advanced: { label:'Advanced', color:'#185fa5', bg:'#e6f1fb' },
  boq:      { label:'BOQ',       color:'#0077a3', bg:'#e0f9ff' },
}
const FILTERS = ['all', 'draft', 'sent', 'approved']
const STATUS_FLOW = ['draft', 'sent', 'approved', 'rejected']
const VO_STATUS_FLOW = ['draft', 'sent', 'approved', 'rejected']
const UNITS = ['Lump Sum', 'Nos', 'm²', 'm', 'L/s', 'Set', 'Hour', 'Day']
const TRADE_FALLBACK = ['Civil', 'MEP', 'False Ceiling', 'Flooring', 'Painting', 'Joinery', 'Sanitary', 'Misc']
const PLAN_RANK = { free:0, silver:1, gold:2, platinum:3 }

// map a library unit (free text) to the closest quote UNIT (case-insensitive)
function mapUnit(u) {
  if (!u) return null
  const f = UNITS.find(x => x.toLowerCase() === String(u).toLowerCase())
  return f || null
}

const blankItem  = () => ({ desc:'', unit:'Nos', qty:1, rate:0 })
const blankItemT = (trade) => ({ desc:'', unit:'Nos', qty:1, rate:0, trade: trade || '' })

function groupByTradeIdx(items, order) {
  const groups = {}
  items.forEach((it, idx) => {
    const t = it.trade || 'Misc'
    ;(groups[t] = groups[t] || []).push({ it, idx })
  })
  const seq = []
  ;(order || []).forEach(t => { if (groups[t]) seq.push(t) })
  Object.keys(groups).forEach(t => { if (!seq.includes(t)) seq.push(t) })
  return seq.map(t => ({
    trade: t, rows: groups[t],
    subtotal: groups[t].reduce((s, r) => s + (Number(r.it.qty)||0)*(Number(r.it.rate)||0), 0),
  }))
}
function groupByTrade(items, order) {
  const groups = {}
  ;(items || []).forEach(it => {
    const t = it.trade || 'Misc'
    ;(groups[t] = groups[t] || []).push(it)
  })
  const seq = []
  ;(order || []).forEach(t => { if (groups[t]) seq.push(t) })
  Object.keys(groups).forEach(t => { if (!seq.includes(t)) seq.push(t) })
  return seq.map(t => ({
    trade: t, items: groups[t],
    subtotal: groups[t].reduce((s, it) => s + (Number(it.qty)||0)*(Number(it.rate)||0), 0),
  }))
}

const DEFAULT_TERMS = 'Quotation valid for 30 days. Prices in AED. Work commences after advance payment & design approval. All as per approved drawing and engineer\'s instruction.'

// Fallback work-type templates used in the builder when Quote Settings has not been
// saved yet (so the "Work type" dropdown always appears). Mirrors the Settings seeds.
const DEFAULT_WHY_TPL = [
  { title: 'Full Turnkey Service', detail: 'From start to final handover, we manage every trade under one contract.' },
  { title: 'Transparent Pricing',  detail: 'Every item priced separately — no hidden costs.' },
]
const _mkPay = (percent, label, description) => ({ percent, label, description })
const DEFAULT_PRESETS = [
  { name:'Interior',   isDefault:true,  terms:DEFAULT_TERMS, whyUs:DEFAULT_WHY_TPL, payment:[ _mkPay(50,'1st Payment — Advance','Upon contract signing before work commences'), _mkPay(25,'2nd Payment — Progress','After demolition & 60% of work completed'), _mkPay(25,'Final — Completion','After project handover & client sign-off') ] },
  { name:'Joinery',    isDefault:false, terms:DEFAULT_TERMS, whyUs:DEFAULT_WHY_TPL, payment:[ _mkPay(60,'1st Payment — Advance','Upon order confirmation (covers material & production)'), _mkPay(40,'Final — Before Delivery','Before delivery & installation on site') ] },
  { name:'Renovation', isDefault:false, terms:DEFAULT_TERMS, whyUs:DEFAULT_WHY_TPL, payment:[ _mkPay(40,'1st Payment — Advance','Upon contract signing before work commences'), _mkPay(30,'2nd Payment — Progress','After demolition & 60% of work completed'), _mkPay(30,'Final — Completion','After project handover & client sign-off') ] },
  { name:'Fit-out',    isDefault:false, terms:DEFAULT_TERMS, whyUs:DEFAULT_WHY_TPL, payment:[ _mkPay(50,'1st Payment — Advance','Upon contract signing before work commences'), _mkPay(30,'2nd Payment — Progress','At 60% project completion'), _mkPay(20,'Final — Handover','After project handover & client sign-off') ] },
]

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ))
}
function parseWhyTpl(raw) {
  if (!raw) return []
  try {
    const p = JSON.parse(raw)
    if (Array.isArray(p)) return p.map(x => ({ title: x.title || '', detail: x.detail || '' })).filter(x => x.title || x.detail)
  } catch {}
  return String(raw).split('\n').filter(l => l.trim()).map(l => ({ title: l.trim(), detail: '' }))
}
function parsePaymentTpl(raw) {
  if (Array.isArray(raw) && raw.length) {
    return raw.map(x => (typeof x === 'object'
      ? { percent: Number(x.percent) || 0, label: x.label || '', description: x.description || '' }
      : { percent: 0, label: String(x), description: '' }))
  }
  return []
}
// Work-type presets bundle (payment + terms + why-us) from quotation_templates.work_type_presets
function parsePresetsTpl(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => ({
      name: (p && p.name) || '',
      isDefault: !!(p && p.isDefault),
      payment: Array.isArray(p && p.payment) ? p.payment : [],
      terms: (p && p.terms) || '',
      whyUs: Array.isArray(p && p.whyUs) ? p.whyUs : [],
    }))
    .filter(p => p.name)
}

const DRAFT_KEY = 'td_quote_draft_v1'
const loadDraft  = () => { try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null } catch { return null } }
const saveDraft  = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {} }
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY) } catch {} }

export default function Quotations({ subRoute = '', setSubRoute, startAi = false }) {
  const { company, user } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const planName    = company?.plan || 'free'
  const canBoq      = (PLAN_RANK[planName] || 0) >= 2
  const canAdvanced = (PLAN_RANK[planName] || 0) >= 1
  const canPremium  = (PLAN_RANK[planName] || 0) >= 2

  const setSub = (typeof setSubRoute === 'function') ? setSubRoute : () => {}

  const [, forceUpdate] = useState(0)
  const [view, setViewRaw]    = useState('list')
  const [quotes, setQuotes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')
  const [draftExists, setDraftExists] = useState(false)
  const [libItems, setLibItems] = useState([])

  const [activeQuote, setActiveQuote] = useState(null)
  const [statusBusy, setStatusBusy]   = useState(false)

  const [tpl, setTpl]         = useState(null)
  const [saving, setSaving]   = useState(false)
  const [editId, setEditId]   = useState(null)
  const [mode, setMode]       = useState('simple')
  const [lockModal, setLockModal] = useState(false)
  const [client, setClient]   = useState(null)
  const [clientSearch, setClientSearch] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSug, setShowSug] = useState(false)
  const [projectTitle, setProjectTitle] = useState('')
  const [items, setItems]     = useState([blankItem()])
  const [vatEnabled, setVatEnabled]   = useState(true)
  const [discountType, setDiscountType] = useState(null)
  const [discountValue, setDiscountValue] = useState(0)
  const [notes, setNotes]     = useState('')
  const [showFooter, setShowFooter] = useState(true)
  const [showSignature, setShowSignature] = useState(true)
  const [showBank, setShowBank] = useState(false)
  const [addTradePick, setAddTradePick] = useState('')
  const [location, setLocation]       = useState('')
  const [preparedBy, setPreparedBy]   = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [previewDraft, setPreviewDraft] = useState(null)
  const [sourceLead, setSourceLead] = useState(null)
  const [workType, setWorkType] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiDesc, setAiDesc] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  // ---- VO state ----
  const [vos, setVos]             = useState([])
  const [voLoading, setVoLoading] = useState(false)
  const [voEditId, setVoEditId]   = useState(null)
  const [voDescription, setVoDescription] = useState('')
  const [voItems, setVoItems]     = useState([blankItem()])
  const [voMode, setVoMode]       = useState('simple')
  const [voVat, setVoVat]         = useState(true)
  const [voAddTrade, setVoAddTrade] = useState('')
  const [voSaving, setVoSaving]   = useState(false)
  const [voPreview, setVoPreview] = useState(null)

  const [restoring, setRestoring] = useState(true)

  // Trades come from BOTH Quote Settings (default_trades) AND the Description Library
  // (distinct trade_section values), merged + de-duplicated. Falls back to defaults only if empty.
  const tradeList = (() => {
    const settingsTrades = (Array.isArray(tpl?.default_trades) && tpl.default_trades.length) ? tpl.default_trades : []
    const libTrades = [...new Set((libItems || []).map(li => li.trade_section).filter(Boolean))]
    const merged = []
    const seen = new Set()
    for (const t of [...settingsTrades, ...libTrades]) {
      const key = String(t).trim().toLowerCase()
      if (t && key && !seen.has(key)) { seen.add(key); merged.push(t) }
    }
    return merged.length ? merged : TRADE_FALLBACK
  })()

  // Work-type templates (payment + terms + why-us) from Quote Settings — fall back to
  // sensible defaults so the builder "Work type" dropdown works even before Settings is saved.
  const savedPresets = parsePresetsTpl(tpl?.work_type_presets)
  const presets = savedPresets.length ? savedPresets : DEFAULT_PRESETS
  const defaultPresetName = (presets.find(p => p.isDefault) || presets[0])?.name || ''
  const selectedPreset = presets.find(p => p.name === workType) || presets.find(p => p.isDefault) || presets[0] || null

  function setView(v, sub) {
    setViewRaw(v)
    if (v === 'list') setSub('')
    else if (sub !== undefined) setSub(sub)
  }

  useEffect(() => {
    if (company?.id) { fetchQuotes(); fetchTemplate(); loadLibrary() }
    setDraftExists(!!loadDraft())
    const observer = new MutationObserver(() => forceUpdate(n => n + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [company?.id])

  useEffect(() => {
    if (loading) return
    if (!restoring) return
    const parts = (subRoute || '').split('/')
    const v = parts[0] || ''
    const id = parts[1] || ''
    if (!v || v === 'list') { setViewRaw('list'); setRestoring(false); return }

    if (v === 'builder') {
      const d = loadDraft()
      if (d) {
        setEditId(null)
        setMode(d.mode === 'boq' && canBoq ? 'boq' : (d.mode === 'advanced' && canAdvanced ? 'advanced' : 'simple'))
        setClient(d.client || null); setClientSearch(d.clientSearch || '')
        setProjectTitle(d.projectTitle || '')
        setItems(Array.isArray(d.items) && d.items.length ? d.items : [blankItem()])
        setVatEnabled(d.vatEnabled ?? true)
        setDiscountType(d.discountType ?? null); setDiscountValue(d.discountValue ?? 0)
        setNotes(d.notes || ''); setShowFooter(d.showFooter ?? true); setShowSignature(d.showSignature ?? true); setShowBank(d.showBank ?? false)
        setLocation(d.location || ''); setPreparedBy(d.preparedBy || ''); setClientEmail(d.clientEmail || '')
        setSourceLead(d.sourceLead || null)
        setWorkType(d.workType || defaultPresetName); setValidUntil(d.validUntil || '')
      }
      setViewRaw('builder')
      setRestoring(false)
      return
    }

    if ((v === 'detail' || v === 'preview') && id) {
      const q = quotes.find(x => String(x.id) === String(id))
      if (q) {
        setActiveQuote(q)
        if (v === 'detail') { setVos([]); fetchVos(q.id) }
        setViewRaw(v)
      } else {
        setViewRaw('list'); setSub('')
      }
      setRestoring(false)
      return
    }

    if ((v === 'voBuilder' || v === 'voPreview') && id) {
      const q = quotes.find(x => String(x.id) === String(id))
      if (q) {
        setActiveQuote(q); setVos([]); fetchVos(q.id)
        setViewRaw('detail')
        setSub(`detail/${q.id}`)
      } else {
        setViewRaw('list'); setSub('')
      }
      setRestoring(false)
      return
    }

    setViewRaw('list'); setSub('')
    setRestoring(false)
  }, [loading, subRoute, quotes])

  // "AI Quote Builder" sidebar entry → open a fresh builder with the AI modal already up.
  const aiStartedRef = useRef(false)
  useEffect(() => {
    if (!startAi || loading || restoring || aiStartedRef.current) return
    aiStartedRef.current = true
    openBuilder()
    setAiOpen(true)
  }, [startAi, loading, restoring])

  async function fetchQuotes() {
    setLoading(true)
    const { data: qs } = await supabase.from('quotations').select('*')
      .eq('company_id', company.id).order('created_at', { ascending: false }).limit(500)
    setQuotes(qs || []); setLoading(false)
  }
  async function fetchTemplate() {
    const { data } = await supabase.from('quotation_templates').select('*')
      .eq('company_id', company.id).maybeSingle()
    setTpl(data || null)
  }
  async function loadLibrary() {
    try {
      const { data } = await supabase.from('quote_library').select('*')
        .eq('company_id', String(company.id)).order('created_at', { ascending: false })
      setLibItems(data || [])
    } catch { setLibItems([]) }
  }
  async function fetchVos(quotationId) {
    setVoLoading(true)
    const { data } = await supabase.from('quotation_variations').select('*')
      .eq('quotation_id', quotationId).eq('company_id', company.id).order('vo_number', { ascending: true })
    setVos(data || []); setVoLoading(false)
  }

  // ---- Description Library: autocomplete fill + auto-grow ----
  function applyDesc(idx, val, isVo) {
    const norm = s => (s || '').trim().toLowerCase()
    const v = norm(val)
    const lib = v ? libItems.find(li => norm(li.description) === v || (li.label && norm(li.label) === v)) : null
    const apply = (it) => {
      if (!lib) return { ...it, desc: val }
      const u = mapUnit(lib.unit)
      return { ...it, desc: lib.description, unit: u || it.unit, rate: Number(lib.default_rate) || it.rate }
    }
    if (isVo) setVoItems(prev => prev.map((it,i)=> i===idx ? apply(it) : it))
    else setItems(prev => prev.map((it,i)=> i===idx ? apply(it) : it))
  }
  // best-effort: save any new line descriptions into the library (owner only via RLS)
  async function growLibrary(validItems, m) {
    try {
      if (!company?.id) return
      const existing = new Set(libItems.map(li => (li.description||'').trim().toLowerCase()))
      const seen = new Set()
      const rows = []
      for (const it of validItems) {
        const d = (it.desc||'').trim()
        if (d.length < 4) continue
        const key = d.toLowerCase()
        if (existing.has(key) || seen.has(key)) continue
        seen.add(key)
        rows.push({
          company_id: String(company.id),
          owner_email: user?.email || null,
          trade_section: (m === 'boq' ? (it.trade || 'Misc') : 'Misc'),
          label: null,
          description: d,
          unit: it.unit || null,
          default_rate: Number(it.rate) || 0,
        })
      }
      if (!rows.length) return
      const { data, error } = await supabase.from('quote_library').insert(rows).select()
      if (!error && data) setLibItems(prev => [...prev, ...data])
    } catch { /* best-effort, ignore */ }
  }

  // link a quote back to its originating lead → move to Quoted + timeline log (best-effort)
  async function linkLeadQuoted(sl, quoteNo) {
    try {
      if (sl.distId) {
        await supabase.from('lead_distributions').update({ status: 'quoted', status_updated_at: new Date().toISOString() }).eq('id', sl.distId)
      } else if (sl.subId) {
        await supabase.from('lead_submissions').update({ status: 'proposal_given', status_updated_at: new Date().toISOString() }).eq('id', sl.subId)
      }
      await supabase.from('lead_activity').insert({
        lead_id: sl.subId || null, distribution_id: sl.distId || null, company_id: company.id,
        actor_name: company?.name || null, kind: 'stage_change', old_stage: sl.status || null, new_stage: 'proposal_given',
        note: quoteNo ? ('Quotation ' + quoteNo + ' created') : 'Quotation created',
      })
    } catch { /* best-effort */ }
  }
  // Quote approved → originating lead becomes Won (best-effort, owner-side).
  async function markLeadWon(q) {
    try {
      if (!q?.source_sub_id && !q?.source_dist_id) return
      if (q.source_dist_id) await supabase.from('lead_distributions').update({ status: 'won', status_updated_at: new Date().toISOString() }).eq('id', q.source_dist_id)
      if (q.source_sub_id) await supabase.from('lead_submissions').update({ status: 'won', status_updated_at: new Date().toISOString() }).eq('id', q.source_sub_id)
      await supabase.from('lead_activity').insert({
        lead_id: q.source_sub_id || null, distribution_id: q.source_dist_id || null, company_id: company.id,
        actor_name: company?.name || null, kind: 'stage_change', new_stage: 'won',
        note: 'Quotation ' + (q.quote_number || '') + ' approved',
      })
    } catch { /* best-effort */ }
  }

  async function searchClients(q) {
    setClientSearch(q); setClient(null)
    if (!q.trim()) { setSuggestions([]); setShowSug(false); return }
    const term = q.trim()
    const normPhone = p => (p || '').replace(/[^0-9]/g, '').slice(-9)
    // 1) saved clients
    const { data: cData } = await supabase.from('clients').select('*')
      .eq('company_id', company.id)
      .or(`name.ilike.%${term}%,phone.ilike.%${term}%,uid.ilike.%${term}%`)
      .order('name').limit(8)
    const clientList = (cData || []).map(c => ({ ...c, _src: 'client' }))
    // 2) own captured leads not yet saved as a client (deduped against the clients above)
    const { data: lData } = await supabase.from('lead_submissions').select('id,name,phone,email,status')
      .eq('company_id', company.id)
      .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
      .order('created_at', { ascending: false }).limit(8)
    const seen = new Set(clientList.flatMap(c => [normPhone(c.phone), (c.name || '').trim().toLowerCase()].filter(Boolean)))
    const leadList = (lData || []).filter(l => {
      const ph = normPhone(l.phone), nm = (l.name || '').trim().toLowerCase()
      return !((ph && seen.has(ph)) || (nm && seen.has(nm)))
    }).map(l => ({ ...l, _src: 'lead' }))
    setSuggestions([...clientList, ...leadList].slice(0, 10)); setShowSug(true)
  }
  // Reuse / create a client row from a captured lead so the quote can link to it.
  async function findOrCreateClientFromLead(lead) {
    const phoneDigits = (lead.phone || '').replace(/[^0-9]/g, '')
    let row = null
    if (phoneDigits) {
      const { data } = await supabase.from('clients').select('*').eq('company_id', company.id).ilike('phone', `%${phoneDigits.slice(-9)}%`).limit(1)
      if (data && data.length) row = data[0]
    }
    if (!row && lead.name) {
      const { data } = await supabase.from('clients').select('*').eq('company_id', company.id).eq('name', lead.name).limit(1)
      if (data && data.length) row = data[0]
    }
    if (!row) {
      const { data, error } = await supabase.from('clients').insert({
        company_id: company.id, name: lead.name || 'Client', phone: lead.phone || null, email: lead.email || null, source: 'lead',
      }).select('*').single()
      if (error) throw error
      row = data
    }
    return row
  }
  async function pickClient(c) {
    if (c._src === 'lead') {
      try {
        const row = await findOrCreateClientFromLead(c)
        setClient(row); setClientSearch(row.name || c.name || ''); setShowSug(false)
        if (row.email || c.email) setClientEmail(row.email || c.email)
        setSourceLead({ subId: c.id, distId: null, isPlatform: false, status: c.status || 'new' })
      } catch (e) { toast.error('Could not use lead: ' + (e.message || 'unknown')) }
      return
    }
    setClient(c); setClientSearch(c.name); setShowSug(false)
    if (c.email) setClientEmail(c.email)
  }

  function openDetail(q) { setActiveQuote(q); setVos([]); fetchVos(q.id); setView('detail', `detail/${q.id}`) }
  function openPreview(q) { setPreviewDraft(null); setActiveQuote(q); setView('preview', `preview/${q.id}`) }
  async function duplicateQuote(q) {
    try {
      const { data: seq, error: seqErr } = await supabase.rpc('fn_next_quote_seq', { p_company_id: company.id })
      if (seqErr) throw seqErr
      const prefix = tpl?.quote_prefix || 'QTN'
      const payload = {
        company_id: company.id,
        quote_number: `${prefix}-${String(seq).padStart(3,'0')}`,
        client_id: q.client_id, client_uid: q.client_uid, source_uid: q.source_uid || q.client_uid,
        client_name: q.client_name, client_phone: q.client_phone || null, client_email: q.client_email || null,
        location: q.location || null, prepared_by: q.prepared_by || null,
        project_title: (q.project_title ? `${q.project_title} (Copy)` : 'Untitled (Copy)'),
        mode: q.mode, items: q.items,
        subtotal: q.subtotal, vat_amount: q.vat_amount, total: q.total,
        discount_type: q.discount_type || null, discount_value: q.discount_value || 0, vat_enabled: q.vat_enabled ?? null,
        payment_terms: q.payment_terms, why_choose_us: q.why_choose_us, terms: q.terms,
        work_type: q.work_type || null, valid_until: null,
        show_footer: q.show_footer ?? true, show_signature: q.show_signature ?? true, show_bank: q.show_bank ?? false,
        status: 'draft',
      }
      const { error } = await supabase.from('quotations').insert(payload)
      if (error) throw error
      toast.success('Quote duplicated → draft ✓')
      fetchQuotes()
    } catch (e) { toast.error('Duplicate failed: ' + (e.message || 'unknown')) }
  }

  async function changeStatus(newStatus) {
    if (!activeQuote || newStatus === activeQuote.status) return
    setStatusBusy(true)
    const { error } = await supabase.from('quotations').update({ status: newStatus }).eq('id', activeQuote.id).eq('company_id', company.id)
    if (error) { toast.error('Status update failed'); setStatusBusy(false); return }
    const updated = { ...activeQuote, status: newStatus }
    setActiveQuote(updated)
    setQuotes(prev => prev.map(x => x.id === updated.id ? updated : x))
    if (newStatus === 'approved') await markLeadWon(updated)
    setStatusBusy(false)
    toast.success(newStatus === 'approved' ? 'Approved · lead moved to Won' : 'Status updated')
  }

  async function doDelete(id) {
    const { error } = await supabase.from('quotations').delete().eq('id', id).eq('company_id', company.id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Quotation deleted')
    if (activeQuote?.id === id) { setActiveQuote(null); setView('list') }
    fetchQuotes()
  }
  function deleteQuote() {
    if (!activeQuote) return
    if (!window.confirm('Delete this quotation? This cannot be undone.')) return
    doDelete(activeQuote.id)
  }

  function openBuilder() {
    setEditId(null); setMode('simple')
    setClient(null); setClientSearch(''); setSuggestions([]); setShowSug(false)
    setProjectTitle(''); setItems([blankItem()]); setNotes('')
    setVatEnabled(tpl?.default_vat_enabled ?? true)
    setDiscountType(null); setDiscountValue(0)
    setShowFooter(true); setShowSignature(true); setShowBank(tpl?.default_show_bank ?? false); setAddTradePick('')
    setLocation(''); setPreparedBy(''); setClientEmail(''); setSourceLead(null)
    setWorkType(defaultPresetName); setValidUntil('')
    setView('builder', 'builder')
  }
  function resumeDraft() {
    const d = loadDraft()
    if (!d) { setDraftExists(false); return }
    setEditId(null)
    setMode(d.mode === 'boq' && canBoq ? 'boq' : (d.mode === 'advanced' && canAdvanced ? 'advanced' : 'simple'))
    setClient(d.client || null); setClientSearch(d.clientSearch || '')
    setSuggestions([]); setShowSug(false)
    setProjectTitle(d.projectTitle || '')
    setItems(Array.isArray(d.items) && d.items.length ? d.items : [blankItem()])
    setVatEnabled(d.vatEnabled ?? true)
    setDiscountType(d.discountType ?? null); setDiscountValue(d.discountValue ?? 0)
    setNotes(d.notes || ''); setShowFooter(d.showFooter ?? true); setShowSignature(d.showSignature ?? true); setShowBank(d.showBank ?? false)
    setLocation(d.location || ''); setPreparedBy(d.preparedBy || ''); setClientEmail(d.clientEmail || '')
    setSourceLead(d.sourceLead || null)
    setWorkType(d.workType || defaultPresetName); setValidUntil(d.validUntil || '')
    setAddTradePick(''); setView('builder', 'builder')
  }
  function discardDraft() { clearDraft(); setDraftExists(false); toast.info('Draft discarded') }

  function editQuote(q) {
    setEditId(q.id)
    setMode(q.mode === 'boq' && canBoq ? 'boq' : (q.mode === 'advanced' && canAdvanced ? 'advanced' : 'simple'))
    setClient(q.client_id ? { id:q.client_id, uid:q.client_uid, name:q.client_name, phone:q.client_phone, email:q.client_email } : null)
    setClientSearch(q.client_name || ''); setSuggestions([]); setShowSug(false)
    setProjectTitle(q.project_title || '')
    setItems(Array.isArray(q.items) && q.items.length
      ? q.items.map(it => ({ desc:it.desc||'', unit:it.unit||'Nos', qty:it.qty??1, rate:it.rate??0, trade: it.trade || '' }))
      : [blankItem()])
    setNotes('')
    setVatEnabled(q.vat_enabled != null ? q.vat_enabled : (!!q.vat_amount || (tpl?.default_vat_enabled ?? true)))
    setDiscountType(q.discount_type || null); setDiscountValue(q.discount_value || 0)
    setShowFooter(q.show_footer ?? true); setShowSignature(q.show_signature ?? true); setShowBank(q.show_bank ?? (tpl?.default_show_bank ?? false))
    setLocation(q.location || ''); setPreparedBy(q.prepared_by || ''); setClientEmail(q.client_email || ''); setSourceLead(null)
    setWorkType(q.work_type || defaultPresetName); setValidUntil(q.valid_until || '')
    setAddTradePick(''); setView('builder', 'builder')
  }

  function switchMode(m) {
    if (m === mode) return
    if (m === 'advanced' && !canAdvanced) { setLockModal(true); return }
    if (m === 'boq' && !canBoq) { setLockModal(true); return }
    if (m === 'boq' || m === 'advanced') {
      // Grouped modes: drop empty rows so the user adds a section first, then items.
      setItems(prev => prev.filter(it => (it.desc || '').trim()))
    }
    setMode(m)
  }

  function updateItem(idx, field, val) { setItems(prev => prev.map((it,i)=> i===idx?{...it,[field]:val}:it)) }
  function addItem() { setItems(prev => [...prev, blankItem()]) }
  function removeItem(idx) { setItems(prev => prev.length===1?prev:prev.filter((_,i)=>i!==idx)) }
  function addItemToTrade(trade) { setItems(prev => [...prev, blankItemT(trade)]) }
  function removeItemBoq(idx) { setItems(prev => prev.filter((_,i)=>i!==idx)) }
  function addTradeSection() { if (!addTradePick) return; addItemToTrade(addTradePick); setAddTradePick('') }

  // AI: describe a project → Claude drafts an itemized quote (grounded in the quote library + rates)
  async function aiGenerate() {
    if (!aiDesc.trim()) { toast.error('Describe the project first'); return }
    setAiBusy(true)
    try {
      const lib = (libItems || []).map(li => ({ description: li.description, unit: li.unit, default_rate: li.default_rate, trade_section: li.trade_section }))
      const { data, error } = await supabase.functions.invoke('smart-function', {
        body: { action: 'quote', description: aiDesc.trim(), companyName: company?.name || '', companyCategory: company?.category || '', mode, library: lib },
      })
      if (error) throw error
      if (data?.error) { toast.error(data.code === 'no_credit' ? 'AI credits exhausted' : (data.error || 'AI failed')); return }
      const aiItems = Array.isArray(data?.items) ? data.items : []
      if (!aiItems.length) { toast.error('AI could not generate items — add more detail (or redeploy the AI function)'); return }
      const mapped = aiItems.map(it => ({
        desc: String(it.desc || '').trim(), unit: it.unit || 'Nos',
        qty: Number(it.qty) || 1, rate: Number(it.rate) || 0,
        ...((mode === 'boq' || mode === 'advanced') ? { trade: it.trade || 'Misc' } : {}),
      })).filter(it => it.desc)
      if (!mapped.length) { toast.error('AI returned no usable items'); return }
      setItems(mapped)
      setAiOpen(false); setAiDesc('')
      toast.success(`AI drafted ${mapped.length} items ✓ — review & edit rates`)
    } catch (e) { toast.error('AI failed: ' + (e.message || 'unknown')) } finally { setAiBusy(false) }
  }

  const subtotal = items.reduce((s,it)=> s + (Number(it.qty)||0)*(Number(it.rate)||0), 0)
  const discountAmount = discountType==='percent' ? Math.round(subtotal*(Number(discountValue)||0)/100)
    : discountType==='flat' ? (Number(discountValue)||0) : 0
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const vatAmount = vatEnabled ? Math.round(afterDiscount*0.05) : 0
  const grandTotal = afterDiscount + vatAmount
  const fmt = n => 'AED ' + Math.round(n).toLocaleString('en-AE')

  useEffect(() => {
    if (view !== 'builder' || editId) return
    const hasContent = client || projectTitle.trim() || items.some(it => it.desc.trim())
    if (!hasContent) return
    const t = setTimeout(() => {
      saveDraft({ mode, client, clientSearch, projectTitle, items, vatEnabled, discountType, discountValue, notes, showFooter, showSignature, showBank, location, preparedBy, clientEmail, sourceLead })
      setDraftExists(true)
    }, 500)
    return () => clearTimeout(t)
  }, [view, editId, mode, client, projectTitle, items, vatEnabled, discountType, discountValue, notes, showFooter, showSignature, showBank, location, preparedBy, clientEmail, sourceLead])

  function openBuilderPreview() {
    if (!client) { toast.error('Select a client first'); return }
    const validItems = items.filter(it => it.desc.trim())
    if (validItems.length === 0) { toast.error('Add at least one line item'); return }
    const tempQuote = {
      id: '__preview__',
      quote_number: editId ? (activeQuote?.quote_number || 'DRAFT') : 'DRAFT',
      client_uid: client.uid, client_name: client.name, client_phone: client.phone || '',
      client_email: clientEmail.trim() || client.email || '',
      location: location.trim() || '', prepared_by: preparedBy.trim() || '',
      project_title: projectTitle.trim() || '', mode,
      items: validItems.map(it => ({
        desc: it.desc.trim(), unit: it.unit || 'Nos', qty: Number(it.qty)||0, rate: Number(it.rate)||0,
        ...((mode === 'boq' || mode === 'advanced') ? { trade: it.trade || 'Misc' } : {}),
      })),
      subtotal, vat_amount: vatAmount, total: grandTotal,
      payment_terms: selectedPreset ? selectedPreset.payment : (tpl?.payment_schedule || null),
      why_choose_us: selectedPreset ? JSON.stringify(selectedPreset.whyUs) : (tpl?.why_choose_us || null),
      terms: selectedPreset ? selectedPreset.terms : (tpl?.default_terms || null),
      work_type: workType || null, valid_until: validUntil || null,
      show_footer: showFooter, show_signature: showSignature, show_bank: showBank,
      created_at: new Date().toISOString(),
    }
    setPreviewDraft(tempQuote)
    setActiveQuote(tempQuote)
    setView('preview', 'preview')
  }

  async function saveQuote(sendNow) {
    if (!client) { toast.error('Select a client first'); return }
    const validItems = items.filter(it => it.desc.trim())
    if (validItems.length === 0) { toast.error('Add at least one line item'); return }
    setSaving(true)
    try {
      const payload = {
        client_id: client.id, client_uid: client.uid, source_uid: client.uid,
        client_name: client.name, client_phone: client.phone || null,
        client_email: (clientEmail.trim() || client.email || null),
        location: location.trim() || null,
        prepared_by: preparedBy.trim() || null,
        project_title: projectTitle.trim() || null, mode,
        items: validItems.map(it => ({
          desc:it.desc.trim(), unit:it.unit||'Nos', qty:Number(it.qty)||0, rate:Number(it.rate)||0,
          ...((mode === 'boq' || mode === 'advanced') ? { trade: it.trade || 'Misc' } : {}),
        })),
        subtotal, vat_amount: vatAmount, total: grandTotal,
        discount_type: discountType || null, discount_value: Number(discountValue) || 0, vat_enabled: vatEnabled,
        payment_terms: selectedPreset ? selectedPreset.payment : (tpl?.payment_schedule || null),
        why_choose_us: selectedPreset ? JSON.stringify(selectedPreset.whyUs) : (tpl?.why_choose_us || null),
        terms: selectedPreset ? (selectedPreset.terms || null) : (tpl?.default_terms || null),
        work_type: workType || null,
        valid_until: validUntil || null,
        show_footer: showFooter, show_signature: showSignature, show_bank: showBank,
        status: sendNow ? 'sent' : 'draft',
      }
      let savedQuoteNo = editId ? (activeQuote?.quote_number || '') : ''
      if (editId) {
        const { error } = await supabase.from('quotations').update(payload).eq('id', editId).eq('company_id', company.id)
        if (error) throw error
        toast.success('Quotation updated ✓')
      } else {
        const { data: seq, error: seqErr } = await supabase.rpc('fn_next_quote_seq', { p_company_id: company.id })
        if (seqErr) throw seqErr
        const prefix = tpl?.quote_prefix || 'QTN'
        payload.company_id = company.id
        payload.quote_number = `${prefix}-${String(seq).padStart(3,'0')}`
        payload.source_sub_id = sourceLead?.subId || null
        payload.source_dist_id = sourceLead?.distId || null
        savedQuoteNo = payload.quote_number
        const { error } = await supabase.from('quotations').insert(payload)
        if (error) throw error
        toast.success(sendNow ? 'Quotation sent ✓' : 'Draft saved ✓')
      }
      growLibrary(validItems, mode)
      if (sourceLead && !['won','lost'].includes(sourceLead.status || '')) {
        await linkLeadQuoted(sourceLead, savedQuoteNo)
      }
      setSourceLead(null)
      clearDraft(); setDraftExists(false)
      setView('list'); fetchQuotes()
    } catch (e) {
      toast.error('Save failed: ' + (e.message || 'unknown'))
    } finally { setSaving(false) }
  }

  // ============ VO logic ============
  const voSubtotal = voItems.reduce((s,it)=> s + (Number(it.qty)||0)*(Number(it.rate)||0), 0)
  const voVatAmount = voVat ? Math.round(voSubtotal*0.05) : 0
  const voTotal = voSubtotal + voVatAmount

  const approvedVoTotal = vos.filter(v => (v.status||'draft')==='approved').reduce((s,v)=> s + Number(v.total||0), 0)
  const revisedTotal = Number(activeQuote?.total||0) + approvedVoTotal

  function openVoBuilder() {
    setVoEditId(null)
    setVoDescription('')
    setVoMode(activeQuote?.mode === 'boq' && canBoq ? 'boq' : 'simple')
    setVoItems(activeQuote?.mode === 'boq' && canBoq ? [] : [blankItem()])
    setVoVat(true); setVoAddTrade('')
    setView('voBuilder', `voBuilder/${activeQuote.id}`)
  }
  function editVo(v) {
    setVoEditId(v.id)
    setVoDescription(v.description || '')
    const m = v.items && v.items.some(it => it.trade) ? 'boq' : 'simple'
    setVoMode(m === 'boq' && canBoq ? 'boq' : 'simple')
    setVoItems(Array.isArray(v.items) && v.items.length
      ? v.items.map(it => ({ desc:it.desc||'', unit:it.unit||'Nos', qty:it.qty??1, rate:it.rate??0, trade: it.trade || '' }))
      : [blankItem()])
    setVoVat(!!v.vat_amount); setVoAddTrade('')
    setView('voBuilder', `voBuilder/${activeQuote.id}`)
  }
  function updateVoItem(idx, field, val) { setVoItems(prev => prev.map((it,i)=> i===idx?{...it,[field]:val}:it)) }
  function addVoItem() { setVoItems(prev => [...prev, voMode==='boq'?blankItemT(tradeList[0]||'Misc'):blankItem()]) }
  function removeVoItem(idx) { setVoItems(prev => prev.length===1?prev:prev.filter((_,i)=>i!==idx)) }
  function addVoItemToTrade(trade) { setVoItems(prev => [...prev, blankItemT(trade)]) }
  function removeVoItemBoq(idx) { setVoItems(prev => prev.filter((_,i)=>i!==idx)) }

  async function saveVo() {
    const validItems = voItems.filter(it => it.desc.trim())
    if (!voDescription.trim()) { toast.error('Add a variation description'); return }
    if (validItems.length === 0) { toast.error('Add at least one line item'); return }
    setVoSaving(true)
    try {
      const payload = {
        quotation_id: activeQuote.id, company_id: company.id,
        description: voDescription.trim(),
        items: validItems.map(it => ({
          desc:it.desc.trim(), unit:it.unit||'Nos', qty:Number(it.qty)||0, rate:Number(it.rate)||0,
          ...(voMode === 'boq' ? { trade: it.trade || 'Misc' } : {}),
        })),
        subtotal: voSubtotal, vat_enabled: voVat, vat_amount: voVatAmount, total: voTotal,
        status: 'draft',
      }
      if (voEditId) {
        const { error } = await supabase.from('quotation_variations').update(payload).eq('id', voEditId).eq('company_id', company.id)
        if (error) throw error
        toast.success('Variation updated ✓')
      } else {
        const nextVo = (vos.reduce((m,v)=> Math.max(m, Number(v.vo_number)||0), 0)) + 1
        payload.vo_number = nextVo
        const { error } = await supabase.from('quotation_variations').insert(payload)
        if (error) throw error
        toast.success('Variation saved ✓')
      }
      growLibrary(validItems, voMode)
      await fetchVos(activeQuote.id)
      setView('detail', `detail/${activeQuote.id}`)
    } catch (e) {
      toast.error('Save failed: ' + (e.message || 'unknown'))
    } finally { setVoSaving(false) }
  }

  async function changeVoStatus(v, newStatus) {
    if ((v.status||'draft') === newStatus) return
    const { error } = await supabase.from('quotation_variations').update({ status: newStatus }).eq('id', v.id).eq('company_id', company.id)
    if (error) { toast.error('Status update failed'); return }
    await fetchVos(activeQuote.id)
    toast.success('VO status updated')
  }
  async function deleteVo(v) {
    if (!window.confirm(`Delete VO-${String(v.vo_number).padStart(2,'0')}? This cannot be undone.`)) return
    const { error } = await supabase.from('quotation_variations').delete().eq('id', v.id).eq('company_id', company.id)
    if (error) { toast.error('Delete failed'); return }
    await fetchVos(activeQuote.id)
    toast.success('Variation deleted')
  }

  // ============ PDF HTML GENERATOR (quotes + VO) ============
  function buildQuoteHTML(q, voMeta) {
    const cName  = escapeHtml(tpl?.company_legal_name || company?.name || 'Company')
    const cLogo  = company?.logo_url || ''
    const tagline= escapeHtml(tpl?.tagline || 'Dubai, UAE')
    const cPhone = escapeHtml(tpl?.contact_phone || company?.phone || '')
    const cEmail = escapeHtml(tpl?.contact_email || '')
    const trn    = escapeHtml(tpl?.trn_number || '')
    const terms  = escapeHtml(q.terms || tpl?.default_terms || DEFAULT_TERMS)
    const wantFooter = q.show_footer ?? true
    const wantSign   = q.show_signature ?? true
    const wantBank   = q.show_bank ?? false
    const bankFields = [
      ['Bank', tpl?.bank_name], ['Account Name', tpl?.bank_account_name], ['Account No', tpl?.bank_account_number],
      ['IBAN', tpl?.bank_iban], ['SWIFT', tpl?.bank_swift], ['Branch', tpl?.bank_branch],
    ].filter(([, v]) => v && String(v).trim()).map(([k, v]) => [k, escapeHtml(v)])
    const qItems = Array.isArray(q.items) ? q.items : []
    const isBoq  = (q.mode === 'boq' || q.mode === 'advanced')
    const isVo   = !!voMeta
    const docLabel = isVo ? 'VARIATION ORDER' : 'QUOTATION'
    const refLabel = isVo ? escapeHtml(voMeta.voNumber) : escapeHtml(q.quote_number||'')
    const dateStr = new Date(q.created_at || Date.now()).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
    const validStr = q.valid_until ? new Date(q.valid_until).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : ''

    const sub = Number(q.subtotal||0), vat = Number(q.vat_amount||0), tot = Number(q.total||0)
    const disc = Math.max(0, sub - (tot - vat))
    const n = v => Math.round(v).toLocaleString('en-AE')

    const payments = parsePaymentTpl(q.payment_terms || tpl?.payment_schedule)
    const whys = parseWhyTpl(q.why_choose_us || tpl?.why_choose_us)

    const colgroup = `<colgroup><col style="width:26px"><col><col style="width:44px"><col style="width:36px"><col style="width:60px"><col style="width:72px"></colgroup>`
    const td = 'padding:7px 8px;font-size:10.5px;border-bottom:0.5px solid #ededed;'
    const tdDesc = `${td}word-break:break-word;overflow-wrap:anywhere;`

    const rowHtml = (it, i) => `<tr>
      <td style="${td}color:#999;">${i}</td>
      <td style="${tdDesc}">${escapeHtml(it.desc||'')}</td>
      <td style="${td}text-align:center;color:#777;">${escapeHtml(it.unit||'')}</td>
      <td style="${td}text-align:center;color:#777;">${escapeHtml(it.qty||0)}</td>
      <td style="${td}text-align:right;color:#777;">${n(Number(it.rate)||0)}</td>
      <td style="${td}text-align:right;">${n((Number(it.qty)||0)*(Number(it.rate)||0))}</td>
    </tr>`

    const bandBg = canPremium ? '#c9952a' : '#1a1a1a'
    const bandColor = canPremium ? '#1a1a1a' : '#fff'

    let bodyRows = ''
    if (isBoq) {
      const groups = groupByTrade(qItems, tradeList)
      bodyRows = groups.map((g, gi) => `
        <tr><td colspan="6" style="background:${bandBg};color:${bandColor};font-size:10px;font-weight:700;padding:5px 10px;letter-spacing:1px;">${escapeHtml(String.fromCharCode(65+gi))} · ${escapeHtml(g.trade.toUpperCase())}</td></tr>
        ${g.items.map((it,i)=>rowHtml(it,i+1)).join('')}
        <tr><td colspan="5" style="text-align:right;padding:6px 10px;background:#faf6ec;font-size:10px;font-weight:700;color:#6b6b6b;">${escapeHtml(g.trade)} Subtotal</td><td style="text-align:right;padding:6px 10px;background:#faf6ec;font-size:10px;font-weight:700;color:#c9952a;">AED ${n(g.subtotal)}</td></tr>
      `).join('')
    } else {
      bodyRows = qItems.map((it,i)=>rowHtml(it,i+1)).join('')
    }

    const logoBox = cLogo
      ? `<img src="${escapeHtml(cLogo)}" style="width:54px;height:54px;border-radius:11px;object-fit:cover;">`
      : `<div style="width:54px;height:54px;border-radius:11px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;color:#c9952a;">${cName[0]||'C'}</div>`

    const voDescBlock = isVo && voMeta.description ? `
      <div style="padding:0 30px 12px;">
        <div style="background:#faf6ec;border:0.5px solid #e8d9b5;border-radius:5px;padding:9px 12px;">
          <div style="font-size:8.5px;color:#b08f3f;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:3px;">Variation Description</div>
          <div style="font-size:11px;color:#444;line-height:1.5;">${escapeHtml(voMeta.description)}</div>
        </div>
      </div>` : ''

    if (canPremium) {
      const paymentCards = (!isVo && payments.length) ? `
        <div style="padding:18px 30px 0;">
          <div style="font-size:10px;color:#c9952a;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:10px;">— Payment Schedule</div>
          <div style="display:flex;gap:8px;">
            ${payments.map(p => `<div style="flex:1;border:0.5px solid #eee;border-top:2px solid #c9952a;padding:9px 10px;">
              <div style="font-size:16px;font-weight:700;color:#c9952a;">${escapeHtml(p.percent)}%</div>
              <div style="font-size:11px;font-weight:700;color:#1a1a1a;margin-top:1px;">AED ${n(tot*(Number(p.percent)||0)/100)}</div>
              <div style="font-size:9.5px;font-weight:700;margin-top:3px;">${escapeHtml(p.label||'')}</div>
              ${p.description?`<div style="font-size:8.5px;color:#888;margin-top:2px;line-height:1.4;">${escapeHtml(p.description)}</div>`:''}
            </div>`).join('')}
          </div>
        </div>` : ''

      const whyBlock = (!isVo && whys.length) ? `
        <div style="padding:18px 30px 0;">
          <div style="font-size:10px;color:#c9952a;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:10px;">— Why Choose ${cName.split(' ').slice(0,2).join(' ')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px 16px;">
            ${whys.map(w => `<div style="display:flex;gap:7px;">
              <span style="color:#c9952a;font-size:13px;font-weight:700;line-height:1.2;">✓</span>
              <div><div style="font-size:10px;font-weight:700;">${escapeHtml(w.title||'')}</div>${w.detail?`<div style="font-size:8.5px;color:#888;line-height:1.5;">${escapeHtml(w.detail)}</div>`:''}</div>
            </div>`).join('')}
          </div>
        </div>` : ''

      const signBlock = wantSign ? `
        <div style="padding:20px 30px 6px;margin-top:14px;border-top:0.5px solid #eee;display:flex;gap:30px;">
          <div style="flex:1;text-align:center;"><div style="font-size:9px;font-weight:700;color:#6b6b6b;margin-bottom:24px;">For ${cName}</div><div style="border-bottom:1px solid #1a1a1a;"></div><div style="font-size:8px;color:#999;margin-top:4px;">Authorized Signatory · Date · Stamp</div></div>
          <div style="flex:1;text-align:center;"><div style="font-size:9px;font-weight:700;color:#6b6b6b;margin-bottom:24px;">Client Acceptance & Approval</div><div style="border-bottom:1px solid #1a1a1a;"></div><div style="font-size:8px;color:#999;margin-top:4px;">Name · Signature · Date</div></div>
        </div>` : ''

      const bankBlock = (wantBank && bankFields.length) ? `
        <div style="padding:18px 30px 0;">
          <div style="font-size:10px;color:#c9952a;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:10px;">— Bank Details</div>
          <div style="border:0.5px solid #eee;border-left:2px solid #c9952a;border-radius:4px;padding:11px 14px;display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;">
            ${bankFields.map(([k,v])=>`<div style="display:flex;gap:8px;font-size:10px;"><span style="color:#999;min-width:80px;">${k}</span><span style="font-weight:600;color:#1a1a1a;word-break:break-word;">${v}</span></div>`).join('')}
          </div>
        </div>` : ''

      return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:680px;margin:0 auto;background:#fff;">
        <div style="height:5px;background:#c9952a;"></div>
        <div style="padding:22px 30px 0;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
            <div style="display:flex;gap:13px;align-items:center;">
              ${logoBox}
              <div>
                <div style="font-size:16px;font-weight:700;">${cName}</div>
                <div style="font-size:9px;color:#8a8a8a;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">${tagline}</div>
                <div style="font-size:9.5px;color:#8a8a8a;margin-top:3px;">${cPhone}${cEmail?' · '+cEmail:''}${trn?' · TRN '+trn:''}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:${isVo?'17px':'20px'};font-weight:700;color:#c9952a;letter-spacing:${isVo?'1px':'2px'};">${docLabel}</div>
              <div style="display:inline-block;margin-top:6px;background:#faf6ec;border:0.5px solid #e8d9b5;border-radius:5px;padding:5px 9px;text-align:left;">
                <div style="font-size:9px;color:#6b6b6b;font-family:monospace;">${isVo?'VO':'Ref'} · ${refLabel}</div>
                ${isVo?`<div style="font-size:9px;color:#6b6b6b;font-family:monospace;">Against · ${escapeHtml(q.quote_number||'')}</div>`:(q.client_uid?`<div style="font-size:9px;color:#6b6b6b;font-family:monospace;">UID · ${escapeHtml(q.client_uid)}</div>`:'')}
                <div style="font-size:9px;color:#6b6b6b;">Date · ${dateStr}</div>
                ${validStr?`<div style="font-size:9px;color:#6b6b6b;">Valid until · ${validStr}</div>`:''}
              </div>
            </div>
          </div>
          <div style="display:flex;gap:14px;margin-bottom:16px;">
            <div style="flex:1;background:#faf9f7;border-left:2.5px solid #c9952a;padding:10px 13px;">
              <div style="font-size:8.5px;color:#b08f3f;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;">Bill To</div>
              <div style="font-size:12.5px;font-weight:700;word-break:break-word;">${escapeHtml(q.client_name||'')}</div>
              ${q.location?`<div style="font-size:10px;color:#6b6b6b;margin-top:2px;">${escapeHtml(q.location)}</div>`:''}
              ${q.client_phone?`<div style="font-size:10px;color:#6b6b6b;">${escapeHtml(q.client_phone)}</div>`:''}
            </div>
            <div style="flex:1;background:#faf9f7;border-left:2.5px solid #c9952a;padding:10px 13px;">
              <div style="font-size:8.5px;color:#b08f3f;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;">Project</div>
              <div style="font-size:12.5px;font-weight:700;word-break:break-word;">${escapeHtml(q.project_title||'—')}</div>
              ${q.prepared_by?`<div style="font-size:10px;color:#6b6b6b;margin-top:2px;">Prepared by · ${escapeHtml(q.prepared_by)}</div>`:''}
              ${q.client_email?`<div style="font-size:10px;color:#6b6b6b;word-break:break-word;">${escapeHtml(q.client_email)}</div>`:''}
            </div>
          </div>
        </div>
        ${voDescBlock}
        <div style="padding:0 30px;">
          <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
            ${colgroup}
            <thead><tr style="background:#1a1a1a;color:#fff;">
              <th style="padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;">#</th>
              <th style="padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;">Description</th>
              <th style="padding:7px 8px;text-align:center;font-size:9px;">Unit</th>
              <th style="padding:7px 8px;text-align:center;font-size:9px;">Qty</th>
              <th style="padding:7px 8px;text-align:right;font-size:9px;">Rate</th>
              <th style="padding:7px 8px;text-align:right;font-size:9px;">Amount</th>
            </tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div style="padding:16px 30px 0;display:flex;justify-content:flex-end;">
          <div style="width:250px;">
            <div style="display:flex;justify-content:space-between;font-size:10.5px;padding:3px 0;color:#6b6b6b;"><span>${disc>0?'Gross Total':'Subtotal'}</span><span>AED ${n(sub)}</span></div>
            ${disc>0?`<div style="display:flex;justify-content:space-between;font-size:10.5px;padding:3px 0;color:#0f6e56;"><span>Discount</span><span>− ${n(disc)}</span></div>`:''}
            ${vat>0?`<div style="display:flex;justify-content:space-between;font-size:10.5px;padding:3px 0;color:#6b6b6b;"><span>VAT 5%</span><span>${n(vat)}</span></div>`:''}
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:7px 10px;margin-top:5px;background:#1a1a1a;color:#fff;border-radius:4px;"><span>${isVo?'VO Total':'Grand Total'}</span><span style="color:#c9952a;">AED ${n(tot)}</span></div>
          </div>
        </div>
        ${bankBlock}
        ${wantFooter ? paymentCards + whyBlock + (!isVo ? `
          <div style="padding:18px 30px 0;">
            <div style="font-size:10px;color:#c9952a;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:7px;">— Terms & Conditions</div>
            <div style="font-size:8.5px;color:#888;line-height:1.7;white-space:pre-line;">${terms}</div>
          </div>` : '') : ''}
        ${signBlock}
        <div style="background:#1a1a1a;color:#9a9a9a;font-size:8.5px;text-align:center;padding:9px;margin-top:18px;">${cName} &nbsp;·&nbsp; ${cPhone}${cEmail?' &nbsp;·&nbsp; '+cEmail:''} &nbsp;·&nbsp; ${tagline}</div>
      </div>`
    }

    const paymentStr = payments.length
      ? payments.map(p => `${p.percent}% (AED ${n(tot*(Number(p.percent)||0)/100)})${p.label ? ' ' + p.label : ''}`).join(' · ')
      : '50% Advance · 40% On completion · 10% On handover'
    const footerHtml = (wantFooter && !isVo) ? `<div style="background:#faf8f3;border-radius:5px;padding:11px 13px;margin-bottom:14px;">
        <div style="font-size:9px;color:#c9952a;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:5px;">Payment Schedule</div>
        <div style="font-size:10.5px;color:#555;">${escapeHtml(paymentStr)}</div>
        <div style="font-size:9px;color:#c9952a;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin:9px 0 5px;">Terms</div>
        <div style="font-size:10px;color:#777;line-height:1.6;white-space:pre-line;">${terms}</div>
      </div>` : ''
    const signHtml = wantSign ? `<div style="text-align:center;"><div style="width:120px;border-bottom:1px solid #1a1a1a;margin-bottom:4px;height:30px;"></div><div style="font-size:9.5px;color:#6b6b6b;">Authorized Signature &amp; Stamp</div></div>` : '<div></div>'
    const bankHtml = (wantBank && bankFields.length) ? `<div style="background:#faf8f3;border-radius:5px;padding:11px 13px;margin-bottom:14px;">
        <div style="font-size:9px;color:#c9952a;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:6px;">Bank Details</div>
        ${bankFields.map(([k,v])=>`<div style="font-size:10.5px;color:#555;margin-bottom:2px;"><span style="color:#999;display:inline-block;min-width:86px;">${k}</span> <span style="font-weight:600;color:#1a1a1a;">${v}</span></div>`).join('')}
      </div>` : ''

    return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:680px;margin:0 auto;padding:30px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c9952a;padding-bottom:14px;margin-bottom:16px;">
        <div style="display:flex;gap:11px;align-items:center;">
          ${cLogo?`<img src="${escapeHtml(cLogo)}" style="width:46px;height:46px;border-radius:9px;object-fit:cover;">`:`<div style="width:46px;height:46px;border-radius:9px;background:#c9952a;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#fff;">${cName[0]||'C'}</div>`}
          <div>
            <div style="font-size:15px;font-weight:700;">${cName}</div>
            <div style="font-size:10px;color:#6b6b6b;">${tagline}</div>
            <div style="font-size:10px;color:#6b6b6b;">${cPhone}${trn?' · TRN '+trn:''}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:17px;font-weight:700;color:#c9952a;">${docLabel}</div>
          <div style="font-size:10px;color:#6b6b6b;margin-top:3px;font-family:monospace;">${isVo?'VO':'Ref'}: ${refLabel}</div>
          ${isVo?`<div style="font-size:10px;color:#6b6b6b;font-family:monospace;">Against: ${escapeHtml(q.quote_number||'')}</div>`:(q.client_uid?`<div style="font-size:10px;color:#6b6b6b;font-family:monospace;">UID: ${escapeHtml(q.client_uid)}</div>`:'')}
          <div style="font-size:10px;color:#6b6b6b;">Date: ${dateStr}</div>
          ${validStr?`<div style="font-size:10px;color:#6b6b6b;">Valid until: ${validStr}</div>`:''}
        </div>
      </div>
      ${isVo && voMeta.description ? `<div style="background:#faf8f3;border-radius:5px;padding:9px 12px;margin-bottom:14px;"><div style="font-size:9px;color:#c9952a;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:3px;">Variation Description</div><div style="font-size:10.5px;color:#555;">${escapeHtml(voMeta.description)}</div></div>` : ''}
      <div style="display:flex;justify-content:space-between;margin-bottom:16px;gap:14px;">
        <div style="min-width:0;"><div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Bill To</div>
          <div style="font-size:12px;font-weight:700;word-break:break-word;">${escapeHtml(q.client_name||'')}</div>
          ${q.location?`<div style="font-size:11px;color:#6b6b6b;">${escapeHtml(q.location)}</div>`:''}
          <div style="font-size:11px;color:#6b6b6b;">${escapeHtml(q.client_phone||'')}</div>
          ${q.client_email?`<div style="font-size:11px;color:#6b6b6b;word-break:break-word;">${escapeHtml(q.client_email)}</div>`:''}</div>
        <div style="text-align:right;min-width:0;"><div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Project</div>
          <div style="font-size:12px;font-weight:700;word-break:break-word;">${escapeHtml(q.project_title||'—')}</div>
          ${q.prepared_by?`<div style="font-size:11px;color:#6b6b6b;">Prepared by · ${escapeHtml(q.prepared_by)}</div>`:''}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:14px;">
        ${colgroup}
        <thead><tr style="background:#1a1a1a;color:#fff;">
          <th style="padding:7px 8px;text-align:left;font-size:10px;">#</th>
          <th style="padding:7px 8px;text-align:left;font-size:10px;">Description</th>
          <th style="padding:7px 8px;text-align:center;font-size:10px;">Unit</th>
          <th style="padding:7px 8px;text-align:center;font-size:10px;">Qty</th>
          <th style="padding:7px 8px;text-align:right;font-size:10px;">Rate</th>
          <th style="padding:7px 8px;text-align:right;font-size:10px;">Total</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
        <div style="width:240px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:#6b6b6b;"><span>${disc>0?'Gross Total':'Subtotal'}</span><span>AED ${n(sub)}</span></div>
          ${disc>0?`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:#0f6e56;"><span>Discount</span><span>− ${n(disc)}</span></div>`:''}
          ${vat>0?`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:#6b6b6b;"><span>VAT 5%</span><span>${n(vat)}</span></div>`:''}
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:6px 0 0;border-top:1.5px solid #1a1a1a;margin-top:4px;"><span>${isVo?'VO Total':'Grand Total'}</span><span style="color:#c9952a;">AED ${n(tot)}</span></div>
        </div>
      </div>
      ${bankHtml}
      ${footerHtml}
      <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:14px;">
        <div style="font-size:9.5px;color:#999;">Thank you for choosing ${cName}.</div>
        ${signHtml}
      </div>
    </div>`
  }

  function printDoc(html, title) {
    const w = window.open('', '_blank')
    if (!w) { toast.error('Allow pop-ups to print/preview'); return }
    const safeTitle = escapeHtml(title || 'Document')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        /* force background colours/gradients to print & save-to-PDF (premium theme stays) */
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @media print {
          .__toolbar { display:none !important; }
          body { padding-top:0 !important; background:#fff !important; }
          @page { margin: 10mm; }
        }
        .__toolbar { position:fixed; top:0; left:0; right:0; height:52px; z-index:9999; background:#0f1623; color:#fff; display:flex; align-items:center; justify-content:space-between; padding:0 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; box-shadow:0 2px 10px rgba(0,0,0,0.25); }
        .__toolbar .__t { font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .__toolbar .__btns { display:flex; gap:8px; flex-shrink:0; }
        .__toolbar button { font-size:13px; font-weight:600; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-family:inherit; }
        .__btn-print { background:#0099cc; color:#fff; }
        .__btn-close { background:rgba(255,255,255,0.12); color:#fff; }
      </style>
    </head><body style="margin:0;background:#eef2f6;padding-top:52px;">
      <div class="__toolbar">
        <span class="__t">${safeTitle}</span>
        <span class="__btns">
          <button class="__btn-print" onclick="window.print()">Print / Save PDF</button>
          <button class="__btn-close" onclick="window.close()">✕ Close</button>
        </span>
      </div>
      ${html}
    </body></html>`)
    w.document.close()
  }
  function printQuote(q) { printDoc(buildQuoteHTML(q), q.quote_number) }
  function printVo(v) {
    const voNum = 'VO-' + String(v.vo_number).padStart(2,'0')
    const renderObj = {
      ...activeQuote, items: v.items, subtotal: v.subtotal, vat_amount: v.vat_amount, total: v.total,
      mode: (v.items && v.items.some(it=>it.trade)) ? 'boq' : 'simple',
      created_at: v.created_at, show_footer: true, show_signature: true,
    }
    printDoc(buildQuoteHTML(renderObj, { voNumber: voNum, description: v.description }), voNum)
  }

  function whatsappQuote(q) {
    const phone = (q.client_phone||'').replace(/[^0-9]/g,'')
    const msg = `Dear ${q.client_name||'Client'},\n\nPlease find your quotation ${q.quote_number} from ${company?.name||''}.\nProject: ${q.project_title||'—'}\nTotal: AED ${Number(q.total||0).toLocaleString('en-AE')}\n\nThank you.`
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank')
  }
  // Public approval link (client opens it, no login, to approve/reject online)
  function approvalLink(q) { return `${window.location.origin}/#approve/${q.public_token || ''}` }
  function copyApprovalLink(q) {
    if (!q.public_token) { toast.error('Save the quote first to get an approval link'); return }
    const link = approvalLink(q)
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(()=>toast.success('Approval link copied ✓')).catch(()=>window.prompt('Copy approval link:', link))
    else window.prompt('Copy approval link:', link)
  }
  function whatsappApproval(q) {
    if (!q.public_token) { toast.error('Save the quote first to get an approval link'); return }
    const phone = (q.client_phone||'').replace(/[^0-9]/g,'')
    const msg = `Dear ${q.client_name||'Client'},\n\nPlease review & approve your quotation ${q.quote_number} from ${company?.name||''}:\n${approvalLink(q)}\n\nThank you.`
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank')
  }

  let list = quotes
  if (filter !== 'all') list = list.filter(q => (q.status||'draft')===filter)
  if (search.trim()) {
    const s = search.toLowerCase()
    list = list.filter(q => q.quote_number?.toLowerCase().includes(s) || q.client_name?.toLowerCase().includes(s)
      || q.project_title?.toLowerCase().includes(s) || q.client_uid?.toLowerCase().includes(s))
  }
  const total   = quotes.length
  const sentCnt = quotes.filter(q => (q.status||'draft')==='sent').length
  const apprCnt = quotes.filter(q => (q.status||'draft')==='approved').length
  const apprVal = quotes.filter(q => (q.status||'draft')==='approved').reduce((s,q)=> s+(q.total||0),0)
  const fmtShort = n => n>=1000 ? (n/1000).toFixed(n%1000===0?0:1)+'k' : String(Math.round(n))

  const text=isDark?'#f1f5f9':'#0f172a', textSub=isDark?'#94a3b8':'#64748b', textMuted=isDark?'#475569':'#94a3b8'
  const border=isDark?'rgba(255,255,255,0.08)':'#e2e8f0', cardBg=isDark?'#1e293b':'#ffffff'
  const subBg=isDark?'rgba(255,255,255,0.04)':'#f8fafc', pillBg=isDark?'rgba(255,255,255,0.05)':'#fff', inputBg=isDark?'#0f172a':'#fff'
  const inputStyle = { padding:'9px 11px', border:`1px solid ${border}`, borderRadius:8, fontSize:13, background:inputBg, color:text, outline:'none', width:'100%', boxSizing:'border-box' }
  const initials = nm => nm ? nm.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '?'

  const LibDatalist = () => {
    const seen = new Set()
    const opts = libItems.filter(li => {
      const k = (li.description || '').trim().toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k); return true
    })
    return (
      <datalist id="qlib-list">
        {opts.map(li => <option key={li.id} value={li.description}>{li.label || ''}</option>)}
      </datalist>
    )
  }

  // ============ PREVIEW ============
  if (view === 'preview' && activeQuote) {
    const q = activeQuote
    const pageHtml = buildQuoteHTML(q)
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <button onClick={() => { if (previewDraft) { setPreviewDraft(null); setView('builder', 'builder') } else { setView('detail', `detail/${q.id}`) } }} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
          </button>
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:18, fontWeight:700, color:text, margin:0 }}>Preview · {q.quote_number}{previewDraft ? ' (unsaved)' : ''}</h1>
            {canPremium && <div style={{ fontSize:11, color:'#d97706', fontWeight:600 }}>Premium template</div>}
          </div>
        </div>
        <div style={{ maxWidth:720, margin:'0 auto', boxShadow:'0 2px 16px rgba(0,0,0,0.12)', overflowX:'auto', background:'#fff' }}
          dangerouslySetInnerHTML={{ __html: pageHtml }} />
        <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:16, flexWrap:'wrap' }}>
          <button onClick={()=>printQuote(q)} style={{ padding:'10px 18px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-printer" style={{ fontSize:14, verticalAlign:'-2px', marginRight:5 }}/> Print / PDF</button>
          <button onClick={()=>whatsappQuote(q)} style={{ padding:'10px 18px', borderRadius:9, border:'none', background:'#22c55e', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-brand-whatsapp" style={{ fontSize:14, verticalAlign:'-2px', marginRight:5 }}/> Send via WhatsApp</button>
          {!previewDraft && q.public_token && (
            <button onClick={()=>copyApprovalLink(q)} style={{ padding:'10px 18px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-link" style={{ fontSize:14, verticalAlign:'-2px', marginRight:5 }}/> Approval link</button>
          )}
        </div>
      </div>
    )
  }

  // ============ VO PREVIEW ============
  if (view === 'voPreview' && voPreview && activeQuote) {
    const v = voPreview
    const voNum = 'VO-' + String(v.vo_number).padStart(2,'0')
    const renderObj = {
      ...activeQuote, items: v.items, subtotal: v.subtotal, vat_amount: v.vat_amount, total: v.total,
      mode: (v.items && v.items.some(it=>it.trade)) ? 'boq' : 'simple',
      created_at: v.created_at, show_footer: true, show_signature: true,
    }
    const pageHtml = buildQuoteHTML(renderObj, { voNumber: voNum, description: v.description })
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <button onClick={() => setView('detail', `detail/${activeQuote.id}`)} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
          </button>
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:18, fontWeight:700, color:text, margin:0 }}>Preview · {voNum}</h1>
            <div style={{ fontSize:11, color:'#d97706', fontWeight:600 }}>Variation Order · against {activeQuote.quote_number}</div>
          </div>
        </div>
        <div style={{ maxWidth:720, margin:'0 auto', boxShadow:'0 2px 16px rgba(0,0,0,0.12)', overflowX:'auto', background:'#fff' }}
          dangerouslySetInnerHTML={{ __html: pageHtml }} />
        <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:16, flexWrap:'wrap' }}>
          <button onClick={()=>printVo(v)} style={{ padding:'10px 18px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-printer" style={{ fontSize:14, verticalAlign:'-2px', marginRight:5 }}/> Print / PDF</button>
        </div>
      </div>
    )
  }

  // ============ VO BUILDER ============
  if (view === 'voBuilder' && activeQuote) {
    const voGroups = voMode === 'boq' ? groupByTradeIdx(voItems, tradeList) : null
    const voAvailTrades = tradeList.filter(t => !(voGroups||[]).some(g => g.trade === t))
    return (
      <div>
        {LibDatalist()}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <button onClick={() => setView('detail', `detail/${activeQuote.id}`)} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
          </button>
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:19, fontWeight:700, color:text, margin:0 }}>{voEditId ? 'Edit Variation' : 'New Variation Order'}</h1>
            <div style={{ fontSize:12, color:textMuted }}>Against {activeQuote.quote_number} · {activeQuote.client_name}</div>
          </div>
        </div>

        <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:5 }}>Variation description <span style={{ color:'#dc2626' }}>*</span></label>
        <input value={voDescription} onChange={e=>setVoDescription(e.target.value)} placeholder="e.g. Added bidet + extra wall niche in Bathroom 2" style={{ ...inputStyle, marginBottom:14 }}/>

        {canBoq && (
          <div style={{ display:'inline-flex', background:pillBg, border:`1px solid ${border}`, borderRadius:10, padding:3, marginBottom:14 }}>
            <button onClick={()=>{ setVoMode('simple') }} style={{ fontSize:13, fontWeight: voMode==='simple'?600:400, padding:'6px 16px', borderRadius:7, border:'none', cursor:'pointer', background: voMode==='simple'?(isDark?'rgba(3,193,245,0.15)':'#e0f9ff'):'transparent', color: voMode==='simple'?'#0099cc':textSub }}>Simple</button>
            <button onClick={()=>{ setVoMode('boq'); setVoItems(prev=>prev.filter(it=> (it.desc||'').trim())) }} style={{ fontSize:13, fontWeight: voMode==='boq'?600:400, padding:'6px 16px', borderRadius:7, border:'none', cursor:'pointer', background: voMode==='boq'?(isDark?'rgba(3,193,245,0.15)':'#e0f9ff'):'transparent', color: voMode==='boq'?'#0099cc':textSub }}>BOQ</button>
          </div>
        )}

        {voMode === 'simple' && (
          <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:14 }}>
            <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
              <div style={{ minWidth:440 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 50px 40px 58px 78px 26px', gap:7, padding:'9px 12px', background:subBg, fontSize:11, color:textSub, textTransform:'uppercase', letterSpacing:'.3px' }}>
                  <span>Description</span><span>Unit</span><span>Qty</span><span>Rate</span><span style={{ textAlign:'right' }}>Total</span><span/>
                </div>
                {voItems.map((it, idx) => {
                  const lt = (Number(it.qty)||0)*(Number(it.rate)||0)
                  return (
                    <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 50px 40px 58px 78px 26px', gap:7, padding:'8px 12px', alignItems:'center', borderTop:`1px solid ${border}` }}>
                      <input list="qlib-list" value={it.desc} onChange={e=>applyDesc(idx, e.target.value, true)} placeholder="Item description" style={{ ...inputStyle, padding:'7px 8px', fontSize:12.5 }}/>
                      <select value={it.unit} onChange={e=>updateVoItem(idx,'unit',e.target.value)} style={{ ...inputStyle, padding:'7px 4px', fontSize:11 }}>
                        {UNITS.map(u => <option key={u} value={u} style={{ background:inputBg, color:text }}>{u}</option>)}
                      </select>
                      <input type="number" value={it.qty} onChange={e=>updateVoItem(idx,'qty',e.target.value)} style={{ ...inputStyle, padding:'7px 4px', fontSize:12.5, textAlign:'center' }}/>
                      <input type="number" value={it.rate} onChange={e=>updateVoItem(idx,'rate',e.target.value)} style={{ ...inputStyle, padding:'7px 6px', fontSize:12.5, textAlign:'right' }}/>
                      <span style={{ textAlign:'right', fontSize:12.5, color:text, alignSelf:'center' }}>{Math.round(lt).toLocaleString('en-AE')}</span>
                      <button onClick={()=>removeVoItem(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:textMuted, display:'flex', justifyContent:'center', alignItems:'center' }}><i className="ti ti-x" style={{ fontSize:15 }}/></button>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ padding:'9px 11px', borderTop:`1px solid ${border}` }}>
              <button onClick={addVoItem} style={{ fontSize:12, padding:'6px 12px', border:`1px solid ${border}`, borderRadius:7, background:'none', color:'#0099cc', cursor:'pointer', fontWeight:600 }}>
                <i className="ti ti-plus" style={{ fontSize:13, verticalAlign:'-2px', marginRight:3 }}/> Add line item
              </button>
            </div>
          </div>
        )}

        {voMode === 'boq' && (
          <>
            {voGroups.map((g) => (
              <div key={g.trade} style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 13px', background:subBg }}>
                  <span style={{ fontSize:13, fontWeight:600, color:text, display:'flex', alignItems:'center', gap:7 }}><i className="ti ti-tools" style={{ fontSize:15, color:'#0099cc' }}/> {g.trade}</span>
                  <span style={{ fontSize:12, color:textSub }}>Subtotal: <span style={{ fontWeight:600, color:text }}>{fmt(g.subtotal)}</span></span>
                </div>
                <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
                  <div style={{ minWidth:430 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 48px 38px 56px 76px 24px', gap:7, padding:'7px 12px', fontSize:10.5, color:textMuted, textTransform:'uppercase', letterSpacing:'.3px' }}>
                      <span>Description</span><span>Unit</span><span>Qty</span><span>Rate</span><span style={{ textAlign:'right' }}>Total</span><span/>
                    </div>
                    {g.rows.map(({ it, idx }) => {
                      const lt = (Number(it.qty)||0)*(Number(it.rate)||0)
                      return (
                        <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 48px 38px 56px 76px 24px', gap:7, padding:'6px 12px', alignItems:'center', borderTop:`1px solid ${border}` }}>
                          <input list="qlib-list" value={it.desc} onChange={e=>applyDesc(idx, e.target.value, true)} placeholder="Item description" style={{ ...inputStyle, padding:'7px 8px', fontSize:12 }}/>
                          <select value={it.unit} onChange={e=>updateVoItem(idx,'unit',e.target.value)} style={{ ...inputStyle, padding:'7px 3px', fontSize:10.5 }}>
                            {UNITS.map(u => <option key={u} value={u} style={{ background:inputBg, color:text }}>{u}</option>)}
                          </select>
                          <input type="number" value={it.qty} onChange={e=>updateVoItem(idx,'qty',e.target.value)} style={{ ...inputStyle, padding:'7px 3px', fontSize:12, textAlign:'center' }}/>
                          <input type="number" value={it.rate} onChange={e=>updateVoItem(idx,'rate',e.target.value)} style={{ ...inputStyle, padding:'7px 5px', fontSize:12, textAlign:'right' }}/>
                          <span style={{ textAlign:'right', fontSize:12, color:text, alignSelf:'center' }}>{Math.round(lt).toLocaleString('en-AE')}</span>
                          <button onClick={()=>removeVoItemBoq(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:textMuted, display:'flex', justifyContent:'center', alignItems:'center' }}><i className="ti ti-x" style={{ fontSize:14 }}/></button>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div style={{ padding:'8px 11px', borderTop:`1px solid ${border}` }}>
                  <button onClick={()=>addVoItemToTrade(g.trade)} style={{ fontSize:12, padding:'5px 11px', border:`1px solid ${border}`, borderRadius:7, background:'none', color:'#0099cc', cursor:'pointer', fontWeight:600 }}>
                    <i className="ti ti-plus" style={{ fontSize:12, verticalAlign:'-2px', marginRight:3 }}/> Add item to {g.trade}
                  </button>
                </div>
              </div>
            ))}
            {voGroups.length === 0 && (
              <div style={{ background:subBg, border:`1px dashed ${border}`, borderRadius:10, padding:'20px 16px', textAlign:'center', marginBottom:12 }}>
                <i className="ti ti-stack-2" style={{ fontSize:24, color:textMuted }}/>
                <div style={{ fontSize:13, color:textSub, marginTop:6, fontWeight:600 }}>Select a trade section to begin</div>
                <div style={{ fontSize:11.5, color:textMuted, marginTop:3 }}>Pick a trade below, then add your variation items.</div>
              </div>
            )}
            <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
              <select value={voAddTrade} onChange={e=>setVoAddTrade(e.target.value)} style={{ ...inputStyle, width:'auto', flex:'0 1 auto', minWidth:200, maxWidth:300 }}>
                <option value="">{voGroups.length === 0 ? 'Select a trade section...' : '+ Add a trade section...'}</option>
                {voAvailTrades.map(t => <option key={t} value={t} style={{ background:inputBg, color:text }}>{t}</option>)}
              </select>
              <button onClick={()=>{ if(voAddTrade){ addVoItemToTrade(voAddTrade); setVoAddTrade('') } }} disabled={!voAddTrade} style={{ padding:'0 16px', borderRadius:8, border:`1px solid ${border}`, background:cardBg, color: voAddTrade?'#0099cc':textMuted, fontSize:13, fontWeight:600, cursor: voAddTrade?'pointer':'default', whiteSpace:'nowrap' }}>
                <i className="ti ti-plus" style={{ fontSize:13, verticalAlign:'-2px', marginRight:3 }}/> Add
              </button>
            </div>
          </>
        )}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, marginBottom:14 }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:textSub, cursor:'pointer' }}>
            <input type="checkbox" checked={voVat} onChange={e=>setVoVat(e.target.checked)} style={{ width:'auto' }}/> Apply 5% VAT
          </label>
          <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, padding:'10px 14px', minWidth:200 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:textSub, padding:'2px 0' }}><span>Subtotal</span><span>{fmt(voSubtotal)}</span></div>
            {voVat && <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:textSub, padding:'2px 0' }}><span>VAT 5%</span><span>{fmt(voVatAmount)}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, color:text, padding:'5px 0 0', borderTop:`1px solid ${border}`, marginTop:3 }}><span>VO Total</span><span>{fmt(voTotal)}</span></div>
          </div>
        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={()=>setView('detail', `detail/${activeQuote.id}`)} disabled={voSaving} style={{ flex:1, minWidth:120, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:'transparent', color:textSub, fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={saveVo} disabled={voSaving} style={{ flex:2, minWidth:160, padding:'11px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-check" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> {voSaving?'Saving...':(voEditId?'Update VO':'Save VO')}</button>
        </div>
      </div>
    )
  }

  // ============ DETAIL ============
  if (view === 'detail' && activeQuote) {
    const q = activeQuote
    const md = MODE_STYLE[q.mode||'simple']||MODE_STYLE.simple
    const st = STATUS_STYLE[q.status||'draft']||STATUS_STYLE.draft
    const qItems = Array.isArray(q.items) ? q.items : []
    const isBoq = (q.mode === 'boq' || q.mode === 'advanced')
    const groups = isBoq ? groupByTrade(qItems, tradeList) : null
    const isApproved = (q.status||'draft') === 'approved'
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <button onClick={() => { setView('list'); setActiveQuote(null) }} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
          </button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18, fontWeight:700, color:text, display:'flex', alignItems:'center', gap:8 }}>
              {q.quote_number}
              <span style={{ fontSize:11, color:md.color, background:isDark?md.color+'22':md.bg, padding:'2px 8px', borderRadius:99 }}>{md.label}</span>
            </div>
            {q.client_uid && <div style={{ fontSize:12, color:textMuted, fontFamily:'monospace' }}>UID {q.client_uid}</div>}
          </div>
          <span style={{ fontSize:11, color:st.color, background:isDark?st.color+'22':st.bg, padding:'4px 11px', borderRadius:99, fontWeight:600 }}>{st.label}</span>
        </div>

        <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, padding:'12px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:11 }}>
          <div style={{ width:36, height:36, borderRadius:8, background:isDark?'rgba(3,193,245,0.12)':'#e0f9ff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, color:'#0077a3' }}>{initials(q.client_name)}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:600, color:text }}>{q.client_name}</div>
            <div style={{ fontSize:12, color:textSub }}>{q.client_phone||'—'}{q.project_title?' · '+q.project_title:''}</div>
          </div>
        </div>

        {isBoq ? groups.map((g, gi) => (
          <div key={gi} style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 13px', background:subBg }}>
              <span style={{ fontSize:13, fontWeight:600, color:text }}>{g.trade}</span>
              <span style={{ fontSize:12, color:textSub }}>Subtotal: <span style={{ fontWeight:600, color:text }}>{fmt(g.subtotal)}</span></span>
            </div>
            <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
              <div style={{ minWidth:430 }}>
                {g.items.map((it,i)=>(
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 50px 40px 64px 80px', gap:7, padding:'9px 13px', borderTop:`1px solid ${border}`, fontSize:13, color:text }}>
                    <span style={{ wordBreak:'break-word' }}>{it.desc}</span><span style={{ color:textSub, fontSize:12 }}>{it.unit||'—'}</span><span style={{ color:textSub, textAlign:'center' }}>{it.qty}</span>
                    <span style={{ color:textSub, textAlign:'right' }}>{Number(it.rate).toLocaleString('en-AE')}</span>
                    <span style={{ textAlign:'right' }}>{Math.round((Number(it.qty)||0)*(Number(it.rate)||0)).toLocaleString('en-AE')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )) : (
          <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:12 }}>
            <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
              <div style={{ minWidth:430 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 50px 40px 64px 80px', gap:7, padding:'9px 13px', background:subBg, fontSize:11, color:textSub, textTransform:'uppercase', letterSpacing:'.3px' }}>
                  <span>Description</span><span>Unit</span><span style={{ textAlign:'center' }}>Qty</span><span style={{ textAlign:'right' }}>Rate</span><span style={{ textAlign:'right' }}>Total</span>
                </div>
                {qItems.map((it, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 50px 40px 64px 80px', gap:7, padding:'9px 13px', borderTop:`1px solid ${border}`, fontSize:13, color:text }}>
                    <span style={{ wordBreak:'break-word' }}>{it.desc}</span><span style={{ color:textSub, fontSize:12 }}>{it.unit||'—'}</span><span style={{ color:textSub, textAlign:'center' }}>{it.qty}</span>
                    <span style={{ color:textSub, textAlign:'right' }}>{Number(it.rate).toLocaleString('en-AE')}</span>
                    <span style={{ textAlign:'right' }}>{Math.round((Number(it.qty)||0)*(Number(it.rate)||0)).toLocaleString('en-AE')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14 }}>
          <div style={{ width:230 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:textSub, padding:'3px 0' }}><span>Subtotal</span><span>{fmt(q.subtotal||0)}</span></div>
            {q.vat_amount>0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:textSub, padding:'3px 0' }}><span>VAT 5%</span><span>{fmt(q.vat_amount)}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, color:text, padding:'6px 0 2px', borderTop:`1px solid ${border}`, marginTop:3 }}><span>Total</span><span>{fmt(q.total||0)}</span></div>
          </div>
        </div>

        <div style={{ borderTop:`1px dashed ${border}`, paddingTop:13, marginBottom:13 }}>
          <div style={{ fontSize:11, color:textMuted, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:8 }}>Status</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {STATUS_FLOW.map(s => {
              const active = (q.status||'draft') === s
              const ss = STATUS_STYLE[s]
              return (
                <button key={s} onClick={()=>changeStatus(s)} disabled={statusBusy}
                  style={{ fontSize:12, padding:'6px 13px', borderRadius:99, cursor:'pointer', fontWeight: active?600:400, textTransform:'capitalize',
                    border:`1px solid ${active?ss.color:border}`, background: active?(isDark?ss.color+'22':ss.bg):'transparent', color: active?ss.color:textSub }}>{ss.label}</button>
              )
            })}
          </div>
        </div>

        <div style={{ borderTop:`1px dashed ${border}`, paddingTop:13, marginBottom:13 }}>
          <div style={{ fontSize:11, color:textMuted, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:8 }}>Client Approval</div>
          {q.client_response_at ? (
            <div style={{ background:subBg, border:`1px solid ${border}`, borderRadius:9, padding:'10px 12px', marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:700, color: q.status==='approved' ? '#0f6e56' : (q.status==='rejected' ? '#b91c1c' : text) }}>
                <i className={`ti ${q.status==='approved' ? 'ti-circle-check' : 'ti-circle-x'}`} style={{ marginRight:5, verticalAlign:'-2px' }}/>
                {q.status==='approved' ? 'Approved' : 'Rejected'}{q.approved_by_name ? ` by ${q.approved_by_name}` : ''}
              </div>
              <div style={{ fontSize:11.5, color:textMuted, marginTop:3 }}>{new Date(q.client_response_at).toLocaleString('en-GB')}</div>
              {q.client_comment && <div style={{ fontSize:12, color:textSub, marginTop:5, fontStyle:'italic' }}>“{q.client_comment}”</div>}
            </div>
          ) : (
            <div style={{ fontSize:12, color:textMuted, marginBottom:10 }}>Share a secure link — the client can approve / reject online. No login needed.</div>
          )}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button onClick={()=>copyApprovalLink(q)} style={{ flex:1, minWidth:120, padding:'9px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
              <i className="ti ti-link" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Copy approval link
            </button>
            <button onClick={()=>whatsappApproval(q)} style={{ flex:1, minWidth:120, padding:'9px', borderRadius:9, border:'none', background:'#22c55e', color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
              <i className="ti ti-brand-whatsapp" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Send for approval
            </button>
          </div>
        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:18 }}>
          <button onClick={()=>editQuote(q)} style={{ flex:1, minWidth:80, padding:'10px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <i className="ti ti-edit" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Edit
          </button>
          <button onClick={()=>openPreview(q)} style={{ flex:1, minWidth:80, padding:'10px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <i className="ti ti-eye" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> View
          </button>
          <button onClick={deleteQuote} style={{ flex:1, minWidth:80, padding:'10px', borderRadius:9, border:`1px solid #fca5a5`, background:cardBg, color:'#dc2626', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <i className="ti ti-trash" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Delete
          </button>
        </div>

        {/* ===== Variation Orders ===== */}
        <div style={{ borderTop:`1px solid ${border}`, paddingTop:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:14, fontWeight:700, color:text, display:'flex', alignItems:'center', gap:8 }}>
              <i className="ti ti-git-branch" style={{ fontSize:17, color:'#0099cc' }}/> Variation Orders
            </div>
            {isApproved && (
              <button onClick={openVoBuilder} style={{ fontSize:12, padding:'6px 13px', background:'#0099cc', color:'#fff', border:'none', borderRadius:8, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                <i className="ti ti-plus" style={{ fontSize:13 }}/> New VO
              </button>
            )}
          </div>

          {!isApproved ? (
            <div style={{ background:subBg, border:`1px dashed ${border}`, borderRadius:10, padding:'18px 16px', textAlign:'center' }}>
              <i className="ti ti-lock" style={{ fontSize:22, color:textMuted }}/>
              <div style={{ fontSize:13, color:textSub, marginTop:6 }}>Approve this quote first to add variations.</div>
              <div style={{ fontSize:11, color:textMuted, marginTop:2 }}>Variation orders apply to confirmed (approved) quotes only.</div>
            </div>
          ) : voLoading ? (
            <div style={{ textAlign:'center', padding:20, color:textMuted, fontSize:13 }}>Loading variations...</div>
          ) : (
            <>
              {vos.length === 0 ? (
                <div style={{ background:subBg, borderRadius:10, padding:'16px', textAlign:'center', fontSize:13, color:textSub, marginBottom:12 }}>
                  No variations yet. Click <span style={{ fontWeight:600 }}>New VO</span> to add scope changes.
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
                  {vos.map(v => {
                    const vst = STATUS_STYLE[v.status||'draft']||STATUS_STYLE.draft
                    return (
                      <div key={v.id} style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, padding:'11px 13px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                          <div style={{ background:isDark?'rgba(3,193,245,0.12)':'#e0f9ff', color:'#0077a3', fontSize:11, fontWeight:600, padding:'4px 9px', borderRadius:6, fontFamily:'monospace', flexShrink:0 }}>VO-{String(v.vo_number).padStart(2,'0')}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:text, wordBreak:'break-word' }}>{v.description}</div>
                            <div style={{ fontSize:11, color:textSub }}>{(v.items?.length||0)} item{(v.items?.length||0)!==1?'s':''} · {new Date(v.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
                          </div>
                          <div style={{ textAlign:'right', flexShrink:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:text }}>+ {fmt(v.total||0)}</div>
                            <span style={{ fontSize:10, color:vst.color, background:isDark?vst.color+'22':vst.bg, padding:'2px 8px', borderRadius:99 }}>{vst.label}</span>
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap', alignItems:'center' }}>
                          {VO_STATUS_FLOW.map(s => {
                            const active = (v.status||'draft') === s
                            const ss = STATUS_STYLE[s]
                            return (
                              <button key={s} onClick={()=>changeVoStatus(v, s)}
                                style={{ fontSize:11, padding:'4px 10px', borderRadius:99, cursor:'pointer', fontWeight: active?600:400, textTransform:'capitalize',
                                  border:`1px solid ${active?ss.color:border}`, background: active?(isDark?ss.color+'22':ss.bg):'transparent', color: active?ss.color:textSub }}>{ss.label}</button>
                            )
                          })}
                          <div style={{ flex:1 }}/>
                          <button onClick={()=>{ setVoPreview(v); setView('voPreview', `voPreview/${activeQuote.id}`) }} title="Preview" style={{ width:28, height:28, borderRadius:7, border:`1px solid ${border}`, background:cardBg, color:'#0099cc', cursor:'pointer' }}><i className="ti ti-eye" style={{ fontSize:14 }}/></button>
                          <button onClick={()=>editVo(v)} title="Edit" style={{ width:28, height:28, borderRadius:7, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer' }}><i className="ti ti-edit" style={{ fontSize:14 }}/></button>
                          <button onClick={()=>deleteVo(v)} title="Delete" style={{ width:28, height:28, borderRadius:7, border:`1px solid #fca5a5`, background:cardBg, color:'#dc2626', cursor:'pointer' }}><i className="ti ti-trash" style={{ fontSize:14 }}/></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {vos.length > 0 && (
                <div style={{ background:subBg, borderRadius:10, padding:'13px 15px' }}>
                  <div style={{ fontSize:11, color:textMuted, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:9 }}>Revised Contract Value</div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:textSub, padding:'3px 0' }}><span>Original quote</span><span>{fmt(q.total||0)}</span></div>
                  {vos.map(v => {
                    const appr = (v.status||'draft')==='approved'
                    return (
                      <div key={v.id} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color: appr?textSub:textMuted, padding:'3px 0' }}>
                        <span>VO-{String(v.vo_number).padStart(2,'0')} {appr?'(approved)':`(${v.status||'draft'} · not counted)`}</span>
                        <span>+ {fmt(v.total||0)}</span>
                      </div>
                    )
                  })}
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:700, color:text, padding:'8px 0 2px', borderTop:`1px solid ${border}`, marginTop:5 }}><span>Revised total</span><span style={{ color:'#0099cc' }}>{fmt(revisedTotal)}</span></div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ============ BUILDER ============
  if (view === 'builder') {
    const md = MODE_STYLE[mode] || MODE_STYLE.simple
    const hasBank = !!(tpl?.bank_name || tpl?.bank_iban || tpl?.bank_account_number)
    const boqGroups = (mode === 'boq' || mode === 'advanced') ? groupByTradeIdx(items, tradeList) : null
    const availableTrades = tradeList.filter(t => !(boqGroups||[]).some(g => g.trade === t))
    return (
      <div>
        {LibDatalist()}
        {aiOpen && (
          <div onClick={()=>!aiBusy&&setAiOpen(false)} style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:cardBg, borderRadius:16, width:'100%', maxWidth:480, padding:20, border:`1px solid ${border}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <i className="ti ti-sparkles" style={{ fontSize:20, color:'#7c3aed' }}/>
                <div style={{ fontSize:16, fontWeight:700, color:text }}>Generate quote with AI</div>
              </div>
              <div style={{ fontSize:12, color:textMuted, marginBottom:12 }}>Describe the project — AI drafts an itemized quote using your library &amp; rates. You can edit everything afterwards.</div>
              <textarea value={aiDesc} onChange={e=>setAiDesc(e.target.value)} autoFocus rows={5}
                placeholder={'e.g. 3-bedroom villa kitchen renovation — remove old cabinets, install modular cabinets, quartz countertop, new sink & mixer, false ceiling with spotlights, repaint walls.'}
                style={{ ...inputStyle, resize:'vertical', lineHeight:1.5, marginBottom:6 }}/>
              <div style={{ fontSize:11, color:textMuted, marginBottom:14 }}>Mode: <b style={{ color:textSub }}>{md.label}</b>{mode!=='simple' ? ' · items will be grouped into sections' : ''}</div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setAiOpen(false)} disabled={aiBusy} style={{ flex:1, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancel</button>
                <button onClick={aiGenerate} disabled={aiBusy} style={{ flex:2, padding:'11px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#7c3aed,#0099cc)', color:'#fff', fontSize:13.5, fontWeight:700, cursor:aiBusy?'default':'pointer', opacity:aiBusy?0.7:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  {aiBusy ? 'Generating…' : <><i className="ti ti-sparkles" style={{ fontSize:15 }}/> Generate</>}
                </button>
              </div>
              {items.some(it=>(it.desc||'').trim()) && <div style={{ fontSize:10.5, color:'#d97706', marginTop:10 }}>⚠ This will replace the current items.</div>}
            </div>
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <button onClick={() => setView('list')} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
          </button>
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:19, fontWeight:700, color:text, margin:0 }}>{editId ? 'Edit Quotation' : 'New Quotation'}</h1>
            <div style={{ fontSize:12, color:textMuted }}>{md.label} mode{!editId && draftExists ? ' · auto-saving' : ''}</div>
          </div>
          <span style={{ fontSize:11, color:md.color, background:isDark?md.color+'22':md.bg, padding:'4px 11px', borderRadius:99, fontWeight:600 }}>{md.label}</span>
        </div>

        <div style={{ display:'inline-flex', background:pillBg, border:`1px solid ${border}`, borderRadius:10, padding:3, marginBottom:16 }}>
          <button onClick={()=>switchMode('simple')}
            style={{ fontSize:13, fontWeight: mode==='simple'?600:400, padding:'6px 16px', borderRadius:7, border:'none', cursor:'pointer',
              background: mode==='simple'?(isDark?'rgba(3,193,245,0.15)':'#e0f9ff'):'transparent', color: mode==='simple'?'#0099cc':textSub }}>Simple</button>
          <button onClick={()=>switchMode('advanced')}
            style={{ fontSize:13, fontWeight: mode==='advanced'?600:400, padding:'6px 16px', borderRadius:7, border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:5,
              background: mode==='advanced'?(isDark?'rgba(3,193,245,0.15)':'#e0f9ff'):'transparent', color: mode==='advanced'?'#0099cc':(canAdvanced?textSub:textMuted) }}>
            Advanced {!canAdvanced && <i className="ti ti-lock" style={{ fontSize:12 }}/>}
          </button>
          <button onClick={()=>switchMode('boq')}
            style={{ fontSize:13, fontWeight: mode==='boq'?600:400, padding:'6px 16px', borderRadius:7, border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:5,
              background: mode==='boq'?(isDark?'rgba(3,193,245,0.15)':'#e0f9ff'):'transparent', color: mode==='boq'?'#0099cc':(canBoq?textSub:textMuted) }}>
            BOQ {!canBoq && <i className="ti ti-lock" style={{ fontSize:12 }}/>}
          </button>
        </div>

        <button onClick={()=>setAiOpen(true)}
          style={{ display:'flex', alignItems:'center', gap:9, width:'100%', marginBottom:14, padding:'11px 14px', borderRadius:10, border:'none', cursor:'pointer',
            background:'linear-gradient(135deg,#7c3aed,#0099cc)', color:'#fff', fontSize:13.5, fontWeight:600, boxSizing:'border-box' }}>
          <i className="ti ti-sparkles" style={{ fontSize:18 }}/>
          <div style={{ textAlign:'left', flex:1 }}>
            <div>Generate with AI</div>
            <div style={{ fontSize:10.5, opacity:0.85, fontWeight:400 }}>Describe the project — AI drafts the itemized quote</div>
          </div>
          <i className="ti ti-arrow-right" style={{ fontSize:15 }}/>
        </button>

        <div style={{ marginBottom:12, position:'relative' }}>
          <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:5 }}>Select client <span style={{ color:'#dc2626' }}>*</span></label>
          {client ? (
            <div style={{ background:cardBg, border:`1px solid #0099cc`, borderRadius:8, padding:'10px 12px', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:isDark?'rgba(3,193,245,0.12)':'#e0f9ff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'#0077a3' }}>{initials(client.name)}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:text }}>{client.name}</div>
                <div style={{ fontSize:11, color:textSub }}>{client.phone||'—'}{client.email?' · '+client.email:''}</div>
              </div>
              {client.uid && <span style={{ fontSize:10, color:'#0077a3', fontFamily:'monospace' }}>{client.uid}</span>}
              <button onClick={()=>{ setClient(null); setClientSearch('') }} style={{ background:'none', border:'none', cursor:'pointer', color:textMuted }}><i className="ti ti-x" style={{ fontSize:15 }}/></button>
            </div>
          ) : (
            <>
              <div style={{ position:'relative' }}>
                <input value={clientSearch} onChange={e=>searchClients(e.target.value)} onFocus={()=>clientSearch&&setShowSug(true)}
                  placeholder="Type name or phone — clients & leads..." style={{ ...inputStyle, paddingLeft:34 }} />
                <i className="ti ti-search" style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:15, color:textMuted }}/>
              </div>
              {showSug && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:4, background:cardBg, border:`1px solid ${border}`, borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:20, overflow:'hidden', maxHeight:280, overflowY:'auto' }}>
                  {suggestions.length > 0 ? suggestions.map((c,i) => (
                    <div key={`${c._src}-${c.id}`} onClick={()=>pickClient(c)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', cursor:'pointer', borderTop: i>0?`1px solid ${border}`:'none' }}
                      onMouseEnter={e=>e.currentTarget.style.background=subBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{ width:30, height:30, borderRadius:7, background:subBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:textSub }}>{initials(c.name)}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:text }}>{c.name}</div>
                        <div style={{ fontSize:11, color:textSub }}>{c.phone||'—'}</div>
                      </div>
                      {c._src === 'lead'
                        ? <span style={{ fontSize:9.5, color:'#0891b2', background:isDark?'#0891b222':'#e0f7fa', padding:'2px 7px', borderRadius:99, fontWeight:600 }}>Lead</span>
                        : <span style={{ fontSize:10, color:textMuted, fontFamily:'monospace' }}>{c.uid}</span>}
                    </div>
                  )) : (
                    <div style={{ padding:'14px 12px', textAlign:'center' }}>
                      <div style={{ fontSize:12, color:textSub, marginBottom:4 }}>No match found</div>
                      <div style={{ fontSize:11, color:textMuted }}>No client or lead matches that name / phone.</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <input value={projectTitle} onChange={e=>setProjectTitle(e.target.value)} placeholder="Project title (e.g. Interior Fit-Out)" style={{ ...inputStyle, marginBottom:10 }}/>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap:8, marginBottom:14 }}>
          <div style={{ minWidth:0 }}>
            <label style={{ fontSize:11, color:textMuted, display:'block', marginBottom:3 }}>Location</label>
            <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Dubai, UAE" style={{ ...inputStyle, fontSize:12.5 }}/>
          </div>
          <div style={{ minWidth:0 }}>
            <label style={{ fontSize:11, color:textMuted, display:'block', marginBottom:3 }}>Prepared by</label>
            <input value={preparedBy} onChange={e=>setPreparedBy(e.target.value)} placeholder="Your name" style={{ ...inputStyle, fontSize:12.5 }}/>
          </div>
          <div style={{ minWidth:0 }}>
            <label style={{ fontSize:11, color:textMuted, display:'block', marginBottom:3 }}>Client email</label>
            <input value={clientEmail} onChange={e=>setClientEmail(e.target.value)} placeholder="client@email.com" style={{ ...inputStyle, fontSize:12.5 }}/>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap:8, marginBottom:14 }}>
          {presets.length > 0 && (
            <div style={{ minWidth:0 }}>
              <label style={{ fontSize:11, color:textMuted, display:'block', marginBottom:3 }}>Work type · payment &amp; terms</label>
              <select value={workType} onChange={e=>setWorkType(e.target.value)} style={{ ...inputStyle, fontSize:12.5 }}>
                {presets.map(p => <option key={p.name} value={p.name} style={{ background:inputBg, color:text }}>{p.name}{p.isDefault?' (default)':''}</option>)}
              </select>
              <div style={{ fontSize:10.5, color:textMuted, marginTop:3 }}>Payment schedule, why-us &amp; terms come from this template.</div>
            </div>
          )}
          <div style={{ minWidth:0 }}>
            <label style={{ fontSize:11, color:textMuted, display:'block', marginBottom:3 }}>Valid until <span style={{ color:textMuted }}>(optional)</span></label>
            <input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)} style={{ ...inputStyle, fontSize:12.5 }}/>
          </div>
        </div>

        {mode === 'simple' && (
          <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:14 }}>
            <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
              <div style={{ minWidth:440 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 50px 40px 58px 78px 26px', gap:7, padding:'9px 12px', background:subBg, fontSize:11, color:textSub, textTransform:'uppercase', letterSpacing:'.3px' }}>
                  <span>Description</span><span>Unit</span><span>Qty</span><span>Rate</span><span style={{ textAlign:'right' }}>Total</span><span/>
                </div>
                {items.map((it, idx) => {
                  const lt = (Number(it.qty)||0)*(Number(it.rate)||0)
                  return (
                    <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 50px 40px 58px 78px 26px', gap:7, padding:'8px 12px', alignItems:'center', borderTop:`1px solid ${border}` }}>
                      <input list="qlib-list" value={it.desc} onChange={e=>applyDesc(idx, e.target.value, false)} placeholder="Item description" style={{ ...inputStyle, padding:'7px 8px', fontSize:12.5 }}/>
                      <select value={it.unit} onChange={e=>updateItem(idx,'unit',e.target.value)} style={{ ...inputStyle, padding:'7px 4px', fontSize:11 }}>
                        {UNITS.map(u => <option key={u} value={u} style={{ background:inputBg, color:text }}>{u}</option>)}
                      </select>
                      <input type="number" value={it.qty} onChange={e=>updateItem(idx,'qty',e.target.value)} style={{ ...inputStyle, padding:'7px 4px', fontSize:12.5, textAlign:'center' }}/>
                      <input type="number" value={it.rate} onChange={e=>updateItem(idx,'rate',e.target.value)} style={{ ...inputStyle, padding:'7px 6px', fontSize:12.5, textAlign:'right' }}/>
                      <span style={{ textAlign:'right', fontSize:12.5, color:text, alignSelf:'center' }}>{Math.round(lt).toLocaleString('en-AE')}</span>
                      <button onClick={()=>removeItem(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:textMuted, display:'flex', justifyContent:'center', alignItems:'center' }}><i className="ti ti-x" style={{ fontSize:15 }}/></button>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ padding:'9px 11px', borderTop:`1px solid ${border}` }}>
              <button onClick={addItem} style={{ fontSize:12, padding:'6px 12px', border:`1px solid ${border}`, borderRadius:7, background:'none', color:'#0099cc', cursor:'pointer', fontWeight:600 }}>
                <i className="ti ti-plus" style={{ fontSize:13, verticalAlign:'-2px', marginRight:3 }}/> Add line item
              </button>
            </div>
          </div>
        )}

        {(mode === 'boq' || mode === 'advanced') && (
          <>
            {boqGroups.map((g) => (
              <div key={g.trade} style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 13px', background:subBg }}>
                  <span style={{ fontSize:13, fontWeight:600, color:text, display:'flex', alignItems:'center', gap:7 }}>
                    <i className="ti ti-tools" style={{ fontSize:15, color:'#0099cc' }}/> {g.trade}
                  </span>
                  <span style={{ fontSize:12, color:textSub }}>Subtotal: <span style={{ fontWeight:600, color:text }}>{fmt(g.subtotal)}</span></span>
                </div>
                <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
                  <div style={{ minWidth:430 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 48px 38px 56px 76px 24px', gap:7, padding:'7px 12px', fontSize:10.5, color:textMuted, textTransform:'uppercase', letterSpacing:'.3px' }}>
                      <span>Description</span><span>Unit</span><span>Qty</span><span>Rate</span><span style={{ textAlign:'right' }}>Total</span><span/>
                    </div>
                    {g.rows.map(({ it, idx }) => {
                      const lt = (Number(it.qty)||0)*(Number(it.rate)||0)
                      return (
                        <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 48px 38px 56px 76px 24px', gap:7, padding:'6px 12px', alignItems:'center', borderTop:`1px solid ${border}` }}>
                          <input list="qlib-list" value={it.desc} onChange={e=>applyDesc(idx, e.target.value, false)} placeholder="Item description" style={{ ...inputStyle, padding:'7px 8px', fontSize:12 }}/>
                          <select value={it.unit} onChange={e=>updateItem(idx,'unit',e.target.value)} style={{ ...inputStyle, padding:'7px 3px', fontSize:10.5 }}>
                            {UNITS.map(u => <option key={u} value={u} style={{ background:inputBg, color:text }}>{u}</option>)}
                          </select>
                          <input type="number" value={it.qty} onChange={e=>updateItem(idx,'qty',e.target.value)} style={{ ...inputStyle, padding:'7px 3px', fontSize:12, textAlign:'center' }}/>
                          <input type="number" value={it.rate} onChange={e=>updateItem(idx,'rate',e.target.value)} style={{ ...inputStyle, padding:'7px 5px', fontSize:12, textAlign:'right' }}/>
                          <span style={{ textAlign:'right', fontSize:12, color:text, alignSelf:'center' }}>{Math.round(lt).toLocaleString('en-AE')}</span>
                          <button onClick={()=>removeItemBoq(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:textMuted, display:'flex', justifyContent:'center', alignItems:'center' }}><i className="ti ti-x" style={{ fontSize:14 }}/></button>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div style={{ padding:'8px 11px', borderTop:`1px solid ${border}` }}>
                  <button onClick={()=>addItemToTrade(g.trade)} style={{ fontSize:12, padding:'5px 11px', border:`1px solid ${border}`, borderRadius:7, background:'none', color:'#0099cc', cursor:'pointer', fontWeight:600 }}>
                    <i className="ti ti-plus" style={{ fontSize:12, verticalAlign:'-2px', marginRight:3 }}/> Add item to {g.trade}
                  </button>
                </div>
              </div>
            ))}
            {boqGroups.length === 0 && (
              <div style={{ background:subBg, border:`1px dashed ${border}`, borderRadius:10, padding:'22px 16px', textAlign:'center', marginBottom:12 }}>
                <i className="ti ti-stack-2" style={{ fontSize:26, color:textMuted }}/>
                <div style={{ fontSize:13.5, color:textSub, marginTop:7, fontWeight:600 }}>{mode === 'advanced' ? 'Start by adding a section' : 'Start by selecting a trade section'}</div>
                <div style={{ fontSize:11.5, color:textMuted, marginTop:3, lineHeight:1.5 }}>{mode === 'advanced' ? 'Type a section name (e.g. Kitchen, Living Room), then add your line items.' : <>Choose a trade below, then add your line items.<br/>Trades come from your Quote Settings &amp; Description Library.</>}</div>
              </div>
            )}
            <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
              {mode === 'advanced' ? (
                <input value={addTradePick} onChange={e=>setAddTradePick(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addTradeSection() } }}
                  placeholder={boqGroups.length === 0 ? 'Section name (e.g. Kitchen)...' : '+ Add a section (e.g. Bedroom)...'}
                  style={{ ...inputStyle, width:'auto', flex:'0 1 auto', minWidth:200, maxWidth:300 }}/>
              ) : (
                <select value={addTradePick} onChange={e=>setAddTradePick(e.target.value)} style={{ ...inputStyle, width:'auto', flex:'0 1 auto', minWidth:200, maxWidth:300 }}>
                  <option value="">{boqGroups.length === 0 ? 'Select a trade section...' : '+ Add a trade section...'}</option>
                  {availableTrades.map(t => <option key={t} value={t} style={{ background:inputBg, color:text }}>{t}</option>)}
                </select>
              )}
              <button onClick={addTradeSection} disabled={!addTradePick} style={{ padding:'0 16px', borderRadius:8, border:`1px solid ${border}`, background:cardBg, color: addTradePick?'#0099cc':textMuted, fontSize:13, fontWeight:600, cursor: addTradePick?'pointer':'default', whiteSpace:'nowrap' }}>
                <i className="ti ti-plus" style={{ fontSize:13, verticalAlign:'-2px', marginRight:3 }}/> Add
              </button>
            </div>
          </>
        )}

        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:14 }}>
          <div style={{ flex:1, minWidth:230, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, padding:'11px 13px' }}>
              <div style={{ fontSize:12, fontWeight:600, color:textSub, marginBottom:8 }}>Discount</div>
              <div style={{ display:'flex', gap:6, marginBottom: discountType?8:0 }}>
                {[['None',null],['%','percent'],['AED','flat']].map(([lbl,val]) => (
                  <button key={lbl} onClick={()=>{ setDiscountType(val); if(!val) setDiscountValue(0) }}
                    style={{ flex:1, fontSize:12, padding:'6px 0', borderRadius:7, cursor:'pointer', fontWeight: discountType===val?600:400,
                      border:`1px solid ${discountType===val?'#0099cc':border}`, background: discountType===val?(isDark?'rgba(3,193,245,0.12)':'#e0f9ff'):'transparent', color: discountType===val?'#0099cc':textSub }}>{lbl}</button>
                ))}
              </div>
              {discountType && <input type="number" value={discountValue} onChange={e=>setDiscountValue(e.target.value)} placeholder={discountType==='percent'?'Discount %':'Discount AED'} style={inputStyle}/>}
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:textSub, cursor:'pointer' }}>
              <input type="checkbox" checked={vatEnabled} onChange={e=>setVatEnabled(e.target.checked)} style={{ width:'auto' }}/>
              Apply 5% VAT {tpl?.trn_number?'(TRN set)':''}
            </label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes for client..." style={{ ...inputStyle, minHeight:54, resize:'vertical' }}/>
          </div>

          <div style={{ flex:1, minWidth:210, background:cardBg, border:`1px solid ${border}`, borderRadius:10, padding:'13px 15px', alignSelf:'flex-start' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:textSub, padding:'4px 0' }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            {discountAmount>0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#0f6e56', padding:'4px 0' }}><span>Discount{discountType==='percent'?` (${discountValue}%)`:''}</span><span>− {fmt(discountAmount)}</span></div>}
            {vatEnabled && <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:textSub, padding:'4px 0' }}><span>VAT 5%</span><span>{fmt(vatAmount)}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:700, color:text, padding:'7px 0 2px', borderTop:`1px solid ${border}`, marginTop:4 }}><span>Total</span><span>{fmt(grandTotal)}</span></div>
          </div>
        </div>

        <div style={{ borderTop:`1px dashed ${border}`, paddingTop:13, marginBottom:14 }}>
          <div style={{ fontSize:11, color:textMuted, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:8 }}>Document options</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <label style={{ display:'flex', alignItems:'center', gap:10, background:cardBg, border:`1px solid ${showFooter?'#0099cc':border}`, borderRadius:8, padding:'9px 12px', cursor:'pointer' }}>
              <input type="checkbox" checked={showFooter} onChange={e=>setShowFooter(e.target.checked)} style={{ width:'auto' }}/>
              <i className="ti ti-align-left" style={{ fontSize:15, color:textSub }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:text }}>Footer note</div>
                <div style={{ fontSize:11, color:textMuted }}>Terms, payment{canPremium?' & why-choose-us':''} on the PDF</div>
              </div>
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:10, background:cardBg, border:`1px solid ${showSignature?'#0099cc':border}`, borderRadius:8, padding:'9px 12px', cursor:'pointer' }}>
              <input type="checkbox" checked={showSignature} onChange={e=>setShowSignature(e.target.checked)} style={{ width:'auto' }}/>
              <i className="ti ti-writing-sign" style={{ fontSize:15, color:textSub }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:text }}>Signature &amp; stamp</div>
                <div style={{ fontSize:11, color:textMuted }}>{canPremium?'Dual-party signature block':'Authorized signature block'} on the PDF</div>
              </div>
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:10, background:cardBg, border:`1px solid ${showBank?'#0099cc':border}`, borderRadius:8, padding:'9px 12px', cursor:'pointer' }}>
              <input type="checkbox" checked={showBank} onChange={e=>setShowBank(e.target.checked)} style={{ width:'auto' }}/>
              <i className="ti ti-building-bank" style={{ fontSize:15, color:textSub }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:text }}>Bank account details</div>
                <div style={{ fontSize:11, color:textMuted }}>{hasBank ? 'Account name, number & IBAN on the PDF' : 'Add bank details in Quote Settings first'}</div>
              </div>
            </label>
          </div>
        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={()=>{ if(!editId){clearDraft(); setDraftExists(false)} setView('list') }} disabled={saving} style={{ flex:1, minWidth:90, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:'transparent', color:textSub, fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={openBuilderPreview} disabled={saving} style={{ flex:1, minWidth:90, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-eye" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Preview</button>
          <button onClick={()=>saveQuote(false)} disabled={saving} style={{ flex:1, minWidth:90, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>{saving?'Saving...':(editId?'Update':'Save draft')}</button>
          <button onClick={()=>saveQuote(true)} disabled={saving} style={{ flex:1, minWidth:90, padding:'11px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-send" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> {saving?'...':'Send'}</button>
        </div>

        <UpgradeLockModal
          open={lockModal}
          featureName="BOQ Mode"
          currentPlan={planName}
          onClose={() => setLockModal(false)}
          onUpgrade={() => { setLockModal(false); window.location.hash = 'plans' }}
        />
      </div>
    )
  }

  // ============ LIST ============
  const STATS = [
    { label:'Total quotes', value: total, color: text },
    { label:'Sent', value: sentCnt, color:'#d97706' },
    { label:'Approved', value: apprCnt, color:'#0f6e56' },
    { label:'Approved value', value: fmtShort(apprVal), color: text },
  ]
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:18, flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontSize:21, fontWeight:700, color:text, margin:0 }}>Quotations</h1>
          <p style={{ fontSize:13, color:textSub, marginTop:3 }}>Create, send &amp; track your quotes · {total} total</p>
        </div>
        <button onClick={openBuilder} style={{ padding:'9px 16px', background:'#0099cc', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
          <i className="ti ti-plus" style={{ fontSize:15 }}/> New Quotation
        </button>
      </div>

      {draftExists && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:isDark?'rgba(232,184,75,0.1)':'#fffbeb', border:`1px solid ${isDark?'rgba(232,184,75,0.25)':'#fcd34d'}`, borderRadius:10, padding:'11px 14px', marginBottom:14 }}>
          <i className="ti ti-device-floppy" style={{ fontSize:18, color:'#d97706' }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, color:text }}>You have an unsaved quotation draft</div>
            <div style={{ fontSize:11, color:textSub }}>Continue where you left off, or discard it.</div>
          </div>
          <button onClick={resumeDraft} style={{ fontSize:12, fontWeight:600, padding:'7px 14px', borderRadius:8, border:'none', background:'#0099cc', color:'#fff', cursor:'pointer' }}>Resume</button>
          <button onClick={discardDraft} style={{ fontSize:12, padding:'7px 12px', borderRadius:8, border:`1px solid ${border}`, background:'transparent', color:textSub, cursor:'pointer' }}>Discard</button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background:subBg, borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:12, color:textSub }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:s.color, marginTop:2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quote, client, UID..."
          style={{ flex:1, minWidth:200, padding:'9px 12px', border:`1px solid ${border}`, borderRadius:9, fontSize:13, background:cardBg, color:text, outline:'none', boxSizing:'border-box' }} />
        <div style={{ display:'inline-flex', background:pillBg, border:`1px solid ${border}`, borderRadius:99, padding:3 }}>
          {FILTERS.map(f => (
            <button key={f} onClick={()=>setFilter(f)} style={{ fontSize:12, fontWeight: filter===f?600:400, padding:'5px 13px', borderRadius:99, border:'none', cursor:'pointer', background: filter===f?(isDark?'rgba(3,193,245,0.15)':'#e0f9ff'):'transparent', color: filter===f?'#0099cc':textMuted, textTransform:'capitalize' }}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:50 }}>
          <div style={{ width:34, height:34, border:'3px solid #0099cc', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <p style={{ color:textMuted, fontSize:13 }}>Loading quotations...</p>
        </div>
      ) : list.length === 0 ? (
        <div style={{ textAlign:'center', padding:'56px 20px', background:cardBg, border:`1px solid ${border}`, borderRadius:14 }}>
          <div style={{ width:56, height:56, borderRadius:14, background:subBg, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}><i className="ti ti-file-invoice" style={{ fontSize:26, color:textMuted }}/></div>
          <h3 style={{ fontSize:16, fontWeight:700, color:text, margin:'0 0 6px' }}>{quotes.length===0?'No quotations yet':'No quotes match your filter'}</h3>
          <p style={{ fontSize:13, color:textSub, margin:'0 0 18px', lineHeight:1.5 }}>{quotes.length===0?'Create your first quotation and send it to a client in minutes.':'Try a different status filter or search term.'}</p>
          {quotes.length===0 && <button onClick={openBuilder} style={{ padding:'10px 18px', background:'#0099cc', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>+ New Quotation</button>}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
          {list.map(q => {
            const st = STATUS_STYLE[q.status||'draft']||STATUS_STYLE.draft
            const md = MODE_STYLE[q.mode||'simple']||MODE_STYLE.simple
            const expired = q.valid_until && (q.status||'draft') !== 'approved' && new Date(q.valid_until) < new Date(new Date().toDateString())
            const iconBtn = (icon, color, onClick, title) => (
              <button title={title} onClick={(e)=>{ e.stopPropagation(); onClick() }}
                style={{ width:30, height:30, borderRadius:7, border:`1px solid ${border}`, background:cardBg, color, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className={`ti ${icon}`} style={{ fontSize:15 }}/>
              </button>
            )
            return (
              <div key={q.id} onClick={()=>openDetail(q)}
                style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer', transition:'all .15s' }}
                onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow=isDark?'0 4px 16px rgba(0,0,0,0.3)':'0 2px 12px rgba(0,0,0,0.06)' }}
                onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ width:42, height:42, borderRadius:10, background:subBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><i className="ti ti-file-text" style={{ fontSize:19, color:textSub }}/></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:text, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    {q.quote_number||'Untitled'}
                    <span style={{ fontSize:11, color:md.color, background:isDark?md.color+'22':md.bg, padding:'1px 8px', borderRadius:99 }}>{md.label}</span>
                    {q.client_uid && <span style={{ fontSize:10, color:textMuted, fontFamily:'monospace' }}>{q.client_uid}</span>}
                  </div>
                  <div style={{ fontSize:12, color:textSub, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {q.client_name||'No client'}{q.project_title?' · '+q.project_title:''}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:text }}>{fmt(q.total||0)}</div>
                  <span style={{ fontSize:11, color:st.color, background:isDark?st.color+'22':st.bg, padding:'2px 9px', borderRadius:99 }}>{st.label}</span>
                  {expired && <span style={{ fontSize:10, color:'#b91c1c', background:isDark?'#b91c1c22':'#fee2e2', padding:'2px 8px', borderRadius:99, marginLeft:5, fontWeight:600 }}>Expired</span>}
                </div>
                <div style={{ display:'flex', gap:5, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
                  {iconBtn('ti-eye', '#0099cc', ()=>openPreview(q), 'View')}
                  {iconBtn('ti-edit', textSub, ()=>editQuote(q), 'Edit')}
                  {iconBtn('ti-copy', textSub, ()=>duplicateQuote(q), 'Duplicate')}
                  {iconBtn('ti-trash', '#dc2626', ()=>{ if(window.confirm('Delete this quotation? This cannot be undone.')) doDelete(q.id) }, 'Delete')}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
