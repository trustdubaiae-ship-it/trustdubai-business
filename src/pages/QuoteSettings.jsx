import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const DEFAULT_TRADES = ['Civil', 'MEP', 'False Ceiling', 'Flooring', 'Painting', 'Joinery', 'Sanitary']
const DEFAULT_PAYMENT = [
  { percent: 50, label: '1st Payment — Advance',  description: 'Upon contract signing before work commences' },
  { percent: 25, label: '2nd Payment — Progress', description: 'After demolition & 60% of work completed' },
  { percent: 25, label: 'Final — Completion',     description: 'After project handover & client sign-off' },
]
const DEFAULT_WHY = [
  { title: 'Full Turnkey Service',  detail: 'From start to final handover, we manage every trade under one contract — no coordination headaches for the client.' },
  { title: 'Transparent Pricing',   detail: 'Every item priced separately — no hidden costs. All installation works carry a defect liability period.' },
]
const DEFAULT_TERMS = `1. This quotation is valid for 30 days from date of issue.
2. Prices are in AED and subject to 5% VAT.
3. Any variations to the agreed scope will be priced separately via written variation order.
4. Warranty: 1-year defect liability period from project handover date.`

// why_choose_us is a TEXT column — we store structured points as a JSON string.
// Gracefully handle old plain-text data (each line becomes a title-only point).
function parseWhy(raw) {
  if (!raw) return [...DEFAULT_WHY]
  try {
    const p = JSON.parse(raw)
    if (Array.isArray(p)) return p.map(x => ({ title: x.title || '', detail: x.detail || '' }))
  } catch {}
  return String(raw).split('\n').filter(l => l.trim()).map(l => ({ title: l.trim(), detail: '' }))
}
function parsePayment(raw) {
  if (Array.isArray(raw) && raw.length)
    return raw.map(x => ({ percent: Number(x.percent) || 0, label: x.label || '', description: x.description || '' }))
  return [...DEFAULT_PAYMENT]
}
function parseTrades(raw) {
  if (Array.isArray(raw) && raw.length) return raw.filter(Boolean)
  return [...DEFAULT_TRADES]
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
  const [why, setWhy]               = useState([...DEFAULT_WHY])
  const [payment, setPayment]       = useState([...DEFAULT_PAYMENT])
  const [terms, setTerms]           = useState(DEFAULT_TERMS)

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
      setWhy(parseWhy(data.why_choose_us))
      setPayment(parsePayment(data.payment_schedule))
      setTerms(data.default_terms || DEFAULT_TERMS)
    } else {
      // no row yet — sensible defaults pulled from company
      setLegalName(company?.name || '')
      setPhone(company?.phone || '')
    }
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

  // ---- why choose us ----
  function updateWhy(i, field, val) { setWhy(prev => prev.map((w, idx) => idx === i ? { ...w, [field]: val } : w)) }
  function addWhy() { setWhy(prev => [...prev, { title: '', detail: '' }]) }
  function removeWhy(i) { setWhy(prev => prev.filter((_, idx) => idx !== i)) }

  // ---- payment ----
  function updatePay(i, field, val) { setPayment(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p)) }
  function addPay() { setPayment(prev => [...prev, { percent: 0, label: '', description: '' }]) }
  function removePay(i) { setPayment(prev => prev.filter((_, idx) => idx !== i)) }

  const payTotal = payment.reduce((s, p) => s + (Number(p.percent) || 0), 0)
  const payOk = payTotal === 100

  async function save() {
    if (payment.length > 0 && !payOk) {
      toast.error(`Payment milestones must total 100% (currently ${payTotal}%)`); return
    }
    setSaving(true)
    try {
      const cleanWhy = why.filter(w => w.title.trim() || w.detail.trim())
        .map(w => ({ title: w.title.trim(), detail: w.detail.trim() }))
      const cleanPay = payment.filter(p => p.label.trim() || Number(p.percent) > 0)
        .map(p => ({ percent: Number(p.percent) || 0, label: p.label.trim(), description: (p.description || '').trim() }))

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
        why_choose_us: JSON.stringify(cleanWhy),
        payment_schedule: cleanPay,
        default_terms: terms.trim() || null,
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

      {/* Why Choose Us */}
      <div style={cardStyle}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <div style={{ ...cardHead, marginBottom:0 }}><i className="ti ti-circle-check" style={{ fontSize:18, color:'#0099cc' }}/> Why Choose Us</div>
          <span style={{ fontSize:11, color:textMuted }}>title + detail per point</span>
        </div>
        <p style={{ margin:'0 0 12px', fontSize:11, color:textMuted }}>Shows as a checklist on the quote PDF.</p>

        {why.map((w, i) => (
          <div key={i} style={{ border:`1px solid ${border}`, borderRadius:9, padding:'11px 12px', marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <i className="ti ti-check" style={{ fontSize:15, color:'#0f6e56' }}/>
              <input value={w.title} onChange={e=>updateWhy(i,'title',e.target.value)} placeholder="Point title (e.g. Trusted Premium Brands)" style={{ ...inputStyle, flex:1, padding:'7px 9px' }}/>
              <i className="ti ti-trash" onClick={()=>removeWhy(i)} style={{ fontSize:16, color:textMuted, cursor:'pointer' }}/>
            </div>
            <textarea value={w.detail} onChange={e=>updateWhy(i,'detail',e.target.value)} placeholder="Short description shown under the title..."
              style={{ ...inputStyle, fontSize:12.5, minHeight:46, resize:'vertical' }}/>
          </div>
        ))}

        <button onClick={addWhy} style={{ width:'100%', padding:'9px', borderRadius:8, border:`1px dashed ${textMuted}`, background:'transparent', color:textSub, fontSize:12.5, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <i className="ti ti-plus" style={{ fontSize:14 }}/> Add another point
        </button>
      </div>

      {/* Payment Schedule */}
      <div style={cardStyle}>
        <div style={cardHead}><i className="ti ti-credit-card" style={{ fontSize:18, color:'#0099cc' }}/> Payment Schedule</div>
        <p style={{ margin:'0 0 12px', fontSize:11, color:textMuted }}>Milestones must total 100% · description shown on PDF.</p>

        {payment.map((p, i) => (
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

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
          <button onClick={addPay} style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:'#0099cc', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <i className="ti ti-plus" style={{ fontSize:13, verticalAlign:'-2px', marginRight:3 }}/> Add milestone
          </button>
          <span style={{ fontSize:12.5, fontWeight:600, color: payOk ? '#0f6e56' : '#dc2626', display:'flex', alignItems:'center', gap:4 }}>
            <i className={`ti ${payOk ? 'ti-check' : 'ti-alert-triangle'}`} style={{ fontSize:14 }}/> Total: {payTotal}%
          </span>
        </div>
      </div>

      {/* Terms */}
      <div style={cardStyle}>
        <div style={cardHead}><i className="ti ti-file-text" style={{ fontSize:18, color:'#0099cc' }}/> Terms &amp; Conditions</div>
        <textarea value={terms} onChange={e=>setTerms(e.target.value)} placeholder="One condition per line..."
          style={{ ...inputStyle, fontSize:12.5, minHeight:120, resize:'vertical', lineHeight:1.6 }}/>
        <p style={{ margin:'8px 0 0', fontSize:11, color:textMuted }}>One point per line. Appears in the footer of every quote.</p>
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
