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
const STATUS_FLOW = ['draft', 'sent', 'approved', 'rejected']
const UNITS = ['Lump Sum', 'Nos', 'm²', 'm', 'L/s', 'Set', 'Hour', 'Day']
const blankItem = () => ({ desc:'', unit:'Nos', qty:1, rate:0 })

export default function Quotations() {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const [, forceUpdate] = useState(0)
  const [view, setView]       = useState('list')
  const [quotes, setQuotes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')

  // detail
  const [activeQuote, setActiveQuote] = useState(null)
  const [statusBusy, setStatusBusy]   = useState(false)

  // builder
  const [tpl, setTpl]         = useState(null)
  const [saving, setSaving]   = useState(false)
  const [editId, setEditId]   = useState(null)
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

  useEffect(() => {
    if (company?.id) { fetchQuotes(); fetchTemplate() }
    const observer = new MutationObserver(() => forceUpdate(n => n + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [company?.id])

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

  async function deleteQuote() {
    if (!activeQuote) return
    if (!window.confirm('Delete this quotation? This cannot be undone.')) return
    const { error } = await supabase.from('quotations').delete().eq('id', activeQuote.id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Quotation deleted')
    setActiveQuote(null); setView('list'); fetchQuotes()
  }

  function openBuilder() {
    setEditId(null)
    setClient(null); setClientSearch(''); setSuggestions([]); setShowSug(false)
    setProjectTitle('')
    setItems([blankItem()]); setNotes('')
    setVatEnabled(tpl?.default_vat_enabled ?? true)
    setDiscountType(null); setDiscountValue(0)
    setView('builder')
  }
  function editQuote(q) {
    setEditId(q.id)
    setClient(q.client_id ? { id:q.client_id, uid:q.client_uid, name:q.client_name, phone:q.client_phone, email:q.client_email } : null)
    setClientSearch(q.client_name || '')
    setSuggestions([]); setShowSug(false)
    setProjectTitle(q.project_title || '')
    setItems(Array.isArray(q.items) && q.items.length ? q.items.map(it => ({ desc:it.desc||'', unit:it.unit||'Nos', qty:it.qty??1, rate:it.rate??0 })) : [blankItem()])
    setNotes('')
    setVatEnabled(!!q.vat_amount || (tpl?.default_vat_enabled ?? true))
    setDiscountType(null); setDiscountValue(0)
    setView('builder')
  }
  function updateItem(idx, field, val) { setItems(prev => prev.map((it,i)=> i===idx?{...it,[field]:val}:it)) }
  function addItem() { setItems(prev => [...prev, blankItem()]) }
  function removeItem(idx) { setItems(prev => prev.length===1?prev:prev.filter((_,i)=>i!==idx)) }

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
        client_id: client.id,
        client_uid: client.uid,
        source_uid: client.uid,
        client_name: client.name,
        client_phone: client.phone || null,
        client_email: client.email || null,
        project_title: projectTitle.trim() || null,
        mode: 'simple',
        items: validItems.map(it => ({ desc:it.desc.trim(), unit:it.unit||'Nos', qty:Number(it.qty)||0, rate:Number(it.rate)||0 })),
        subtotal,
        vat_amount: vatAmount,
        total: grandTotal,
        payment_terms: tpl?.payment_schedule || null,
        why_choose_us: tpl?.why_choose_us || null,
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

  // ============ DETAIL ============
  if (view === 'detail' && activeQuote) {
    const q = activeQuote
    const md = MODE_STYLE[q.mode||'simple']||MODE_STYLE.simple
    const st = STATUS_STYLE[q.status||'draft']||STATUS_STYLE.draft
    const qItems = Array.isArray(q.items) ? q.items : []
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

        <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 44px 70px 80px', gap:8, padding:'9px 13px', background:subBg, fontSize:11, color:textSub, textTransform:'uppercase', letterSpacing:'.3px' }}>
            <span>Description</span><span>Unit</span><span>Qty</span><span>Rate</span><span style={{ textAlign:'right' }}>Total</span>
          </div>
          {qItems.map((it, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 70px 44px 70px 80px', gap:8, padding:'9px 13px', borderTop:`1px solid ${border}`, fontSize:13, color:text }}>
              <span>{it.desc}</span>
              <span style={{ color:textSub, fontSize:12 }}>{it.unit||'—'}</span>
              <span style={{ color:textSub }}>{it.qty}</span>
              <span style={{ color:textSub }}>{Number(it.rate).toLocaleString('en-AE')}</span>
              <span style={{ textAlign:'right' }}>{Math.round((Number(it.qty)||0)*(Number(it.rate)||0)).toLocaleString('en-AE')}</span>
            </div>
          ))}
        </div>

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
                    border:`1px solid ${active?ss.color:border}`,
                    background: active?(isDark?ss.color+'22':ss.bg):'transparent',
                    color: active?ss.color:textSub }}>{ss.label}</button>
              )
            })}
          </div>
        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={()=>editQuote(q)} style={{ flex:1, minWidth:90, padding:'10px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <i className="ti ti-edit" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Edit
          </button>
          <button onClick={()=>toast.info('PDF / preview comes in the next step')} style={{ flex:1, minWidth:90, padding:'10px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <i className="ti ti-file-text" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Preview / PDF
          </button>
          <button onClick={deleteQuote} style={{ flex:1, minWidth:90, padding:'10px', borderRadius:9, border:`1px solid #fca5a5`, background:cardBg, color:'#dc2626', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <i className="ti ti-trash" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Delete
          </button>
        </div>
      </div>
    )
  }

  // ============ BUILDER ============
  if (view === 'builder') {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <button onClick={() => setView('list')} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
          </button>
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:19, fontWeight:700, color:text, margin:0 }}>{editId ? 'Edit Quotation' : 'New Quotation'}</h1>
            <div style={{ fontSize:12, color:textMuted }}>Simple mode</div>
          </div>
          <span style={{ fontSize:11, color:'#0077a3', background:isDark?'rgba(3,193,245,0.15)':'#e0f9ff', padding:'4px 11px', borderRadius:99, fontWeight:600 }}>Simple</span>
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

        {/* Items with UNIT */}
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

        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:230, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, padding:'11px 13px' }}>
              <div style={{ fontSize:12, fontWeight:600, color:textSub, marginBottom:8 }}>Discount</div>
              <div style={{ display:'flex', gap:6, marginBottom: discountType?8:0 }}>
                {[['None',null],['%','percent'],['AED','flat']].map(([lbl,val]) => (
                  <button key={lbl} onClick={()=>{ setDiscountType(val); if(!val) setDiscountValue(0) }}
                    style={{ flex:1, fontSize:12, padding:'6px 0', borderRadius:7, cursor:'pointer', fontWeight: discountType===val?600:400,
                      border:`1px solid ${discountType===val?'#0099cc':border}`,
                      background: discountType===val?(isDark?'rgba(3,193,245,0.12)':'#e0f9ff'):'transparent',
                      color: discountType===val?'#0099cc':textSub }}>{lbl}</button>
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

        <div style={{ display:'flex', gap:8, marginTop:16, flexWrap:'wrap' }}>
          <button onClick={()=>setView('list')} disabled={saving} style={{ flex:1, minWidth:100, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:'transparent', color:textSub, fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={()=>saveQuote(false)} disabled={saving} style={{ flex:1, minWidth:100, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>{saving?'Saving...':(editId?'Update':'Save draft')}</button>
          <button onClick={()=>saveQuote(true)} disabled={saving} style={{ flex:1, minWidth:100, padding:'11px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}><i className="ti ti-send" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> {saving?'...':'Send'}</button>
        </div>
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
            return (
              <div key={q.id} onClick={()=>openDetail(q)}
                style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', transition:'all .15s' }}
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
