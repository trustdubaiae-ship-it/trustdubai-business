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
const blankItem = () => ({ desc:'', qty:1, rate:0 })

export default function Quotations() {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const [, forceUpdate] = useState(0)
  // view: 'list' | 'select' | 'newproject' | 'builder'
  const [view, setView]       = useState('list')
  const [quotes, setQuotes]   = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')

  // select step
  const [projSearch, setProjSearch] = useState('')

  // new project form
  const [npName, setNpName]   = useState('')
  const [npPhone, setNpPhone] = useState('')
  const [npType, setNpType]   = useState('')
  const [npOpt, setNpOpt]     = useState({ location:false, email:false, budget:false })
  const [npLocation, setNpLocation] = useState('')
  const [npEmail, setNpEmail] = useState('')
  const [npBudget, setNpBudget] = useState('')
  const [npSaving, setNpSaving] = useState(false)

  // builder
  const [activeProject, setActiveProject] = useState(null)  // selected/created project row
  const [tpl, setTpl]         = useState(null)
  const [saving, setSaving]   = useState(false)
  const [items, setItems]     = useState([blankItem()])
  const [vatEnabled, setVatEnabled]   = useState(true)
  const [discountType, setDiscountType] = useState(null)
  const [discountValue, setDiscountValue] = useState(0)
  const [notes, setNotes]     = useState('')

  useEffect(() => {
    if (company?.id) { fetchQuotes(); fetchTemplate(); fetchProjects() }
    const observer = new MutationObserver(() => forceUpdate(n => n + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [company?.id])

  async function fetchQuotes() {
    setLoading(true)
    const { data: qs } = await supabase.from('quotations').select('*')
      .eq('company_id', company.id).order('created_at', { ascending: false })
    if (!qs || qs.length === 0) { setQuotes([]); setLoading(false); return }
    const ids = qs.map(q => q.id)
    const { data: revs } = await supabase.from('quotation_revisions')
      .select('quotation_id, rev_number, total').in('quotation_id', ids)
    const merged = qs.map(q => {
      const cur = (revs || []).find(r => r.quotation_id === q.id && r.rev_number === q.current_revision)
      return { ...q, _total: cur?.total || 0 }
    })
    setQuotes(merged); setLoading(false)
  }
  async function fetchTemplate() {
    const { data } = await supabase.from('quotation_templates').select('*')
      .eq('company_id', company.id).maybeSingle()
    setTpl(data || null)
  }
  async function fetchProjects() {
    const { data } = await supabase.from('projects').select('*')
      .eq('company_id', company.id).order('created_at', { ascending: false })
    setProjects(data || [])
  }

  // ---------- NEW QUOTATION → step 1 (select) ----------
  function startNewQuote() {
    setProjSearch('')
    setView('select')
  }

  // ---------- new project ----------
  function openNewProject() {
    setNpName(''); setNpPhone(''); setNpType('')
    setNpOpt({ location:false, email:false, budget:false })
    setNpLocation(''); setNpEmail(''); setNpBudget('')
    setView('newproject')
  }
  async function saveProject() {
    if (!npName.trim()) { toast.error('Client name is required'); return }
    if (!npPhone.trim()) { toast.error('Phone is required'); return }
    if (!npType.trim()) { toast.error('Project type is required'); return }
    setNpSaving(true)
    try {
      const { data: uid, error: uidErr } = await supabase.rpc('fn_next_uid', { p_company_id: company.id })
      if (uidErr) throw uidErr
      const row = {
        company_id: company.id,
        code: uid,
        name: npType.trim(),
        client_name: npName.trim(),
        client_phone: npPhone.trim(),
        client_email: npOpt.email ? (npEmail.trim() || null) : null,
        location: npOpt.location ? (npLocation.trim() || null) : null,
        budget: npOpt.budget && npBudget ? Number(npBudget) : null,
        source: 'manual',
        status: 'active',
      }
      const { data: proj, error: pErr } = await supabase.from('projects').insert(row).select().single()
      if (pErr) throw pErr
      toast.success('Project created · ' + uid)
      fetchProjects()
      openBuilder(proj)
    } catch (e) {
      toast.error('Failed: ' + (e.message || 'unknown'))
    } finally {
      setNpSaving(false)
    }
  }

  // ---------- builder ----------
  function openBuilder(proj) {
    setActiveProject(proj)
    setItems([blankItem()]); setNotes('')
    setVatEnabled(tpl?.default_vat_enabled ?? true)
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
    const validItems = items.filter(it => it.desc.trim())
    if (validItems.length === 0) { toast.error('Add at least one line item'); return }
    setSaving(true)
    try {
      const { data: seq, error: seqErr } = await supabase.rpc('fn_next_quote_seq', { p_company_id: company.id })
      if (seqErr) throw seqErr
      const prefix = tpl?.quote_prefix || 'QTN'
      const quoteNumber = `${prefix}-${String(seq).padStart(3,'0')}`

      const { data: q, error: qErr } = await supabase.from('quotations').insert({
        company_id: company.id,
        quote_number: quoteNumber,
        project_id: activeProject?.id || null,
        source_uid: activeProject?.code || null,
        client_name: activeProject?.client_name || null,
        client_phone: activeProject?.client_phone || null,
        project_title: activeProject?.name || null,
        mode: 'simple',
        status: sendNow ? 'sent' : 'draft',
        current_revision: 0,
      }).select().single()
      if (qErr) throw qErr

      const { error: rErr } = await supabase.from('quotation_revisions').insert({
        quotation_id: q.id,
        rev_number: 0,
        items: validItems.map(it => ({ desc:it.desc.trim(), qty:Number(it.qty)||0, rate:Number(it.rate)||0 })),
        discount_type: discountType,
        discount_value: Number(discountValue)||0,
        discount_amount: discountAmount,
        subtotal, vat_enabled: vatEnabled, vat_amount: vatAmount, total: grandTotal,
        why_choose_us: tpl?.why_choose_us || null,
        terms: tpl?.default_terms || null,
        payment_schedule: tpl?.payment_schedule || [],
        notes: notes.trim() || null,
        is_locked: !!sendNow,
        sent_at: sendNow ? new Date().toISOString() : null,
      })
      if (rErr) throw rErr

      // mark project as quoted
      if (activeProject?.id) {
        await supabase.from('projects').update({ status:'quoted' }).eq('id', activeProject.id)
      }
      toast.success(sendNow ? 'Quotation sent ✓' : 'Draft saved ✓')
      setView('list'); fetchQuotes()
    } catch (e) {
      toast.error('Save failed: ' + (e.message || 'unknown'))
    } finally { setSaving(false) }
  }

  // ---------- derived ----------
  let list = quotes
  if (filter !== 'all') list = list.filter(q => (q.status||'draft')===filter)
  if (search.trim()) {
    const s = search.toLowerCase()
    list = list.filter(q => q.quote_number?.toLowerCase().includes(s) || q.client_name?.toLowerCase().includes(s)
      || q.project_title?.toLowerCase().includes(s) || q.source_uid?.toLowerCase().includes(s))
  }
  const total   = quotes.length
  const sentCnt = quotes.filter(q => (q.status||'draft')==='sent').length
  const apprCnt = quotes.filter(q => (q.status||'draft')==='approved').length
  const apprVal = quotes.filter(q => (q.status||'draft')==='approved').reduce((s,q)=> s+(q._total||0),0)
  const fmtShort = n => n>=1000 ? (n/1000).toFixed(n%1000===0?0:1)+'k' : String(Math.round(n))

  let projList = projects
  if (projSearch.trim()) {
    const s = projSearch.toLowerCase()
    projList = projList.filter(p => p.client_name?.toLowerCase().includes(s) || p.name?.toLowerCase().includes(s)
      || p.code?.toLowerCase().includes(s) || p.client_phone?.toLowerCase().includes(s))
  }

  // ---------- theme ----------
  const text=isDark?'#f1f5f9':'#0f172a', textSub=isDark?'#94a3b8':'#64748b', textMuted=isDark?'#475569':'#94a3b8'
  const border=isDark?'rgba(255,255,255,0.08)':'#e2e8f0', cardBg=isDark?'#1e293b':'#ffffff'
  const subBg=isDark?'rgba(255,255,255,0.04)':'#f8fafc', pillBg=isDark?'rgba(255,255,255,0.05)':'#fff', inputBg=isDark?'#0f172a':'#fff'
  const inputStyle = { padding:'9px 11px', border:`1px solid ${border}`, borderRadius:8, fontSize:13, background:inputBg, color:text, outline:'none', width:'100%' }
  const initials = nm => nm ? nm.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '?'

  const backBtn = (onClick) => (
    <button onClick={onClick} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
    </button>
  )

  // ============ SELECT STEP ============
  if (view === 'select') {
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          {backBtn(() => setView('list'))}
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:19, fontWeight:700, color:text, margin:0 }}>New Quotation</h1>
            <div style={{ fontSize:12, color:textMuted }}>Step 1 — choose who it's for</div>
          </div>
        </div>

        <div style={{ fontSize:13, color:textSub, marginBottom:8 }}>Select a lead or project</div>
        <div style={{ position:'relative', marginBottom:12 }}>
          <input value={projSearch} onChange={e=>setProjSearch(e.target.value)} placeholder="Type a name, phone or UID..."
            style={{ ...inputStyle, paddingLeft:34 }} />
          <i className="ti ti-search" style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', fontSize:15, color:textMuted }}/>
        </div>

        {projList.length > 0 ? (
          <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:14 }}>
            {projList.map((p, i) => (
              <div key={p.id} onClick={() => openBuilder(p)}
                style={{ display:'flex', alignItems:'center', gap:11, padding:'10px 13px', cursor:'pointer', borderTop: i>0?`1px solid ${border}`:'none' }}
                onMouseEnter={e=>e.currentTarget.style.background=subBg}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{ width:34, height:34, borderRadius:8, background:subBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:textSub, flexShrink:0 }}>{initials(p.client_name)}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:text }}>{p.client_name}</div>
                  <div style={{ fontSize:11, color:textSub, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.name || '—'}{p.location?' · '+p.location:''}{p.source && p.source!=='manual'?' · from '+p.source:''}
                  </div>
                </div>
                <span style={{ fontSize:10, color:'#0077a3', background: isDark?'rgba(3,193,245,0.12)':'#e0f9ff', padding:'2px 8px', borderRadius:99, fontFamily:'monospace', flexShrink:0 }}>{p.code}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign:'center', padding:'24px', color:textMuted, fontSize:13, background:cardBg, border:`1px solid ${border}`, borderRadius:10, marginBottom:14 }}>
            {projects.length===0 ? 'No projects yet — add your first below.' : 'No match found.'}
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:10, margin:'14px 0' }}>
          <div style={{ flex:1, height:1, background:border }}/>
          <span style={{ fontSize:11, color:textMuted }}>or</span>
          <div style={{ flex:1, height:1, background:border }}/>
        </div>

        <button onClick={openNewProject}
          style={{ width:'100%', padding:'11px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
          <i className="ti ti-plus" style={{ fontSize:15 }}/> Add new project / lead
        </button>
        <div style={{ fontSize:11, color:textMuted, textAlign:'center', marginTop:8 }}>A new project gets its own UID automatically</div>
      </div>
    )
  }

  // ============ NEW PROJECT FORM ============
  if (view === 'newproject') {
    const optRow = (key, label, value, setter, type='text') => (
      <div style={{ display:'flex', alignItems:'center', gap:10, background:cardBg, border:`1px solid ${npOpt[key]?'#0099cc':border}`, borderRadius:8, padding:'8px 11px', opacity: npOpt[key]?1:0.6 }}>
        <input type="checkbox" checked={npOpt[key]} onChange={e=>setNpOpt(o=>({...o,[key]:e.target.checked}))} style={{ width:'auto', flexShrink:0 }}/>
        <label style={{ fontSize:12, color:textSub, width:80, flexShrink:0 }}>{label}</label>
        <input type={type} value={value} onChange={e=>setter(e.target.value)} disabled={!npOpt[key]}
          placeholder={npOpt[key]?'':'Not included'} style={{ ...inputStyle, padding:'7px 9px', fontSize:12.5 }}/>
      </div>
    )
    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
          {backBtn(() => setView('select'))}
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:19, fontWeight:700, color:text, margin:0 }}>New Project / Lead</h1>
            <div style={{ fontSize:12, color:textMuted }}>UID will be assigned on save</div>
          </div>
          <span style={{ fontSize:10, color:textMuted, background:subBg, padding:'3px 9px', borderRadius:99, fontFamily:'monospace' }}>TD-{company?.company_code||'····'}-····</span>
        </div>

        <div style={{ fontSize:11, color:textMuted, textTransform:'uppercase', letterSpacing:'.4px', margin:'14px 0 8px' }}>Required</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div>
            <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:4 }}>Client name <span style={{ color:'#dc2626' }}>*</span></label>
            <input value={npName} onChange={e=>setNpName(e.target.value)} placeholder="e.g. Mr. Ankit" style={inputStyle}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:4 }}>Phone <span style={{ color:'#dc2626' }}>*</span></label>
              <input value={npPhone} onChange={e=>setNpPhone(e.target.value)} placeholder="+971 50 ..." style={inputStyle}/>
            </div>
            <div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:4 }}>Project type <span style={{ color:'#dc2626' }}>*</span></label>
              <input value={npType} onChange={e=>setNpType(e.target.value)} placeholder="e.g. Interior Fit-Out" style={inputStyle}/>
            </div>
          </div>
        </div>

        <div style={{ fontSize:11, color:textMuted, textTransform:'uppercase', letterSpacing:'.4px', margin:'18px 0 8px' }}>
          Optional <span style={{ textTransform:'none', letterSpacing:0 }}>· tick to include</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {optRow('location','Location', npLocation, setNpLocation)}
          {optRow('email','Email', npEmail, setNpEmail)}
          {optRow('budget','Budget', npBudget, setNpBudget, 'number')}
        </div>

        <div style={{ display:'flex', gap:8, marginTop:16 }}>
          <button onClick={()=>setView('select')} disabled={npSaving}
            style={{ flex:1, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:'transparent', color:textSub, fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={saveProject} disabled={npSaving}
            style={{ flex:2, padding:'11px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <i className="ti ti-check" style={{ fontSize:15, verticalAlign:'-2px', marginRight:4 }}/> {npSaving?'Saving...':'Save & continue to quote'}
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
          {backBtn(() => setView('list'))}
          <div style={{ flex:1 }}>
            <h1 style={{ fontSize:19, fontWeight:700, color:text, margin:0 }}>New Quotation</h1>
            <div style={{ fontSize:12, color:textMuted }}>Simple mode · Rev 0</div>
          </div>
          <span style={{ fontSize:11, color:'#0077a3', background:isDark?'rgba(3,193,245,0.15)':'#e0f9ff', padding:'4px 11px', borderRadius:99, fontWeight:600 }}>Simple</span>
        </div>

        {/* Client strip */}
        {activeProject && (
          <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, padding:'10px 13px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:8, background:isDark?'rgba(3,193,245,0.12)':'#e0f9ff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, color:'#0077a3' }}>{initials(activeProject.client_name)}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:text }}>{activeProject.client_name}{activeProject.name?' · '+activeProject.name:''}</div>
              <div style={{ fontSize:11, color:textSub }}>{activeProject.client_phone||''}{activeProject.location?' · '+activeProject.location:''}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, color:textMuted, fontFamily:'monospace' }}>{activeProject.code}</div>
              <div style={{ fontSize:10, color:'#0077a3', fontFamily:'monospace' }}>Ref pending</div>
            </div>
          </div>
        )}

        {/* Items */}
        <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:10, overflow:'hidden', marginBottom:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 90px 96px 30px', gap:8, padding:'9px 12px', background:subBg, fontSize:11, color:textSub, textTransform:'uppercase', letterSpacing:'.3px' }}>
            <span>Description</span><span>Qty</span><span>Rate</span><span style={{ textAlign:'right' }}>Total</span><span/>
          </div>
          {items.map((it, idx) => {
            const lt = (Number(it.qty)||0)*(Number(it.rate)||0)
            return (
              <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 60px 90px 96px 30px', gap:8, padding:'8px 12px', alignItems:'center', borderTop:`1px solid ${border}` }}>
                <input value={it.desc} onChange={e=>updateItem(idx,'desc',e.target.value)} placeholder="Item description" style={{ ...inputStyle, padding:'7px 9px', fontSize:12.5 }}/>
                <input type="number" value={it.qty} onChange={e=>updateItem(idx,'qty',e.target.value)} style={{ ...inputStyle, padding:'7px 9px', fontSize:12.5 }}/>
                <input type="number" value={it.rate} onChange={e=>updateItem(idx,'rate',e.target.value)} style={{ ...inputStyle, padding:'7px 9px', fontSize:12.5 }}/>
                <span style={{ textAlign:'right', fontSize:13, color:text }}>{Math.round(lt).toLocaleString('en-AE')}</span>
                <button onClick={()=>removeItem(idx)} style={{ background:'none', border:'none', cursor:'pointer', color:textMuted, display:'flex', justifyContent:'center' }}><i className="ti ti-x" style={{ fontSize:15 }}/></button>
              </div>
            )
          })}
          <div style={{ padding:'9px 12px', borderTop:`1px solid ${border}` }}>
            <button onClick={addItem} style={{ fontSize:12, padding:'6px 12px', border:`1px solid ${border}`, borderRadius:7, background:'none', color:'#0099cc', cursor:'pointer', fontWeight:600 }}>
              <i className="ti ti-plus" style={{ fontSize:13, verticalAlign:'-2px', marginRight:3 }}/> Add line item
            </button>
          </div>
        </div>

        {/* Discount/VAT + Totals */}
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
          <button onClick={()=>saveQuote(false)} disabled={saving} style={{ flex:1, minWidth:100, padding:'11px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>{saving?'Saving...':'Save draft'}</button>
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
        <button onClick={startNewQuote} style={{ padding:'9px 16px', background:'#0099cc', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
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
          {quotes.length===0 && <button onClick={startNewQuote} style={{ padding:'10px 18px', background:'#0099cc', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>+ New Quotation</button>}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
          {list.map(q => {
            const st = STATUS_STYLE[q.status||'draft']||STATUS_STYLE.draft
            const md = MODE_STYLE[q.mode||'simple']||MODE_STYLE.simple
            return (
              <div key={q.id} onClick={()=>toast.info('Quote detail/edit opens in the next step')}
                style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', transition:'all .15s' }}
                onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow=isDark?'0 4px 16px rgba(0,0,0,0.3)':'0 2px 12px rgba(0,0,0,0.06)' }}
                onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ width:42, height:42, borderRadius:10, background:subBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><i className="ti ti-file-text" style={{ fontSize:19, color:textSub }}/></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:text, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    {q.quote_number||'Untitled'}
                    <span style={{ fontSize:11, color:md.color, background:isDark?md.color+'22':md.bg, padding:'1px 8px', borderRadius:99 }}>{md.label}</span>
                    {q.source_uid && <span style={{ fontSize:10, color:textMuted, fontFamily:'monospace' }}>{q.source_uid}</span>}
                  </div>
                  <div style={{ fontSize:12, color:textSub, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {q.client_name||'No client'}{q.project_title?' · '+q.project_title:''} · Rev {q.current_revision??0}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:text }}>{fmt(q._total)}</div>
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
