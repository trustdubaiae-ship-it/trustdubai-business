// trustdubai-business/src/pages/AIAssistant.jsx
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/* =========================================================================
   AI ASSISTANT — lead conversation thread + AI suggested reply.
   - Left: searchable / filterable lead list
   - Right: chat thread (in/out) + AI suggestion (reads full thread) + composer
   Calls Edge Function 'smart-function'. Stores thread in lead_conversations.
   Fully responsive + light/dark. Gated by CRM/AI add-on (sidebar).
   ========================================================================= */

const TEMP = {
  hot:  { label: 'Hot',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  warm: { label: 'Warm', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  cold: { label: 'Cold', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
}

function field(lead, keys) {
  for (const k of keys) {
    if (lead[k]) return lead[k]
    if (lead.answers && typeof lead.answers === 'object' && lead.answers[k]) return lead.answers[k]
  }
  return ''
}

export default function AIAssistant({ onNavigate }) {
  const { company, user } = useAuth()
  const companyId = company?.id != null ? String(company.id) : null
  const ownerEmail = user?.email || ''

  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const [thread, setThread] = useState([])         // conversation rows for active lead
  const [threadLoading, setThreadLoading] = useState(false)
  const [scoreMap, setScoreMap] = useState({})     // { leadId: {score, temperature} }

  const [suggestion, setSuggestion] = useState('') // AI suggested reply text
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const [draft, setDraft] = useState('')           // composer text
  const [incoming, setIncoming] = useState('')     // quick "lead said" box
  const [toast, setToast] = useState('')
  const threadEndRef = useRef(null)

  useEffect(() => { if (companyId) loadLeads() }, [companyId])
  useEffect(() => { if (active) loadThread(active) }, [active])
  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [thread])

  async function loadLeads() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('lead_submissions').select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false }).limit(80)
      if (error) throw error
      setLeads(data || [])
      if (data && data.length) setActive(prev => prev ?? data[0].id)
    } catch (e) { console.error('loadLeads', e) }
    finally { setLoading(false) }
  }

  async function loadThread(leadId) {
    setThreadLoading(true); setSuggestion(''); setAiError('')
    try {
      const { data, error } = await supabase
        .from('lead_conversations').select('*')
        .eq('lead_id', leadId).order('created_at', { ascending: true })
      if (error) throw error
      let rows = data || []
      // seed first incoming from the lead's original message if thread empty
      if (rows.length === 0) {
        const lead = leads.find(l => l.id === leadId)
        const firstMsg = lead ? field(lead, ['message','enquiry','note','notes']) : ''
        if (firstMsg) {
          const seed = { lead_id: leadId, company_id: companyId, direction: 'in', message: firstMsg, channel: 'manual', created_by: ownerEmail }
          const { data: ins } = await supabase.from('lead_conversations').insert(seed).select()
          rows = ins || []
        }
      }
      setThread(rows)
    } catch (e) { console.error('loadThread', e) }
    finally { setThreadLoading(false) }
  }

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 2000) }

  async function addMessage(direction, message, channel = 'manual') {
    if (!message.trim() || !active) return
    try {
      const row = { lead_id: active, company_id: companyId, direction, message: message.trim(), channel, created_by: ownerEmail }
      const { data, error } = await supabase.from('lead_conversations').insert(row).select()
      if (error) throw error
      setThread(t => [...t, ...(data || [])])
    } catch (e) { console.error('addMessage', e); showToast('Could not save message') }
  }

  async function suggestReply() {
    if (!active) return
    setAiLoading(true); setAiError(''); setSuggestion('')
    try {
      const lead = leads.find(l => l.id === active)
      // build conversation text for context
      const convo = thread.map(m => `${m.direction === 'in' ? 'Customer' : 'Us'}: ${m.message}`).join('\n')
      const payload = {
        action: 'both',
        companyName: company?.name || 'our company',
        companyCategory: company?.category || '',
        lead: {
          name: field(lead, ['name']),
          message: convo || field(lead, ['message','enquiry','note','notes']),
          budget: field(lead, ['budget']),
          area: field(lead, ['area','location']),
          project_type: field(lead, ['project_type','scope','service']),
          source: field(lead, ['source']),
          phone: field(lead, ['phone']),
        },
      }
      const { data, error } = await supabase.functions.invoke('smart-function', { body: payload })
      if (error) throw error
      if (data?.error) {
        const code = data.code || ''
        const msg = code === 'no_credit' ? 'AI needs credit. Add credit to your Anthropic account to enable AI replies.'
          : code === 'bad_key'   ? 'AI key issue. Please re-check the API key in settings.'
          : code === 'rate_limit'? 'Too many requests right now. Wait a moment and retry.'
          : (data.detail || 'Could not generate. Please retry.')
        const e = new Error(msg); e.handled = true; throw e
      }
      setSuggestion(data.reply || '')
      setDraft(data.reply || '')
      if (data.score != null || data.temperature) {
        setScoreMap(s => ({ ...s, [active]: { score: data.score, temperature: data.temperature } }))
      }
    } catch (e) {
      console.error('suggestReply', e)
      const msg = e?.handled ? e.message
        : ((e?.message || '').toLowerCase().includes('credit') ? 'AI needs credit. Add credit to your Anthropic account to enable AI replies.'
          : 'Could not generate. Please retry.')
      setAiError(msg)
    } finally { setAiLoading(false) }
  }

  async function sendReply() {
    const text = draft.trim()
    if (!text) return
    await addMessage('out', text, 'manual')
    const lead = leads.find(l => l.id === active)
    const phone = (field(lead, ['phone']) || '').replace(/[^\d]/g, '')
    const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    setDraft(''); setSuggestion('')
  }

  const activeLead = leads.find(l => l.id === active) || null

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize:'clamp(20px,5vw,26px)', fontWeight:800, color:'var(--text)', margin:0, display:'flex', alignItems:'center', gap:9 }}>
          <i className="ti ti-robot" style={{ color:'#22c55e' }}/> AI Assistant
        </h1>
        <p style={{ fontSize:13, color:'var(--text2)', margin:'4px 0 0' }}>Lead conversations with AI-suggested replies. AI reads the whole thread.</p>
      </div>

      {loading ? (
        <Spinner/>
      ) : leads.length === 0 ? (
        <Empty onNavigate={onNavigate}/>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,300px) minmax(0,1fr)', gap:14, alignItems:'start' }}>
          {/* lead list */}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 11px' }}>
              <i className="ti ti-search" style={{ fontSize:14, color:'var(--text3)' }}/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…"
                style={{ border:'none', background:'none', outline:'none', fontSize:13, width:'100%', color:'var(--text)' }}/>
              {search && <i className="ti ti-x" onClick={() => setSearch('')} style={{ fontSize:14, color:'var(--text3)', cursor:'pointer' }}/>}
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[['all','All'],['hot','Hot'],['warm','Warm'],['cold','Cold']].map(([k,label]) => {
                const on = filter === k; const c = TEMP[k]?.color || '#22c55e'
                return (
                  <button key={k} onClick={() => setFilter(k)}
                    style={{ fontSize:11.5, fontWeight:600, padding:'5px 11px', borderRadius:8, cursor:'pointer',
                      background: on ? (TEMP[k]?.bg || 'rgba(34,197,94,0.12)') : 'transparent',
                      color: on ? c : 'var(--text2)', border: on ? `1px solid ${c}` : '1px solid var(--border)' }}>{label}</button>
                )
              })}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:'66vh', overflowY:'auto', paddingRight:2 }}>
              {leads.filter(l => {
                const q = search.trim().toLowerCase()
                if (q) {
                  const hay = `${field(l,['name'])} ${field(l,['message','enquiry','note','notes'])} ${field(l,['phone'])}`.toLowerCase()
                  if (!hay.includes(q)) return false
                }
                if (filter !== 'all' && scoreMap[l.id]?.temperature !== filter) return false
                return true
              }).map(l => {
                const on = l.id === active
                const nm = field(l, ['name']) || 'Unknown'
                const msg = field(l, ['message','enquiry','note','notes'])
                const t = scoreMap[l.id]?.temperature ? TEMP[scoreMap[l.id].temperature] : null
                return (
                  <div key={l.id} onClick={() => setActive(l.id)}
                    style={{ background:'var(--card)', border: on?'1.5px solid #22c55e':'1px solid var(--border)', borderRadius:12, padding:'11px 13px', cursor:'pointer' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                      <span style={{ fontSize:13.5, fontWeight:700, color:'var(--text)', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{nm}</span>
                      {t && <span style={{ fontSize:9.5, fontWeight:700, color:t.color, background:t.bg, borderRadius:99, padding:'1px 7px' }}>{scoreMap[l.id].score ?? ''} {t.label}</span>}
                    </div>
                    {msg && <div style={{ fontSize:11.5, color:'var(--text2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{msg}</div>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* conversation panel */}
          {!activeLead ? (
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:40, textAlign:'center', color:'var(--text2)' }}>Select a lead.</div>
          ) : (
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:480 }}>
              {/* header */}
              <div style={{ display:'flex', alignItems:'center', gap:11, padding:'13px 16px', borderBottom:'1px solid var(--border)' }}>
                <span style={{ width:40, height:40, borderRadius:'50%', background:'rgba(34,197,94,0.14)', color:'#16a34a', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:15, flexShrink:0 }}>
                  {(field(activeLead,['name'])||'?')[0].toUpperCase()}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{field(activeLead,['name'])||'Unknown'}</div>
                  <div style={{ fontSize:11.5, color:'var(--text2)' }}>{[field(activeLead,['phone']), field(activeLead,['area','location'])].filter(Boolean).join(' · ') || 'No contact info'}</div>
                </div>
                {scoreMap[active]?.temperature && (
                  <span style={{ fontSize:11, fontWeight:700, color:TEMP[scoreMap[active].temperature].color, background:TEMP[scoreMap[active].temperature].bg, borderRadius:99, padding:'4px 12px' }}>
                    {scoreMap[active].score != null ? `${scoreMap[active].score} · ` : ''}{TEMP[scoreMap[active].temperature].label}
                  </span>
                )}
              </div>

              {/* thread */}
              <div style={{ flex:1, padding:16, display:'flex', flexDirection:'column', gap:10, overflowY:'auto', maxHeight:'42vh', background:'var(--bg2,rgba(127,127,127,0.03))' }}>
                {threadLoading ? <div style={{ textAlign:'center', color:'var(--text3)', fontSize:12, padding:20 }}>Loading…</div>
                : thread.length === 0 ? <div style={{ textAlign:'center', color:'var(--text3)', fontSize:12.5, padding:20 }}>No messages yet. Add what the lead said below.</div>
                : thread.map(m => {
                  const out = m.direction === 'out'
                  return (
                    <div key={m.id} style={{ display:'flex', justifyContent: out?'flex-end':'flex-start' }}>
                      <div style={{ maxWidth:'78%', padding:'9px 12px', borderRadius:14, fontSize:13, lineHeight:1.45,
                        ...(out ? { background:'#22c55e', color:'#fff', borderBottomRightRadius:4 }
                                : { background:'var(--card)', color:'var(--text)', border:'1px solid var(--border)', borderBottomLeftRadius:4 }) }}>
                        {m.message}
                        <div style={{ fontSize:9.5, opacity:0.7, marginTop:3, textAlign:'right' }}>{new Date(m.created_at).toLocaleTimeString('en-AE',{hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={threadEndRef}/>
              </div>

              {/* AI suggestion */}
              <div style={{ borderTop:'1px solid var(--border)', padding:'12px 14px', background:'var(--card)' }}>
                {aiError ? (
                  <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:10, padding:'11px 13px', marginBottom:10 }}>
                    <div style={{ fontSize:12.5, color:'#ef4444', fontWeight:600, marginBottom:6 }}><i className="ti ti-alert-triangle" style={{ verticalAlign:'-2px' }}/> {aiError}</div>
                    <button onClick={suggestReply} style={btnGhost}><i className="ti ti-refresh" style={{ fontSize:14 }}/> Retry</button>
                  </div>
                ) : suggestion ? (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                      <i className="ti ti-sparkles" style={{ fontSize:13, color:'#22c55e' }}/>
                      <span style={{ fontSize:10.5, fontWeight:700, color:'#22c55e', textTransform:'uppercase', letterSpacing:'.05em' }}>AI suggested reply</span>
                      <span style={{ fontSize:10, color:'var(--text3)', marginLeft:'auto' }}>reads full conversation</span>
                    </div>
                  </div>
                ) : null}

                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  <button onClick={suggestReply} disabled={aiLoading} style={{ ...btnPrimary, flex:'0 0 auto' }}>
                    {aiLoading ? <><span style={{ width:14, height:14, border:'2px solid #fff', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin .8s linear infinite' }}/> Thinking…</>
                      : <><i className="ti ti-sparkles" style={{ fontSize:15 }}/> Suggest reply</>}
                  </button>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>

                {/* composer */}
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} placeholder="Type your reply… (or use AI suggestion above)"
                  style={{ width:'100%', background:'var(--bg2,rgba(127,127,127,0.05))', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', fontSize:13.5, color:'var(--text)', resize:'vertical', minHeight:54, outline:'none', boxSizing:'border-box', fontFamily:'inherit', marginBottom:8 }}/>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button onClick={sendReply} disabled={!draft.trim()} style={{ ...btnPrimary, opacity: draft.trim()?1:0.5 }}>
                    <i className="ti ti-brand-whatsapp" style={{ fontSize:16 }}/> Send on WhatsApp
                  </button>
                  <button onClick={() => { if (draft.trim()) { addMessage('out', draft, 'manual'); setDraft(''); setSuggestion('') } }} disabled={!draft.trim()} style={{ ...btnGhost, opacity: draft.trim()?1:0.5 }}>
                    <i className="ti ti-check" style={{ fontSize:15 }}/> Save only
                  </button>
                </div>

                {/* quick add incoming */}
                <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center' }}>
                  <input value={incoming} onChange={e => setIncoming(e.target.value)} placeholder="What the lead said (incoming)…"
                    onKeyDown={e => { if (e.key==='Enter' && incoming.trim()) { addMessage('in', incoming, 'manual'); setIncoming('') } }}
                    style={{ flex:1, background:'transparent', border:'1px dashed var(--border)', borderRadius:9, padding:'8px 11px', fontSize:12.5, color:'var(--text)', outline:'none' }}/>
                  <button onClick={() => { if (incoming.trim()) { addMessage('in', incoming, 'manual'); setIncoming('') } }} disabled={!incoming.trim()}
                    style={{ ...btnGhost, padding:'8px 12px', opacity: incoming.trim()?1:0.5 }}>+ Add</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#0f172a', color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:300 }}>{toast}</div>}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}>
      <div style={{ width:32, height:32, border:'3px solid #22c55e', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
function Empty({ onNavigate }) {
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'48px 20px', textAlign:'center' }}>
      <i className="ti ti-inbox" style={{ fontSize:34, color:'var(--text3)', display:'block', marginBottom:10 }}/>
      <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>No leads yet</div>
      <div style={{ fontSize:13, color:'var(--text2)', marginBottom:18 }}>When leads arrive, you can chat and get AI replies here.</div>
      <button onClick={() => onNavigate && onNavigate('leadengine')} style={btnPrimary}>Go to Lead Engine</button>
    </div>
  )
}

const btnPrimary = { display:'inline-flex', alignItems:'center', gap:6, padding:'10px 16px', borderRadius:10, border:'none', background:'#22c55e', color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer' }
const btnGhost = { display:'inline-flex', alignItems:'center', gap:6, padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:13.5, fontWeight:600, cursor:'pointer' }
