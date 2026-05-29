import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const PLAN_CONFIG = {
  free:     { name:'Free',     color:'#6b7280', bg:'#f9fafb', border:'#e5e7eb', badge:'🆓', welcomeEmoji:'👋', maxMembers:2   },
  silver:   { name:'Silver',   color:'#64748b', bg:'#f1f5f9', border:'#cbd5e1', badge:'🥈', welcomeEmoji:'✨', maxMembers:5   },
  gold:     { name:'Gold',     color:'#d97706', bg:'#fffbeb', border:'#fcd34d', badge:'🥇', welcomeEmoji:'🌟', maxMembers:15  },
  platinum: { name:'Platinum', color:'#8b5cf6', bg:'#1e1b4b', border:'#4c1d95', badge:'💎', welcomeEmoji:'👑', maxMembers:999, isDark:true },
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

// Coming Soon tooltip wrapper
function ComingSoon({ children, active }) {
  const [show, setShow] = useState(false)
  if (!active) return children
  return (
    <div style={{ position:'relative', cursor:'not-allowed' }}
      onMouseEnter={()=>setShow(true)}
      onMouseLeave={()=>setShow(false)}>
      <div style={{ pointerEvents:'none', opacity:0.6 }}>{children}</div>
      {show && (
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:'rgba(0,0,0,0.75)', color:'#fff', fontSize:10, fontWeight:600, padding:'5px 10px', borderRadius:6, whiteSpace:'nowrap', zIndex:50, pointerEvents:'none' }}>
          Coming Soon
        </div>
      )}
    </div>
  )
}

export default function DashboardPage({ onNavigate }) {
  const { company } = useAuth()
  const [stats,         setStats]         = useState({ views:0, reviews:0, avgRating:0, portfolio:0, newReviews:0, satisfaction:0, reputationGrowth:'Low', trustScore:'0.0' })
  const [recentReviews, setRecentReviews] = useState([])
  const [memberCount,   setMemberCount]   = useState(0)
  const [reviewDist,    setReviewDist]    = useState({ 5:0, 4:0, 3:0, 2:0, 1:0 })
  const [loading,       setLoading]       = useState(true)

  const hhRef   = useRef(null)
  const mmRef   = useRef(null)
  const ssRef   = useRef(null)
  const dateRef = useRef(null)

  useEffect(() => {
    function tick() {
      const now = new Date()
      if (hhRef.current)   hhRef.current.textContent   = String(now.getHours()).padStart(2,'0')
      if (mmRef.current)   mmRef.current.textContent   = String(now.getMinutes()).padStart(2,'0')
      if (ssRef.current)   ssRef.current.textContent   = String(now.getSeconds()).padStart(2,'0')
      if (dateRef.current) dateRef.current.textContent = now.toLocaleDateString('en-AE',{weekday:'short',day:'numeric',month:'short',year:'numeric'})
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (company) fetchStats() }, [company])

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

      // This month
      const monthStart     = new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString()
      const newRev         = reviews.filter(r=>r.created_at>=monthStart).length

      // Last month
      const lastMonthStart = new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toISOString()
      const lastMonthEnd   = monthStart
      const lastMonthCount = reviews.filter(r=>r.created_at>=lastMonthStart&&r.created_at<lastMonthEnd).length
      const repGrowth      = lastMonthCount===0
        ? (newRev>0?'High':'Low')
        : newRev>lastMonthCount?'High'
        : newRev===lastMonthCount?'Stable':'Low'

      // Customer satisfaction
      const satisfaction = avg>0 ? Math.round((parseFloat(avg)/5)*100) : 0

      // Trust score
      const verified   = company.is_verified ? 1 : 0
      const trustScore = Math.min(10, parseFloat(
        ((verified*0.4)+(parseFloat(avg)/5*0.4)+Math.min(reviews.length/50,1)*0.2)*10
      ).toFixed(1))

      // Review distribution
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
  const isGold     = plan==='gold'
  const expiryInfo = getExpiryInfo(company?.plan_expires_at)
  const profilePct = calcProfileComplete(company)

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

  const reviewTrend = [2,5,3,8,6,12,9,15,11,18,14,stats.reviews]
  const viewTrend   = [10,25,18,40,32,55,45,70,58,82,75,stats.views]

  const checklist = [
    { done:!!company?.name,        label:'Company name added',    page:'profile'   },
    { done:!!company?.logo_url,    label:'Logo uploaded',         page:'profile'   },
    { done:!!company?.description, label:'Description written',   page:'profile'   },
    { done:!!company?.phone,       label:'Phone number added',    page:'profile'   },
    { done:stats.portfolio>0,      label:'Portfolio photo added', page:'portfolio' },
    { done:stats.reviews>0,        label:'First review received', page:'reviews'   },
  ]

  const maxDist = Math.max(...Object.values(reviewDist),1)

  // Trust score suggestions
  const trustSuggestions = [
    { done:company?.is_verified,    label:'Get Trade License Verified',    icon:'ti-license',       points:'+4.0 pts' },
    { done:parseFloat(stats.avgRating)>=4, label:'Maintain 4+ star rating', icon:'ti-star',         points:'+4.0 pts' },
    { done:stats.reviews>=10,       label:'Get 10+ customer reviews',      icon:'ti-message-circle',points:'+2.0 pts' },
    { done:!!company?.logo_url,     label:'Upload company logo',           icon:'ti-photo',         points:'Profile boost' },
    { done:!!company?.description,  label:'Complete your description',     icon:'ti-file-text',     points:'Profile boost' },
  ]

  return (
    <div className="page-content animate-in" style={{ color:C.text, background:isDark?'#0f0e1a':'var(--bg)' }}>

      {/* PLATINUM BANNER */}
      {isPlatinum && (
        <div style={{ background:'rgba(139,92,246,0.15)', border:'0.5px solid rgba(139,92,246,0.3)', borderRadius:10, padding:'10px 18px', display:'flex', alignItems:'center', gap:10, marginBottom:16, color:'#a78bfa', fontSize:12, fontWeight:600, letterSpacing:'0.04em' }}>
          <i className="ti ti-diamond" style={{ fontSize:16 }}/>
          PLATINUM VERIFIED BUSINESS · TRUSTDUBAI PREMIUM
          <span style={{ marginLeft:'auto', fontSize:10, opacity:0.7 }}>Highest Priority Listing</span>
        </div>
      )}

      {/* GOLD BANNER */}
      {isGold && (
        <div style={{ background:'#fffbeb', border:'0.5px solid #fcd34d', borderRadius:10, padding:'10px 18px', display:'flex', alignItems:'center', gap:10, marginBottom:16, color:'#92400e', fontSize:12, fontWeight:600 }}>
          <i className="ti ti-trophy" style={{ fontSize:16, color:'#d97706' }}/>
          Gold Verified Business on TrustDubai
          <span style={{ marginLeft:'auto', fontSize:10, color:'#b45309' }}>Priority Listing Active</span>
        </div>
      )}

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
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:18, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:C.text, letterSpacing:'-0.3px', fontFamily:"'Syne',sans-serif" }}>
            {company?.name||'My Business'} {pc.welcomeEmoji}
          </h1>
          <p style={{ fontSize:12, color:C.text2, marginTop:3 }}>Here's how your business is performing on TrustDubai.</p>
        </div>
        {/* Clock */}
        <div style={{ background:C.card, border:`0.5px solid ${C.border}`, borderRadius:12, padding:'10px 16px', textAlign:'center', minWidth:200 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, marginBottom:6 }}>
            <i className="ti ti-clock" style={{ fontSize:10, color:'#e8b84b' }}/>
            <span style={{ fontSize:8.5, color:C.text3, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase' }}>Dubai Time (GMT+4)</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
            {[hhRef,mmRef,ssRef].map((ref,i) => (
              <span key={i} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span ref={ref} style={{ background:isDark?'rgba(255,255,255,0.06)':'#f8fafc', border:`0.5px solid ${isDark?'rgba(232,184,75,0.2)':'#fcd34d'}`, borderRadius:7, padding:'4px 8px', fontSize:20, fontWeight:700, color:'#e8b84b', fontVariantNumeric:'tabular-nums', minWidth:42, textAlign:'center', display:'inline-block' }}/>
                {i<2 && <span style={{ fontSize:16, color:'#e8b84b', opacity:0.5 }}>:</span>}
              </span>
            ))}
          </div>
          <div ref={dateRef} style={{ fontSize:9, color:C.text3, marginTop:5 }}/>
        </div>
      </div>

      {/* PROFILE COMPLETION */}
      {profilePct<100 && (
        <div style={{ background:isPlatinum?'rgba(139,92,246,0.08)':'linear-gradient(135deg,#fef9ed,#fef3c7)', border:`0.5px solid ${isPlatinum?'rgba(139,92,246,0.2)':'rgba(232,184,75,0.3)'}`, borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
          <i className="ti ti-alert-circle" style={{ fontSize:20, color:isPlatinum?'#a78bfa':'var(--amber)' }}/>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:600, fontSize:14, color:isPlatinum?'#a78bfa':'#92400e' }}>Profile {profilePct}% complete</div>
            <div style={{ fontSize:13, color:isPlatinum?'rgba(167,139,250,0.7)':'#b45309', marginTop:2 }}>Complete your profile to get more visibility</div>
          </div>
          <div style={{ width:120, height:6, background:isPlatinum?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)', borderRadius:99, overflow:'hidden' }}>
            <div style={{ width:`${profilePct}%`, height:'100%', background:isPlatinum?'linear-gradient(90deg,#7c3aed,#a78bfa)':'linear-gradient(90deg,#e8b84b,#c9952a)', borderRadius:99 }}/>
          </div>
          <button className="btn btn-sm btn-primary" onClick={()=>onNavigate('profile')}>Complete</button>
        </div>
      )}

      {/* 6 TOP STAT CARDS */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:16 }}>
        {[
          {
            label:'Trust Score', value:stats.trustScore, icon:'ti-shield-check', color:'#10b981',
            trend:[5,5.5,6,6.2,7,7.5,8,8.2,9,9.1,9.2,parseFloat(stats.trustScore)||0],
            change:'+6.5% Change', isReal:true, page:'reviews'
          },
          {
            label:'Total Reviews', value:stats.reviews, icon:'ti-message-circle', color:'#e8b84b',
            trend:[2,5,8,12,18,25,30,42,55,70,85,stats.reviews],
            change:'+3.1% Change', isReal:true, page:'reviews'
          },
          {
            label:'New Reviews (30D)', value:stats.newReviews, icon:'ti-star', color:'#3b82f6',
            trend:[0,1,2,3,5,4,6,8,7,9,10,stats.newReviews],
            change:'+12% Change', isReal:true, page:'reviews'
          },
          {
            label:'Average Rating', value:stats.avgRating||'0.0', icon:'ti-star', color:'#f59e0b',
            trend:[3,3.2,3.5,3.8,4,4.1,4.3,4.5,4.6,4.7,4.8,parseFloat(stats.avgRating)||0],
            change:'+0.1 Change', isReal:true, page:'reviews', suffix:'★'
          },
          {
            label:'Customer Satisfaction', value:`${stats.satisfaction}%`, icon:'ti-mood-smile', color:'#8b5cf6',
            trend:[60,65,70,72,75,78,80,82,84,86,88,stats.satisfaction],
            change:'+2.1% Change', isReal:true, isStr:true
          },
          {
            label:'Reputation Growth', value:stats.reputationGrowth, icon:'ti-trending-up', color:'#10b981',
            trend:[20,30,35,45,40,55,60,65,70,75,80,stats.reputationGrowth==='High'?90:stats.reputationGrowth==='Stable'?60:30],
            change:'vs last month', isReal:true, isStr:true
          },
        ].map((card,i) => (
          <div key={i}
            style={{ ...cardS, cursor:card.isReal?'pointer':'not-allowed', transition:'all 0.15s', position:'relative', overflow:'hidden', opacity:card.isReal?1:0.6 }}
            onClick={()=>{ if(card.isReal && card.page) onNavigate(card.page) }}
            onMouseEnter={e=>{ if(card.isReal){ e.currentTarget.style.borderColor=card.color+'55'; e.currentTarget.style.transform='translateY(-1px)' }}}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.transform='none' }}
            title={!card.isReal?'Coming Soon':''}
          >
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
            {!card.isReal && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.03)', borderRadius:12 }}>
                <span style={{ background:'rgba(0,0,0,0.6)', color:'#fff', fontSize:9, fontWeight:600, padding:'3px 8px', borderRadius:99 }}>Coming Soon</span>
              </div>
            )}
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

        {/* Trust Score Gauge + Suggestions */}
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
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:14 }}>

        {/* AI Insights */}
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

        {/* Profile Checklist */}
        <div style={cardS}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em' }}>Profile Checklist</div>
            <span style={{ fontSize:9, fontWeight:700, color:profilePct===100?'#10b981':'#e8b84b' }}>{profilePct}%</span>
          </div>
          <div style={{ height:4, background:C.bar, borderRadius:99, overflow:'hidden', marginBottom:10 }}>
            <div style={{ width:`${profilePct}%`, height:'100%', background:'linear-gradient(90deg,#e8b84b,#c9952a)', borderRadius:99 }}/>
          </div>
          {checklist.map(({done,label,page})=>(
            <div key={label} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', background:done?isDark?'rgba(16,185,129,0.08)':'#f0fdf4':'transparent', borderRadius:7, marginBottom:4, cursor:done?'default':'pointer' }}
              onClick={()=>!done&&onNavigate(page)}>
              <i className={`ti ${done?'ti-circle-check':'ti-circle'}`} style={{ fontSize:13, color:done?'#10b981':'#d1d5db' }}/>
              <span style={{ fontSize:10, color:done?'#10b981':C.text2, flex:1 }}>{label}</span>
              {!done && <i className="ti ti-arrow-right" style={{ fontSize:11, color:C.text3 }}/>}
            </div>
          ))}
        </div>

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

      {/* BUSINESS PERFORMANCE + PLAN */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12, marginBottom:14 }}>

        {/* Business Performance Chart */}
        <div style={cardS}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em' }}>Business Performance Metrics</div>
            <div style={{ display:'flex', gap:10 }}>
              {[['#3b82f6','Inquiries'],['#8b5cf6','Bookings'],['#10b981','Website']].map(([c,l])=>(
                <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:8.5, color:C.text2 }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:c }}/>{l}
                </div>
              ))}
            </div>
          </div>
          <div style={{ position:'relative', height:100 }}>
            <div style={{ position:'absolute', left:24, right:0, top:0, bottom:16 }}>
              <svg width="100%" height="100%" viewBox="0 0 500 84" preserveAspectRatio="none">
                {[0,42,84].map(y=><line key={y} x1="0" y1={y} x2="500" y2={y} stroke={isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)'} strokeWidth="0.5"/>)}
                <polyline points="0,78 60,70 120,55 180,45 240,38 300,30 360,22 420,15 500,10" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="0,80 60,74 120,68 180,62 240,56 300,50 360,44 420,38 500,32" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,3"/>
                <polyline points="0,76 60,72 120,65 180,60 240,55 300,52 360,48 420,44 500,40" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2,4"/>
              </svg>
            </div>
            <div style={{ position:'absolute', left:24, right:0, bottom:0, display:'flex', justifyContent:'space-between' }}>
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'].map(m=><span key={m} style={{ fontSize:7, color:C.text3 }}>{m}</span>)}
            </div>
          </div>
        </div>

        {/* Plan Card */}
        <div style={cardS}>
          <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Current Plan</div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:`${pc.color}18`, border:`0.5px solid ${pc.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{pc.badge}</div>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:pc.color }}>{pc.name}</div>
              {expiryInfo && plan!=='free' ? (
                <div style={{ fontSize:10, color:expiryInfo.color, marginTop:2 }}>{expiryInfo.label}</div>
              ) : (
                <div style={{ fontSize:10, color:C.text3, marginTop:2 }}>{plan==='free'?'Upgrade for more features':'✓ Plan active'}</div>
              )}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <i className="ti ti-users" style={{ fontSize:13, color:'#3b82f6' }}/>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:C.text3, marginBottom:3 }}>
                <span>Team Members</span>
                <span>{memberCount}/{pc.maxMembers===999?'∞':pc.maxMembers}</span>
              </div>
              <div style={{ height:4, background:C.bar, borderRadius:99, overflow:'hidden' }}>
                <div style={{ width:`${pc.maxMembers===999?50:Math.min(100,memberCount/pc.maxMembers*100)}%`, height:'100%', background:'#3b82f6', borderRadius:99 }}/>
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" style={{ width:'100%', justifyContent:'center' }} onClick={()=>onNavigate('plans')}>
            {plan==='free'?'Upgrade Plan':expiryInfo?.urgent?'Renew Now':'Manage Plan'}
          </button>
        </div>

        {/* Platinum CTA or Profile */}
        {plan!=='platinum' ? (
          <div style={{ background:'#1e1b4b', border:'0.5px solid rgba(139,92,246,0.3)', borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', gap:10 }}>
            <span style={{ fontSize:28 }}>💎</span>
            <div style={{ fontSize:13, fontWeight:700, color:'#a78bfa' }}>Upgrade to Platinum</div>
            <div style={{ fontSize:10, color:'rgba(167,139,250,0.7)', lineHeight:1.6 }}>Unlimited portfolio, priority listing, AI insights & dedicated support</div>
            <button onClick={()=>onNavigate('plans')} style={{ padding:'8px 18px', background:'linear-gradient(135deg,#7c3aed,#4c1d95)', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
              <i className="ti ti-bolt" style={{ fontSize:12 }}/> Upgrade Now
            </button>
          </div>
        ) : (
          <div style={{ ...cardS, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#a78bfa', textTransform:'uppercase', letterSpacing:'0.04em' }}>Profile Completion</div>
            <div style={{ fontSize:24, fontWeight:700, color:C.text }}>{profilePct}%</div>
            <div style={{ height:6, background:C.bar, borderRadius:99, overflow:'hidden' }}>
              <div style={{ width:`${profilePct}%`, height:'100%', background:'linear-gradient(90deg,#e8b84b,#c9952a)', borderRadius:99 }}/>
            </div>
            {profilePct<100 && <button className="btn btn-primary btn-sm" onClick={()=>onNavigate('profile')}>Complete Profile</button>}
          </div>
        )}
      </div>

    </div>
  )
}
