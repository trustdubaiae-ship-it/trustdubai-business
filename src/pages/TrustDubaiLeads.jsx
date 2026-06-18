// tritova-business/src/pages/TrustDubaiLeads.jsx
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/* =========================================================================
   QUVERA LEADS — only leads that came from the Quvera platform
   (source = platform / trustdubai), separate from Meta/manual leads.
   Shows count + status, search, WhatsApp/Call quick actions.
   Fully responsive + light/dark.
   ========================================================================= */

const PLATFORM_SOURCES = ['platform', 'trustdubai', 'trust dubai', 'trustdubai.ae']

const STATUSES = [
  { key:'new',            label:'New',            color:'#3b82f6' },
  { key:'qualified',      label:'Qualified',      color:'#8b5cf6' },
  { key:'in_conversation',label:'In Conversation',color:'#f59e0b' },
  { key:'proposal_given', label:'Proposal',       color:'#06b6d4' },
  { key:'won',            label:'Won',            color:'#22c55e' },
  { key:'lost',           label:'Lost',           color:'#ef4444' },
]

function field(lead, keys) {
  for (const k of keys) {
    if (lead[k]) return lead[k]
    if (lead.answers && typeof lead.answers === 'object' && lead.answers[k]) return lead.answers[k]
  }
  return ''
}
function isPlatform(lead) {
  const s = (field(lead, ['source']) || '').toLowerCase().trim()
  return PLATFORM_SOURCES.includes(s)
}
function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-AE', { day:'numeric', month:'short', year:'numeric' })
}

export default function TrustDubaiLeads({ onNavigate }) {
  const { company } = useAuth()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [toast, setToast] = useState('')

  useEffect(() => { if (company?.id != null) load() }, [company?.id])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('lead_submissions').select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      // keep only platform-source leads
      setLeads((data || []).filter(isPlatform))
    } catch (e) { console.error('TrustDubaiLeads load', e) }
    finally { setLoading(false) }
  }

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 2000) }

  async function updateStatus(lead, status) {
    try {
      await supabase.from('lead_submissions')
        .update({ status, status_updated_at: new Date().toISOString() })
        .eq('id', lead.id)
      setLeads(xs => xs.map(x => x.id === lead.id ? { ...x, status } : x))
      showToast('Status updated ✓')
    } catch (e) { console.error(e); showToast('Update failed') }
  }

  const stats = useMemo(() => ({
    total: leads.length,
    won:   leads.filter(l => l.status === 'won').length,
    active:leads.filter(l => !['won','lost'].includes(l.status)).length,
  }), [leads])

  const filtered = useMemo(() => leads.filter(l => {
    const q = search.trim().toLowerCase()
    if (q) {
      const hay = `${field(l,['name'])} ${field(l,['phone'])} ${field(l,['message','enquiry','note','notes'])}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (statusFilter !== 'all' && (l.status || 'new') !== statusFilter) return false
    return true
  }), [leads, search, statusFilter])

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      {/* stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12, marginBottom:18 }}>
        <Stat icon="ti-users" label="Total leads" value={stats.total} color="#3b82f6" />
        <Stat icon="ti-flame" label="Active" value={stats.active} color="#f59e0b" />
        <Stat icon="ti-trophy" label="Won" value={stats.won} color="#22c55e" />
      </div>

      {/* controls */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 11px', flex:'1 1 220px' }}>
          <i className="ti ti-search" style={{ fontSize:14, color:'var(--text3)' }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search leads…"
            style={{ border:'none', background:'none', outline:'none', fontSize:13, width:'100%', color:'var(--text)' }}/>
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
          style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 12px', fontSize:13, color:'var(--text)', outline:'none' }}>
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* list */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}>
          <div style={{ width:32, height:32, border:'3px solid #22c55e', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'48px 20px', textAlign:'center' }}>
          <i className="ti ti-discount-check" style={{ fontSize:34, color:'var(--text3)', display:'block', marginBottom:10 }}/>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>
            {leads.length === 0 ? 'No Quvera leads yet' : 'No leads match your filter'}
          </div>
          <div style={{ fontSize:13, color:'var(--text2)', marginBottom:18 }}>
            {leads.length === 0 ? 'When customers contact you via your Quvera profile, they appear here.' : 'Try a different search or status.'}
          </div>
          {leads.length === 0 && (
            <button onClick={() => onNavigate && onNavigate('profile')} style={btnPrimary}>View my profile</button>
          )}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(l => {
            const st = STATUSES.find(s => s.key === (l.status || 'new')) || STATUSES[0]
            const name = field(l,['name']) || 'Unknown'
            const phone = field(l,['phone'])
            const msg = field(l,['message','enquiry','note','notes'])
            const phoneClean = (phone || '').replace(/[^\d]/g, '')
            return (
              <div key={l.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                  <span style={{ width:40, height:40, borderRadius:10, background:'rgba(34,197,94,0.14)', color:'#16a34a', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:15, flexShrink:0 }}>
                    {name[0].toUpperCase()}
                  </span>
                  <div style={{ flex:1, minWidth:160 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{name}</span>
                      <span style={{ fontSize:9.5, fontWeight:700, color:'#16a34a', background:'rgba(34,197,94,0.14)', borderRadius:6, padding:'2px 7px', display:'inline-flex', alignItems:'center', gap:3 }}>
                        <i className="ti ti-discount-check" style={{ fontSize:11 }}/> Quvera
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>
                      {[phone, fmtDate(l.created_at)].filter(Boolean).join(' · ')}
                    </div>
                    {msg && <div style={{ fontSize:12.5, color:'var(--text2)', marginTop:6, lineHeight:1.5 }}>{msg}</div>}
                    <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginTop:8 }}>
                      {field(l,['budget']) && <Chip icon="ti-coin" text={`Budget: ${field(l,['budget'])}`} />}
                      {field(l,['project_type','scope','service']) && <Chip icon="ti-tool" text={field(l,['project_type','scope','service'])} />}
                      {field(l,['area','location']) && <Chip icon="ti-map-pin" text={field(l,['area','location'])} />}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end', marginLeft:'auto' }}>
                    <select value={l.status || 'new'} onChange={e=>updateStatus(l, e.target.value)}
                      style={{ background:st.color+'1a', color:st.color, border:`1px solid ${st.color}55`, borderRadius:8, padding:'5px 9px', fontSize:11.5, fontWeight:700, outline:'none', cursor:'pointer' }}>
                      {STATUSES.map(s => <option key={s.key} value={s.key} style={{ color:'#111' }}>{s.label}</option>)}
                    </select>
                    <div style={{ display:'flex', gap:6 }}>
                      {phoneClean && (
                        <a href={`https://wa.me/${phoneClean}`} target="_blank" rel="noreferrer"
                          style={{ width:34, height:34, borderRadius:9, background:'rgba(34,197,94,0.12)', color:'#16a34a', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }} title="WhatsApp">
                          <i className="ti ti-brand-whatsapp" style={{ fontSize:17 }}/>
                        </a>
                      )}
                      {phoneClean && (
                        <a href={`tel:${phone}`}
                          style={{ width:34, height:34, borderRadius:9, background:'var(--bg2,rgba(127,127,127,0.08))', color:'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', border:'1px solid var(--border)' }} title="Call">
                          <i className="ti ti-phone" style={{ fontSize:16 }}/>
                        </a>
                      )}
                      {onNavigate && (
                        <button onClick={() => onNavigate('aiassistant')}
                          style={{ width:34, height:34, borderRadius:9, background:'rgba(34,197,94,0.12)', color:'#16a34a', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }} title="AI reply">
                          <i className="ti ti-sparkles" style={{ fontSize:16 }}/>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {toast && <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#0f172a', color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:300 }}>{toast}</div>}
    </div>
  )
}

function Stat({ icon, label, value, color }) {
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
      <span style={{ width:40, height:40, borderRadius:10, background:color+'1a', color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <i className={`ti ${icon}`} style={{ fontSize:20 }}/>
      </span>
      <div>
        <div style={{ fontSize:22, fontWeight:800, color:'var(--text)', lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:11.5, color:'var(--text2)', marginTop:3 }}>{label}</div>
      </div>
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

const btnPrimary = { display:'inline-flex', alignItems:'center', gap:6, padding:'10px 16px', borderRadius:10, border:'none', background:'#22c55e', color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer' }
