import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

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

function blankItem() {
  return { desc:'', qty:1, rate:0 }
}

export default function Quotations() {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const [, forceUpdate] = useState(0)
  const [view, setView]       = useState('list')     // 'list' | 'builder'
  const [quotes, setQuotes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')

  // builder state
  const [tpl, setTpl]         = useState(null)        // company quotation_templates row
  const [saving, setSaving]   = useState(false)
  const [clientName, setClientName]   = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [items, setItems]     = useState([blankItem()])
  const [vatEnabled, setVatEnabled]   = useState(true)
  const [discountType, setDiscountType] = useState(null)  // null | 'percent' | 'flat'
  const [discountValue, setDiscountValue] = useState(0)
  const [notes, setNotes]     = useState('')

  useEffect(() => {
    if (company?.id) { fetchQuotes(); fetchTemplate() }
    const observer = new MutationObserver(() => forceUpdate(n => n + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [company?.id])

  async function fetchQuotes() {
    setLoading(true)
    const { data: qs } = await supabase
      .from('quotations').select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    if (!qs || qs.length === 0) { setQuotes([]); setLoading(false); return }
    const ids = qs.map(q => q.id)
    const { data: revs } = await supabase
      .from('quotation_revisions').select('quotation_id, rev_number, total')
      .in('quotation_id', ids)
    const merged = qs.map(q => {
      const cur = (revs || []).find(r => r.quotation_id === q.id && r.rev_number === q.current_revision)
      return { ...q, _total: cur?.total || 0 }
    })
    setQuotes(merged); setLoading(false)
  }

  async function fetchTemplate() {
    const { data } = await supabase
      .from('quotation_templates').select('*')
      .eq('company_id', company.id).maybeSingle()
    setTpl(data || null)
  }

  // ---------- builder helpers ----------
  function openBuilder() {
    setClientName(''); setClientPhone(''); setProjectTitle('')
    setItems([blankItem()]); setNotes('')
    setVatEnabled(tpl?.default_vat_enabled ?? true)
    setDiscountType(null); setDiscountValue(0)
    setView('builder')
  }
  function updateItem(idx, field, val) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it))
  }
  function addItem()    { setItems(prev => [...prev, blankItem()]) }
  function removeItem(idx) { setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)) }

  const subtotal = items.reduce((s, it) => s + (Number(it.qty)||0) * (Number(it.rate)||0), 0)
  const discountAmount = discountType === 'percent'
    ? Math.round(subtotal * (Number(discountValue)||0) / 100)
    : discountType === 'flat' ? (Number(discountValue)||0) : 0
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const vatAmount = vatEnabled ? Math.round(afterDiscount * 0.05) : 0
  const grandTotal = afterDiscount + vatAmount

  function fmt(n) { return 'AED ' + Math.round(n).toLocaleString('en-AE') }

  async function saveQuote(sendNow) {
    if (!clientName.trim()) { toast.error('Client name is required'); return }
    const validItems = items.filter(it => it.desc.trim())
    if (validItems.length === 0) { toast.error('Add at least one line item'); return }
    setSaving(true)
    try {
      // 1. get next sequence number
      const { data: seq, error: seqErr } = await supabase.rpc('fn_next_quote_seq', { p_company_id: company.id })
      if (seqErr) throw seqErr
      const prefix = tpl?.quote_prefix || 'QTN'
      const quoteNumber = `${prefix}-${String(seq).padStart(3, '0')}`

      // 2. insert quotation envelope
      const { data: q, error: qErr } = await supabase
        .from('quotations')
        .insert({
          company_id: company.id,
          quote_number: quoteNumber,
          client_name: clientName.trim(),
          client_phone: clientPhone.trim() || null,
          project_title: projectTitle.trim() || null,
          mode: 'simple',
          status: sendNow ? 'sent' : 'draft',
          current_revision: 0,
        })
        .select().single()
      if (qErr) throw qErr

      // 3. insert revision 0
      const { error: rErr } = await supabase
        .from('quotation_revisions')
        .insert({
          quotation_id: q.id,
          rev_number: 0,
          items: validItems.map(it => ({ desc: it.desc.trim(), qty: Number(it.qty)||0, rate: Number(it.rate)||0 })),
          discount_type: discountType,
          discount_value: Number(discountValue)||0,
          discount_amount: discountAmount,
          subtotal,
          vat_enabled: vatEnabled,
          vat_amount: vatAmount,
          total: grandTotal,
          why_choose_us: tpl?.why_choose_us || null,
          terms: tpl?.default_terms || null,
          payment_schedule: tpl?.payment_schedule || [],
          notes: notes.trim() || null,
          is_locked: !!sendNow,
          sent_at: sendNow ? new Date().toISOString() : null,
        })
      if (rErr) throw rErr

      toast.success(sendNow ? 'Quotation sent ✓' : 'Draft saved ✓')
      setView('list')
      fetchQuotes()
    } catch (e) {
      toast.error('Save failed: ' + (e.message || 'unknown error'))
    } finally {
      setSaving(false)
    }
  }

  // ---------- derived list ----------
  let list = quotes
  if (filter !== 'all') list = list.filter(q => (q.status || 'draft') === filter)
  if (search.trim()) {
    const s = search.toLowerCase()
    list = list.filter(q =>
      q.quote_number?.toLowerCase().includes(s) ||
      q.client_name?.toLowerCase().includes(s) ||
      q.project_title?.toLowerCase().includes(s))
  }
  const total   = quotes.length
  const sentCnt = quotes.filter(q => (q.status||'draft') === 'sent').length
  const apprCnt = quotes.filter(q => (q.status||'draft') === 'approved').length
  const apprVal = quotes.filter(q => (q.status||'draft') === 'approved').reduce((s,q) => s + (q._total||0), 0)
  function fmtShort(n) { return n >= 1000 ? (n/1000).toFixed(n%1000===0?0:1)+'k' : String(Math.round(n)) }

  // ---------- theme tokens ----------
  const text      = isDark ? '#f1f5f9' : '#0f172a'
  const textSub   = isDark ? '#94a3b8' : '#64748b'
  const textMuted = isDark ? '#475569' : '#94a3b8'
  const border    = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
  const cardBg    = isDark ? '#1e293b' : '#ffffff'
  const subBg     = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'
  const pillBg    = isDark ? 'rgba(255,255,255,0.05)' : '#fff'
  const inputBg   = isDark ? '#0f172a' : '#fff'

  const inputStyle = { padding:'9px 11px', border:`1px solid ${border}`, borderRadius:8, fontSize:13, background:inputBg, color:text, outline:'none', width:'100%' }

  // ============ BUILDER VIEW ============
  if (view === 'builder') {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <button onClick={() => setView('list')}
            style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
          </button>
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:19, fontWeight:700, color:text, margin:0 }}>New Quotation</h1>
            <div style={{ fontSize:12, color:textMuted }}>Simple mode · Rev 0</div>
          </div>
          <span style={{ fontSize:11, color:'#0077a3', background: isDark?'rgba(3,193,245,0.15)':'#e0f9ff', padding:'4px 11px', borderRadius:99, fontWeight:600 }}>Simple</span>
        </div>

        {/* Client */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
          <input value={clientName} onChange={e=>setClientName(e.target.value)} placeholder="Client name *" style={inputStyle}/>
          <input value={clientPhone} onChange={e=>setClientPhone(e.target.value)} placeholder="Client phone" style={inputStyle}/>
        </div>
        <input value={projectTitle} onChange={e=>setProjectTitle(e.target.value)} placeholder="Project title (e.g. Interior Fit-Out)" style={{ ...inputStyle, marginBottom:14 }}/>

        {/* Items */}
        <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 90px 96px 30px', gap:8, padding:'9px 12px', background:subBg, fontSize:11, color:textSub, textTransform:'uppercase', letterSpacing:'.3px' }}>
            <span>Description</span><span>Qty</span><span>Rate</span><span style={{ textAlign:'right' }}>Total</span><span/>
          </div>
          {items.map((it, idx) => {
            const lineTotal = (Number(it.qty)||0) * (Number(it.rate)||0)
            return (
              <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 60px 90px 96px 30px', gap:8, padding:'8px 12px', alignItems:'center', borderTop:`1px solid ${border}` }}>
                <input value={it.desc} onChange={e=>updateItem(idx,'desc',e.target.value)} placeholder="Item description" style={{ ...inputStyle, padding:'7px 9px', fontSize:12.5 }}/>
                <input type="number" value={it.qty} onChange={e=>updateItem(idx,'qty',e.target.value)} style={{ ...inputStyle, padding:'7px 9px', fontSize:12.5 }}/>
                <input type="number" value={it.rate} onChange={e=>updateItem(idx,'rate',e.target.value)} style={{ ...inputStyle, padding:'7px 9px', fontSize:12.5 }}/>
                <span style={{ textAlign:'right', fontSize:13, color:text }}>{Math.round(lineTotal).toLocaleString('en-AE')}</span>
                <button onClick={()=>removeItem(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:textMuted, display:'flex', justifyContent:'center' }}>
                  <i className="ti ti-x" style={{ fontSize:15 }}/>
                </button>
              </div>
            )
          })}
          <div style={{ padding:'9px 12px', borderTop:`1px solid ${border}` }}>
            <button onClick={addItem} style={{ fontSize:12, padding:'6px 12px', border:`1px solid ${border}`, borderRadius:7, background:'none', color:'#0099cc', cursor:'pointer', fontWeight:600 }}>
              <i className="ti ti-plus" style={{ fontSize:13, verticalAlign:'-2px', marginRight:3 }}/> Add line item
            </button>
          </div>
        </div>

        {/* Discount + VAT + Notes  &  Totals */}
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:230, display:'flex', flexDirection:'column', gap:10 }}>
            {/* Discount */}
            <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, padding:'11px 13px' }}>
              <div style={{ fontSize:12, fontWeight:600, color:textSub, marginBottom:8 }}>Discount</div>
              <div style={{ display:'flex', gap:6, marginBottom: discountType?8:0 }}>
                {[['None',null],['%','percent'],['AED','flat']].map(([lbl,val]) => (
                  <button key={lbl} onClick={()=>{ setDiscountType(val); if(!val) setDiscountValue(0) }}
                    style={{ flex:1, fontSize:12, padding:'6px 0', borderRadius:7, cursor:'pointer', fontWeight: discountType===val?600:400,
                      border:`1px solid ${discountType===val?'#0099cc':border}`,
                      background: discountType===val ? (isDark?'rgba(3,193,245,0.12)':'#e0f9ff') : 'transparent',
                      color: discountType===val ? '#0099cc' : textSub }}>{lbl}</button>
                ))}
              </div>
              {discountType && (
                <input type="number" value={discountValue} onChange={e=>setDiscountValue(e.target.value)}
                  placeholder={discountType==='percent'?'Discount %':'Discount AED'} style={inputStyle}/>
              )}
            </div>
            {/* VAT */}
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:textSub, padding:'2px 2px', cursor:'pointer' }}>
              <input type="checkbox" checked={vatEnabled} onChange={e=>setVatEnabled(e.target.checked)} style={{ width:'auto' }}/>
              Apply 5% VAT {tpl?.trn_number ? '(TRN set)' : ''}
            </label>
            {/* Notes */}
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes for client..." style={{ ...inputStyle, minHeight:54, resize:'vertical' }}/>
          </div>

          {/* Totals */}
          <div style={{ flex:1, minWidth:210, background:cardBg, border:`1px solid ${border}`, borderRadius:10, padding:'13px 15px', alignSelf:'flex-start' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:textSub, padding:'4px 0' }}>
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#0f6e56', padding:'4px 0' }}>
                <span>Discount{discountType==='percent'?` (${discountValue}%)`:''}</span><span>− {fmt(discountAmount)}</span>
              </div>
            )}
            {vatEnabled && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:textSub, padding:'4px 0' }}>
                <span>VAT 5%</span><span>{fmt(vatAmount)}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:700, color:text, padding:'7px 0 2px', borderTop:`1px solid ${border}`, marginTop:4 }}>
              <span>Total</span><span>{fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:8, marginTop:16, flexWrap:'wrap' }}>
          <button onClick={()=>setView('list')} disabled={saving}
            style={{ flex:1, minWidth:100, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:'transparent', color:textSub, fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={()=>saveQuote(false)} disabled={saving}
            style={{ flex:1, minWidth:100, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            {saving ? 'Saving...' : 'Save draft'}
          </button>
          <button onClick={()=>saveQuote(true)} disabled={saving}
            style={{ flex:1, minWidth:100, padding:'11px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <i className="ti ti-send" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> {saving ? '...' : 'Send'}
          </button>
        </div>
      </div>
    )
  }

  // ============ LIST VIEW ============
  const STATS = [
    { label:'Total quotes',   value: total,             color: text },
    { label:'Sent',           value: sentCnt,           color:'#d97706' },
    { label:'Approved',       value: apprCnt,           color:'#0f6e56' },
    { label:'Approved value', value: fmtShort(apprVal), color: text },
  ]

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:18, flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontSize:21, fontWeight:700, color:text, margin:0 }}>Quotations</h1>
          <p style={{ fontSize:13, color:textSub, marginTop:3 }}>Create, send &amp; track your quotes · {total} total</p>
        </div>
        <button onClick={openBuilder}
          style={{ padding:'9px 16px', background:'#0099cc', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
          <i className="ti ti-plus" style={{ fontSize:15 }}/> New Quotation
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background:subBg, borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:12, color:textSub }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:s.color, marginTop:2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quote number, client..."
          style={{ flex:1, minWidth:200, padding:'9px 12px', border:`1px solid ${border}`, borderRadius:9, fontSize:13, background:cardBg, color:text, outline:'none' }} />
        <div style={{ display:'inline-flex', background:pillBg, border:`1px solid ${border}`, borderRadius:99, padding:3 }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ fontSize:12, fontWeight: filter===f?600:400, padding:'5px 13px', borderRadius:99, border:'none', cursor:'pointer',
                background: filter===f ? (isDark?'rgba(3,193,245,0.15)':'#e0f9ff') : 'transparent',
                color: filter===f ? '#0099cc' : textMuted, textTransform:'capitalize' }}>{f}</button>
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
          <div style={{ width:56, height:56, borderRadius:14, background:subBg, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            <i className="ti ti-file-invoice" style={{ fontSize:26, color:textMuted }}/>
          </div>
          <h3 style={{ fontSize:16, fontWeight:700, color:text, margin:'0 0 6px' }}>
            {quotes.length === 0 ? 'No quotations yet' : 'No quotes match your filter'}
          </h3>
          <p style={{ fontSize:13, color:textSub, margin:'0 0 18px', lineHeight:1.5 }}>
            {quotes.length === 0 ? 'Create your first quotation and send it to a client in minutes.' : 'Try a different status filter or search term.'}
          </p>
          {quotes.length === 0 && (
            <button onClick={openBuilder} style={{ padding:'10px 18px', background:'#0099cc', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>
              + New Quotation
            </button>
          )}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
          {list.map(q => {
            const st = STATUS_STYLE[q.status || 'draft'] || STATUS_STYLE.draft
            const md = MODE_STYLE[q.mode || 'simple'] || MODE_STYLE.simple
            return (
              <div key={q.id} onClick={() => toast.info('Quote detail/edit opens in the next step')}
                style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', transition:'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow = isDark?'0 4px 16px rgba(0,0,0,0.3)':'0 2px 12px rgba(0,0,0,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ width:42, height:42, borderRadius:10, background:subBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className="ti ti-file-text" style={{ fontSize:19, color:textSub }}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:text, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    {q.quote_number || 'Untitled'}
                    <span style={{ fontSize:11, color:md.color, background: isDark?md.color+'22':md.bg, padding:'1px 8px', borderRadius:99 }}>{md.label}</span>
                  </div>
                  <div style={{ fontSize:12, color:textSub, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {q.client_name || 'No client'}{q.project_title ? ' · ' + q.project_title : ''} · Rev {q.current_revision ?? 0}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:text }}>{fmt(q._total)}</div>
                  <span style={{ fontSize:11, color:st.color, background: isDark?st.color+'22':st.bg, padding:'2px 9px', borderRadius:99 }}>{st.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
