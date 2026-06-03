import { useState, useEffect } from 'react'
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
const UNITS = ['Lump Sum', 'Nos', 'm²', 'm', 'L/s', 'Set', 'Hour', 'Day']
const TRADE_FALLBACK = ['Civil', 'MEP', 'False Ceiling', 'Flooring', 'Painting', 'Joinery', 'Sanitary', 'Misc']
const PLAN_RANK = { free:0, silver:1, gold:2, platinum:3 }

const blankItem  = () => ({ desc:'', unit:'Nos', qty:1, rate:0 })
const blankItemT = (trade) => ({ desc:'', unit:'Nos', qty:1, rate:0, trade: trade || '' })

// Group items by trade, preserving each item's original index for editing.
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
    trade: t,
    rows: groups[t],
    subtotal: groups[t].reduce((s, r) => s + (Number(r.it.qty)||0)*(Number(r.it.rate)||0), 0),
  }))
}
// Read-only grouping (detail/preview/print)
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
    trade: t,
    items: groups[t],
    subtotal: groups[t].reduce((s, it) => s + (Number(it.qty)||0)*(Number(it.rate)||0), 0),
  }))
}

const DEFAULT_TERMS = 'Quotation valid for 7 days. Prices in AED. Work commences after advance payment & design approval. All as per approved drawing and engineer\'s instruction.'
const DEFAULT_PAYMENT = '50% Advance · 40% On 60% completion · 10% On handover'

const DRAFT_KEY = 'td_quote_draft_v1'
const loadDraft  = () => { try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null } catch { return null } }
const saveDraft  = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {} }
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY) } catch {} }

export default function Quotations() {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const planName = company?.plan || 'free'
  const canBoq   = (PLAN_RANK[planName] || 0) >= 2

  const [, forceUpdate] = useState(0)
  const [view, setView]       = useState('list')   // list | builder | detail | preview
  const [quotes, setQuotes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')
  const [draftExists, setDraftExists] = useState(false)

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
  const [addTradePick, setAddTradePick] = useState('')

  const tradeList = (Array.isArray(tpl?.default_trades) && tpl.default_trades.length)
    ? tpl.default_trades : TRADE_FALLBACK

  useEffect(() => {
    if (company?.id) { fetchQuotes(); fetchTemplate() }
    setDraftExists(!!loadDraft())
    const observer = new MutationObserver(() => forceUpdate(n => n + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [company?.id])

  // Auto-save builder data to browser (only for NEW quote, not edit)
  useEffect(() => {
    if (view !== 'builder' || editId) return
    const hasContent = client || projectTitle.trim() || items.some(it => it.desc.trim())
    if (!hasContent) return
    const t = setTimeout(() => {
      saveDraft({ mode, client, clientSearch, projectTitle, items, vatEnabled, discountType, discountValue, notes, showFooter, showSignature })
      setDraftExists(true)
    }, 500)
    return () => clearTimeout(t)
  }, [view, editId, mode, client, projectTitle, items, vatEnabled, discountType, discountValue, notes, showFooter, showSignature])

  async function fetchQuotes() {
    setLoading(true)
    const { data: qs } = await supabase.from('quotations').select('*')
      .eq('company_id', company.id).order('created_at', { ascending: false })
    setQuotes(qs || []); setLoading(false)
  }
  async function fetchTemplate() {
    const { data } = await supabase.from('quotation_templates').select('*')
      .eq('company_id', company.id).maybeSingle()
    setTpl(data || null)
  }

  async function searchClients(q) {
    setClientSearch(q); setClient(null)
    if (!q.trim()) { setSuggestions([]); setShowSug(false); return }
    const term = q.trim()
    const { data } = await supabase.from('clients').select('*')
      .or(`name.ilike.%${term}%,phone.ilike.%${term}%,uid.ilike.%${term}%`)
      .order('name').limit(8)
    setSuggestions(data || []); setShowSug(true)
  }
  function pickClient(c) { setClient(c); setClientSearch(c.name); setShowSug(false) }

  function openDetail(q) { setActiveQuote(q); setView('detail') }
  function openPreview(q) { setActiveQuote(q); setView('preview') }

  async function changeStatus(newStatus) {
    if (!activeQuote || newStatus === activeQuote.status) return
    setStatusBusy(true)
    const { error } = await supabase.from('quotations').update({ status: newStatus }).eq('id', activeQuote.id)
    if (error) { toast.error('Status update failed'); setStatusBusy(false); return }
    const updated = { ...activeQuote, status: newStatus }
    setActiveQuote(updated)
    setQuotes(prev => prev.map(x => x.id === updated.id ? updated : x))
    setStatusBusy(false)
    toast.success('Status updated')
  }

  async function doDelete(id) {
    const { error } = await supabase.from('quotations').delete().eq('id', id)
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
    setEditId(null)
    setMode('simple')
    setClient(null); setClientSearch(''); setSuggestions([]); setShowSug(false)
    setProjectTitle(''); setItems([blankItem()]); setNotes('')
    setVatEnabled(tpl?.default_vat_enabled ?? true)
    setDiscountType(null); setDiscountValue(0)
    setShowFooter(true); setShowSignature(true)
    setAddTradePick('')
    setView('builder')
  }
  function resumeDraft() {
    const d = loadDraft()
    if (!d) { setDraftExists(false); return }
    setEditId(null)
    setMode(d.mode === 'boq' && canBoq ? 'boq' : 'simple')
    setClient(d.client || null)
    setClientSearch(d.clientSearch || '')
    setSuggestions([]); setShowSug(false)
    setProjectTitle(d.projectTitle || '')
    setItems(Array.isArray(d.items) && d.items.length ? d.items : [blankItem()])
    setVatEnabled(d.vatEnabled ?? true)
    setDiscountType(d.discountType ?? null)
    setDiscountValue(d.discountValue ?? 0)
    setNotes(d.notes || '')
    setShowFooter(d.showFooter ?? true)
    setShowSignature(d.showSignature ?? true)
    setAddTradePick('')
    setView('builder')
  }
  function discardDraft() { clearDraft(); setDraftExists(false); toast.info('Draft discarded') }

  function editQuote(q) {
    setEditId(q.id)
    setMode(q.mode === 'boq' && canBoq ? 'boq' : (q.mode || 'simple'))
    setClient(q.client_id ? { id:q.client_id, uid:q.client_uid, name:q.client_name, phone:q.client_phone, email:q.client_email } : null)
    setClientSearch(q.client_name || '')
    setSuggestions([]); setShowSug(false)
    setProjectTitle(q.project_title || '')
    setItems(Array.isArray(q.items) && q.items.length
      ? q.items.map(it => ({ desc:it.desc||'', unit:it.unit||'Nos', qty:it.qty??1, rate:it.rate??0, trade: it.trade || '' }))
      : [blankItem()])
    setNotes('')
    setVatEnabled(!!q.vat_amount || (tpl?.default_vat_enabled ?? true))
    setDiscountType(null); setDiscountValue(0)
    setShowFooter(q.show_footer ?? true)
    setShowSignature(q.show_signature ?? true)
    setAddTradePick('')
    setView('builder')
  }

  // ---- mode switch (plan gated) ----
  function switchMode(m) {
    if (m === mode) return
    if (m === 'boq' && !canBoq) { setLockModal(true); return }
    if (m === 'boq') {
      const def = tradeList[0] || 'Misc'
      setItems(prev => prev.map(it => it.trade ? it : { ...it, trade: def }))
    }
    setMode(m)
  }

  function updateItem(idx, field, val) { setItems(prev => prev.map((it,i)=> i===idx?{...it,[field]:val}:it)) }
  function addItem() { setItems(prev => [...prev, blankItem()]) }
  function removeItem(idx) { setItems(prev => prev.length===1?prev:prev.filter((_,i)=>i!==idx)) }

  // ---- BOQ helpers ----
  function addItemToTrade(trade) { setItems(prev => [...prev, blankItemT(trade)]) }
  function removeItemBoq(idx) { setItems(prev => prev.filter((_,i)=>i!==idx)) }
  function addTradeSection() {
    const t = addTradePick
    if (!t) return
    addItemToTrade(t)
    setAddTradePick('')
  }

  const subtotal = items.reduce((s,it)=> s + (Number(it.qty)||0)*(Number(it.rate)||0), 0)
  const discountAmount = discountType==='percent' ? Math.round(subtotal*(Number(discountValue)||0)/100)
    : discountType==='flat' ? (Number(discountValue)||0) : 0
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const vatAmount = vatEnabled ? Math.round(afterDiscount*0.05) : 0
  const grandTotal = afterDiscount + vatAmount
  const fmt = n => 'AED ' + Math.round(n).toLocaleString('en-AE')

  async function saveQuote(sendNow) {
    if (!client) { toast.error('Select a client first'); return }
    const validItems = items.filter(it => it.desc.trim())
    if (validItems.length === 0) { toast.error('Add at least one line item'); return }
    setSaving(true)
    try {
      const payload = {
        client_id: client.id, client_uid: client.uid, source_uid: client.uid,
        client_name: client.name, client_phone: client.phone || null, client_email: client.email || null,
        project_title: projectTitle.trim() || null, mode,
        items: validItems.map(it => ({
          desc:it.desc.trim(), unit:it.unit||'Nos', qty:Number(it.qty)||0, rate:Number(it.rate)||0,
          ...(mode === 'boq' ? { trade: it.trade || 'Misc' } : {}),
        })),
        subtotal, vat_amount: vatAmount, total: grandTotal,
        payment_terms: tpl?.payment_schedule || null, why_choose_us: tpl?.why_choose_us || null,
        show_footer: showFooter, show_signature: showSignature,
        status: sendNow ? 'sent' : 'draft',
      }
      if (editId) {
        const { error } = await supabase.from('quotations').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Quotation updated ✓')
      } else {
        const { data: seq, error: seqErr } = await supabase.rpc('fn_next_quote_seq', { p_company_id: company.id })
        if (seqErr) throw seqErr
        const prefix = tpl?.quote_prefix || 'QTN'
        payload.company_id = company.id
        payload.quote_number = `${prefix}-${String(seq).padStart(3,'0')}`
        const { error } = await supabase.from('quotations').insert(payload)
        if (error) throw error
        toast.success(sendNow ? 'Quotation sent ✓' : 'Draft saved ✓')
      }
      clearDraft(); setDraftExists(false)
      setView('list'); fetchQuotes()
    } catch (e) {
      toast.error('Save failed: ' + (e.message || 'unknown'))
    } finally { setSaving(false) }
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
  const inputStyle = { padding:'9px 11px', border:`1px solid ${border}`, borderRadius:8, fontSize:13, background:inputBg, color:text, outline:'none', width:'100%' }
  const initials = nm => nm ? nm.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '?'

  // ---------- PRINT ----------
  function printQuote(q) {
    const cName = company?.name || 'Company'
    const cPhone = company?.phone || ''
    const cLogo = company?.logo_url || ''
    const trn = tpl?.trn_number || ''
    const terms = tpl?.default_terms || DEFAULT_TERMS
    const payment = (Array.isArray(tpl?.payment_schedule) ? tpl.payment_schedule.map(p=>p.label?`${p.percent}% ${p.label}`:p).join(' · ') : tpl?.payment_schedule) || DEFAULT_PAYMENT
    const wantFooter = q.show_footer ?? true
    const wantSign = q.show_signature ?? true
    const qItems = Array.isArray(q.items) ? q.items : []
    const isBoq = (q.mode === 'boq')

    let bodyRows = ''
    if (isBoq) {
      const groups = groupByTrade(qItems, tradeList)
      bodyRows = groups.map(g => {
        const rows = g.items.map((it,i)=>`<tr>
          <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;color:#6b6b6b;">${i+1}</td>
          <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;">${it.desc||''}</td>
          <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;text-align:center;color:#6b6b6b;">${it.unit||''}</td>
          <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;text-align:center;color:#6b6b6b;">${it.qty||0}</td>
          <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;text-align:right;color:#6b6b6b;">${Number(it.rate||0).toLocaleString('en-AE')}</td>
          <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;text-align:right;">${Math.round((Number(it.qty)||0)*(Number(it.rate)||0)).toLocaleString('en-AE')}</td>
        </tr>`).join('')
        return `<tr><td colspan="6" style="background:#1a1a1a;color:#fff;font-size:10px;font-weight:700;padding:6px 8px;text-transform:uppercase;letter-spacing:.5px;">${g.trade}</td></tr>
          ${rows}
          <tr><td colspan="5" style="padding:6px 8px;font-size:10.5px;font-weight:700;text-align:right;background:#faf8f3;">${g.trade} Subtotal</td><td style="padding:6px 8px;font-size:10.5px;font-weight:700;text-align:right;background:#faf8f3;color:#c9952a;">AED ${Math.round(g.subtotal).toLocaleString('en-AE')}</td></tr>`
      }).join('')
    } else {
      bodyRows = qItems.map((it,i)=>`<tr>
        <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;color:#6b6b6b;">${i+1}</td>
        <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;">${it.desc||''}</td>
        <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;text-align:center;color:#6b6b6b;">${it.unit||''}</td>
        <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;text-align:center;color:#6b6b6b;">${it.qty||0}</td>
        <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;text-align:right;color:#6b6b6b;">${Number(it.rate||0).toLocaleString('en-AE')}</td>
        <td style="padding:8px;border-bottom:0.5px solid #e5e5e5;font-size:11px;text-align:right;">${Math.round((Number(it.qty)||0)*(Number(it.rate)||0)).toLocaleString('en-AE')}</td>
      </tr>`).join('')
    }

    const footerHtml = wantFooter ? `<div style="background:#faf8f3;border-radius:5px;padding:11px 13px;margin-bottom:14px;">
        <div style="font-size:9px;color:#c9952a;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:5px;">Payment Schedule</div>
        <div style="font-size:10.5px;color:#555;">${payment}</div>
        <div style="font-size:9px;color:#c9952a;text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin:9px 0 5px;">Terms</div>
        <div style="font-size:10px;color:#777;line-height:1.6;">${terms}</div>
      </div>` : ''
    const signHtml = wantSign ? `<div style="text-align:center;"><div style="width:120px;border-bottom:1px solid #1a1a1a;margin-bottom:4px;height:30px;"></div><div style="font-size:9.5px;color:#6b6b6b;">Authorized Signature &amp; Stamp</div></div>` : '<div></div>'

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${q.quote_number}</title></head>
    <body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:720px;margin:0 auto;padding:30px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c9952a;padding-bottom:14px;margin-bottom:16px;">
        <div style="display:flex;gap:11px;align-items:center;">
          ${cLogo?`<img src="${cLogo}" style="width:46px;height:46px;border-radius:9px;object-fit:cover;">`:`<div style="width:46px;height:46px;border-radius:9px;background:#c9952a;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#fff;">${cName[0]||'C'}</div>`}
          <div>
            <div style="font-size:15px;font-weight:700;">${cName}</div>
            ${tpl?.tagline?`<div style="font-size:10px;color:#6b6b6b;">${tpl.tagline}</div>`:`<div style="font-size:10px;color:#6b6b6b;">Dubai, UAE</div>`}
            <div style="font-size:10px;color:#6b6b6b;">${cPhone}${trn?' · TRN '+trn:''}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:17px;font-weight:700;color:#c9952a;">QUOTATION</div>
          <div style="font-size:10px;color:#6b6b6b;margin-top:3px;font-family:monospace;">Ref: ${q.quote_number}</div>
          ${q.client_uid?`<div style="font-size:10px;color:#6b6b6b;font-family:monospace;">UID: ${q.client_uid}</div>`:''}
          <div style="font-size:10px;color:#6b6b6b;">Date: ${new Date(q.created_at||Date.now()).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
        <div>
          <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Bill To</div>
          <div style="font-size:12px;font-weight:700;">${q.client_name||''}</div>
          <div style="font-size:11px;color:#6b6b6b;">${q.client_phone||''}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Project</div>
          <div style="font-size:12px;font-weight:700;">${q.project_title||'—'}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
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
          <div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:#6b6b6b;"><span>Subtotal</span><span>AED ${Number(q.subtotal||0).toLocaleString('en-AE')}</span></div>
          ${q.vat_amount>0?`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:#6b6b6b;"><span>VAT 5%</span><span>AED ${Number(q.vat_amount).toLocaleString('en-AE')}</span></div>`:''}
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:6px 0 0;border-top:1.5px solid #1a1a1a;margin-top:4px;"><span>Grand Total</span><span style="color:#c9952a;">AED ${Number(q.total||0).toLocaleString('en-AE')}</span></div>
        </div>
      </div>
      ${footerHtml}
      <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:14px;">
        <div style="font-size:9.5px;color:#999;">Thank you for choosing ${cName}.</div>
        ${signHtml}
      </div>
    </body></html>`

    const w = window.open('', '_blank')
    if (!w) { toast.error('Allow pop-ups to print/preview'); return }
    w.document.write(html); w.document.close()
    setTimeout(()=>{ w.focus(); w.print() }, 400)
  }

  function whatsappQuote(q) {
    const phone = (q.client_phone||'').replace(/[^0-9]/g,'')
    const msg = `Dear ${q.client_name||'Client'},\n\nPlease find your quotation ${q.quote_number} from ${company?.name||''}.\nProject: ${q.project_title||'—'}\nTotal: AED ${Number(q.total||0).toLocaleString('en-AE')}\n\nThank you.`
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank')
  }

  // ============ PREVIEW ============
  if (view === 'preview' && activeQuote) {
    const q = activeQuote
    const cName = company?.name || 'Company'
    const cLogo = company?.logo_url || ''
    const trn = tpl?.trn_number || ''
    const terms = tpl?.default_terms || DEFAULT_TERMS
    const payment = (Array.isArray(tpl?.payment_schedule) ? tpl.payment_schedule.map(p=>p.label?`${p.percent}% ${p.label}`:p).join(' · ') : tpl?.payment_schedule) || DEFAULT_PAYMENT
    const wantFooter = q.show_footer ?? true
    const wantSign = q.show_signature ?? true
    const qItems = Array.isArray(q.items) ? q.items : []
    const isBoq = (q.mode === 'boq')
    const groups = isBoq ? groupByTrade(qItems, tradeList) : null
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <button onClick={() => setView('detail')} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
          </button>
          <div style={{ flex:1 }}><h1 style={{ fontSize:18, fontWeight:700, color:text, margin:0 }}>Preview · {q.quote_number}</h1></div>
        </div>

        <div style={{ background:'#fff', borderRadius:8, padding:'26px 28px', maxWidth:620, margin:'0 auto', boxShadow:'0 2px 12px rgba(0,0,0,0.1)', color:'#1a1a1a' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'2px solid #c9952a', paddingBottom:14, marginBottom:16 }}>
            <div style={{ display:'flex', gap:11, alignItems:'center' }}>
              {cLogo ? <img src={cLogo} style={{ width:46, height:46, borderRadius:9, objectFit:'cover' }}/> : <div style={{ width:46, height:46, borderRadius:9, background:'#c9952a', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:18, color:'#fff' }}>{cName[0]||'C'}</div>}
              <div>
                <div style={{ fontSize:15, fontWeight:700 }}>{cName}</div>
                <div style={{ fontSize:10, color:'#6b6b6b' }}>{tpl?.tagline || 'Dubai, UAE'}</div>
                <div style={{ fontSize:10, color:'#6b6b6b' }}>{company?.phone||''}{trn?' · TRN '+trn:''}</div>
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:17, fontWeight:700, color:'#c9952a' }}>QUOTATION</div>
              <div style={{ fontSize:10, color:'#6b6b6b', marginTop:3, fontFamily:'monospace' }}>Ref: {q.quote_number}</div>
              {q.client_uid && <div style={{ fontSize:10, color:'#6b6b6b', fontFamily:'monospace' }}>UID: {q.client_uid}</div>}
              <div style={{ fontSize:10, color:'#6b6b6b' }}>Date: {new Date(q.created_at||Date.now()).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
            <div><div style={{ fontSize:9, color:'#999', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:3 }}>Bill To</div>
              <div style={{ fontSize:12, fontWeight:700 }}>{q.client_name}</div>
              <div style={{ fontSize:11, color:'#6b6b6b' }}>{q.client_phone||''}</div></div>
            <div style={{ textAlign:'right' }}><div style={{ fontSize:9, color:'#999', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:3 }}>Project</div>
              <div style={{ fontSize:12, fontWeight:700 }}>{q.project_title||'—'}</div></div>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:14 }}>
            <thead><tr style={{ background:'#1a1a1a', color:'#fff' }}>
              <th style={{ padding:'7px 8px', textAlign:'left', fontSize:10 }}>#</th>
              <th style={{ padding:'7px 8px', textAlign:'left', fontSize:10 }}>Description</th>
              <th style={{ padding:'7px 8px', textAlign:'center', fontSize:10 }}>Unit</th>
              <th style={{ padding:'7px 8px', textAlign:'center', fontSize:10 }}>Qty</th>
              <th style={{ padding:'7px 8px', textAlign:'right', fontSize:10 }}>Rate</th>
              <th style={{ padding:'7px 8px', textAlign:'right', fontSize:10 }}>Total</th>
            </tr></thead>
            <tbody>
              {isBoq ? groups.map((g, gi) => (
                <>
                  <tr key={'h'+gi}><td colSpan={6} style={{ background:'#1a1a1a', color:'#fff', fontSize:10, fontWeight:700, padding:'6px 8px', textTransform:'uppercase', letterSpacing:'.5px' }}>{g.trade}</td></tr>
                  {g.items.map((it,i)=>(
                    <tr key={gi+'-'+i}>
                      <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11, color:'#6b6b6b' }}>{i+1}</td>
                      <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11 }}>{it.desc}</td>
                      <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11, textAlign:'center', color:'#6b6b6b' }}>{it.unit||''}</td>
                      <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11, textAlign:'center', color:'#6b6b6b' }}>{it.qty}</td>
                      <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11, textAlign:'right', color:'#6b6b6b' }}>{Number(it.rate||0).toLocaleString('en-AE')}</td>
                      <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11, textAlign:'right' }}>{Math.round((Number(it.qty)||0)*(Number(it.rate)||0)).toLocaleString('en-AE')}</td>
                    </tr>
                  ))}
                  <tr key={'s'+gi}><td colSpan={5} style={{ padding:'6px 8px', fontSize:10.5, fontWeight:700, textAlign:'right', background:'#faf8f3' }}>{g.trade} Subtotal</td><td style={{ padding:'6px 8px', fontSize:10.5, fontWeight:700, textAlign:'right', background:'#faf8f3', color:'#c9952a' }}>AED {Math.round(g.subtotal).toLocaleString('en-AE')}</td></tr>
                </>
              )) : qItems.map((it,i)=>(
                <tr key={i}>
                  <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11, color:'#6b6b6b' }}>{i+1}</td>
                  <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11 }}>{it.desc}</td>
                  <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11, textAlign:'center', color:'#6b6b6b' }}>{it.unit||''}</td>
                  <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11, textAlign:'center', color:'#6b6b6b' }}>{it.qty}</td>
                  <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11, textAlign:'right', color:'#6b6b6b' }}>{Number(it.rate||0).toLocaleString('en-AE')}</td>
                  <td style={{ padding:8, borderBottom:'0.5px solid #e5e5e5', fontSize:11, textAlign:'right' }}>{Math.round((Number(it.qty)||0)*(Number(it.rate)||0)).toLocaleString('en-AE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
            <div style={{ width:240 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'3px 0', color:'#6b6b6b' }}><span>Subtotal</span><span>AED {Number(q.subtotal||0).toLocaleString('en-AE')}</span></div>
              {q.vat_amount>0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'3px 0', color:'#6b6b6b' }}><span>VAT 5%</span><span>AED {Number(q.vat_amount).toLocaleString('en-AE')}</span></div>}
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, padding:'6px 0 0', borderTop:'1.5px solid #1a1a1a', marginTop:4 }}><span>Grand Total</span><span style={{ color:'#c9952a' }}>AED {Number(q.total||0).toLocaleString('en-AE')}</span></div>
            </div>
          </div>
          {wantFooter && (
            <div style={{ background:'#faf8f3', borderRadius:5, padding:'11px 13px', marginBottom:14 }}>
              <div style={{ fontSize:9, color:'#c9952a', textTransform:'uppercase', letterSpacing:'.5px', fontWeight:700, marginBottom:5 }}>Payment Schedule</div>
              <div style={{ fontSize:10.5, color:'#555' }}>{payment}</div>
              <div style={{ fontSize:9, color:'#c9952a', textTransform:'uppercase', letterSpacing:'.5px', fontWeight:700, margin:'9px 0 5px' }}>Terms</div>
              <div style={{ fontSize:10, color:'#777', lineHeight:1.6 }}>{terms}</div>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', paddingTop:14 }}>
            <div style={{ fontSize:9.5, color:'#999' }}>Thank you for choosing {cName}.</div>
            {wantSign && <div style={{ textAlign:'center' }}><div style={{ width:120, borderBottom:'1px solid #1a1a1a', marginBottom:4, height:30 }}/><div style={{ fontSize:9.5, color:'#6b6b6b' }}>Authorized Signature &amp; Stamp</div></div>}
          </div>
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:16, flexWrap:'wrap' }}>
          <button onClick={()=>printQuote(q)} style={{ padding:'10px 18px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-printer" style={{ fontSize:14, verticalAlign:'-2px', marginRight:5 }}/> Print / PDF</button>
          <button onClick={()=>whatsappQuote(q)} style={{ padding:'10px 18px', borderRadius:9, border:'none', background:'#22c55e', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-brand-whatsapp" style={{ fontSize:14, verticalAlign:'-2px', marginRight:5 }}/> Send via WhatsApp</button>
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
    const isBoq = (q.mode === 'boq')
    const groups = isBoq ? groupByTrade(qItems, tradeList) : null
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
          <div style={{ flex:1 }}>
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
            {g.items.map((it,i)=>(
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 70px 44px 70px 80px', gap:8, padding:'9px 13px', borderTop:`1px solid ${border}`, fontSize:13, color:text }}>
                <span>{it.desc}</span><span style={{ color:textSub, fontSize:12 }}>{it.unit||'—'}</span><span style={{ color:textSub }}>{it.qty}</span>
                <span style={{ color:textSub }}>{Number(it.rate).toLocaleString('en-AE')}</span>
                <span style={{ textAlign:'right' }}>{Math.round((Number(it.qty)||0)*(Number(it.rate)||0)).toLocaleString('en-AE')}</span>
              </div>
            ))}
          </div>
        )) : (
          <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 44px 70px 80px', gap:8, padding:'9px 13px', background:subBg, fontSize:11, color:textSub, textTransform:'uppercase', letterSpacing:'.3px' }}>
              <span>Description</span><span>Unit</span><span>Qty</span><span>Rate</span><span style={{ textAlign:'right' }}>Total</span>
            </div>
            {qItems.map((it, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 70px 44px 70px 80px', gap:8, padding:'9px 13px', borderTop:`1px solid ${border}`, fontSize:13, color:text }}>
                <span>{it.desc}</span><span style={{ color:textSub, fontSize:12 }}>{it.unit||'—'}</span><span style={{ color:textSub }}>{it.qty}</span>
                <span style={{ color:textSub }}>{Number(it.rate).toLocaleString('en-AE')}</span>
                <span style={{ textAlign:'right' }}>{Math.round((Number(it.qty)||0)*(Number(it.rate)||0)).toLocaleString('en-AE')}</span>
              </div>
            ))}
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

        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
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
      </div>
    )
  }

  // ============ BUILDER ============
  if (view === 'builder') {
    const md = MODE_STYLE[mode] || MODE_STYLE.simple
    const boqGroups = mode === 'boq' ? groupByTradeIdx(items, tradeList) : null
    const availableTrades = tradeList.filter(t => !(boqGroups||[]).some(g => g.trade === t))
    return (
      <div>
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

        {/* Mode switcher */}
        <div style={{ display:'inline-flex', background:pillBg, border:`1px solid ${border}`, borderRadius:10, padding:3, marginBottom:16 }}>
          <button onClick={()=>switchMode('simple')}
            style={{ fontSize:13, fontWeight: mode==='simple'?600:400, padding:'6px 16px', borderRadius:7, border:'none', cursor:'pointer',
              background: mode==='simple'?(isDark?'rgba(3,193,245,0.15)':'#e0f9ff'):'transparent', color: mode==='simple'?'#0099cc':textSub }}>Simple</button>
          <button onClick={()=>switchMode('boq')}
            style={{ fontSize:13, fontWeight: mode==='boq'?600:400, padding:'6px 16px', borderRadius:7, border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:5,
              background: mode==='boq'?(isDark?'rgba(3,193,245,0.15)':'#e0f9ff'):'transparent', color: mode==='boq'?'#0099cc':(canBoq?textSub:textMuted) }}>
            BOQ {!canBoq && <i className="ti ti-lock" style={{ fontSize:12 }}/>}
          </button>
        </div>

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
                  placeholder="Type client name, phone or UID..." style={{ ...inputStyle, paddingLeft:34 }} />
                <i className="ti ti-search" style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:15, color:textMuted }}/>
              </div>
              {showSug && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:4, background:cardBg, border:`1px solid ${border}`, borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:20, overflow:'hidden', maxHeight:280, overflowY:'auto' }}>
                  {suggestions.length > 0 ? suggestions.map((c,i) => (
                    <div key={c.id} onClick={()=>pickClient(c)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', cursor:'pointer', borderTop: i>0?`1px solid ${border}`:'none' }}
                      onMouseEnter={e=>e.currentTarget.style.background=subBg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{ width:30, height:30, borderRadius:7, background:subBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:textSub }}>{initials(c.name)}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:text }}>{c.name}</div>
                        <div style={{ fontSize:11, color:textSub }}>{c.phone||'—'}</div>
                      </div>
                      <span style={{ fontSize:10, color:textMuted, fontFamily:'monospace' }}>{c.uid}</span>
                    </div>
                  )) : (
                    <div style={{ padding:'14px 12px', textAlign:'center' }}>
                      <div style={{ fontSize:12, color:textSub, marginBottom:4 }}>No client found</div>
                      <div style={{ fontSize:11, color:textMuted }}>Client not listed? Add them in My Leads first, then select here.</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <input value={projectTitle} onChange={e=>setProjectTitle(e.target.value)} placeholder="Project title (e.g. Interior Fit-Out)" style={{ ...inputStyle, marginBottom:14 }}/>

        {/* ITEMS — SIMPLE */}
        {mode === 'simple' && (
          <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 78px 52px 78px 80px 28px', gap:6, padding:'9px 11px', background:subBg, fontSize:11, color:textSub, textTransform:'uppercase', letterSpacing:'.3px' }}>
              <span>Description</span><span>Unit</span><span>Qty</span><span>Rate</span><span style={{ textAlign:'right' }}>Total</span><span/>
            </div>
            {items.map((it, idx) => {
              const lt = (Number(it.qty)||0)*(Number(it.rate)||0)
              return (
                <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 78px 52px 78px 80px 28px', gap:6, padding:'8px 11px', alignItems:'center', borderTop:`1px solid ${border}` }}>
                  <input value={it.desc} onChange={e=>updateItem(idx,'desc',e.target.value)} placeholder="Item description" style={{ ...inputStyle, padding:'7px 8px', fontSize:12.5 }}/>
                  <select value={it.unit} onChange={e=>updateItem(idx,'unit',e.target.value)} style={{ ...inputStyle, padding:'7px 5px', fontSize:11.5 }}>
                    {UNITS.map(u => <option key={u} value={u} style={{ background:inputBg, color:text }}>{u}</option>)}
                  </select>
                  <input type="number" value={it.qty} onChange={e=>updateItem(idx,'qty',e.target.value)} style={{ ...inputStyle, padding:'7px 6px', fontSize:12.5 }}/>
                  <input type="number" value={it.rate} onChange={e=>updateItem(idx,'rate',e.target.value)} style={{ ...inputStyle, padding:'7px 8px', fontSize:12.5 }}/>
                  <span style={{ textAlign:'right', fontSize:12.5, color:text }}>{Math.round(lt).toLocaleString('en-AE')}</span>
                  <button onClick={()=>removeItem(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:textMuted, display:'flex', justifyContent:'center' }}><i className="ti ti-x" style={{ fontSize:15 }}/></button>
                </div>
              )
            })}
            <div style={{ padding:'9px 11px', borderTop:`1px solid ${border}` }}>
              <button onClick={addItem} style={{ fontSize:12, padding:'6px 12px', border:`1px solid ${border}`, borderRadius:7, background:'none', color:'#0099cc', cursor:'pointer', fontWeight:600 }}>
                <i className="ti ti-plus" style={{ fontSize:13, verticalAlign:'-2px', marginRight:3 }}/> Add line item
              </button>
            </div>
          </div>
        )}

        {/* ITEMS — BOQ (trade-grouped) */}
        {mode === 'boq' && (
          <>
            {boqGroups.map((g, gi) => (
              <div key={g.trade} style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 13px', background:subBg }}>
                  <span style={{ fontSize:13, fontWeight:600, color:text, display:'flex', alignItems:'center', gap:7 }}>
                    <i className="ti ti-tools" style={{ fontSize:15, color:'#0099cc' }}/> {g.trade}
                  </span>
                  <span style={{ fontSize:12, color:textSub }}>Subtotal: <span style={{ fontWeight:600, color:text }}>{fmt(g.subtotal)}</span></span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 48px 70px 72px 26px', gap:6, padding:'7px 11px', fontSize:10.5, color:textMuted, textTransform:'uppercase', letterSpacing:'.3px' }}>
                  <span>Description</span><span>Unit</span><span>Qty</span><span>Rate</span><span style={{ textAlign:'right' }}>Total</span><span/>
                </div>
                {g.rows.map(({ it, idx }) => {
                  const lt = (Number(it.qty)||0)*(Number(it.rate)||0)
                  return (
                    <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 70px 48px 70px 72px 26px', gap:6, padding:'6px 11px', alignItems:'center', borderTop:`1px solid ${border}` }}>
                      <input value={it.desc} onChange={e=>updateItem(idx,'desc',e.target.value)} placeholder="Item description" style={{ ...inputStyle, padding:'7px 8px', fontSize:12 }}/>
                      <select value={it.unit} onChange={e=>updateItem(idx,'unit',e.target.value)} style={{ ...inputStyle, padding:'7px 4px', fontSize:11 }}>
                        {UNITS.map(u => <option key={u} value={u} style={{ background:inputBg, color:text }}>{u}</option>)}
                      </select>
                      <input type="number" value={it.qty} onChange={e=>updateItem(idx,'qty',e.target.value)} style={{ ...inputStyle, padding:'7px 4px', fontSize:12 }}/>
                      <input type="number" value={it.rate} onChange={e=>updateItem(idx,'rate',e.target.value)} style={{ ...inputStyle, padding:'7px 6px', fontSize:12 }}/>
                      <span style={{ textAlign:'right', fontSize:12, color:text }}>{Math.round(lt).toLocaleString('en-AE')}</span>
                      <button onClick={()=>removeItemBoq(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:textMuted, display:'flex', justifyContent:'center' }}><i className="ti ti-x" style={{ fontSize:14 }}/></button>
                    </div>
                  )
                })}
                <div style={{ padding:'8px 11px', borderTop:`1px solid ${border}` }}>
                  <button onClick={()=>addItemToTrade(g.trade)} style={{ fontSize:12, padding:'5px 11px', border:`1px solid ${border}`, borderRadius:7, background:'none', color:'#0099cc', cursor:'pointer', fontWeight:600 }}>
                    <i className="ti ti-plus" style={{ fontSize:12, verticalAlign:'-2px', marginRight:3 }}/> Add item to {g.trade}
                  </button>
                </div>
              </div>
            ))}
            <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
              <select value={addTradePick} onChange={e=>setAddTradePick(e.target.value)} style={{ ...inputStyle, flex:1, minWidth:180 }}>
                <option value="">+ Add a trade section...</option>
                {availableTrades.map(t => <option key={t} value={t} style={{ background:inputBg, color:text }}>{t}</option>)}
              </select>
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

        {/* Document options */}
        <div style={{ borderTop:`1px dashed ${border}`, paddingTop:13, marginBottom:14 }}>
          <div style={{ fontSize:11, color:textMuted, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:8 }}>Document options</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <label style={{ display:'flex', alignItems:'center', gap:10, background:cardBg, border:`1px solid ${showFooter?'#0099cc':border}`, borderRadius:8, padding:'9px 12px', cursor:'pointer' }}>
              <input type="checkbox" checked={showFooter} onChange={e=>setShowFooter(e.target.checked)} style={{ width:'auto' }}/>
              <i className="ti ti-align-left" style={{ fontSize:15, color:textSub }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:text }}>Footer note</div>
                <div style={{ fontSize:11, color:textMuted }}>Terms &amp; payment schedule on the PDF</div>
              </div>
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:10, background:cardBg, border:`1px solid ${showSignature?'#0099cc':border}`, borderRadius:8, padding:'9px 12px', cursor:'pointer' }}>
              <input type="checkbox" checked={showSignature} onChange={e=>setShowSignature(e.target.checked)} style={{ width:'auto' }}/>
              <i className="ti ti-writing-sign" style={{ fontSize:15, color:textSub }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:text }}>Signature &amp; stamp</div>
                <div style={{ fontSize:11, color:textMuted }}>Authorized signature block on the PDF</div>
              </div>
            </label>
          </div>
        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={()=>{ if(!editId){clearDraft(); setDraftExists(false)} setView('list') }} disabled={saving} style={{ flex:1, minWidth:100, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:'transparent', color:textSub, fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={()=>saveQuote(false)} disabled={saving} style={{ flex:1, minWidth:100, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>{saving?'Saving...':(editId?'Update':'Save draft')}</button>
          <button onClick={()=>saveQuote(true)} disabled={saving} style={{ flex:1, minWidth:100, padding:'11px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-send" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> {saving?'...':'Send'}</button>
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
          <i className="ti ti-device-floppy" style={{ fontSize:18, color:'#d97706' }}/>
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
          style={{ flex:1, minWidth:200, padding:'9px 12px', border:`1px solid ${border}`, borderRadius:9, fontSize:13, background:cardBg, color:text, outline:'none' }} />
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
                </div>
                <div style={{ display:'flex', gap:5, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
                  {iconBtn('ti-eye', '#0099cc', ()=>openPreview(q), 'View')}
                  {iconBtn('ti-edit', textSub, ()=>editQuote(q), 'Edit')}
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
