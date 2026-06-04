// trustdubai-business/src/pages/DashboardPage.jsx
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import NotificationsCard from '../components/NotificationsCard'

/* ============================== config ============================== */
const PLAN_CONFIG = {
  free:     { name:'Free',     color:'#6b7280', badge:'🆓', welcomeEmoji:'👋', maxMembers:2   },
  silver:   { name:'Silver',   color:'#64748b', badge:'🥈', welcomeEmoji:'✨', maxMembers:5   },
  gold:     { name:'Gold',     color:'#d97706', badge:'🥇', welcomeEmoji:'🌟', maxMembers:15  },
  platinum: { name:'Platinum', color:'#8b5cf6', badge:'💎', welcomeEmoji:'👑', maxMembers:999 },
}

const TIER_LABEL = {
  listed:'Listed', verified:'Verified', trusted:'Trusted', top_rated:'Top Rated', 'top rated':'Top Rated',
}

const TIMEZONES = [
  { tz:'Asia/Dubai',      label:'Dubai (GMT+4)' },
  { tz:'Asia/Karachi',    label:'Karachi (GMT+5)' },
  { tz:'Asia/Kolkata',    label:'India (GMT+5:30)' },
  { tz:'Asia/Riyadh',     label:'Riyadh (GMT+3)' },
  { tz:'Europe/London',   label:'London (GMT+0/1)' },
  { tz:'America/New_York',label:'New York (GMT-5/4)' },
]

const CLOCK_COLORS = ['#e8b84b','#0099cc','#10b981','#8b5cf6','#ef4444','#f59e0b','#0f172a','#ffffff']
const CLOCK_BGS    = ['#f8fafc','#fffbeb','#eff6ff','#f0fdf4','#faf5ff','#fef2f2','#0f172a','#1e1b4b']
const CLOCK_DEFAULTS = { fontColor:'#e8b84b', bgColor:'#f8fafc', tz:'Asia/Dubai', showUserName:true, customName:'' }

function loadClockPrefs() {
  try {
    const raw = localStorage.getItem('td_clock_prefs')
    return raw ? { ...CLOCK_DEFAULTS, ...JSON.parse(raw) } : { ...CLOCK_DEFAULTS }
  } catch { return { ...CLOCK_DEFAULTS } }
}

/* ============================== helpers ============================== */
function getExpiryInfo(expiresAt) {
  if (!expiresAt) return null
  const diff = Math.ceil((new Date(expiresAt) - new Date()) / 86400000)
  if (diff < 0)   return { color:'#ef4444', bg:'rgba(239,68,68,0.12)', border:'rgba(239,68,68,0.4)', days:diff, expired:true,  urgent:true  }
  if (diff <= 7)  return { color:'#ef4444', bg:'rgba(239,68,68,0.12)', border:'rgba(239,68,68,0.4)', days:diff, expired:false, urgent:true  }
  if (diff <= 30) return { color:'#f59e0b', bg:'rgba(245,158,11,0.12)', border:'rgba(245,158,11,0.4)', days:diff, expired:false, urgent:false }
  return            { color:'#10b981', bg:'rgba(16,185,129,0.12)', border:'rgba(16,185,129,0.4)', days:diff, expired:false, urgent:false }
}

function calcProfileComplete(c) {
  if (!c) return 0
  const fields = ['name','description','phone','logo_url','category','location']
  return Math.round(fields.filter(f=>!!c[f]).length/fields.length*100)
}

const iso = (n) => new Date(Date.now() - n*864e5).toISOString()
function pctChange(now, prev) {
  if (prev === 0) return now > 0 ? 100 : 0
  return Math.round(((now - prev) / prev) * 100)
}
function dailyCounts(rows, days) {
  const map = {}
  for (let i=days-1;i>=0;i--) map[iso(i).slice(0,10)] = 0
  ;(rows||[]).forEach(r => { const k=(r.created_at||'').slice(0,10); if (map[k]!==undefined) map[k]++ })
  return Object.values(map)
}

/* ============================== UI atoms ============================== */
function GlowCard({ glow, children, style, className, onClick, onMouseEnter, onMouseLeave }) {
  return (
    <div className={className} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      style={{ position:'relative', overflow:'hidden', background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:16, minWidth:0, ...style }}>
      {glow && <div style={{ position:'absolute', right:-22, top:-22, width:74, height:74, borderRadius:'50%', background:glow, filter:'blur(6px)', pointerEvents:'none' }}/>}
      <div style={{ position:'relative' }}>{children}</div>
    </div>
  )
}

function Sparkline({ data, color, height=30 }) {
  if (!data||data.length<2) return (
    <svg width="100%" height={height} preserveAspectRatio="none" viewBox="0 0 84 30"><line x1="0" y1={15} x2="84" y2={15} stroke={color} strokeWidth="1.5" opacity="0.3" strokeDasharray="3,2"/></svg>
  )
  const W=84, max=Math.max(...data), min=Math.min(...data), range=max-min||1
  const pts=data.map((v,i)=>`${(i/(data.length-1))*W},${height-((v-min)/range)*(height-4)-2}`).join(' ')
  const last=`${W},${height-((data[data.length-1]-min)/range)*(height-4)-2}`
  return (
    <svg width="100%" height={height} preserveAspectRatio="none" viewBox={`0 0 ${W} ${height}`} style={{ overflow:'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" vectorEffect="non-scaling-stroke"/>
      <circle cx={last.split(',')[0]} cy={last.split(',')[1]} r="2.6" fill={color}/>
    </svg>
  )
}

function TrustGauge({ score }) {  // score 0–100
  const r=40, cx=50, cy=50, circ=2*Math.PI*r
  const filled=(Math.max(0,Math.min(100,score))/100)*circ
  const color=score>=70?'#10b981':score>=40?'#e8b84b':'#ef4444'
  return (
    <svg width="108" height="108" viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg2)" strokeWidth="8"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${filled} ${circ-filled}`} strokeDashoffset={circ*0.25} strokeLinecap="round"/>
      <text x={cx} y={cy-1} textAnchor="middle" fill={color} fontSize="22" fontWeight="700">{Math.round(score)}</text>
      <text x={cx} y={cy+13} textAnchor="middle" fill="var(--text3)" fontSize="8">/ 100</text>
    </svg>
  )
}

function SentimentDonut({ pos, neu, neg }) {
  const total = pos+neu+neg
  const r=38, cx=55, cy=55, circ=2*Math.PI*r
  const segs = [['#10b981',pos],['#94a3b8',neu],['#f87171',neg]]
  let offset = 0
  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg2)" strokeWidth="11"/>
      {total>0 && segs.map(([c,v],i)=>{
        const len=(v/total)*circ
        const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth="11"
          strokeDasharray={`${len} ${circ-len}`} strokeDashoffset={-offset+circ*0.25} />
        offset+=len
        return el
      })}
      <text x={cx} y={cy-3} textAnchor="middle" fill="var(--text)" fontSize="20" fontWeight="700">{total}</text>
      <text x={cx} y={cy+13} textAnchor="middle" fill="var(--text3)" fontSize="8">Total Reviews</text>
    </svg>
  )
}

function ScoreRow({ label, score, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
      <span style={{ fontSize:10.5, color:'var(--text2)', flex:1, minWidth:0 }}>{label}</span>
      <div style={{ flex:'0 0 90px', maxWidth:110, height:4, background:'var(--bg2)', borderRadius:99, overflow:'hidden' }}>
        <div style={{ width:`${Math.max(0,Math.min(100,score))}%`, height:'100%', background:color, borderRadius:99 }}/>
      </div>
      <span style={{ fontSize:10, fontWeight:700, color, minWidth:30, textAlign:'right' }}>{Math.round(score)}%</span>
    </div>
  )
}

/* 12-month real sentiment trend */
function SentimentTrend({ months }) {
  const pos = months.map(m=>m.pos), neu = months.map(m=>m.neu), neg = months.map(m=>m.neg)
  const max = Math.max(1, ...pos, ...neu, ...neg)
  const W=400, H=84
  const xy = (arr) => arr.map((v,i)=>`${(i/(arr.length-1||1))*W},${H-(v/max)*(H-6)-3}`).join(' ')
  const area = `0,${H} ${xy(pos)} ${W},${H} Z`
  const hasData = pos.concat(neu,neg).some(v=>v>0)
  return (
    <div style={{ position:'relative', height:104 }}>
      <div style={{ position:'absolute', left:22, right:0, top:0, bottom:16 }}>
        {hasData ? (
          <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {[0,H/2,H].map(y=><line key={y} x1="0" y1={y} x2={W} y2={y} stroke="var(--border)" strokeWidth="0.5"/>)}
            <path d={`M${area}`} fill="rgba(16,185,129,0.12)"/>
            <polyline points={xy(pos)} fill="none" stroke="#10b981" strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
            <polyline points={xy(neu)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3,2" vectorEffect="non-scaling-stroke"/>
            <polyline points={xy(neg)} fill="none" stroke="#f87171" strokeWidth="1.5" strokeDasharray="2,3" vectorEffect="non-scaling-stroke"/>
          </svg>
        ) : (
          <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'var(--text3)' }}>No review data yet</div>
        )}
      </div>
      <div style={{ position:'absolute', left:0, top:0, bottom:16, display:'flex', flexDirection:'column', justifyContent:'space-between', width:20 }}>
        {[max, Math.round(max/2), 0].map((l,i)=><span key={i} style={{ fontSize:7, color:'var(--text3)' }}>{l}</span>)}
      </div>
      <div style={{ position:'absolute', left:22, right:0, bottom:0, display:'flex', justifyContent:'space-between' }}>
        {months.filter((_,i)=>i%2===0).map((m,i)=><span key={i} style={{ fontSize:7, color:'var(--text3)' }}>{m.label}</span>)}
      </div>
    </div>
  )
}

function ClockCard({ defaultName }) {
  const [prefs, setPrefs] = useState(loadClockPrefs)
  const [open, setOpen]   = useState(false)
  const hhRef = useRef(null), mmRef = useRef(null), ssRef = useRef(null), dateRef = useRef(null)

  useEffect(() => {
    function fmt(part, now) {
      return new Intl.DateTimeFormat('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:prefs.tz }).formatToParts(now).find(p=>p.type===part)?.value || '00'
    }
    function tick() {
      const now = new Date()
      if (hhRef.current) hhRef.current.textContent = fmt('hour', now)
      if (mmRef.current) mmRef.current.textContent = fmt('minute', now)
      if (ssRef.current) ssRef.current.textContent = fmt('second', now)
      if (dateRef.current) dateRef.current.textContent =
        new Intl.DateTimeFormat('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'2-digit', timeZone:prefs.tz }).format(now).toUpperCase()
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [prefs.tz])

  function update(patch) {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try { localStorage.setItem('td_clock_prefs', JSON.stringify(next)) } catch {}
  }

  const tzLabel  = TIMEZONES.find(t=>t.tz===prefs.tz)?.label?.split(' (')[0] || 'Dubai'
  const userName = (prefs.customName?.trim() || defaultName || '').toUpperCase()
  const digitFg  = prefs.fontColor
  const digitStyle = {
    background: prefs.bgColor, border:`1.5px solid ${digitFg}55`, borderRadius:10, padding:'6px 10px',
    fontSize:26, fontWeight:800, color:digitFg, fontVariantNumeric:'tabular-nums', minWidth:46, textAlign:'center', display:'inline-block', lineHeight:1,
  }

  return (
    <GlowCard glow="rgba(232,184,75,0.14)" style={{ minHeight:130, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center', overflow:'visible' }}>
      <button onClick={()=>setOpen(v=>!v)} title="Clock settings"
        style={{ position:'absolute', top:0, right:0, width:24, height:24, borderRadius:6, border:'none', background:'transparent', cursor:'pointer', color:'var(--text3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <i className="ti ti-settings" style={{ fontSize:15 }}/>
      </button>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, marginTop:4, flexWrap:'wrap' }}>
        <span ref={hhRef} style={digitStyle}/>
        <span style={{ fontSize:22, color:digitFg, opacity:0.6, fontWeight:700 }}>:</span>
        <span ref={mmRef} style={digitStyle}/>
        <span style={{ fontSize:22, color:digitFg, opacity:0.6, fontWeight:700 }}>:</span>
        <span ref={ssRef} style={digitStyle}/>
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginTop:9, flexWrap:'wrap' }}>
        <span ref={dateRef} style={{ fontSize:11, fontWeight:800, color:'var(--text)', letterSpacing:'0.02em' }}/>
        <div style={{ textAlign:'left', lineHeight:1.3 }}>
          <div style={{ fontSize:9.5, fontWeight:700, color:digitFg }}>{tzLabel} Time</div>
          {prefs.showUserName && userName && <div style={{ fontSize:9.5, fontWeight:700, color:'var(--text2)' }}>{userName}</div>}
        </div>
      </div>

      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, zIndex:40 }}/>
          <div style={{ position:'absolute', top:30, right:2, zIndex:50, width:230, background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, boxShadow:'var(--shadow-md)', padding:14, textAlign:'left' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:10 }}>Clock Settings</div>
            <div style={{ fontSize:10, color:'var(--text3)', marginBottom:5 }}>Font Color</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              {CLOCK_COLORS.map(c=>(
                <button key={c} onClick={()=>update({fontColor:c})} style={{ width:20, height:20, borderRadius:'50%', background:c, cursor:'pointer', border: prefs.fontColor===c ? '2px solid #0099cc' : '1px solid var(--border)' }}/>
              ))}
            </div>
            <div style={{ fontSize:10, color:'var(--text3)', marginBottom:5 }}>Background Color</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              {CLOCK_BGS.map(c=>(
                <button key={c} onClick={()=>update({bgColor:c})} style={{ width:20, height:20, borderRadius:'50%', background:c, cursor:'pointer', border: prefs.bgColor===c ? '2px solid #0099cc' : '1px solid var(--border)' }}/>
              ))}
            </div>
            <div style={{ fontSize:10, color:'var(--text3)', marginBottom:5 }}>Time Zone</div>
            <select value={prefs.tz} onChange={e=>update({tz:e.target.value})}
              style={{ width:'100%', border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', borderRadius:8, padding:'6px 8px', fontSize:11, marginBottom:12, boxSizing:'border-box' }}>
              {TIMEZONES.map(t=><option key={t.tz} value={t.tz} style={{ background:'var(--card)', color:'var(--text)' }}>{t.label}</option>)}
            </select>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:10, color:'var(--text3)' }}>Show Name</span>
              <button onClick={()=>update({showUserName:!prefs.showUserName})}
                style={{ width:36, height:20, borderRadius:99, border:'none', cursor:'pointer', background: prefs.showUserName?'#0099cc':'var(--border2)', position:'relative', transition:'all .15s' }}>
                <span style={{ position:'absolute', top:2, left: prefs.showUserName?18:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'all .15s' }}/>
              </button>
            </div>
            {prefs.showUserName && (
              <>
                <div style={{ fontSize:10, color:'var(--text3)', marginBottom:5 }}>Display Name</div>
                <input value={prefs.customName} onChange={e=>update({customName:e.target.value})} placeholder={defaultName || 'Your name'}
                  style={{ width:'100%', border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', borderRadius:8, padding:'6px 8px', fontSize:11, marginBottom:10, boxSizing:'border-box' }}/>
              </>
            )}
            <button onClick={()=>update({...CLOCK_DEFAULTS})}
              style={{ width:'100%', padding:'7px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg2)', fontSize:11, color:'var(--text2)', cursor:'pointer' }}>
              Reset to Default
            </button>
          </div>
        </>
      )}
    </GlowCard>
  )
}

/* ============================== main ============================== */
export default function DashboardPage({ onNavigate }) {
  const { company, staff, user } = useAuth()
  const [stats,         setStats]         = useState({ views:0, reviews:0, avgRating:0, portfolio:0, newReviews:0, reputationGrowth:'Low', trust:0 })
  const [leadStats,     setLeadStats]     = useState({ total:0, active:0, won:0, newThisMonth:0 })
  const [spark,         setSpark]         = useState({ reviews:[], leads:[], rating:[] })
  const [changes,       setChanges]       = useState({ reviews:0, leads:0, rating:0 })
  const [sentiment12,   setSentiment12]   = useState([])
  const [recentReviews, setRecentReviews] = useState([])
  const [memberCount,   setMemberCount]   = useState(0)
  const [reviewDist,    setReviewDist]    = useState({ 5:0, 4:0, 3:0, 2:0, 1:0 })
  const [loading,       setLoading]       = useState(true)
  const [aiInsightsOn,  setAiInsightsOn]  = useState(true)

  useEffect(() => { if (company) fetchStats() }, [company])
  useEffect(() => { fetchAiInsightsSetting() }, [])

  async function fetchAiInsightsSetting() {
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'feature.ai_insights').maybeSingle()
      setAiInsightsOn(data?.value?.enabled !== false)
    } catch { setAiInsightsOn(true) }
  }

  async function fetchStats() {
    try {
      const [reviewsRes, portfolioRes, membersRes, leadsRes] = await Promise.all([
        supabase.from('reviews').select('rating,created_at').eq('company_id', company.id),
        supabase.from('portfolio_items').select('id').eq('company_id', company.id),
        supabase.from('employees').select('id').eq('current_company_id', company.id),
        supabase.from('lead_submissions').select('status,created_at').eq('company_id', company.id),
      ])

      const reviews = reviewsRes.data||[]
      const leads   = leadsRes.data||[]
      const now     = new Date()
      const avg     = reviews.length>0 ? (reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1) : 0

      const monthStart     = new Date(now.getFullYear(),now.getMonth(),1).toISOString()
      const lastMonthStart = new Date(now.getFullYear(),now.getMonth()-1,1).toISOString()
      const newRev         = reviews.filter(r=>r.created_at>=monthStart).length
      const lastMonthRev   = reviews.filter(r=>r.created_at>=lastMonthStart&&r.created_at<monthStart).length
      const repGrowth      = lastMonthRev===0 ? (newRev>0?'High':'Low') : newRev>lastMonthRev?'High' : newRev===lastMonthRev?'Stable':'Low'

      // rating distribution
      const dist = {5:0,4:0,3:0,2:0,1:0}
      reviews.forEach(r=>{ if(dist[r.rating]!==undefined) dist[r.rating]++ })
      setReviewDist(dist)

      // 30d vs prev 30d (real)
      const win = (rows,from,to)=> (rows||[]).filter(r=>{const t=new Date(r.created_at).getTime(); return t>=now.getTime()-from*864e5 && t<now.getTime()-to*864e5}).length
      const pctReviews = pctChange(win(reviews,30,0), win(reviews,60,30))
      const pctLeads   = pctChange(win(leads,30,0),   win(leads,60,30))

      // avg rating: this month vs last month (real)
      const avgOf = (rows)=> rows.length ? rows.reduce((s,r)=>s+r.rating,0)/rows.length : 0
      const thisMonthAvg = avgOf(reviews.filter(r=>r.created_at>=monthStart))
      const lastMonthAvg = avgOf(reviews.filter(r=>r.created_at>=lastMonthStart&&r.created_at<monthStart))
      const pctRating = lastMonthAvg ? Math.round(((thisMonthAvg-lastMonthAvg)/lastMonthAvg)*100) : 0

      // sparklines (real)
      const reviewsDaily = dailyCounts(reviews, 14)
      const leadsDaily   = dailyCounts(leads, 14)
      const ratingMonthly = []
      for (let i=5;i>=0;i--){
        const ms = new Date(now.getFullYear(), now.getMonth()-i, 1)
        const me = new Date(now.getFullYear(), now.getMonth()-i+1, 1)
        const rs = reviews.filter(r=>{const t=new Date(r.created_at); return t>=ms&&t<me})
        ratingMonthly.push(avgOf(rs))
      }

      // 12-month real sentiment
      const months12 = []
      for (let i=11;i>=0;i--){
        const ms = new Date(now.getFullYear(), now.getMonth()-i, 1)
        const me = new Date(now.getFullYear(), now.getMonth()-i+1, 1)
        const rs = reviews.filter(r=>{const t=new Date(r.created_at); return t>=ms&&t<me})
        months12.push({
          label: ms.toLocaleDateString('en-AE',{month:'short'}),
          pos: rs.filter(r=>r.rating>=4).length,
          neu: rs.filter(r=>r.rating===3).length,
          neg: rs.filter(r=>r.rating<=2).length,
        })
      }
      setSentiment12(months12)

      // trust score (real from DB; fallback compute on 0–100)
      const verified  = company.is_verified ? 1 : 0
      const fallback  = Math.round(((verified*0.4)+(parseFloat(avg)/5*0.4)+Math.min(reviews.length/50,1)*0.2)*100)
      const realTrust = (company.trust_score!=null) ? Number(company.trust_score) : fallback

      setStats({ views:company.profile_views||0, reviews:reviews.length, avgRating:avg, portfolio:portfolioRes.data?.length||0, newReviews:newRev, reputationGrowth:repGrowth, trust:realTrust })
      setMemberCount(membersRes.data?.length||0)
      setSpark({ reviews:reviewsDaily, leads:leadsDaily, rating:ratingMonthly })
      setChanges({ reviews:pctReviews, leads:pctLeads, rating:pctRating })

      const lWon    = leads.filter(l=>l.status==='won').length
      const lActive = leads.filter(l=>!['won','lost'].includes(l.status)).length
      const lNew    = leads.filter(l=>l.created_at>=monthStart).length
      setLeadStats({ total:leads.length, active:lActive, won:lWon, newThisMonth:lNew })

      const {data:recent} = await supabase.from('reviews').select('*').eq('company_id',company.id).order('created_at',{ascending:false}).limit(3)
      setRecentReviews(recent||[])
    } catch(e){console.error('Dashboard fetch error:',e)}
    finally{setLoading(false)}
  }

  /* ---------- derived ---------- */
  const plan        = company?.plan||'free'
  const pc          = PLAN_CONFIG[plan]||PLAN_CONFIG.free
  const expiryInfo  = getExpiryInfo(company?.plan_expires_at)
  const profilePct  = calcProfileComplete(company)
  const profileDone = profilePct >= 100
  const defaultName = staff?.name || company?.name || (user?.email||'').split('@')[0] || ''
  const tierKey     = (company?.trust_tier||'').toLowerCase()
  const tierLabel   = TIER_LABEL[tierKey] || (company?.is_verified ? 'Verified' : 'Listed')

  const pos = reviewDist[5]+reviewDist[4]
  const neu = reviewDist[3]
  const neg = reviewDist[2]+reviewDist[1]

  // verification % (real if present)
  const verifPct = company?.verification_percent!=null ? Number(company.verification_percent)
                 : company?.doc_verification_percent!=null ? Number(company.doc_verification_percent)
                 : (company?.is_verified ? 100 : 25)

  const trustSuggestions = [
    { done:company?.is_verified,            label:'Get Trade License Verified', points:'High' },
    { done:parseFloat(stats.avgRating)>=4,  label:'Maintain 4+ star rating',    points:'High' },
    { done:stats.reviews>=10,               label:'Get 10+ customer reviews',   points:'Medium' },
    { done:!!company?.logo_url,             label:'Upload company logo',        points:'Boost' },
    { done:!!company?.description,          label:'Complete your description',  points:'Boost' },
  ]

  const journey = [
    { icon:'ti-eye',           label:'Profile Views', value:stats.views,                       color:'#3b82f6' },
    { icon:'ti-message-circle',label:'Reviews',       value:stats.reviews,                     color:'#8b5cf6' },
    { icon:'ti-star',          label:'Avg Rating',    value:stats.avgRating||'0.0',            color:'#e8b84b' },
    { icon:'ti-calendar',      label:'New (30D)',     value:stats.newReviews,                  color:'#10b981' },
    { icon:'ti-shield-check',  label:'Verified',      value:company?.is_verified?'Yes':'No',   color:company?.is_verified?'#10b981':'#ef4444' },
  ]

  const fmtChange = (p)=> `${p>=0?'+':''}${p}%`

  const statCards = [
    { label:'Trust Score',     value:loading?'—':Math.round(stats.trust), icon:'ti-shield-check',   color:'#10b981', glow:'rgba(16,185,129,0.16)', sub:tierLabel,                 page:'trust' },
    { label:'Total Reviews',   value:loading?'—':stats.reviews,           icon:'ti-message-circle', color:'#e8b84b', glow:'rgba(232,184,75,0.16)', spark:spark.reviews, change:changes.reviews, page:'reviews' },
    { label:'Avg Rating',      value:loading?'—':(stats.avgRating||'0.0'),icon:'ti-star',           color:'#f59e0b', glow:'rgba(245,158,11,0.16)', spark:spark.rating, change:changes.rating, suffix:'★', page:'reviews' },
    { label:'New Leads (30D)', value:loading?'—':leadStats.newThisMonth,  icon:'ti-user-plus',      color:'#0891b2', glow:'rgba(8,145,178,0.16)',  spark:spark.leads, change:changes.leads, page:'leads' },
    { label:'Active Pipeline', value:loading?'—':leadStats.active,        icon:'ti-arrows-right',   color:'#8b5cf6', glow:'rgba(139,92,246,0.16)', sub:'in progress',              page:'leads' },
    { label:'Leads Won',       value:loading?'—':leadStats.won,           icon:'ti-trophy',         color:'#10b981', glow:'rgba(16,185,129,0.16)', sub:'closed',                   page:'leads' },
  ]

  // real, derived AI insight scores
  const convRate = leadStats.total ? Math.round((leadStats.won/leadStats.total)*100) : 0
  const repHealth = stats.reputationGrowth==='High'?85 : stats.reputationGrowth==='Stable'?60 : 35
  const aiScores = [
    { label:'Review Quality',      score: parseFloat(stats.avgRating)/5*100 || 0, color:'#10b981' },
    { label:'Reputation Trend',    score: repHealth,                              color:'#3b82f6' },
    { label:'Lead Conversion',     score: convRate,                               color:'#e8b84b' },
    { label:'Profile Strength',    score: profilePct,                             color:'#f59e0b' },
    { label:'Verification Level',  score: verifPct,                               color:'#8b5cf6' },
  ]

  // real, rule-based business summary
  const summary = [
    { label:'Reputation', text: stats.reviews>0 ? `${stats.reviews} reviews at ${stats.avgRating}★ average.` : 'No reviews yet — invite happy clients to review you.' },
    { label:'This Month', text: stats.newReviews>0 ? `${stats.newReviews} new review${stats.newReviews>1?'s':''} (${stats.reputationGrowth} momentum).` : 'No new reviews this month.' },
    { label:'Leads',      text: leadStats.total>0 ? `${leadStats.newThisMonth} new this month · ${leadStats.won} won · ${convRate}% conversion.` : 'No leads received yet.' },
    { label:'Profile',    text: profileDone ? 'Profile 100% complete ✓' : `Profile ${profilePct}% complete — finish it to rank higher.` },
    { label:'Next Step',  text: !company?.is_verified ? 'Get verified to boost trust score & visibility.' : (stats.avgRating<4 ? 'Focus on service quality to lift your rating.' : 'Keep engaging — request reviews after each job.') },
  ]

  const sectionTitle = { fontSize:11, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.04em' }

  const distTotal = stats.reviews || 1

  return (
    <div className="page-content animate-in dashpage" style={{ color:'var(--text)' }}>

      <style>{DASH_CSS}</style>

      {expiryInfo?.urgent && plan!=='free' && (
        <div style={{ background:expiryInfo.bg, border:`0.5px solid ${expiryInfo.border}`, borderRadius:12, padding:'12px 18px', display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
          <i className="ti ti-alert-triangle" style={{ fontSize:18, color:expiryInfo.color }}/>
          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ fontSize:13, fontWeight:700, color:expiryInfo.color }}>
              {expiryInfo.expired?'Your plan has expired!':`Your ${pc.name} plan expires in ${expiryInfo.days} days!`}
            </div>
            <div style={{ fontSize:11, color:expiryInfo.color, opacity:0.85, marginTop:2 }}>
              {expiryInfo.expired?'Renew now to restore features.':'Renew now to avoid losing premium features.'}
            </div>
          </div>
          <button className="btn btn-primary btn-sm"
            onClick={()=>window.open(`https://wa.me/971503856786?text=Hi, I need to renew my TrustDubai ${plan} plan`,'_blank')}>Renew Now</button>
        </div>
      )}

      {/* HEADER */}
      <div style={{ marginBottom:16 }}>
        <h1 className="font-syne" style={{ fontSize:'clamp(19px,2.4vw,24px)', fontWeight:800, color:'var(--text)', letterSpacing:'-0.3px', margin:0 }}>
          {company?.name||'My Business'} {pc.welcomeEmoji}
        </h1>
        <p style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>Here's how your business is performing on TrustDubai.</p>
      </div>

      {/* 6 STAT CARDS */}
      <div className="dash-stats">
        {statCards.map((card,i)=>(
          <GlowCard key={i} glow={card.glow}
            style={{ cursor:card.page?'pointer':'default', transition:'transform .15s, border-color .15s' }}
            onClick={()=>{ if(card.page) onNavigate(card.page) }}
            onMouseEnter={e=>{ if(card.page){ e.currentTarget.style.borderColor=card.color; e.currentTarget.style.transform='translateY(-2px)' }}}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='none' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:9 }}>
              <div style={{ width:30, height:30, borderRadius:8, background:card.color+'22', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <i className={`ti ${card.icon}`} style={{ fontSize:15, color:card.color }}/>
              </div>
              {card.change!=null
                ? <span style={{ fontSize:9, fontWeight:700, color: card.change>=0?'#10b981':'#ef4444' }}>{fmtChange(card.change)}</span>
                : <span style={{ fontSize:9, color:'var(--text3)', fontWeight:600 }}>{card.sub}</span>}
            </div>
            <div style={{ fontSize:9, color:'var(--text3)', marginBottom:4 }}>{card.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:'var(--text)', lineHeight:1, marginBottom:7 }}>
              {card.suffix && card.value!=='—' ? `${card.value}${card.suffix}` : card.value}
            </div>
            {card.spark
              ? <Sparkline data={card.spark} color={card.color} height={28}/>
              : <div style={{ height:28, display:'flex', alignItems:'center' }}><span style={{ fontSize:9, color:'var(--text3)' }}>{card.change!=null?'last 14 days':card.sub}</span></div>}
          </GlowCard>
        ))}
      </div>

      {/* ROW: JOURNEY + PROFILE + CLOCK */}
      <div className="dash-mid1">
        <GlowCard glow="rgba(59,130,246,0.12)" className="m1-journey">
          <div style={{ ...sectionTitle, marginBottom:16 }}>Review Journey Overview</div>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', position:'relative', gap:4 }}>
            <div style={{ position:'absolute', top:21, left:'10%', right:'10%', height:2, background:'var(--bg2)' }}/>
            {journey.map((j,i)=>(
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:7, flex:1, position:'relative', zIndex:1, minWidth:0 }}>
                <div style={{ width:44, height:44, borderRadius:'50%', background:j.color+'1f', border:`1.5px solid ${j.color}55`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={`ti ${j.icon}`} style={{ fontSize:18, color:j.color }}/>
                </div>
                <div style={{ fontSize:9.5, color:'var(--text3)', textAlign:'center' }}>{j.label}</div>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{loading?'—':j.value}</div>
              </div>
            ))}
          </div>
        </GlowCard>

        <GlowCard glow={profileDone?'rgba(16,185,129,0.14)':'rgba(232,184,75,0.14)'} style={{ display:'flex', flexDirection:'column', justifyContent:'center' }}>
          {profileDone ? (
            <div style={{ textAlign:'center' }}>
              <i className="ti ti-circle-check" style={{ fontSize:26, color:'#10b981', marginBottom:6 }}/>
              <div style={{ fontSize:13, fontWeight:700, color:'#10b981' }}>Profile Completed ✓</div>
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:3 }}>100% complete</div>
            </div>
          ) : (
            <>
              <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', marginBottom:8 }}>Profile {profilePct}% complete</div>
              <div style={{ width:'100%', height:6, background:'var(--bg2)', borderRadius:99, overflow:'hidden', marginBottom:10 }}>
                <div style={{ width:`${profilePct}%`, height:'100%', background:'linear-gradient(90deg,#e8b84b,#c9952a)', borderRadius:99 }}/>
              </div>
              <button className="btn btn-sm btn-primary" style={{ alignSelf:'flex-start' }} onClick={()=>onNavigate('profile')}>Complete Profile</button>
            </>
          )}
        </GlowCard>

        <ClockCard defaultName={defaultName} />
      </div>

      {/* ROW: SENTIMENT TREND + TRUST SCORE + REVIEW SENTIMENT */}
      <div className="dash-row3">
        <GlowCard glow="rgba(16,185,129,0.1)" className="r3-trend">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, gap:8 }}>
            <div>
              <div style={sectionTitle}>Customer Sentiment</div>
              <div style={{ fontSize:9, color:'var(--text3)', marginTop:2 }}>Your reviews · last 12 months</div>
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {[['#10b981','Positive'],['#94a3b8','Neutral'],['#f87171','Negative']].map(([c,l])=>(
                <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:8.5, color:'var(--text2)' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:c }}/>{l}
                </div>
              ))}
            </div>
          </div>
          <SentimentTrend months={sentiment12.length?sentiment12:Array.from({length:12},(_,i)=>({label:'',pos:0,neu:0,neg:0}))}/>
        </GlowCard>

        <GlowCard glow="rgba(16,185,129,0.12)">
          <div style={{ ...sectionTitle, marginBottom:10 }}>Trust Score</div>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
            <TrustGauge score={stats.trust}/>
          </div>
          <div style={{ textAlign:'center', marginBottom:10 }}>
            <span style={{ background:'rgba(16,185,129,0.1)', color: company?.is_verified?'#10b981':'#e8b84b', fontSize:9, fontWeight:700, padding:'3px 9px', borderRadius:99, border:`0.5px solid ${company?.is_verified?'rgba(16,185,129,0.4)':'rgba(232,184,75,0.4)'}` }}>
              {tierLabel}{company?.is_verified?' · Verified':''}
            </span>
          </div>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--text2)', marginBottom:7, textTransform:'uppercase', letterSpacing:'0.04em' }}>Build Your Score</div>
          {trustSuggestions.slice(0,3).map(s=>(
            <div key={s.label} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
              <i className={`ti ${s.done?'ti-circle-check':'ti-circle'}`} style={{ fontSize:11, color:s.done?'#10b981':'var(--border2)', flexShrink:0 }}/>
              <span style={{ fontSize:8.5, color:s.done?'#10b981':'var(--text2)', flex:1, lineHeight:1.3 }}>{s.label}</span>
              <span style={{ fontSize:8, color:s.done?'#10b981':'#e8b84b', fontWeight:600, flexShrink:0 }}>{s.points}</span>
            </div>
          ))}
        </GlowCard>

        <GlowCard glow="rgba(16,185,129,0.12)">
          <div style={{ ...sectionTitle, marginBottom:10 }}>Review Sentiment</div>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
            <SentimentDonut pos={pos} neu={neu} neg={neg}/>
          </div>
          {[['Positive','#10b981',pos],['Neutral','#94a3b8',neu],['Negative','#f87171',neg]].map(([l,c,v])=>(
            <div key={l} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:9.5, color:'var(--text2)' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:c }}/>{l}
              </div>
              <span style={{ fontSize:9.5, fontWeight:700, color:'var(--text)' }}>{v}</span>
            </div>
          ))}
        </GlowCard>
      </div>

      {/* ROW: AI SUMMARY + RATING DISTRIBUTION + AI INSIGHTS */}
      <div className={aiInsightsOn ? 'dash-row4' : 'dash-row4 two'}>
        <GlowCard glow="rgba(139,92,246,0.14)">
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <i className="ti ti-robot" style={{ fontSize:14, color:'#8b5cf6' }}/>
            <div style={sectionTitle}>Business Summary</div>
          </div>
          {summary.map(item=>(
            <div key={item.label} style={{ marginBottom:9 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#a78bfa', marginBottom:2 }}>{item.label}</div>
              <div style={{ fontSize:9.5, color:'var(--text2)', lineHeight:1.5 }}>{item.text}</div>
            </div>
          ))}
        </GlowCard>

        <GlowCard glow="rgba(232,184,75,0.12)">
          <div style={{ ...sectionTitle, marginBottom:12 }}>Rating Distribution</div>
          {[5,4,3,2,1].map(star=>{
            const v = reviewDist[star]
            const colr = star>=4?'#10b981':star===3?'#e8b84b':'#f87171'
            return (
              <div key={star} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:9 }}>
                <span style={{ fontSize:10, color:'var(--text2)', width:26 }}>{star}★</span>
                <div style={{ flex:1, height:6, background:'var(--bg2)', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ width:`${Math.round(v/distTotal*100)}%`, height:'100%', background:colr, borderRadius:99 }}/>
                </div>
                <span style={{ fontSize:9.5, fontWeight:700, color:'var(--text)', width:26, textAlign:'right' }}>{v}</span>
              </div>
            )
          })}
          {stats.reviews===0 && <div style={{ fontSize:10, color:'var(--text3)', textAlign:'center', marginTop:4 }}>No reviews yet</div>}
        </GlowCard>

        {aiInsightsOn && (
          <GlowCard glow="rgba(232,184,75,0.12)">
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
              <i className="ti ti-bulb" style={{ fontSize:14, color:'#e8b84b' }}/>
              <div style={sectionTitle}>Performance Scores</div>
            </div>
            {aiScores.map(s=><ScoreRow key={s.label} label={s.label} score={s.score} color={s.color}/>)}
          </GlowCard>
        )}
      </div>

      {/* BOTTOM ROW */}
      <div className="dash-bottom">
        <NotificationsCard cardStyle={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:16 }} C={{ text:'var(--text)', text2:'var(--text2)', text3:'var(--text3)', border:'var(--border)', bg:'var(--bg2)' }} onOpenPage={() => onNavigate('notifications')} />

        <GlowCard glow="rgba(59,130,246,0.1)">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={sectionTitle}>Latest Reviews</div>
            <button style={{ padding:'3px 8px', background:'var(--bg2)', border:'0.5px solid var(--border)', borderRadius:6, fontSize:9, color:'var(--text2)', cursor:'pointer' }} onClick={()=>onNavigate('reviews')}>View All</button>
          </div>
          {recentReviews.length===0 ? (
            <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text3)', fontSize:11 }}>No reviews yet</div>
          ) : recentReviews.map((r,i)=>(
            <div key={r.id} style={{ padding:'8px 0', borderBottom:i<recentReviews.length-1?'0.5px solid var(--border)':'none' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7, minWidth:0 }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:'#e8b84b22', color:'#d97706', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0 }}>
                    {(r.reviewer_name||'A')[0]}
                  </div>
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.reviewer_name||'Anonymous'}</span>
                </div>
                <div style={{ display:'flex', gap:1, flexShrink:0 }}>
                  {[1,2,3,4,5].map(s=><span key={s} style={{ fontSize:10, color:s<=r.rating?'#e8b84b':'var(--border2)' }}>★</span>)}
                </div>
              </div>
              <p style={{ fontSize:10, color:'var(--text2)', lineHeight:1.5, margin:0 }}>
                {(r.comment||r.review_text||'').slice(0,60)}{(r.comment||r.review_text||'').length>60?'...':''}
              </p>
              <span style={{ fontSize:8.5, color:'var(--text3)' }}>{new Date(r.created_at).toLocaleDateString('en-AE',{day:'numeric',month:'short'})}</span>
            </div>
          ))}
        </GlowCard>

        <div style={{ display:'flex', flexDirection:'column', gap:12, minWidth:0 }}>
          <GlowCard glow={company?.is_verified?'rgba(16,185,129,0.14)':'rgba(239,68,68,0.14)'} style={{ flex:1 }}>
            <div style={{ ...sectionTitle, marginBottom:10 }}>Verification Status</div>
            <div style={{ textAlign:'center', padding:'8px 0' }}>
              <div style={{ width:50, height:50, borderRadius:'50%', background:company?.is_verified?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)', border:`2px solid ${company?.is_verified?'#10b981':'#ef4444'}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 8px' }}>
                <i className={`ti ${company?.is_verified?'ti-shield-check':'ti-shield-x'}`} style={{ fontSize:24, color:company?.is_verified?'#10b981':'#ef4444' }}/>
              </div>
              <div style={{ fontSize:11, fontWeight:700, color:company?.is_verified?'#10b981':'#ef4444', marginBottom:2 }}>
                {company?.is_verified?'Verified Business':'Not Verified'}
              </div>
              <div style={{ fontSize:9, color:'var(--text3)' }}>{Math.round(verifPct)}% verification complete</div>
            </div>
            <div style={{ height:4, background:'var(--bg2)', borderRadius:99, overflow:'hidden', margin:'6px 0' }}>
              <div style={{ width:`${Math.max(8,Math.round(verifPct))}%`, height:'100%', background:company?.is_verified?'#10b981':'#f59e0b', borderRadius:99 }}/>
            </div>
            {!company?.is_verified && (
              <button className="btn btn-sm btn-primary" style={{ width:'100%', marginTop:6 }} onClick={()=>onNavigate('trust')}>Get Verified</button>
            )}
          </GlowCard>

          <GlowCard glow="rgba(139,92,246,0.14)">
            <div style={{ ...sectionTitle, color:'#a78bfa', marginBottom:10 }}>Premium Features</div>
            {[
              { icon:'ti-star',      label:'Featured Listings',   page:'plans' },
              { icon:'ti-ad-2',      label:'Sponsored Placement', page:'sponsored' },
              { icon:'ti-chart-bar', label:'Advanced Analytics',  page:'analytics' },
              { icon:'ti-robot',     label:'AI Reputation Tools', page:'plans' },
            ].map((f,idx,arr)=>(
              <div key={f.label} onClick={()=>onNavigate(f.page)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:idx<arr.length-1?'0.5px solid var(--border)':'none', cursor:'pointer' }}>
                <i className={`ti ${f.icon}`} style={{ fontSize:12, color:'#a78bfa' }}/>
                <span style={{ fontSize:10, color:'var(--text2)', flex:1 }}>{f.label}</span>
                <i className="ti ti-arrow-right" style={{ fontSize:11, color:'var(--text3)' }}/>
              </div>
            ))}
          </GlowCard>
        </div>
      </div>

    </div>
  )
}

/* ====================== RESPONSIVE LAYOUT (CSS) ======================
   Full responsive — phone / tablet / iPad / laptop / desktop / big PC.
   Light + dark handled by app-level --css variables (var(--card) etc).
   ==================================================================== */
const DASH_CSS = `
.dashpage * { box-sizing:border-box; }
.dash-stats  { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-bottom:14px; }
.dash-mid1   { display:grid; grid-template-columns:2.2fr 1fr 1fr; gap:12px; margin-bottom:14px; }
.dash-row3   { display:grid; grid-template-columns:1.7fr 1fr 1fr; gap:12px; margin-bottom:14px; }
.dash-row4   { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:14px; }
.dash-row4.two { grid-template-columns:repeat(2,1fr); }
.dash-bottom { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
.dash-stats>*,.dash-mid1>*,.dash-row3>*,.dash-row4>*,.dash-bottom>* { min-width:0; }

/* big PC */
@media (min-width:1700px){
  .dash-stats,.dash-mid1,.dash-row3,.dash-row4,.dash-bottom{ gap:14px; }
}
/* laptop / small desktop */
@media (max-width:1280px){
  .dash-stats  { grid-template-columns:repeat(3,1fr); }
  .dash-mid1   { grid-template-columns:1fr 1fr; }
  .m1-journey  { grid-column:span 2; }
  .dash-row3   { grid-template-columns:1fr 1fr; }
  .r3-trend    { grid-column:span 2; }
  .dash-row4   { grid-template-columns:1fr 1fr; }
  .dash-row4.two { grid-template-columns:1fr 1fr; }
  .dash-bottom { grid-template-columns:1fr 1fr; }
}
/* tablet / iPad portrait */
@media (max-width:900px){
  .dash-bottom { grid-template-columns:1fr; }
}
/* large phone / small tablet */
@media (max-width:768px){
  .dash-stats  { grid-template-columns:1fr 1fr; gap:10px; }
  .dash-mid1   { grid-template-columns:1fr; }
  .m1-journey  { grid-column:auto; }
  .dash-row3   { grid-template-columns:1fr; }
  .r3-trend    { grid-column:auto; }
  .dash-row4, .dash-row4.two { grid-template-columns:1fr; }
}
/* small phone */
@media (max-width:380px){
  .dash-stats  { grid-template-columns:1fr; }
}
`
