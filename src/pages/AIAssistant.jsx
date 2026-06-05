// trustdubai-business/src/pages/AIAssistant.jsx
import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/* =========================================================================
   AI ASSISTANT (Phase A) — reads leads, drafts an AI reply + scores each,
   owner sends via WhatsApp / copies. Calls Edge Function 'smart-function'.
   Fully responsive + light/dark. Gated by CRM add-on (sidebar).
   ========================================================================= */

const TEMP = {
  hot:  { label: 'Hot',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  warm: { label: 'Warm', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  cold: { label: 'Cold', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
}

// pull a field from a lead row or its answers JSON
function field(lead, keys) {
  for (const k of keys) {
    if (lead[k]) return lead[k]
    if (lead.answers && typeof lead.answers === 'object' && lead.answers[k]) return lead.answers[k]
  }
  return ''
}

export default function AIAssistant({ onNavigate }) {
  const { company } = useAuth()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null)     // selected lead id
  const [ai, setAi] = useState({})               // { [leadId]: {reply, score, temperature, reason, loading, error, edited} }
  const [toast, setToast] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')    // all | hot | warm | cold

  useEffect(() => { if (company?.id != null) load() }, [company?.id])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('lead_submissions')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setLeads(data || [])
      if (data && data.length) setActive(prev => prev ?? data[0].id)
    } catch (e) { console.error('AIAssistant load', e) }
    finally { setLoading(false) }
  }

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 2000) }

  async function generate(lead) {
    setAi(s => ({ ...s, [lead.id]: { ...(s[lead.id]||{}), loading: true, error: '' } }))
    try {
      const payload = {
        action: 'both',
        companyName: company?.name || 'our company',
        companyCategory: company?.category || '',
        lead: {
          name: field(lead, ['name']),
          message: field(lead, ['message', 'enquiry', 'note', 'notes']),
          budget: field(lead, ['budget']),
          area: field(lead, ['area', 'location']),
          project_type: field(lead, ['project_type', 'scope', 'service']),
          source: field(lead, ['source']),
          phone: field(lead, ['phone']),
        },
      }
      const { data, error } = await supabase.functions.invoke('smart-function', { body: payload })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setAi(s => ({ ...s, [lead.id]: {
        loading: false, error: '',
        reply: data.reply || '',
        edited: data.reply || '',
        score: data.score, temperature: data.temperature, reason: data.reason,
      }}))
    } catch (e) {
      console.error('generate', e)
      const msg = (e?.message || '').includes('402') || (e?.message||'').toLowerCase().includes('credit')
        ? 'AI needs API credit. Add credit in your Anthropic account, then retry.'
        : 'Could not generate. Please retry.'
      setAi(s => ({ ...s, [lead.id]: { ...(s[lead.id]||{}), loading: false, error: msg } }))
    }
  }

  function waLink(lead, text) {
    const phone = (field(lead, ['phone']) || '').replace(/[^\d]/g, '')
    const msg = encodeURIComponent(text || '')
    return phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`
  }

  function copyText(t) {
    try { navigator.clipboard.writeText(t || ''); showToast('Copied ✓') } catch { showToast('Copy failed') }
  }

  const activeLead = leads.find(l => l.id === active) || null
  const a = activeLead ? ai[activeLead.id] : null

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize:'clamp(20px,5vw,26px)', fontWeight:800, color:'var(--text)', margin:0, display:'flex', alignItems:'center', gap:9 }}>
          <i className="ti ti-robot" style={{ color:'#22c55e' }}/> AI Assistant
        </h1>
        <p style={{ fontSize:13, color:'var(--text2)', margin:'4px 0 0' }}>AI drafts a reply and scores each lead. Review, then send on WhatsApp.</p>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}>
          <div style={{ width:32, height:32, border:'3px solid #22c55e', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : leads.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'48px 20px', textAlign:'center' }}>
          <i className="ti ti-inbox" style={{ fontSize:34, color:'var(--text3)', display:'block', marginBottom:10 }}/>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>No leads yet</div>
          <div style={{ fontSize:13, color:'var(--text2)', marginBottom:18 }}>When leads arrive, AI will draft replies here.</div>
          <button onClick={() => onNavigate && onNavigate('leadengine')} style={btnPrimary}>Go to Lead Engine</button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,300px) minmax(0,1fr)', gap:16, alignItems:'start' }}>
          {/* lead list */}
          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'74vh' }}>
            {/* search */}
            <div style={{ display:'flex', alignItems:'center', gap:7, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 11px' }}>
              <i className="ti ti-search" style={{ fontSize:14, color:'var(--text3)' }}/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…"
                style={{ border:'none', background:'none', outline:'none', fontSize:13, width:'100%', color:'var(--text)' }}/>
              {search && <i className="ti ti-x" onClick={() => setSearch('')} style={{ fontSize:14, color:'var(--text3)', cursor:'pointer' }}/>}
            </div>
            {/* filter chips */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[['all','All'],['hot','Hot'],['warm','Warm'],['cold','Cold']].map(([k,label]) => {
                const on = filter === k
                const c = TEMP[k]?.color || '#22c55e'
                return (
                  <button key={k} onClick={() => setFilter(k)}
                    style={{ fontSize:11.5, fontWeight:600, padding:'5px 11px', borderRadius:8, cursor:'pointer',
                      background: on ? (TEMP[k]?.bg || 'rgba(34,197,94,0.12)') : 'transparent',
                      color: on ? c : 'var(--text2)', border: on ? `1px solid ${c}` : '1px solid var(--border)' }}>
                    {label}
                  </button>
                )
              })}
            </div>
            {/* list (scrolls) */}
            <div style={{ display:'flex', flexDirection:'column', gap:6, overflowY:'auto', paddingRight:2 }}>
            {leads
              .filter(l => {
                const q = search.trim().toLowerCase()
                if (q) {
                  const hay = `${field(l,['name'])} ${field(l,['message','enquiry','note','notes'])} ${field(l,['phone'])}`.toLowerCase()
                  if (!hay.includes(q)) return false
                }
                if (filter !== 'all') {
                  if (ai[l.id]?.temperature !== filter) return false
                }
                return true
              })
              .map(l => {
              const on = l.id === active
              const nm = field(l, ['name']) || 'Unknown'
              const msg = field(l, ['message','enquiry','note','notes'])
              const t = ai[l.id]?.temperature ? TEMP[ai[l.id].temperature] : null
              return (
                <div key={l.id} onClick={() => setActive(l.id)}
                  style={{ background: on?'var(--card)':'var(--card)', border: on?'1.5px solid #22c55e':'1px solid var(--border)', borderRadius:12, padding:'11px 13px', cursor:'pointer' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:13.5, fontWeight:700, color:'var(--text)', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{nm}</span>
                    {t && <span style={{ fontSize:9.5, fontWeight:700, color:t.color, background:t.bg, borderRadius:99, padding:'1px 7px' }}>{ai[l.id].score ?? ''} {t.label}</span>}
                  </div>
                  {msg && <div style={{ fontSize:11.5, color:'var(--text2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{msg}</div>}
                </div>
              )
            })}
            </div>
          </div>

          {/* detail + AI */}
          {!activeLead ? (
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:40, textAlign:'center', color:'var(--text2)' }}>Select a lead.</div>
          ) : (
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'clamp(15px,3vw,22px)' }}>
              {/* lead header */}
              <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:14, flexWrap:'wrap' }}>
                <span style={{ width:42, height:42, borderRadius:10, background:'rgba(34,197,94,0.14)', color:'#16a34a', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:16, flexShrink:0 }}>
                  {(field(activeLead,['name'])||'?')[0].toUpperCase()}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>{field(activeLead,['name'])||'Unknown'}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>
                    {[field(activeLead,['phone']), field(activeLead,['area','location'])].filter(Boolean).join(' · ') || 'No contact info'}
                  </div>
                </div>
                {a?.temperature && (
                  <span style={{ fontSize:11, fontWeight:700, color:TEMP[a.temperature].color, background:TEMP[a.temperature].bg, borderRadius:99, padding:'4px 12px' }}>
                    {a.score != null ? `Score ${a.score} · ` : ''}{TEMP[a.temperature].label}
                  </span>
                )}
              </div>

              {/* lead detail chips */}
              <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:14 }}>
                {field(activeLead,['budget']) && <Chip icon="ti-coin" text={`Budget: ${field(activeLead,['budget'])}`} />}
                {field(activeLead,['project_type','scope','service']) && <Chip icon="ti-tool" text={field(activeLead,['project_type','scope','service'])} />}
                {field(activeLead,['source']) && <Chip icon="ti-route" text={field(activeLead,['source'])} />}
              </div>

              {/* lead message */}
              {field(activeLead,['message','enquiry','note','notes']) && (
                <>
                  <div style={lblUp}>Lead message</div>
                  <div style={{ background:'var(--bg2,rgba(127,127,127,0.06))', border:'1px solid var(--border)', borderRadius:10, padding:'11px 13px', fontSize:13, color:'var(--text)', marginBottom:16, whiteSpace:'pre-wrap' }}>
                    {field(activeLead,['message','enquiry','note','notes'])}
                  </div>
                </>
              )}

              {/* AI section */}
              {!a || (!a.reply && !a.loading && !a.error) ? (
                <div style={{ textAlign:'center', padding:'24px 0' }}>
                  <button onClick={() => generate(activeLead)} style={{ ...btnPrimary, margin:'0 auto' }}>
                    <i className="ti ti-sparkles" style={{ fontSize:16 }}/> Generate AI reply
                  </button>
                  <div style={{ fontSize:11.5, color:'var(--text3)', marginTop:10 }}>AI will draft a reply and score this lead.</div>
                </div>
              ) : a.loading ? (
                <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center', padding:'24px 0', color:'var(--text2)', fontSize:13 }}>
                  <div style={{ width:20, height:20, border:'2px solid #22c55e', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
                  AI is thinking…
                </div>
              ) : a.error ? (
                <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:10, padding:'13px 15px' }}>
                  <div style={{ fontSize:13, color:'#ef4444', fontWeight:600, marginBottom:6 }}><i className="ti ti-alert-triangle" style={{ verticalAlign:'-2px' }}/> {a.error}</div>
                  <button onClick={() => generate(activeLead)} style={btnGhost}><i className="ti ti-refresh" style={{ fontSize:14 }}/> Retry</button>
                </div>
              ) : (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                    <i className="ti ti-sparkles" style={{ fontSize:14, color:'#22c55e' }}/>
                    <span style={lblUp}>AI-drafted reply</span>
                    {a.reason && <span style={{ fontSize:11, color:'var(--text3)', marginLeft:'auto' }}>{a.reason}</span>}
                  </div>
                  <textarea value={a.edited} onChange={e => setAi(s => ({ ...s, [activeLead.id]: { ...s[activeLead.id], edited: e.target.value } }))}
                    rows={4} style={{ width:'100%', background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:10, padding:'12px 14px', fontSize:13.5, color:'var(--text)', lineHeight:1.55, resize:'vertical', minHeight:90, outline:'none', boxSizing:'border-box', fontFamily:'inherit', marginBottom:12 }}/>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <a href={waLink(activeLead, a.edited)} target="_blank" rel="noreferrer" style={{ ...btnPrimary, textDecoration:'none' }}>
                      <i className="ti ti-brand-whatsapp" style={{ fontSize:16 }}/> Send on WhatsApp
                    </a>
                    <button onClick={() => copyText(a.edited)} style={btnGhost}><i className="ti ti-copy" style={{ fontSize:15 }}/> Copy</button>
                    <button onClick={() => generate(activeLead)} style={btnGhost}><i className="ti ti-refresh" style={{ fontSize:15 }}/> Regenerate</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#0f172a', color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:300 }}>{toast}</div>
      )}
    </div>
  )
}

function Chip({ icon, text }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, color:'var(--text2)', background:'var(--bg2,rgba(127,127,127,0.06))', border:'1px solid var(--border)', borderRadius:8, padding:'4px 9px' }}>
      <i className={`ti ${icon}`} style={{ fontSize:13 }}/> {text}
    </span>
  )
}

const lblUp = { fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }
const btnPrimary = { display:'inline-flex', alignItems:'center', gap:6, padding:'10px 16px', borderRadius:10, border:'none', background:'#22c55e', color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer' }
const btnGhost = { display:'inline-flex', alignItems:'center', gap:6, padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:13.5, fontWeight:600, cursor:'pointer' }
