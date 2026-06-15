import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const DURATION_OPTIONS = [
  { months: 1, label: '1 Month',  desc: 'Monthly visibility' },
  { months: 3, label: '3 Months', desc: 'Save more — popular choice' },
  { months: 6, label: '6 Months', desc: 'Best value — maximum exposure' },
]

const STATUS_CONFIG = {
  pending:  { label: 'Pending Review', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  icon: 'ti-clock' },
  active:   { label: 'Active',         color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  icon: 'ti-check' },
  rejected: { label: 'Rejected',       color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', icon: 'ti-x' },
  expired:  { label: 'Expired',        color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)', icon: 'ti-calendar-off' },
}

function MiniChart({ data, color, height = 40 }) {
  if (!data || data.length < 2) return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <line x1="0" y1={height/2} x2="100" y2={height/2} stroke={color} strokeWidth="1" opacity="0.3" strokeDasharray="3,2"/>
    </svg>
  )
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const pts = data.map((v,i) => `${(i/(data.length-1))*100},${height-((v-min)/range)*(height-4)-2}`).join(' ')
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ overflow:'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
    </svg>
  )
}

export default function SponsoredPage({ onNavigate }) {
  const { company } = useAuth()
  const [mySlot,     setMySlot]     = useState(null)
  const [analytics,  setAnalytics]  = useState({ views:0, clicks:0, leads:0, daily:[] })
  const [leads,      setLeads]      = useState([])
  const [pricing,    setPricing]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showRequest,setShowRequest]= useState(false)
  const [reqForm,    setReqForm]    = useState({ duration_months: 3, message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [activeTab,  setActiveTab]  = useState('overview')

  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  useEffect(() => { const r = () => setVw(window.innerWidth); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r) }, [])
  const mobile = vw < 768

  useEffect(() => { if (company) fetchAll() }, [company])

  async function fetchAll() {
    setLoading(true)
    try {
      const [slotRes, pricingRes] = await Promise.all([
        supabase.from('sponsor_slots').select('*').eq('company_id', company.id).order('created_at', { ascending:false }).limit(1).single(),
        supabase.from('sponsor_slot_pricing').select('*').order('duration_months'),
      ])

      setMySlot(slotRes.data || null)
      setPricing(pricingRes.data || [])

      if (slotRes.data?.id) {
        const { data: analyticsData } = await supabase
          .from('sponsor_analytics')
          .select('event_type, created_at')
          .eq('slot_id', slotRes.data.id)
          .order('created_at', { ascending: true })

        const views  = (analyticsData||[]).filter(a=>a.event_type==='view').length
        const clicks = (analyticsData||[]).filter(a=>a.event_type==='click').length
        const leadsC = (analyticsData||[]).filter(a=>a.event_type==='quote_request').length

        // Daily clicks last 14 days
        const dailyMap = {}
        const today = new Date()
        for (let i=13; i>=0; i--) {
          const d = new Date(today); d.setDate(d.getDate()-i)
          dailyMap[d.toISOString().split('T')[0]] = 0
        }
        ;(analyticsData||[]).filter(a=>a.event_type==='click').forEach(a => {
          const day = a.created_at.split('T')[0]
          if (dailyMap[day] !== undefined) dailyMap[day]++
        })

        setAnalytics({ views, clicks, leadsC, daily: Object.values(dailyMap) })

        const { data: leadsData } = await supabase
          .from('sponsor_analytics')
          .select('*')
          .eq('slot_id', slotRes.data.id)
          .eq('event_type', 'quote_request')
          .order('created_at', { ascending:false })
        setLeads(leadsData||[])
      }
    } catch(e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function submitRequest() {
    if (!reqForm.duration_months) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('sponsor_slots').insert({
        company_id:      company.id,
        duration_months: reqForm.duration_months,
        message:         reqForm.message,
        status:          'pending',
      })
      if (!error) {
        setShowRequest(false)
        setReqForm({ duration_months:3, message:'' })
        fetchAll()
      } else alert('Error: ' + error.message)
    } catch(e) { console.error(e) }
    finally { setSubmitting(false) }
  }

  const plan = company?.plan || 'free'
  const planColors = { free:'#6b7280', silver:'#94a3b8', gold:'#fbbf24', platinum:'#a78bfa' }
  const planColor  = planColors[plan] || '#6b7280'

  // Days remaining
  const daysLeft = mySlot?.expires_at
    ? Math.max(0, Math.ceil((new Date(mySlot.expires_at) - new Date()) / 86400000))
    : 0

  const progressPct = mySlot?.starts_at && mySlot?.expires_at
    ? Math.min(100, Math.max(0, (new Date()-new Date(mySlot.starts_at)) / (new Date(mySlot.expires_at)-new Date(mySlot.starts_at)) * 100))
    : 0

  const ctr = analytics.clicks > 0 && analytics.views > 0
    ? ((analytics.clicks / analytics.views) * 100).toFixed(1)
    : '0.0'
  const convRate = analytics.clicks > 0 && analytics.leadsC > 0
    ? ((analytics.leadsC / analytics.clicks) * 100).toFixed(1)
    : '0.0'

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ width:28, height:28, border:'2px solid #e8b84b', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div className="animate-in">

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:'var(--text)', letterSpacing:'-0.3px' }}>Sponsored Placement</h1>
          <p style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>Get featured on trustdubai.ae homepage — reach more customers</p>
        </div>
        {(!mySlot || mySlot.status === 'rejected' || mySlot.status === 'expired') && (
          <button onClick={()=>setShowRequest(true)}
            style={{ padding:'9px 18px', background:'linear-gradient(135deg,#e8b84b,#c9952a)', color:'#0d1117', border:'none', borderRadius:9, fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            <i className="ti ti-ad-2" style={{ fontSize:14 }}/>
            Request Sponsor Slot
          </button>
        )}
      </div>

      {/* No slot yet */}
      {!mySlot && (
        <>
          {/* What you get */}
          <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:12, padding: mobile?'16px':'20px 24px', marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.04em' }}>
              What You Get as a Sponsor
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px,1fr))', gap:12, marginBottom:16 }}>
              {[
                { icon:'ti-home',         label:'Homepage Placement', desc:'Your card appears on trustdubai.ae home page' },
                { icon:'ti-eye',          label:'Maximum Visibility',  desc:'Seen by every visitor — top of page' },
                { icon:'ti-trending-up',  label:'Lead Generation',     desc:'Get a Quote form — leads sent directly to you' },
                { icon:'ti-chart-bar',    label:'Full Analytics',      desc:'Track clicks, views & leads in real time' },
                { icon:'ti-shield-check', label:'Verified Badge',      desc:'Ad badge shown — trusted placement' },
                { icon:'ti-bell',         label:'Instant Alerts',      desc:'WhatsApp alert on every new lead' },
              ].map(f => (
                <div key={f.label} style={{ background:'var(--bg2)', borderRadius:9, padding:'12px 14px' }}>
                  <i className={`ti ${f.icon}`} style={{ fontSize:18, color:'#e8b84b', display:'block', marginBottom:7 }}/>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--text)', marginBottom:3 }}>{f.label}</div>
                  <div style={{ fontSize:10, color:'var(--text3)', lineHeight:1.5 }}>{f.desc}</div>
                </div>
              ))}
            </div>

            {/* How sponsor card looks */}
            <div style={{ background:'var(--bg2)', borderRadius:10, padding:'14px 16px', marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Preview — how your card looks on trustdubai.ae:</div>
              <div style={{ background:'#f0faff', border:'0.5px solid #b3d9f0', borderRadius:8, padding:'10px 12px', maxWidth:280, position:'relative' }}>
                <span style={{ position:'absolute', top:5, right:5, fontSize:7.5, color:'#7a9ab5', background:'#e8f4fd', padding:'1px 5px', borderRadius:3 }}>Ad</span>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <div style={{ width:28, height:28, borderRadius:7, background:'#e8b84b22', color:'#d97706', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700 }}>
                    {company?.name?.[0]?.toUpperCase()||'?'}
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#1a2744' }}>{company?.name||'Your Company'}</div>
                    <div style={{ fontSize:8.5, color:'#7a9ab5' }}>{company?.category||'Your Category'}</div>
                  </div>
                </div>
                <div style={{ fontSize:9, color:'#f5a623', marginBottom:6 }}>★★★★★ {company?.avg_rating||'5.0'}</div>
                <button style={{ width:'100%', background:'#0099cc', border:'none', borderRadius:5, padding:'5px 0', fontSize:9.5, color:'#fff', fontWeight:700, cursor:'pointer' }}>
                  Get a Free Quote
                </button>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:12, padding: mobile?'16px':'20px 24px', marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:14, textTransform:'uppercase', letterSpacing:'0.04em' }}>Pricing</div>
            <div style={{ display:'grid', gridTemplateColumns: mobile?'1fr':'repeat(3,1fr)', gap:12 }}>
              {pricing.map((p,i) => (
                <div key={p.id}
                  style={{ background: i===1?'linear-gradient(135deg,#fffbeb,#fef3c7)':'var(--bg2)', border:`${i===1?'1.5px':'0.5px'} solid ${i===1?'#fcd34d':'var(--border)'}`, borderRadius:10, padding:'16px', textAlign:'center', position:'relative' }}>
                  {i===1 && <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'#e8b84b', color:'#0d1117', fontSize:9, fontWeight:700, padding:'2px 10px', borderRadius:99, whiteSpace:'nowrap' }}>Most Popular</div>}
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:4 }}>
                    {p.duration_months===1?'1 Month':p.duration_months===3?'3 Months':'6 Months'}
                  </div>
                  <div style={{ fontSize:26, fontWeight:700, color:'#d97706', marginBottom:4 }}>AED {p.price_aed}</div>
                  <div style={{ fontSize:10, color:'var(--text3)', marginBottom:12, lineHeight:1.5 }}>{p.description}</div>
                  <button onClick={()=>{ setReqForm({...reqForm, duration_months:p.duration_months}); setShowRequest(true) }}
                    style={{ width:'100%', padding:'8px', background:i===1?'#e8b84b':'var(--border)', color:i===1?'#0d1117':'var(--text)', border:'none', borderRadius:7, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                    Select
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop:12, padding:'10px 14px', background:'var(--bg2)', borderRadius:8, fontSize:10, color:'var(--text2)', lineHeight:1.6 }}>
              Only 3 sponsor slots available on Quvera. Subject to availability and admin approval. Payment due after approval.
            </div>
          </div>
        </>
      )}

      {/* Has a slot — show status + analytics */}
      {mySlot && (
        <>
          {/* Status card */}
          {(() => {
            const sc = STATUS_CONFIG[mySlot.status] || STATUS_CONFIG.pending
            return (
              <div style={{ background:sc.bg, border:`0.5px solid ${sc.border}`, borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14, marginBottom:16, flexWrap:'wrap' }}>
                <div style={{ width:44, height:44, borderRadius:12, background:sc.bg, border:`0.5px solid ${sc.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className={`ti ${sc.icon}`} style={{ fontSize:20, color:sc.color }}/>
                </div>
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:sc.color }}>{sc.label}</div>
                  <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>
                    {mySlot.status==='pending'  && 'Your request is being reviewed by our team. You will be notified once approved.'}
                    {mySlot.status==='active'   && `Slot #${mySlot.slot_number} · Active until ${mySlot.expires_at ? new Date(mySlot.expires_at).toLocaleDateString('en-AE',{day:'numeric',month:'long',year:'numeric'}) : '—'}`}
                    {mySlot.status==='rejected' && (mySlot.admin_note || 'Your request was not approved. Please contact support or submit a new request.')}
                    {mySlot.status==='expired'  && 'Your sponsored slot has expired. Renew to continue getting leads.'}
                  </div>
                </div>
                {(mySlot.status==='rejected'||mySlot.status==='expired') && (
                  <button onClick={()=>setShowRequest(true)}
                    style={{ padding:'8px 16px', background:'linear-gradient(135deg,#e8b84b,#c9952a)', color:'#0d1117', border:'none', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                    {mySlot.status==='expired'?'Renew Slot':'New Request'}
                  </button>
                )}
                {mySlot.status==='active' && (
                  <div style={{ textAlign:'center', flexShrink:0 }}>
                    <div style={{ fontSize:22, fontWeight:700, color:sc.color }}>{daysLeft}</div>
                    <div style={{ fontSize:9, color:'var(--text3)' }}>days left</div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Active slot details */}
          {mySlot.status === 'active' && (
            <>
              {/* Progress bar */}
              <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text3)', marginBottom:6, gap:8, flexWrap:'wrap' }}>
                  <span>Started: {mySlot.starts_at ? new Date(mySlot.starts_at).toLocaleDateString('en-AE',{day:'numeric',month:'short',year:'numeric'}) : '—'}</span>
                  <span style={{ color: daysLeft<=7?'#ef4444':'#10b981' }}>
                    {daysLeft<=7 ? `⚠️ Expires in ${daysLeft} days` : `Expires: ${new Date(mySlot.expires_at).toLocaleDateString('en-AE',{day:'numeric',month:'short',year:'numeric'})}`}
                  </span>
                </div>
                <div style={{ height:6, background:'var(--bg2)', borderRadius:99, overflow:'hidden', marginBottom:6 }}>
                  <div style={{ height:'100%', width:`${progressPct}%`, background:daysLeft<=7?'#ef4444':'#e8b84b', borderRadius:99, transition:'width 0.5s' }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'var(--text3)', gap:8, flexWrap:'wrap' }}>
                  <span>{Math.round(progressPct)}% time elapsed</span>
                  <span>Slot #{mySlot.slot_number} · {mySlot.duration_months} month plan</span>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display:'flex', gap:4, marginBottom:14, overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
                {[
                  { id:'overview', label:'Overview' },
                  { id:'analytics', label:'Analytics' },
                  { id:'leads', label:`Leads (${leads.length})` },
                ].map(tab => (
                  <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                    style={{ padding:'7px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:11, fontWeight:600, whiteSpace:'nowrap', flexShrink:0, background:activeTab===tab.id?'rgba(232,184,75,0.15)':'var(--bg2)', color:activeTab===tab.id?'#d97706':'var(--text2)', transition:'all 0.15s' }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab: Overview */}
              {activeTab === 'overview' && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns: mobile?'repeat(2,1fr)':'repeat(4,1fr)', gap:10, marginBottom:14 }}>
                    {[
                      { label:'Total Views',      value:analytics.views,  icon:'ti-eye',          color:'#6366f1', trend:analytics.daily },
                      { label:'Total Clicks',     value:analytics.clicks, icon:'ti-cursor-text',  color:'#3b82f6', trend:analytics.daily },
                      { label:'Leads Generated',  value:analytics.leadsC, icon:'ti-users',        color:'#e8b84b', trend:[] },
                      { label:'Click-through Rate',value:`${ctr}%`,       icon:'ti-trending-up',  color:'#10b981', trend:[], isStr:true },
                    ].map(s => (
                      <div key={s.label} style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                          <div style={{ width:30, height:30, borderRadius:7, background:s.color+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <i className={`ti ${s.icon}`} style={{ fontSize:14, color:s.color }}/>
                          </div>
                        </div>
                        <div style={{ fontSize:9, color:'var(--text3)', marginBottom:4 }}>{s.label}</div>
                        <div style={{ fontSize:22, fontWeight:700, color:'var(--text)', lineHeight:1, marginBottom:6 }}>{s.value}</div>
                        {s.trend.length > 1 && <MiniChart data={s.trend} color={s.color} height={32}/>}
                      </div>
                    ))}
                  </div>

                  {/* Conversion rates */}
                  <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Performance Metrics</div>
                    <div style={{ display:'grid', gridTemplateColumns: mobile?'1fr':'1fr 1fr', gap:12 }}>
                      {[
                        { label:'Click-through Rate', value:parseFloat(ctr),      color:'#3b82f6', desc:'Views that became clicks' },
                        { label:'Lead Conversion',    value:parseFloat(convRate), color:'#e8b84b', desc:'Clicks that became leads' },
                      ].map(m => (
                        <div key={m.label}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:5 }}>
                            <span style={{ color:'var(--text2)', fontWeight:500 }}>{m.label}</span>
                            <span style={{ color:m.color, fontWeight:700 }}>{m.value}%</span>
                          </div>
                          <div style={{ height:6, background:'var(--bg2)', borderRadius:99, overflow:'hidden', marginBottom:4 }}>
                            <div style={{ height:'100%', width:`${Math.min(100,m.value)}%`, background:m.color, borderRadius:99 }}/>
                          </div>
                          <div style={{ fontSize:9.5, color:'var(--text3)' }}>{m.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Tab: Analytics */}
              {activeTab === 'analytics' && (
                <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, gap:8, flexWrap:'wrap' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.04em' }}>Daily Clicks — Last 14 Days</div>
                    <div style={{ display:'flex', gap:10 }}>
                      {[['#3b82f6','Clicks'],['#e8b84b','Leads']].map(([c,l]) => (
                        <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:9, color:'var(--text3)' }}>
                          <div style={{ width:7, height:7, borderRadius:'50%', background:c }}/>{l}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ position:'relative', height:120 }}>
                    <div style={{ position:'absolute', left:24, right:0, top:0, bottom:18 }}>
                      <svg width="100%" height="100%" viewBox="0 0 500 102" preserveAspectRatio="none">
                        {[0,51,102].map(y=><line key={y} x1="0" y1={y} x2="500" y2={y} stroke="var(--border)" strokeWidth="0.5"/>)}
                        {analytics.daily.length > 0 && (() => {
                          const max = Math.max(...analytics.daily, 1)
                          const pts = analytics.daily.map((v,i)=>`${(i/(analytics.daily.length-1))*500},${102-((v/max)*98)-2}`).join(' ')
                          return (
                            <>
                              <path d={`M${pts.split(' ').join(' L')} L500,102 L0,102 Z`} fill="rgba(59,130,246,0.06)"/>
                              <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </>
                          )
                        })()}
                      </svg>
                    </div>
                    <div style={{ position:'absolute', left:24, right:0, bottom:0, display:'flex', justifyContent:'space-between' }}>
                      {Array.from({length:14},(_,i) => {
                        const d = new Date(); d.setDate(d.getDate()-(13-i))
                        return <span key={i} style={{ fontSize:7, color:'var(--text3)' }}>{d.getDate()}/{d.getMonth()+1}</span>
                      })}
                    </div>
                  </div>

                  {/* Summary */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:14 }}>
                    {[
                      { label:'Best Day',     value:`${Math.max(...analytics.daily,0)} clicks`, color:'#3b82f6' },
                      { label:'Avg Per Day',  value:`${analytics.daily.length>0?(analytics.clicks/14).toFixed(1):0} clicks`, color:'#10b981' },
                      { label:'Total Period', value:`${analytics.clicks} clicks`, color:'#e8b84b' },
                    ].map(s => (
                      <div key={s.label} style={{ background:'var(--bg2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                        <div style={{ fontSize:15, fontWeight:700, color:s.color }}>{s.value}</div>
                        <div style={{ fontSize:9.5, color:'var(--text3)', marginTop:3 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Leads */}
              {activeTab === 'leads' && (
                <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>
                    Leads from Sponsor Slot ({leads.length})
                  </div>
                  {leads.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'30px 0', color:'var(--text3)', fontSize:12 }}>
                      <i className="ti ti-users" style={{ fontSize:32, display:'block', marginBottom:8, opacity:0.3 }}/>
                      No leads yet — leads appear here when users fill the Get a Quote form
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {leads.map(lead => (
                        <div key={lead.id} style={{ background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:9, padding:'10px 14px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                          <div style={{ width:36, height:36, borderRadius:9, background:'rgba(232,184,75,0.15)', color:'#d97706', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, flexShrink:0 }}>
                            {(lead.lead_name||'A')[0].toUpperCase()}
                          </div>
                          <div style={{ flex:1, minWidth:140 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{lead.lead_name||'Anonymous'}</div>
                            <div style={{ fontSize:10, color:'var(--text2)', marginTop:2, display:'flex', alignItems:'center', gap:5 }}>
                              <i className="ti ti-phone" style={{ fontSize:10 }}/>{lead.lead_phone||'No phone'}
                            </div>
                          </div>
                          {lead.lead_message && (
                            <div style={{ flex:2, minWidth:180, fontSize:10, color:'var(--text2)', lineHeight:1.5 }}>
                              "{lead.lead_message}"
                            </div>
                          )}
                          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                            <span style={{ fontSize:9, color:'var(--text3)' }}>via {lead.source_page||'home'}</span>
                            <span style={{ fontSize:9, color:'var(--text3)' }}>{new Date(lead.created_at).toLocaleDateString('en-AE',{day:'numeric',month:'short',year:'numeric'})}</span>
                          </div>
                          <a href={`https://wa.me/${(lead.lead_phone||'').replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer"
                            style={{ padding:'5px 12px', background:'rgba(37,211,102,0.12)', color:'#25d366', border:'0.5px solid rgba(37,211,102,0.25)', borderRadius:7, fontSize:10, fontWeight:600, cursor:'pointer', textDecoration:'none', display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                            <i className="ti ti-brand-whatsapp" style={{ fontSize:12 }}/> WhatsApp
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Pending state details */}
          {mySlot.status === 'pending' && (
            <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:12, padding: mobile?'16px':'20px 24px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:12 }}>Request Details</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px,1fr))', gap:12 }}>
                {[
                  { label:'Duration',   value:`${DURATION_OPTIONS.find(d=>d.months===mySlot.duration_months)?.label||'—'}` },
                  { label:'Status',     value:'Pending Admin Review' },
                  { label:'Submitted',  value:new Date(mySlot.created_at).toLocaleDateString('en-AE',{day:'numeric',month:'long',year:'numeric'}) },
                  { label:'Price',      value:mySlot.price_aed ? `AED ${mySlot.price_aed}` : 'To be set by admin' },
                ].map(d => (
                  <div key={d.label} style={{ background:'var(--bg2)', borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontSize:9.5, color:'var(--text3)', marginBottom:3 }}>{d.label}</div>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{d.value}</div>
                  </div>
                ))}
              </div>
              {mySlot.message && (
                <div style={{ marginTop:12, padding:'10px 14px', background:'var(--bg2)', borderRadius:8, fontSize:11, color:'var(--text2)', borderLeft:'2px solid var(--border)' }}>
                  Your message: "{mySlot.message}"
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Request Modal */}
      {showRequest && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}>
          <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:'24px', width:420, maxWidth:'100%', maxHeight:'92vh', overflowY:'auto' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Request Sponsor Slot</div>
            <div style={{ fontSize:11, color:'var(--text2)', marginBottom:18 }}>Select your preferred duration — price will be confirmed by admin.</div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Choose Duration</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {pricing.map(p => (
                  <div key={p.id}
                    onClick={()=>setReqForm({...reqForm, duration_months:p.duration_months})}
                    style={{ padding:'12px 14px', background:reqForm.duration_months===p.duration_months?'rgba(232,184,75,0.1)':'var(--bg2)', border:`1px solid ${reqForm.duration_months===p.duration_months?'#fcd34d':'var(--border)'}`, borderRadius:9, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', transition:'all 0.15s' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
                        {p.duration_months===1?'1 Month':p.duration_months===3?'3 Months':'6 Months'}
                      </div>
                      <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{p.description}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:15, fontWeight:700, color:'#d97706' }}>AED {p.price_aed}</div>
                      {reqForm.duration_months===p.duration_months && (
                        <i className="ti ti-check" style={{ fontSize:14, color:'#d97706' }}/>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:600, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Message to Admin (optional)</div>
              <textarea
                value={reqForm.message}
                onChange={e=>setReqForm({...reqForm, message:e.target.value})}
                placeholder="Any specific requirements or questions..."
                style={{ width:'100%', padding:'9px 12px', background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:8, fontSize:11, color:'var(--text)', outline:'none', resize:'vertical', minHeight:70, fontFamily:'inherit', boxSizing:'border-box' }}
              />
            </div>

            <div style={{ padding:'10px 12px', background:'rgba(232,184,75,0.06)', border:'0.5px solid rgba(232,184,75,0.2)', borderRadius:8, fontSize:10, color:'var(--text2)', marginBottom:16, lineHeight:1.6 }}>
              Your request will be reviewed within 24 hours. Payment details will be sent after approval via WhatsApp.
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={submitRequest} disabled={submitting}
                style={{ flex:1, padding:'10px', background:'linear-gradient(135deg,#e8b84b,#c9952a)', color:'#0d1117', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5, opacity:submitting?0.7:1 }}>
                {submitting ? <><div style={{ width:14, height:14, border:'2px solid rgba(0,0,0,0.3)', borderTopColor:'#0d1117', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/> Submitting...</> : <><i className="ti ti-send" style={{ fontSize:13 }}/> Submit Request</>}
              </button>
              <button onClick={()=>setShowRequest(false)}
                style={{ flex:1, padding:'10px', background:'var(--bg2)', color:'var(--text2)', border:'0.5px solid var(--border)', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
