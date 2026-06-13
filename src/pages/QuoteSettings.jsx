import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const DEFAULT_TRADES = ['Civil', 'MEP', 'False Ceiling', 'Flooring', 'Painting', 'Joinery', 'Sanitary']
const DEFAULT_WHY = [
  { title: 'Full Turnkey Service',  detail: 'From start to final handover, we manage every trade under one contract — no coordination headaches for the client.' },
  { title: 'Transparent Pricing',   detail: 'Every item priced separately — no hidden costs. All installation works carry a defect liability period.' },
]
const DEFAULT_TERMS = `1. This quotation is valid for 30 days from date of issue.
2. Prices are in AED and subject to 5% VAT.
3. Any variations to the agreed scope will be priced separately via written variation order.
4. Warranty: 1-year defect liability period from project handover date.`

// Per-work-type default payment milestones (each must total 100%). Editable after seeding.
const mkPay = (percent, label, description) => ({ percent, label, description })
const PRESET_PAYMENTS = {
  Interior: [
    mkPay(50, '1st Payment — Advance',  'Upon contract signing before work commences'),
    mkPay(25, '2nd Payment — Progress', 'After demolition & 60% of work completed'),
    mkPay(25, 'Final — Completion',     'After project handover & client sign-off'),
  ],
  Joinery: [
    mkPay(60, '1st Payment — Advance',  'Upon order confirmation (covers material & production)'),
    mkPay(40, 'Final — Before Delivery','Before delivery & installation on site'),
  ],
  Renovation: [
    mkPay(40, '1st Payment — Advance',  'Upon contract signing before work commences'),
    mkPay(30, '2nd Payment — Progress', 'After demolition & 60% of work completed'),
    mkPay(30, 'Final — Completion',     'After project handover & client sign-off'),
  ],
  'Fit-out': [
    mkPay(50, '1st Payment — Advance',  'Upon contract signing before work commences'),
    mkPay(30, '2nd Payment — Progress', 'At 60% project completion'),
    mkPay(20, 'Final — Handover',       'After project handover & client sign-off'),
  ],
}
const SEED_ORDER = ['Interior', 'Joinery', 'Renovation', 'Fit-out']

function cleanWhyArr(arr) {
  return (arr || []).map(w => ({ title: (w.title || '').trim(), detail: (w.detail || '').trim() }))
}
function cleanPayArr(arr) {
  return (arr || []).map(p => ({ percent: Number(p.percent) || 0, label: (p.label || '').trim(), description: (p.description || '').trim() }))
}

// why_choose_us is a TEXT column — we store structured points as a JSON string.
function parseWhy(raw) {
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (Array.isArray(p) && p.length) return p.map(x => ({ title: x.title || '', detail: x.detail || '' }))
  } catch {}
  const lines = String(raw).split('\n').filter(l => l.trim()).map(l => ({ title: l.trim(), detail: '' }))
  return lines.length ? lines : null
}
function parsePayment(raw) {
  if (Array.isArray(raw) && raw.length)
    return raw.map(x => ({ percent: Number(x.percent) || 0, label: x.label || '', description: x.description || '' }))
  return null
}
function parseTrades(raw) {
  if (Array.isArray(raw) && raw.length) return raw.filter(Boolean)
  return [...DEFAULT_TRADES]
}

// Build one preset object for a named work-type.
function makePreset(name, { payment, terms, whyUs, isDefault } = {}) {
  return {
    name,
    isDefault: !!isDefault,
    payment: payment || PRESET_PAYMENTS[name] || PRESET_PAYMENTS.Interior,
    terms: terms != null ? terms : DEFAULT_TERMS,
    whyUs: whyUs || [...DEFAULT_WHY],
  }
}

// Seed the 4 default work-types. Preserve any previously-saved global
// payment/why/terms by folding them into the "Interior" (default) preset.
function seedPresets(oldPay, oldWhy, oldTerms) {
  return SEED_ORDER.map((name, i) => makePreset(name, {
    isDefault: i === 0,
    payment: name === 'Interior' ? (oldPay || undefined) : undefined,
    whyUs:   name === 'Interior' ? (oldWhy || undefined) : undefined,
    terms:   name === 'Interior' ? (oldTerms || undefined) : undefined,
  }))
}

// Parse the work_type_presets column; null if absent/empty so we can seed.
function parsePresets(raw) {
  if (!Array.isArray(raw) || !raw.length) return null
  return raw.map((p, i) => ({
    name: (p.name || `Type ${i + 1}`).trim(),
    isDefault: !!p.isDefault,
    payment: Array.isArray(p.payment) && p.payment.length ? p.payment.map(x => ({ percent: Number(x.percent) || 0, label: x.label || '', description: x.description || '' })) : [...PRESET_PAYMENTS.Interior],
    terms: p.terms != null ? p.terms : DEFAULT_TERMS,
    whyUs: Array.isArray(p.whyUs) ? p.whyUs.map(x => ({ title: x.title || '', detail: x.detail || '' })) : [...DEFAULT_WHY],
  }))
}

export default function QuoteSettings() {
  const { company } = useAuth()
  const toast = useToast()

  const [, forceUpdate] = useState(0)
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  // form state (one piece per column)
  const [legalName, setLegalName]   = useState('')
  const [tagline, setTagline]       = useState('')
  const [trn, setTrn]               = useState('')
  const [phone, setPhone]           = useState('')
  const [email, setEmail]           = useState('')
  const [address, setAddress]       = useState('')
  const [prefix, setPrefix]         = useState('QTN')
  const [nextSeq, setNextSeq]       = useState(1)
  const [vatDefault, setVatDefault] = useState(true)
  const [trades, setTrades]         = useState([...DEFAULT_TRADES])
  const [newTrade, setNewTrade]     = useState('')

  // work-type templates (payment + terms + why-us bundled per type)
  const [presets, setPresets]       = useState([])
  const [activeIdx, setActiveIdx]   = useState(0)
  const [newType, setNewType]       = useState('')

  // bank / payment account
  const [bankName, setBankName]               = useState('')
  const [bankAccName, setBankAccName]         = useState('')
  const [bankAccNumber, setBankAccNumber]     = useState('')
  const [bankIban, setBankIban]               = useState('')
  const [bankSwift, setBankSwift]             = useState('')
  const [bankBranch, setBankBranch]           = useState('')
  const [showBankDefault, setShowBankDefault] = useState(false)

  useEffect(() => {
    if (company?.id) fetchTemplate()
    const observer = new MutationObserver(() => forceUpdate(n => n + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [company?.id])

  async function fetchTemplate() {
    setLoading(true)
    const { data } = await supabase.from('quotation_templates').select('*')
      .eq('company_id', company.id).maybeSingle()
    if (data) {
      setLegalName(data.company_legal_name || company?.name || '')
      setTagline(data.tagline || '')
      setTrn(data.trn_number || '')
      setPhone(data.contact_phone || company?.phone || '')
      setEmail(data.contact_email || '')
      setAddress(data.address || '')
      setPrefix(data.quote_prefix || 'QTN')
      setNextSeq(data.next_quote_seq ?? 1)
      setVatDefault(data.default_vat_enabled ?? true)
      setTrades(parseTrades(data.default_trades))
      // work-type presets: use saved bundle, else seed (folding in old globals)
      const saved = parsePresets(data.work_type_presets)
      setPresets(saved || seedPresets(parsePayment(data.payment_schedule), parseWhy(data.why_choose_us), data.default_terms || null))
      setBankName(data.bank_name || '')
      setBankAccName(data.bank_account_name || '')
      setBankAccNumber(data.bank_account_number || '')
      setBankIban(data.bank_iban || '')
      setBankSwift(data.bank_swift || '')
      setBankBranch(data.bank_branch || '')
      setShowBankDefault(data.default_show_bank ?? false)
    } else {
      // no row yet — sensible defaults pulled from company
      setLegalName(company?.name || '')
      setPhone(company?.phone || '')
      setPresets(seedPresets(null, null, null))
    }
    setActiveIdx(0)
    setLoading(false)
  }

  // ---- trades ----
  function addTrade() {
    const t = newTrade.trim()
    if (!t) return
    if (trades.some(x => x.toLowerCase() === t.toLowerCase())) { toast.info('Trade already added'); return }
    setTrades(prev => [...prev, t]); setNewTrade('')
  }
  function removeTrade(i) { setTrades(prev => prev.filter((_, idx) => idx !== i)) }

  // ---- work-type presets ----
  const active = presets[activeIdx] || null
  function patchActive(patch) {
    setPresets(prev => prev.map((p, idx) => idx === activeIdx ? { ...p, ...patch } : p))
  }
  function addType() {
    const t = newType.trim()
    if (!t) return
    if (presets.some(p => p.name.toLowerCase() === t.toLowerCase())) { toast.info('Work type already exists'); return }
    setPresets(prev => [...prev, makePreset(t, { isDefault: prev.length === 0 })])
    setActiveIdx(presets.length)
    setNewType('')
  }
  function deleteType(i) {
    if (presets.length <= 1) { toast.info('Keep at least one work type'); return }
    setPresets(prev => {
      const next = prev.filter((_, idx) => idx !== i)
      if (!next.some(p => p.isDefault)) next[0] = { ...next[0], isDefault: true }
      return next
    })
    setActiveIdx(idx => Math.max(0, idx >= i ? idx - 1 : idx))
  }
  function makeDefault() {
    setPresets(prev => prev.map((p, idx) => ({ ...p, isDefault: idx === activeIdx })))
  }
  function renameActive(name) { patchActive({ name }) }

  // payment editors (operate on active preset)
  function updatePay(i, field, val) { patchActive({ payment: active.payment.map((p, idx) => idx === i ? { ...p, [field]: val } : p) }) }
  function addPay() { patchActive({ payment: [...active.payment, { percent: 0, label: '', description: '' }] }) }
  function removePay(i) { patchActive({ payment: active.payment.filter((_, idx) => idx !== i) }) }

  // why-us editors (operate on active preset)
  function updateWhy(i, field, val) { patchActive({ whyUs: active.whyUs.map((w, idx) => idx === i ? { ...w, [field]: val } : w) }) }
  function addWhy() { patchActive({ whyUs: [...active.whyUs, { title: '', detail: '' }] }) }
  function removeWhy(i) { patchActive({ whyUs: active.whyUs.filter((_, idx) => idx !== i) }) }

  const payTotal = active ? active.payment.reduce((s, p) => s + (Number(p.percent) || 0), 0) : 0
  const payOk = payTotal === 100

  async function save() {
    // every preset that has milestones must total 100%
    for (const p of presets) {
      const lines = p.payment.filter(x => x.label.trim() || Number(x.percent) > 0)
      const total = lines.reduce((s, x) => s + (Number(x.percent) || 0), 0)
      if (lines.length > 0 && total !== 100) {
        toast.error(`"${p.name}" payment must total 100% (currently ${total}%)`); return
      }
    }
    setSaving(true)
    try {
      // normalise presets, ensure exactly one default
      let cleanPresets = presets.map(p => ({
        name: p.name.trim() || 'Untitled',
        isDefault: !!p.isDefault,
        payment: cleanPayArr(p.payment).filter(x => x.label || x.percent > 0),
        terms: (p.terms || '').trim(),
        whyUs: cleanWhyArr(p.whyUs).filter(w => w.title || w.detail),
      }))
      if (cleanPresets.length && !cleanPresets.some(p => p.isDefault)) {
        cleanPresets = cleanPresets.map((p, i) => ({ ...p, isDefault: i === 0 }))
      }
      const def = cleanPresets.find(p => p.isDefault) || cleanPresets[0] || null

      const payload = {
        company_id: company.id,
        company_legal_name: legalName.trim() || null,
        tagline: tagline.trim() || null,
        trn_number: trn.trim() || null,
        contact_phone: phone.trim() || null,
        contact_email: email.trim() || null,
        address: address.trim() || null,
        quote_prefix: (prefix.trim() || 'QTN').toUpperCase(),
        default_vat_enabled: vatDefault,
        default_trades: trades.filter(Boolean),
        work_type_presets: cleanPresets,
        // mirror the DEFAULT preset into the legacy global columns for backward compatibility
        why_choose_us: JSON.stringify(def ? def.whyUs : []),
        payment_schedule: def ? def.payment : [],
        default_terms: def ? (def.terms || null) : null,
        bank_name: bankName.trim() || null,
        bank_account_name: bankAccName.trim() || null,
        bank_account_number: bankAccNumber.trim() || null,
        bank_iban: bankIban.trim() || null,
        bank_swift: bankSwift.trim() || null,
        bank_branch: bankBranch.trim() || null,
        default_show_bank: showBankDefault,
      }
      const { error } = await supabase.from('quotation_templates')
        .upsert(payload, { onConflict: 'company_id' })
      if (error) throw error
      toast.success('Quote settings saved ✓')
    } catch (e) {
      toast.error('Save failed: ' + (e.message || 'unknown'))
    } finally { setSaving(false) }
  }

  // ---- theme tokens (same system as Quotations.jsx) ----
  const text=isDark?'#f1f5f9':'#0f172a', textSub=isDark?'#94a3b8':'#64748b', textMuted=isDark?'#475569':'#94a3b8'
  const border=isDark?'rgba(255,255,255,0.08)':'#e2e8f0', cardBg=isDark?'#1e293b':'#ffffff'
  const subBg=isDark?'rgba(255,255,255,0.04)':'#f8fafc', inputBg=isDark?'#0f172a':'#fff'
  const inputStyle = { padding:'9px 11px', border:`1px solid ${border}`, borderRadius:8, fontSize:13, background:inputBg, color:text, outline:'none', width:'100%', boxSizing:'border-box' }
  const labelStyle = { fontSize:12, color:textSub, display:'block', marginBottom:4 }
  const cardStyle  = { background:cardBg, border:`1px solid ${border}`, borderRadius:12, padding:'15px 17px', marginBottom:14 }
  const cardHead   = { fontSize:14, fontWeight:700, color:text, marginBottom:14, display:'flex', alignItems:'center', gap:8 }

  if (loading) {
    return (
      <div style={{ textAlign:'center', padding:50 }}>
        <div style={{ width:34, height:34, border:'3px solid #0099cc', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color:textMuted, fontSize:13 }}>Loading settings...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:18, flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontSize:21, fontWeight:700, color:text, margin:0 }}>Quote Settings</h1>
          <p style={{ fontSize:13, color:textSub, marginTop:3 }}>Branding &amp; defaults applied to every new quotation</p>
        </div>
        <button onClick={save} disabled={saving}
          style={{ padding:'9px 18px', background:'#0099cc', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor: saving?'default':'pointer', display:'flex', alignItems:'center', gap:6, opacity: saving?0.7:1 }}>
          <i className="ti ti-device-floppy" style={{ fontSize:15 }}/> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Logo note */}
      <div style={{ display:'flex', alignItems:'center', gap:10, background:subBg, border:`1px solid ${border}`, borderRadius:9, padding:'11px 14px', marginBottom:14 }}>
        <i className="ti ti-photo" style={{ fontSize:18, color:textSub }}/>
        <span style={{ fontSize:12.5, color:textSub }}>Logo comes from your Business Profile and appears automatically on the quote PDF.</span>
      </div>

      {/* Branding & Contact */}
      <div style={cardStyle}>
        <div style={cardHead}><i className="ti ti-palette" style={{ fontSize:18, color:'#0099cc' }}/> Branding &amp; Contact</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:12 }}>
          <div><label style={labelStyle}>Company legal name</label><input value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder="Company LLC" style={inputStyle}/></div>
          <div><label style={labelStyle}>Tagline</label><input value={tagline} onChange={e=>setTagline(e.target.value)} placeholder="Premium Interior Renovation | Dubai" style={inputStyle}/></div>
          <div><label style={labelStyle}>TRN number</label><input value={trn} onChange={e=>setTrn(e.target.value)} placeholder="100xxxxxxxxxxxx" style={inputStyle}/></div>
          <div><label style={labelStyle}>Contact phone</label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+971 50 000 0000" style={inputStyle}/></div>
          <div><label style={labelStyle}>Contact email</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="info@company.com" style={inputStyle}/></div>
          <div><label style={labelStyle}>Address</label><input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Dubai, UAE" style={inputStyle}/></div>
        </div>
      </div>

      {/* Numbering + VAT */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px,1fr))', gap:14, marginBottom:14 }}>
        <div style={{ ...cardStyle, marginBottom:0 }}>
          <div style={cardHead}><i className="ti ti-hash" style={{ fontSize:18, color:'#0099cc' }}/> Quote Numbering</div>
          <div style={{ display:'flex', gap:12, alignItems:'flex-end' }}>
            <div style={{ flex:1 }}><label style={labelStyle}>Prefix</label><input value={prefix} onChange={e=>setPrefix(e.target.value)} placeholder="QTN" style={inputStyle}/></div>
            <div style={{ flex:1 }}><label style={labelStyle}>Next number</label><input value={nextSeq} disabled style={{ ...inputStyle, opacity:0.55, cursor:'not-allowed' }}/></div>
          </div>
          <p style={{ margin:'10px 0 0', fontSize:11, color:textMuted }}>
            Next quote → <span style={{ fontWeight:600, color:textSub, fontFamily:'monospace' }}>{(prefix.trim()||'QTN').toUpperCase()}-{String(nextSeq).padStart(3,'0')}</span> · auto-increments
          </p>
        </div>
        <div style={{ ...cardStyle, marginBottom:0 }}>
          <div style={cardHead}><i className="ti ti-receipt-tax" style={{ fontSize:18, color:'#0099cc' }}/> VAT</div>
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
            <input type="checkbox" checked={vatDefault} onChange={e=>setVatDefault(e.target.checked)} style={{ width:'auto' }}/>
            <span style={{ fontSize:13, color:text }}>Apply 5% VAT by default</span>
          </label>
          <p style={{ margin:'10px 0 0', fontSize:11, color:textMuted }}>Can be toggled per quote in the builder.</p>
        </div>
      </div>

      {/* Trades */}
      <div style={cardStyle}>
        <div style={cardHead}><i className="ti ti-tools" style={{ fontSize:18, color:'#0099cc' }}/> Default Trades
          <span style={{ fontSize:11, fontWeight:400, color:textMuted, marginLeft:4 }}>(BOQ grouping · Gold+)</span>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:12 }}>
          {trades.map((t, i) => (
            <span key={i} style={{ background:subBg, border:`1px solid ${border}`, padding:'5px 10px', borderRadius:8, fontSize:12.5, color:text, display:'flex', alignItems:'center', gap:6 }}>
              {t}
              <i className="ti ti-x" onClick={()=>removeTrade(i)} style={{ fontSize:13, color:textMuted, cursor:'pointer' }}/>
            </span>
          ))}
          {trades.length === 0 && <span style={{ fontSize:12, color:textMuted }}>No trades added yet.</span>}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <input value={newTrade} onChange={e=>setNewTrade(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addTrade() } }}
            placeholder="Add trade (e.g. Sanitary)" style={{ ...inputStyle, flex:1 }}/>
          <button onClick={addTrade} style={{ padding:'0 16px', borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:'#0099cc', fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
            <i className="ti ti-plus" style={{ fontSize:13, verticalAlign:'-2px', marginRight:3 }}/> Add
          </button>
        </div>
      </div>

      {/* Work-Type Templates (payment + why-us + terms per type) */}
      <div style={cardStyle}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6, flexWrap:'wrap', gap:8 }}>
          <div style={{ ...cardHead, marginBottom:0 }}><i className="ti ti-layout-grid" style={{ fontSize:18, color:'#0099cc' }}/> Work-Type Templates</div>
          <span style={{ fontSize:11, color:textMuted }}>Payment + Why-us + Terms per work type</span>
        </div>
        <p style={{ margin:'0 0 12px', fontSize:11, color:textMuted }}>
          In the builder you pick a work type (e.g. Joinery) and its payment schedule, why-us points &amp; terms auto-fill — still editable per quote.
        </p>

        {/* Type tabs */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:14 }}>
          {presets.map((p, i) => (
            <button key={i} onClick={()=>setActiveIdx(i)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:9, fontSize:12.5, fontWeight:600, cursor:'pointer',
                       border:`1px solid ${i===activeIdx ? '#0099cc' : border}`,
                       background: i===activeIdx ? 'rgba(0,153,204,0.10)' : subBg,
                       color: i===activeIdx ? '#0099cc' : textSub }}>
              {p.isDefault && <i className="ti ti-star-filled" style={{ fontSize:12, color:'#f59e0b' }}/>}
              {p.name}
              {presets.length > 1 && (
                <i className="ti ti-x" onClick={(e)=>{ e.stopPropagation(); deleteType(i) }} style={{ fontSize:13, color:textMuted, cursor:'pointer', marginLeft:2 }}/>
              )}
            </button>
          ))}
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <input value={newType} onChange={e=>setNewType(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addType() } }}
              placeholder="New work type" style={{ ...inputStyle, width:140, padding:'7px 9px' }}/>
            <button onClick={addType} style={{ padding:'7px 12px', borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:'#0099cc', fontSize:12.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
              <i className="ti ti-plus" style={{ fontSize:12, verticalAlign:'-2px' }}/> Add
            </button>
          </div>
        </div>

        {active && (
          <div style={{ border:`1px solid ${border}`, borderRadius:11, padding:'14px 14px', background:subBg }}>
            {/* Name + default */}
            <div style={{ display:'flex', gap:10, alignItems:'flex-end', marginBottom:16, flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:180 }}>
                <label style={labelStyle}>Work type name</label>
                <input value={active.name} onChange={e=>renameActive(e.target.value)} placeholder="e.g. Joinery" style={inputStyle}/>
              </div>
              <button onClick={makeDefault} disabled={active.isDefault}
                style={{ padding:'9px 14px', borderRadius:8, border:`1px solid ${active.isDefault ? border : '#f59e0b'}`, background:cardBg,
                         color: active.isDefault ? textMuted : '#b45309', fontSize:12.5, fontWeight:600, cursor: active.isDefault?'default':'pointer',
                         display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
                <i className={`ti ${active.isDefault ? 'ti-star-filled' : 'ti-star'}`} style={{ fontSize:14, color: active.isDefault ? '#f59e0b' : '#b45309' }}/>
                {active.isDefault ? 'Default type' : 'Set as default'}
              </button>
            </div>

            {/* Payment schedule for this type */}
            <div style={{ fontSize:12.5, fontWeight:700, color:text, marginBottom:4, display:'flex', alignItems:'center', gap:6 }}>
              <i className="ti ti-credit-card" style={{ fontSize:15, color:'#0099cc' }}/> Payment Schedule
            </div>
            <p style={{ margin:'0 0 10px', fontSize:11, color:textMuted }}>Milestones must total 100% · description shown on PDF.</p>
            {active.payment.map((p, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'64px 1fr 26px', gap:8, alignItems:'start', marginBottom:8 }}>
                <div>
                  <input type="number" value={p.percent} onChange={e=>updatePay(i,'percent',e.target.value)} style={{ ...inputStyle, textAlign:'center', padding:'8px 4px' }}/>
                  <div style={{ fontSize:10, color:textMuted, textAlign:'center', marginTop:2 }}>%</div>
                </div>
                <div>
                  <input value={p.label} onChange={e=>updatePay(i,'label',e.target.value)} placeholder="Milestone (e.g. 1st Payment — Advance)" style={{ ...inputStyle, marginBottom:5, padding:'8px 9px' }}/>
                  <input value={p.description} onChange={e=>updatePay(i,'description',e.target.value)} placeholder="Description (e.g. Upon contract signing)" style={{ ...inputStyle, fontSize:12, padding:'7px 9px', color:textSub }}/>
                </div>
                <i className="ti ti-trash" onClick={()=>removePay(i)} style={{ fontSize:16, color:textMuted, cursor:'pointer', marginTop:10, justifySelf:'center' }}/>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4, marginBottom:18 }}>
              <button onClick={addPay} style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:'#0099cc', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                <i className="ti ti-plus" style={{ fontSize:13, verticalAlign:'-2px', marginRight:3 }}/> Add milestone
              </button>
              <span style={{ fontSize:12.5, fontWeight:600, color: payOk ? '#0f6e56' : '#dc2626', display:'flex', alignItems:'center', gap:4 }}>
                <i className={`ti ${payOk ? 'ti-check' : 'ti-alert-triangle'}`} style={{ fontSize:14 }}/> Total: {payTotal}%
              </span>
            </div>

            {/* Why choose us for this type */}
            <div style={{ fontSize:12.5, fontWeight:700, color:text, marginBottom:4, display:'flex', alignItems:'center', gap:6 }}>
              <i className="ti ti-circle-check" style={{ fontSize:15, color:'#0099cc' }}/> Why Choose Us
            </div>
            <p style={{ margin:'0 0 10px', fontSize:11, color:textMuted }}>Shows as a checklist on the quote PDF.</p>
            {active.whyUs.map((w, i) => (
              <div key={i} style={{ border:`1px solid ${border}`, borderRadius:9, padding:'11px 12px', marginBottom:8, background:cardBg }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <i className="ti ti-check" style={{ fontSize:15, color:'#0f6e56' }}/>
                  <input value={w.title} onChange={e=>updateWhy(i,'title',e.target.value)} placeholder="Point title (e.g. Trusted Premium Brands)" style={{ ...inputStyle, flex:1, padding:'7px 9px' }}/>
                  <i className="ti ti-trash" onClick={()=>removeWhy(i)} style={{ fontSize:16, color:textMuted, cursor:'pointer' }}/>
                </div>
                <textarea value={w.detail} onChange={e=>updateWhy(i,'detail',e.target.value)} placeholder="Short description shown under the title..."
                  style={{ ...inputStyle, fontSize:12.5, minHeight:46, resize:'vertical' }}/>
              </div>
            ))}
            <button onClick={addWhy} style={{ width:'100%', padding:'9px', borderRadius:8, border:`1px dashed ${textMuted}`, background:'transparent', color:textSub, fontSize:12.5, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:18 }}>
              <i className="ti ti-plus" style={{ fontSize:14 }}/> Add another point
            </button>

            {/* Terms for this type */}
            <div style={{ fontSize:12.5, fontWeight:700, color:text, marginBottom:4, display:'flex', alignItems:'center', gap:6 }}>
              <i className="ti ti-file-text" style={{ fontSize:15, color:'#0099cc' }}/> Terms &amp; Conditions
            </div>
            <textarea value={active.terms} onChange={e=>patchActive({ terms: e.target.value })} placeholder="One condition per line..."
              style={{ ...inputStyle, fontSize:12.5, minHeight:110, resize:'vertical', lineHeight:1.6 }}/>
            <p style={{ margin:'8px 0 0', fontSize:11, color:textMuted }}>One point per line. Appears in the footer of quotes using this work type.</p>
          </div>
        )}
      </div>

      {/* Bank / Payment Account */}
      <div style={cardStyle}>
        <div style={cardHead}><i className="ti ti-building-bank" style={{ fontSize:18, color:'#0099cc' }}/> Bank / Payment Account</div>
        <p style={{ margin:'0 0 12px', fontSize:11, color:textMuted }}>Shown on the quote PDF when the “Bank account details” option is ticked in the builder. Leave blank to hide.</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:12 }}>
          <div><label style={labelStyle}>Bank name</label><input value={bankName} onChange={e=>setBankName(e.target.value)} placeholder="Emirates NBD" style={inputStyle}/></div>
          <div><label style={labelStyle}>Account name</label><input value={bankAccName} onChange={e=>setBankAccName(e.target.value)} placeholder="Company LLC" style={inputStyle}/></div>
          <div><label style={labelStyle}>Account number</label><input value={bankAccNumber} onChange={e=>setBankAccNumber(e.target.value)} placeholder="1011xxxxxxxxx" style={inputStyle}/></div>
          <div><label style={labelStyle}>IBAN</label><input value={bankIban} onChange={e=>setBankIban(e.target.value)} placeholder="AE07 0331 2345 6789 0123 456" style={inputStyle}/></div>
          <div><label style={labelStyle}>SWIFT / BIC</label><input value={bankSwift} onChange={e=>setBankSwift(e.target.value)} placeholder="EBILAEAD" style={inputStyle}/></div>
          <div><label style={labelStyle}>Branch</label><input value={bankBranch} onChange={e=>setBankBranch(e.target.value)} placeholder="Business Bay Branch" style={inputStyle}/></div>
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginTop:13 }}>
          <input type="checkbox" checked={showBankDefault} onChange={e=>setShowBankDefault(e.target.checked)} style={{ width:'auto' }}/>
          <span style={{ fontSize:13, color:text }}>Include bank details on new quotes by default</span>
        </label>
      </div>

      {/* Bottom save */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
        <button onClick={save} disabled={saving}
          style={{ padding:'11px 24px', background:'#0099cc', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor: saving?'default':'pointer', display:'flex', alignItems:'center', gap:6, opacity: saving?0.7:1 }}>
          <i className="ti ti-device-floppy" style={{ fontSize:15 }}/> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
