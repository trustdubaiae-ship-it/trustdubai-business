import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

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

export default function Quotations() {
  const { company } = useAuth()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const [, forceUpdate] = useState(0)
  const [quotes, setQuotes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')

  useEffect(() => {
    if (company?.id) fetchQuotes()
    const observer = new MutationObserver(() => forceUpdate(n => n + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [company?.id])

  async function fetchQuotes() {
    setLoading(true)
    // Fetch quotations + their revisions (to get current revision's total/mode)
    const { data: qs } = await supabase
      .from('quotations')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })

    if (!qs || qs.length === 0) { setQuotes([]); setLoading(false); return }

    const ids = qs.map(q => q.id)
    const { data: revs } = await supabase
      .from('quotation_revisions')
      .select('quotation_id, rev_number, total')
      .in('quotation_id', ids)

    // map current revision total per quotation
    const merged = qs.map(q => {
      const cur = (revs || []).find(r => r.quotation_id === q.id && r.rev_number === q.current_revision)
      return { ...q, _total: cur?.total || 0 }
    })
    setQuotes(merged)
    setLoading(false)
  }

  function newQuote() {
    // Phase A-part2: builder open hoga. Abhi placeholder.
    alert('Quotation builder is coming in the next step.')
  }

  // ---- derived ----
  let list = quotes
  if (filter !== 'all') list = list.filter(q => (q.status || 'draft') === filter)
  if (search.trim()) {
    const s = search.toLowerCase()
    list = list.filter(q =>
      q.quote_number?.toLowerCase().includes(s) ||
      q.client_name?.toLowerCase().includes(s) ||
      q.project_title?.toLowerCase().includes(s) ||
      q.project_ref?.toLowerCase().includes(s)
    )
  }

  const total    = quotes.length
  const sentCnt  = quotes.filter(q => (q.status||'draft') === 'sent').length
  const apprCnt  = quotes.filter(q => (q.status||'draft') === 'approved').length
  const apprVal  = quotes.filter(q => (q.status||'draft') === 'approved').reduce((s,q) => s + (q._total||0), 0)

  function fmtShort(n) {
    if (n >= 1000) return (n/1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k'
    return String(Math.round(n))
  }
  function fmtFull(n) {
    return 'AED ' + Math.round(n).toLocaleString('en-AE')
  }

  // ---- theme tokens ----
  const text      = isDark ? '#f1f5f9' : '#0f172a'
  const textSub   = isDark ? '#94a3b8' : '#64748b'
  const textMuted = isDark ? '#475569' : '#94a3b8'
  const border    = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
  const cardBg    = isDark ? '#1e293b' : '#ffffff'
  const subBg     = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'
  const pillBg    = isDark ? 'rgba(255,255,255,0.05)' : '#fff'

  const STATS = [
    { label:'Total quotes',   value: total,             color: text },
    { label:'Sent',           value: sentCnt,           color:'#d97706' },
    { label:'Approved',       value: apprCnt,           color:'#0f6e56' },
    { label:'Approved value', value: fmtShort(apprVal), color: text },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:18, flexWrap:'wrap' }}>
        <div>
          <h1 style={{ fontSize:21, fontWeight:700, color:text, margin:0 }}>Quotations</h1>
          <p style={{ fontSize:13, color:textSub, marginTop:3 }}>Create, send &amp; track your quotes · {total} total</p>
        </div>
        <button onClick={newQuote}
          style={{ padding:'9px 16px', background:'#0099cc', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
          <i className="ti ti-plus" style={{ fontSize:15 }}/> New Quotation
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background:subBg, borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:12, color:textSub }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:s.color, marginTop:2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search quote number, client..."
          style={{ flex:1, minWidth:200, padding:'9px 12px', border:`1px solid ${border}`, borderRadius:9, fontSize:13, background:cardBg, color:text, outline:'none' }} />
        <div style={{ display:'inline-flex', background:pillBg, border:`1px solid ${border}`, borderRadius:99, padding:3 }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ fontSize:12, fontWeight: filter===f?600:400, padding:'5px 13px', borderRadius:99, border:'none', cursor:'pointer',
                background: filter===f ? (isDark?'rgba(3,193,245,0.15)':'#e0f9ff') : 'transparent',
                color: filter===f ? '#0099cc' : textMuted, textTransform:'capitalize' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
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
            {quotes.length === 0
              ? 'Create your first quotation and send it to a client in minutes.'
              : 'Try a different status filter or search term.'}
          </p>
          {quotes.length === 0 && (
            <button onClick={newQuote}
              style={{ padding:'10px 18px', background:'#0099cc', color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>
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
              <div key={q.id}
                onClick={() => alert('Quote detail/builder opens here in the next step.')}
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
                  <div style={{ fontSize:14, fontWeight:600, color:text }}>{fmtFull(q._total)}</div>
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
