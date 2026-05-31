// trustdubai-business/src/pages/DashboardPage.jsx
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import NotificationsCard from '../components/NotificationsCard'

const PLAN_CONFIG = {
  free:     { name:'Free',     color:'#6b7280', bg:'#f9fafb', border:'#e5e7eb', badge:'🆓', welcomeEmoji:'👋', maxMembers:2   },
  silver:   { name:'Silver',   color:'#64748b', bg:'#f1f5f9', border:'#cbd5e1', badge:'🥈', welcomeEmoji:'✨', maxMembers:5   },
  gold:     { name:'Gold',     color:'#d97706', bg:'#fffbeb', border:'#fcd34d', badge:'🥇', welcomeEmoji:'🌟', maxMembers:15  },
  platinum: { name:'Platinum', color:'#8b5cf6', bg:'#1e1b4b', border:'#4c1d95', badge:'💎', welcomeEmoji:'👑', maxMembers:999, isDark:true },
}

const TIMEZONES = [
  { tz:'Asia/Dubai',     label:'Dubai (GMT+4)' },
  { tz:'Asia/Karachi',   label:'Karachi (GMT+5)' },
  { tz:'Asia/Kolkata',   label:'India (GMT+5:30)' },
  { tz:'Asia/Riyadh',    label:'Riyadh (GMT+3)' },
  { tz:'Europe/London',  label:'London (GMT+0/1)' },
  { tz:'America/New_York',label:'New York (GMT-5/4)' },
]

const CLOCK_COLORS = ['#e8b84b','#0099cc','#10b981','#8b5cf6','#ef4444','#f59e0b','#0f172a','#ffffff']
const CLOCK_BGS    = ['#f8fafc','#fffbeb','#eff6ff','#f0fdf4','#faf5ff','#fef2f2','#0f172a','#1e1b4b']

const CLOCK_DEFAULTS = {
  fontColor:'#e8b84b', bgColor:'#f8fafc', tz:'Asia/Dubai',
  showUserName:true, customName:'',
}

function loadClockPrefs() {
  try {
    const raw = localStorage.getItem('td_clock_prefs')
    return raw ? { ...CLOCK_DEFAULTS, ...JSON.parse(raw) } : { ...CLOCK_DEFAULTS }
  } catch { return { ...CLOCK_DEFAULTS } }
}

function getExpiryInfo(expiresAt) {
  if (!expiresAt) return null
  const diff = Math.ceil((new Date(expiresAt) - new Date()) / 86400000)
  if (diff < 0)   return { label:'Plan Expired!',      color:'#ef4444', bg:'#fef2f2', border:'#fecaca', days:diff, expired:true,  urgent:true  }
  if (diff <= 7)  return { label:`${diff} days left`,  color:'#ef4444', bg:'#fef2f2', border:'#fecaca', days:diff, expired:false, urgent:true  }
  if (diff <= 30) return { label:`${diff} days left`,  color:'#f59e0b', bg:'#fffbeb', border:'#fcd34d', days:diff, expired:false, urgent:false }
  return            { label:`${diff} days left`,       color:'#10b981', bg:'#f0fdf4', border:'#a7f3d0', days:diff, expired:false, urgent:false }
}

function calcProfileComplete(c) {
  if (!c) return 0
  const fields = ['name','description','phone','logo_url','category','location']
  return Math.round(fields.filter(f=>!!c[f]).length/fields.length*100)
}

function Sparkline({ data, color, height=32 }) {
  if (!data||data.length<2) return (
    <svg width="80" height={height}><line x1="0" y1={height/2} x2="80" y2={height/2} stroke={color} strokeWidth="1.5" opacity="0.3" strokeDasharray="3,2"/></svg>
  )
  const max=Math.max(...data), min=Math.min(...data), range=max-min||1
  const pts=data.map((v,i)=>`${(i/(data.length-1))*80},${height-((v-min)/range)*(height-4)-2}`).join(' ')
  return (
    <svg width="80" height={height} style={{ overflow:'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
      <circle cx={80} cy={height-((data[data.length-1]-min)/range)*(height-4)-2} r="2.5" fill={color}/>
    </svg>
  )
}

function TrustGauge({ score, isDark }) {
  const r=40, cx=50, cy=50, circ=2*Math.PI*r
  const filled=(score/10)*circ
  const color=score>=8?'#10b981':score>=6?'#e8b84b':'#ef4444'
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={isDark?'rgba(255,255,255,0.07)':'#f1f5f9'} strokeWidth="8"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${filled} ${circ-filled}`} strokeDashoffset={circ*0.25} strokeLinecap="round"/>
      <text x={cx} y={cy-4} textAnchor="middle" fill={color} fontSize="18" fontWeight="700">{score}</text>
      <text x={cx} y={cy+11} textAnchor="middle" fill={isDark?'#6b7280':'#94a3b8'} fontSize="8">Trust Score</text>
    </svg>
  )
}

function AIScoreRow({ label, score, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
      <span style={{ fontSize:10, color:'#64748b', flex:1 }}>{label}</span>
      <div style={{ width:120, height:4, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
        <div style={{ width:`${score}%`, height:'100%', background:color, borderRadius:99 }}/>
      </div>
      <span style={{ fontSize:10, fontWeight:700, color, minWidth:28, textAlign:'right' }}>{score}%</span>
    </div>
  )
}

/* ---------- CLOCK CARD (big clock + gear settings) ---------- */
function ClockCard({ topCard, C, isDark, defaultName }) {
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

  const tzLabel = TIMEZONES.find(t=>t.tz===prefs.tz)?.label?.split(' (')[0] || 'Dubai'
  const userName = (prefs.customName?.trim() || defaultName || '').toUpperCase()
  const digitBg = prefs.bgColor
  const digitFg = prefs.fontColor

  const digitStyle = {
    background: digitBg,
    border: `1.5px solid ${digitFg}55`,
    borderRadius: 10,
    padding: '6px 10px',
    fontSize: 30,
    fontWeight: 800,
    color: digitFg,
    fontVariantNumeric: 'tabular-nums',
    minWidth: 50,
    textAlign: 'center',
    display: 'inline-block',
    lineHeight: 1,
  }

  return (
    <div style={{ ...topCard, position:'relative', alignItems:'center', textAlign:'center', overflow:'visible' }}>
      {/* gear */}
      <button onClick={()=>setOpen(v=>!v)} title="Clock settings"
        style={{ position:'absolute', top:8, right:8, width:24, height:24, borderRadius:6, border:'none', background:'transparent', cursor:'pointer', color:C.text3, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <i className="ti ti-settings" style={{ fontSize:15 }}/>
      </button>

      {/* big clock */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, marginTop:4 }}>
        <span ref={hhRef} style={digitStyle}/>
        <span style={{ fontSize:24, color:digitFg, opacity:0.6, fontWeight:700 }}>:</span>
        <span ref={mmRef} style={digitStyle}/>
        <span style={{ fontSize:24, color:digitFg, opacity:0.6, fontWeight:700 }}>:</span>
        <span ref={ssRef} style={digitStyle}/>
      </div>

      {/* bottom line: DATE | TZ + USER */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginTop:9, flexWrap:'wrap' }}>
        <span ref={dateRef} style={{ fontSize:11, fontWeight:800, color:C.text, letterSpacing:'0.02em' }}/>
        <div style={{ textAlign:'left', lineHeight:1.3 }}>
          <div style={{ fontSize:9.5, fontWeight:700, color:digitFg }}>{tzLabel} Time</div>
          {prefs.showUserName && userName && (
            <div style={{ fontSize:9.5, fontWeight:700, color:C.text2 }}>{userName}</div>
          )}
        </div>
      </div>

      {/* settings popup */}
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, zIndex:40 }}/>
          <div style={{ position:'absolute', top:34, right:6, zIndex:50, width:230, background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, boxShadow:'0 10px 30px rgba(0,0,0,0.15)', padding:14, textAlign:'left' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', marginBottom:10 }}>Clock Settings</div>

            <div style={{ fontSize:10, color:'#64748b', marginBottom:5 }}>Font Color</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              {CLOCK_COLORS.map(c=>(
                <button key={c} onClick={()=>update({fontColor:c})}
                  style={{ width:20, height:20, borderRadius:'50%', background:c, cursor:'pointer', border: prefs.fontColor===c ? '2px solid #0099cc' : '1px solid #e2e8f0' }}/>
              ))}
            </div>

            <div style={{ fontSize:10, color:'#64748b', marginBottom:5 }}>Background Color</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
              {CLOCK_BGS.map(c=>(
                <button key={c} onClick={()=>update({bgColor:c})}
                  style={{ width:20, height:20, borderRadius:'50%', background:c, cursor:'pointer', border: prefs.bgColor===c ? '2px solid #0099cc' : '1px solid #e2e8f0' }}/>
              ))}
            </div>

            <div style={{ fontSize:10, color:'#64748b', marginBottom:5 }}>Time Zone</div>
            <select value={prefs.tz} onChange={e=>update({tz:e.target.value})}
              style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 8px', fontSize:11, marginBottom:12, boxSizing:'border-box' }}>
              {TIMEZONES.map(t=><option key={t.tz} value={t.tz}>{t.label}</option>)}
            </select>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:10, color:'#64748b' }}>Show Name</span>
              <button onClick={()=>update({showUserName:!prefs.showUserName})}
                style={{ width:36, height:20, borderRadius:99, border:'none', cursor:'pointer', background: prefs.showUserName?'#0099cc':'#cbd5e1', position:'relative', transition:'all .15s' }}>
                <span style={{ position:'absolute', top:2, left: prefs.showUserName?18:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'all .15s' }}/>
              </button>
            </div>

            {prefs.showUserName && (
              <>
                <div style={{ fontSize:10, color:'#64748b', marginBottom:5 }}>Display Name</div>
                <input value={prefs.customName} onChange={e=>update({customName:e.target.value})}
                  placeholder={defaultName || 'Your name'}
                  style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 8px', fontSize:11, marginBottom:10, boxSizing:'border-box' }}/>
              </>
            )}

            <button onClick={()=>{ update({...CLOCK_DEFAULTS}); }}
              style={{ width:'100%', padding:'7px', borderRadius:8, border:'1px solid #e2e8f0', background:'#f8fafc', fontSize:11, color:'#64748b', cursor:'pointer' }}>
              Reset to Default
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function DashboardPage({ onNavigate }) {
  const { company, staff, user } = useAuth()
  const [stats,         setStats]         = useState({ views:0, reviews:0, avgRating:0, portfolio:0, newReviews:0, satisfaction:0, reputationGrowth:'Low', trustScore:'0.0' })
  const [recentReviews, setRecentReviews] = useState([])
  const [memberCount,   setMemberCount]   = useState(0)
  const [reviewDist,    setReviewDist]    = useState({ 5:0, 4:0, 3:0, 2:0, 1:0 })
  const [loading,       setLoading]       = useState(true)
  const [aiInsightsOn,  setAiInsightsOn]  = useState(true)  // global toggle (app_settings)

  useEffect(() => { if (company) fetchStats() }, [company])

  useEffect(() => { fetchAiInsightsSetting() }, [])

  async function fetchAiInsightsSetting() {
    const { data } = await supabase
      .from('app_settings').select('value').eq('key', 'feature.ai_insights').maybeSingle()
    setAiInsightsOn(data?.value?.enabled !== false)  // default ON agar setting na mile
  }

  async function fetchStats() {
    try {
      const [reviewsRes, portfolioRes, membersRes] = await Promise.all([
        supabase.from('reviews').select('rating,created_at').eq('company_id', company.id),
        supabase.from('portfolio_items').select('id').eq('company_id', company.id),
        supabase.from('employees').select('id').eq('current_company_id', company.id),
      ])

      const reviews = reviewsRes.data||[]
      const avg     = reviews.length>0
        ? (reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1) : 0

      const monthStart     = new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString()
      const newRev         = reviews.filter(r=>r.created_at>=monthStart).length

      const lastMonthStart = new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toISOString()
      const lastMonthEnd   = monthStart
      const lastMonthCount = reviews.filter(r=>r.created_at>=lastMonthStart&&r.created_at<lastMonthEnd).length
      const repGrowth      = lastMonthCount===0
        ? (newRev>0?'High':'Low')
        : newRev>lastMonthCount?'High'
        : newRev===lastMonthCount?'Stable':'Low'

      const satisfaction = avg>0 ? Math.round((parseFloat(avg)/5)*100) : 0

      const verified   = company.is_verified ? 1 : 0
      const trustScore = Math.min(10, parseFloat(
        ((verified*0.4)+(parseFloat(avg)/5*0.4)+Math.min(reviews.length/50,1)*0.2)*10
      ).toFixed(1))

      const dist = {5:0,4:0,3:0,2:0,1:0}
      reviews.forEach(r=>{ if(dist[r.rating]!==undefined) dist[r.rating]++ })
      setReviewDist(dist)

      setStats({ views:company.profile_views||0, reviews:reviews.length, avgRating:avg, portfolio:portfolioRes.data?.length||0, newReviews:newRev, satisfaction, reputationGrowth:repGrowth, trustScore })
      setMemberCount(membersRes.data?.length||0)

      const {data:recent} = await supabase.from('reviews').select('*').eq('company_id',company.id).order('created_at',{ascending:false}).limit(3)
      setRecentReviews(recent||[])
    } catch(e){console.error(e)}
    finally{setLoading(false)}
  }

  const plan       = company?.plan||'free'
  const pc         = PLAN_CONFIG[plan]||PLAN_CONFIG.free
  const isDark     = plan==='platinum'
  const isPlatinum = isDark
  const expiryInfo = getExpiryInfo(company?.plan_expires_at)
  const profilePct = calcProfileComplete(company)
  const profileDone = profilePct >= 100
  const defaultName = staff?.name || company?.name || (user?.email||'').split('@')[0] || ''

  const C = {
    text:   isDark?'#f1f5f9':'#0f172a',
    text2:  isDark?'#94a3b8':'#475569',
    text3:  isDark?'#6b7280':'#94a3b8',
    border: isDark?'rgba(255,255,255,0.08)':'#e2e8f0',
    card:   isDark?'#1e1b4b':'#ffffff',
    bg:     isDark?'rgba(255,255,255,0.04)':'#f8fafc',
    bar:    isDark?'rgba(255,255,255,0.08)':'#f1f5f9',
  }
  const cardS = { background:C.card, border:`0.5px solid ${C.border}`, borderRadius:12, padding:'14px 16px' }

  const maxDist = Math.max(...Object.values(reviewDist),1)

  const trustSuggestions = [
    { done:company?.is_verified,    label:'Get Trade License Verified',    icon:'ti-license',       points:'+4.0 pts' },
    { done:parseFloat(stats.avgRating)>=4, label:'Maintain 4+ star rating', icon:'ti-star',         points:'+4.0 pts' },
    { done:stats.reviews>=10,       label:'Get 10+ customer reviews',      icon:'ti-message-circle',points:'+2.0 pts' },
    { done:!!company?.logo_url,     label:'Upload company logo',           icon:'ti-photo',         points:'Profile boost' },
    { done:!!company?.description,  label:'Complete your description',     icon:'ti-file-text',     points:'Profile boost' },
  ]

  const blankCards = [
    { num:'1', color:'#3b82f6', bg:'#eff6ff', border:'#bfdbfe' },
    { num:'2', color:'#8b5cf6', bg:'#f5f3ff', border:'#ddd6fe' },
    { num:'3', color:'#ec4899', bg:'#fdf2f8', border:'#fbcfe8' },
  ]

  const topCard = { ...cardS, minHeight:130, boxSizing:'border-box', display:'flex', flexDirection:'column', justifyContent:'center' }

  // bottom row: AI Insights off hone par 4->3 columns
  const bottomCols = aiInsightsOn ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr'

  return (
    <div className="page-content animate-in" style={{ color:C.text, background:isDark?'#0f0e1a':'var(--bg)' }}>

      {/* EXPIRY WARNING */}
      {expiryInfo?.urgent && plan!=='free' && (
        <div style={{ background:expiryInfo.bg, border:`0.5px solid ${expiryInfo.border}`, borderRadius:10, padding:'12px 18px', display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <i className="ti ti-alert-triangle" style={{ fontSize:18, color:expiryInfo.color }}/>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:expiryInfo.color }}>
              {expiryInfo.expired?'Your plan has expired!':`Your ${pc.name} plan expires in ${expiryInfo.days} days!`}
            </div>
            <div style={{ fontSize:11, color:expiryInfo.color, opacity:0.8, marginTop:2 }}>
              {expiryInfo.expired?'Renew now to restore features.':'Renew now to avoid losing premium features.'}
            </div>
          </div>
          <button className="btn btn-primary btn-sm"
            onClick={()=>window.open(`https://wa.me/971503856786?text=Hi, I need to renew my TrustDubai ${plan} plan`,'_blank')}>
            Renew Now
          </button>
        </div>
      )}

      {/* HEADER */}
      <div style={{ marginBottom:14 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:C.text, letterSpacing:'-0.3px', fontFamily:"'Syne',sans-serif" }}>
          {company?.name||'My Business'} {pc.welcomeEmoji}
        </h1>
        <p style={{ fontSize:12, color:C.text2, marginTop:3 }}>Here's how your business is performing on TrustDubai.</p>
      </div>

      {/* TOP 6-CARD ROW */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:16 }}>

        {/* Card 1,2,3 — Blank placeholders */}
        {blankCards.map((b) => (
          <div key={b.num} style={{ ...topCard, background:b.bg, border:`0.5px solid ${b.border}`, alignItems:'center', textAlign:'center' }}>
            <div style={{ width:34, height:34, borderRadius:9, background:`${b.color}22`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:8 }}>
              <span style={{ fontSize:15, fontWeight:800, color:b.color }}>{b.num}</span>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:b.color }}>Coming Soon</div>
            <div style={{ fontSize:9, color:C.text3, marginTop:3 }}>Feature will update soon</div>
          </div>
        ))}

        {/* Card 4 — Plan Verified */}
        <div style={{ ...topCard, background: isPlatinum?'rgba(139,92,246,0.12)':`${pc.color}14`, border:`0.5px solid ${pc.color}55`, alignItems:'flex-start' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
            <span style={{ fontSize:20 }}>{pc.badge}</span>
            <span style={{ fontSize:12.5, fontWeight:700, color:pc.color, lineHeight:1.2 }}>{pc.name} Verified</span>
          </div>
          <div style={{ fontSize:9.5, color:isPlatinum?'rgba(167,139,250,0.85)':pc.color, opacity:0.9, lineHeight:1.4 }}>
            {plan==='free' ? 'Upgrade for priority listing' : 'on TrustDubai · Priority Listing Active'}
          </div>
        </div>

        {/* Card 5 — Profile completion */}
        <div style={{ ...topCard,
          background:profileDone ? (isDark?'rgba(16,185,129,0.1)':'#f0fdf4') : (isPlatinum?'rgba(139,92,246,0.08)':'linear-gradient(135deg,#fef9ed,#fef3c7)'),
          border:`0.5px solid ${profileDone ? '#a7f3d0' : (isPlatinum?'rgba(139,92,246,0.2)':'rgba(232,184,75,0.3)')}`,
          alignItems:'flex-start' }}>
          {profileDone ? (
            <>
              <i className="ti ti-circle-check" style={{ fontSize:24, color:'#10b981', marginBottom:6 }}/>
              <div style={{ fontSize:12.5, fontWeight:700, color:'#10b981' }}>Profile Completed ✓</div>
              <div style={{ fontSize:9.5, color:isDark?'rgba(255,255,255,0.6)':'#15803d', marginTop:3 }}>100% complete</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight:700, fontSize:12.5, color:isPlatinum?'#a78bfa':'#92400e', marginBottom:4 }}>Profile {profilePct}% complete</div>
              <div style={{ width:'100%', height:5, background:isPlatinum?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.08)', borderRadius:99, overflow:'hidden', marginBottom:7 }}>
                <div style={{ width:`${profilePct}%`, height:'100%', background:isPlatinum?'linear-gradient(90deg,#7c3aed,#a78bfa)':'linear-gradient(90deg,#e8b84b,#c9952a)', borderRadius:99 }}/>
              </div>
              <button className="btn btn-sm btn-primary" style={{ alignSelf:'flex-start' }} onClick={()=>onNavigate('profile')}>Complete</button>
            </>
          )}
        </div>

        {/* Card 6 — Clock (big + settings) */}
        <ClockCard topCard={topCard} C={C} isDark={isDark} defaultName={defaultName} />
      </div>

      {/* 6 TOP STAT CARDS */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'Trust Score', value:stats.trustScore, icon:'ti-shield-check', color:'#10b981', trend:[5,5.5,6,6.2,7,7.5,8,8.2,9,9.1,9.2,parseFloat(stats.trustScore)||0], change:'+6.5% Change', page:'reviews' },
          { label:'Total Reviews', value:stats.reviews, icon:'ti-message-circle', color:'#e8b84b', trend:[2,5,8,12,18,25,30,42,55,70,85,stats.reviews], change:'+3.1% Change', page:'reviews' },
          { label:'New Reviews (30D)', value:stats.newReviews, icon:'ti-star', color:'#3b82f6', trend:[0,1,2,3,5,4,6,8,7,9,10,stats.newReviews], change:'+12% Change', page:'reviews' },
          { label:'Average Rating', value:stats.avgRating||'0.0', icon:'ti-star', color:'#f59e0b', trend:[3,3.2,3.5,3.8,4,4.1,4.3,4.5,4.6,4.7,4.8,parseFloat(stats.avgRating)||0], change:'+0.1 Change', page:'reviews', suffix:'★' },
          { label:'Customer Satisfaction', value:`${stats.satisfaction}%`, icon:'ti-mood-smile', color:'#8b5cf6', trend:[60,65,70,72,75,78,80,82,84,86,88,stats.satisfaction], change:'+2.1% Change', isStr:true },
          { label:'Reputation Growth', value:stats.reputationGrowth, icon:'ti-trending-up', color:'#10b981', trend:[20,30,35,45,40,55,60,65,70,75,80,stats.reputationGrowth==='High'?90:stats.reputationGrowth==='Stable'?60:30], change:'vs last month', isStr:true },
        ].map((card,i) => (
          <div key={i}
            style={{ ...cardS, cursor:card.page?'pointer':'default', transition:'all 0.15s', position:'relative', overflow:'hidden' }}
            onClick={()=>{ if(card.page) onNavigate(card.page) }}
            onMouseEnter={e=>{ if(card.page){ e.currentTarget.style.borderColor=card.color+'55'; e.currentTarget.style.transform='translateY(-1px)' }}}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.transform='none' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ width:28, height:28, borderRadius:7, background:card.color+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className={`ti ${card.icon}`} style={{ fontSize:14, color:card.color }}/>
              </div>
              <span style={{ fontSize:8, color:C.text3, fontWeight:500 }}>{card.change}</span>
            </div>
            <div style={{ fontSize:8.5, color:C.text3, marginBottom:4 }}>{card.label}</div>
            <div style={{ fontSize:card.isStr?17:20, fontWeight:700, color:C.text, lineHeight:1, marginBottom:6 }}>
              {loading?'—':card.suffix?`${card.value}${card.suffix}`:card.value}
            </div>
            <Sparkline data={card.trend} color={card.color} height={26}/>
          </div>
        ))}
      </div>

      {/* MIDDLE ROW */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 1fr 1fr 1fr', gap:12, marginBottom:14 }}>

        {/* Sentiment Chart */}
        <div style={cardS}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em' }}>Customer Sentiment Analytics</div>
              <div style={{ fontSize:9, color:C.text3, marginTop:2 }}>Interactive · last 12 months</div>
            </div>
            <select style={{ fontSize:9, color:C.text2, background:C.bg, border:`0.5px solid ${C.border}`, borderRadius:6, padding:'3px 8px', cursor:'pointer' }}>
              <option>last 12 months</option>
            </select>
          </div>
          <div style={{ display:'flex', gap:12, marginBottom:8 }}>
            {[['#10b981','Positive'],['#94a3b8','Neutral'],['#f87171','Negative']].map(([c,l])=>(
              <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:8.5, color:C.text2 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:c }}/>{l}
              </div>
            ))}
          </div>
          <div style={{ position:'relative', height:100 }}>
            <div style={{ position:'absolute', left:24, right:0, top:0, bottom:16 }}>
              <svg width="100%" height="100%" viewBox="0 0 400 84" preserveAspectRatio="none">
                {[0,42,84].map(y=><line key={y} x1="0" y1={y} x2="400" y2={y} stroke={isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)'} strokeWidth="0.5"/>)}
                <path d="M0,70 40,62 80,55 120,45 160,38 200,30 240,22 280,15 320,10 360,7 400,5 L400,84 L0,84 Z" fill="rgba(16,185,129,0.08)"/>
                <polyline points="0,70 40,62 80,55 120,45 160,38 200,30 240,22 280,15 320,10 360,7 400,5" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="0,76 40,74 80,72 120,70 160,68 200,66 240,64 280,62 320,60 360,58 400,56" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3,2"/>
                <polyline points="0,80 40,79 80,78 120,77 160,76 200,75 240,74 280,73 320,72 360,71 400,70" fill="none" stroke="#f87171" strokeWidth="1" strokeLinecap="round" strokeDasharray="2,3"/>
              </svg>
            </div>
            <div style={{ position:'absolute', left:0, top:0, bottom:16, display:'flex', flexDirection:'column', justifyContent:'space-between', width:22 }}>
              {['100','50','0'].map(l=><span key={l} style={{ fontSize:7, color:C.text3 }}>{l}</span>)}
            </div>
            <div style={{ position:'absolute', left:24, right:0, bottom:0, display:'flex', justifyContent:'space-between' }}>
              {['Jan','Mar','May','Jul','Sep','Nov'].map(m=><span key={m} style={{ fontSize:7, color:C.text3 }}>{m}</span>)}
            </div>
          </div>
        </div>

        {/* AI Business Summary */}
        <div style={{ ...cardS, background:isDark?'rgba(139,92,246,0.1)':'#fafafa', border:`0.5px solid ${isDark?'rgba(139,92,246,0.2)':'#e2e8f0'}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <i className="ti ti-robot" style={{ fontSize:14, color:'#8b5cf6' }}/>
            <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em' }}>AI Business Summary</div>
          </div>
          {[
            { label:'What Customers Love',     text:'Professional team, quality work & timely delivery.' },
            { label:'Common Complaints',        text:'Response time could be faster on weekends.' },
            { label:'Recent Reputation Change', text:'10% increase in service scores this month.' },
            { label:'Growth Opportunity',       text:"Leverage 'Featured Listings' for peak inquiries." },
            { label:'Suggested Action',         text:"Address 'Weekend response time' during high demand." },
          ].map(item=>(
            <div key={item.label} style={{ marginBottom:8 }}>
              <div style={{ fontSize:9, fontWeight:700, color:isDark?'#a78bfa':'#7c3aed', marginBottom:2 }}>{item.label}</div>
              <div style={{ fontSize:9.5, color:C.text2, lineHeight:1.5 }}>{item.text}</div>
            </div>
          ))}
        </div>

        {/* Review Distribution */}
        <div style={cardS}>
          <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:10 }}>Review Distribution</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:5, height:80, marginBottom:8 }}>
            {[5,4,3,2,1].map(s=>(
              <div key={s} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                <div style={{ width:'100%', background:'#e8b84b', borderRadius:'4px 4px 0 0', transition:'height 0.5s', height:`${Math.max(4,(reviewDist[s]/maxDist)*70)}px` }}/>
                <span style={{ fontSize:8, color:C.text3 }}>{s}★</span>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'center', gap:6, flexWrap:'wrap' }}>
            {[5,4,3,2,1].map(s=>(
              <span key={s} style={{ fontSize:8, color:C.text2 }}>{s}★ {reviewDist[s]}</span>
            ))}
          </div>
        </div>

        {/* Trust Score Gauge */}
        <div style={cardS}>
          <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:10 }}>Trust Score</div>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
            <TrustGauge score={parseFloat(stats.trustScore)||0} isDark={isDark}/>
          </div>
          <div style={{ textAlign:'center', marginBottom:8 }}>
            <span style={{ background:isDark?'rgba(16,185,129,0.15)':'#f0fdf4', color:'#10b981', fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:99, border:'0.5px solid #a7f3d0' }}>
              {company?.is_verified?'Verified Badge':'Not Verified'}
            </span>
          </div>
          <div style={{ fontSize:9, fontWeight:700, color:C.text2, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.04em' }}>Build Your Score</div>
          {trustSuggestions.slice(0,3).map(s=>(
            <div key={s.label} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
              <i className={`ti ${s.done?'ti-circle-check':'ti-circle'}`} style={{ fontSize:11, color:s.done?'#10b981':'#d1d5db', flexShrink:0 }}/>
              <span style={{ fontSize:8.5, color:s.done?'#10b981':C.text2, flex:1, lineHeight:1.3 }}>{s.label}</span>
              <span style={{ fontSize:8, color:s.done?'#10b981':'#e8b84b', fontWeight:600, flexShrink:0 }}>{s.points}</span>
            </div>
          ))}
        </div>

        {/* Review Highlights */}
        <div style={cardS}>
          <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:10 }}>Review Highlights</div>
          <div style={{ fontSize:9, fontWeight:700, color:C.text2, marginBottom:6 }}>What People Love</div>
          {[['Service Quality','82%'],['Professionalism','55%'],['Value for Money','40%'],['Timeliness','12%']].map(([l,v])=>(
            <div key={l} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
              <span style={{ fontSize:9, color:C.text2, flex:1 }}>{l}</span>
              <div style={{ width:60, height:3, background:C.bar, borderRadius:99, overflow:'hidden' }}>
                <div style={{ width:v, height:'100%', background:'#10b981', borderRadius:99 }}/>
              </div>
              <span style={{ fontSize:8.5, color:'#10b981', fontWeight:600, marginLeft:4, minWidth:24 }}>{v}</span>
            </div>
          ))}
          <div style={{ fontSize:9, fontWeight:700, color:C.text2, margin:'8px 0 6px' }}>What People Dislike</div>
          {[['Response Time','28%'],['Wait Times','25%'],['Pricing','13%']].map(([l,v])=>(
            <div key={l} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
              <span style={{ fontSize:9, color:C.text2, flex:1 }}>{l}</span>
              <div style={{ width:60, height:3, background:C.bar, borderRadius:99, overflow:'hidden' }}>
                <div style={{ width:v, height:'100%', background:'#f87171', borderRadius:99 }}/>
              </div>
              <span style={{ fontSize:8.5, color:'#f87171', fontWeight:600, marginLeft:4, minWidth:24 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM ROW */}
      <div style={{ display:'grid', gridTemplateColumns:bottomCols, gap:12, marginBottom:14 }}>

        {/* Notifications Card */}
        <NotificationsCard cardStyle={cardS} C={C} onOpenPage={() => onNavigate('notifications')} />

        {/* AI Insights — global toggle se control */}
        {aiInsightsOn && (
          <div style={cardS}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
              <i className="ti ti-bulb" style={{ fontSize:14, color:'#e8b84b' }}/>
              <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em' }}>AI Insights</div>
            </div>
            <AIScoreRow label="Trust Trend Analysis"   score={92} color="#10b981"/>
            <AIScoreRow label="Review Quality Score"   score={80} color="#3b82f6"/>
            <AIScoreRow label="Customer Loyalty Score" score={50} color="#e8b84b"/>
            <AIScoreRow label="Reputation Health"      score={45} color="#f59e0b"/>
            <AIScoreRow label="Risk Indicators"        score={10} color="#ef4444"/>
          </div>
        )}

        {/* Latest Reviews */}
        <div style={cardS}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em' }}>Latest Reviews</div>
            <button style={{ padding:'3px 8px', background:C.bg, border:`0.5px solid ${C.border}`, borderRadius:6, fontSize:9, color:C.text2, cursor:'pointer' }} onClick={()=>onNavigate('reviews')}>View All</button>
          </div>
          {recentReviews.length===0 ? (
            <div style={{ textAlign:'center', padding:'20px 0', color:C.text3, fontSize:11 }}>No reviews yet</div>
          ) : recentReviews.map((r,i)=>(
            <div key={r.id} style={{ padding:'8px 0', borderBottom:i<recentReviews.length-1?`0.5px solid ${C.border}`:'none' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:'#e8b84b22', color:'#d97706', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700 }}>
                    {(r.reviewer_name||'A')[0]}
                  </div>
                  <span style={{ fontSize:10, fontWeight:600, color:C.text }}>{r.reviewer_name||'Anonymous'}</span>
                </div>
                <div style={{ display:'flex', gap:1 }}>
                  {[1,2,3,4,5].map(s=><span key={s} style={{ fontSize:10, color:s<=r.rating?'#e8b84b':'#d1d5db' }}>★</span>)}
                </div>
              </div>
              <p style={{ fontSize:10, color:C.text2, lineHeight:1.5, margin:0 }}>
                {(r.comment||r.review_text||'').slice(0,60)}{(r.comment||r.review_text||'').length>60?'...':''}
              </p>
              <span style={{ fontSize:8.5, color:C.text3 }}>{new Date(r.created_at).toLocaleDateString('en-AE',{day:'numeric',month:'short'})}</span>
            </div>
          ))}
        </div>

        {/* Verification + Premium */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ ...cardS, flex:1 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:10 }}>Verification Status</div>
            <div style={{ textAlign:'center', padding:'10px 0' }}>
              <div style={{ width:50, height:50, borderRadius:'50%', background:company?.is_verified?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)', border:`2px solid ${company?.is_verified?'#10b981':'#ef4444'}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 8px' }}>
                <i className={`ti ${company?.is_verified?'ti-shield-check':'ti-shield-x'}`} style={{ fontSize:24, color:company?.is_verified?'#10b981':'#ef4444' }}/>
              </div>
              <div style={{ fontSize:11, fontWeight:700, color:company?.is_verified?'#10b981':'#ef4444', marginBottom:2 }}>
                {company?.is_verified?'Verified Business':'Not Verified'}
              </div>
              <div style={{ fontSize:9, color:C.text3 }}>Certification Level</div>
            </div>
            <div style={{ height:4, background:C.bar, borderRadius:99, overflow:'hidden', margin:'6px 0' }}>
              <div style={{ width:company?.is_verified?'100%':'30%', height:'100%', background:company?.is_verified?'#10b981':'#f59e0b', borderRadius:99 }}/>
            </div>
          </div>
          <div style={{ ...cardS, background:isDark?'rgba(139,92,246,0.1)':'#faf5ff', border:`0.5px solid ${isDark?'rgba(139,92,246,0.2)':'#e9d5ff'}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:isDark?'#a78bfa':'#7c3aed', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:10 }}>Premium Features</div>
            {[
              { icon:'ti-star',    label:'Featured Listings',   page:'plans' },
              { icon:'ti-ad-2',   label:'Sponsored Placement', page:'sponsored' },
              { icon:'ti-chart-bar',label:'Advanced Analytics', page:'analytics' },
              { icon:'ti-robot',  label:'AI Reputation Tools', page:'plans' },
            ].map(f=>(
              <div key={f.label} onClick={()=>onNavigate(f.page)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:`0.5px solid ${isDark?'rgba(139,92,246,0.1)':'#f3e8ff'}`, cursor:'pointer' }}>
                <i className={`ti ${f.icon}`} style={{ fontSize:12, color:isDark?'#a78bfa':'#8b5cf6' }}/>
                <span style={{ fontSize:10, color:isDark?'#a78bfa':'#7c3aed', flex:1 }}>{f.label}</span>
                <i className="ti ti-arrow-right" style={{ fontSize:11, color:isDark?'rgba(167,139,250,0.5)':'#c4b5fd' }}/>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
