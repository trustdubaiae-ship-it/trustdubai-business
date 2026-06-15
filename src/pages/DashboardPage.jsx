// tritova-business/src/pages/DashboardPage.jsx
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { MENU } from '../components/Sidebar'
import { can } from '../lib/permissions'
import MeetingBanner from '../components/MeetingBanner'

/* =========================================================================
   Quvera Business — COMMAND CENTER
   Same look & theme as the Admin Command Center (self-contained green theme,
   light + dark via `theme` prop, fully responsive). Data is THIS company only.
   ========================================================================= */

function AnimatedNumber({ value, decimals = 0, duration = 900 }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf
    const target = parseFloat(value) || 0
    const t0 = performance.now()
    const step = (t) => {
      const p = Math.min((t - t0) / duration, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setDisplay(target * e)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span>{decimals ? display.toFixed(decimals) : Math.round(display).toLocaleString()}</span>
}

function Sparkline({ data, color, width = 90, height = 32 }) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height}><line x1="0" y1={height/2} x2={width} y2={height/2} stroke={color} strokeWidth="1.5" opacity="0.25" strokeDasharray="3,3"/></svg>
  }
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const pts = data.map((v,i) => `${(i/(data.length-1))*width},${height-((v-min)/range)*(height-6)-3}`).join(' ')
  const areaPts = `0,${height} ${pts} ${width},${height}`
  const lastY = height-((data[data.length-1]-min)/range)*(height-6)-3
  const gid = 'spk' + color.replace('#','')
  return (
    <svg width={width} height={height} style={{ overflow:'visible' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={areaPts} fill={`url(#${gid})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={width} cy={lastY} r="2.5" fill={color}/>
    </svg>
  )
}

function Donut({ segments, total, label, size = 150, isDark }) {
  const r = size/2 - 16, cx = size/2, cy = size/2, circ = 2*Math.PI*r
  let offset = 0
  const sum = segments.reduce((s,x)=>s+x.value,0) || 1
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={isDark?'rgba(255,255,255,0.05)':'#f1f5f9'} strokeWidth="14"/>
      {segments.map((seg,i) => {
        const frac = seg.value/sum
        const dash = frac*circ
        const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth="14" strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt"/>
        offset += dash
        return el
      })}
      <text x={cx} y={cy-4} textAnchor="middle" fontSize="20" fontWeight="700" fill={isDark?'#f1f5f9':'#0f172a'}>{total}</text>
      <text x={cx} y={cy+14} textAnchor="middle" fontSize="9" fill={isDark?'#6b7280':'#94a3b8'}>{label}</text>
    </svg>
  )
}

function DualLineChart({ series, color1, color2, isDark, height = 180 }) {
  if (!series || series.length < 2) return <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:isDark?'#6b7280':'#94a3b8' }}>Not enough data yet</div>
  const w = 1000, h = 220, pad = 8
  const aVals = series.map(s=>s.a), bVals = series.map(s=>s.b)
  const aMax = Math.max(...aVals, 1), bMax = Math.max(...bVals, 1)
  const x = i => (i/(series.length-1))*(w)
  const ya = v => h - (v/aMax)*(h-pad*2) - pad
  const yb = v => h - (v/bMax)*(h-pad*2) - pad
  const lineA = series.map((s,i)=>`${x(i)},${ya(s.a)}`).join(' ')
  const lineB = series.map((s,i)=>`${x(i)},${yb(s.b)}`).join(' ')
  const areaA = `0,${h} ${lineA} ${w},${h}`
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display:'block' }}>
      <defs><linearGradient id="lcA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color1} stopOpacity="0.18"/><stop offset="100%" stopColor={color1} stopOpacity="0"/></linearGradient></defs>
      {[0,0.5,1].map(f => <line key={f} x1="0" y1={h*f} x2={w} y2={h*f} stroke={isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)'} strokeWidth="1"/>)}
      <polygon points={areaA} fill="url(#lcA)"/>
      <polyline points={lineA} fill="none" stroke={color1} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      <polyline points={lineB} fill="none" stroke={color2} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
    </svg>
  )
}

function BarChart({ data, color, isDark, height = 170 }) {
  if (!data || data.length === 0) return <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:isDark?'#6b7280':'#94a3b8' }}>No data yet</div>
  const max = Math.max(...data.map(d=>d.value), 1)
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:10, height, padding:'0 4px' }}>
      {data.map((d,i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6, height:'100%', justifyContent:'flex-end' }}>
          <div style={{ fontSize:10, fontWeight:700, color:isDark?'#9ca3af':'#64748b' }}>{d.value}</div>
          <div style={{ width:'70%', maxWidth:34, height:`${Math.max(4,(d.value/max)*(height-40))}px`, background:`linear-gradient(180deg, ${color}, ${color}aa)`, borderRadius:'6px 6px 0 0', transition:'height 1s cubic-bezier(.3,1,.4,1)' }}/>
          <div style={{ fontSize:9, color:isDark?'#6b7280':'#94a3b8' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

function Clock({ isDark }) {
  const ref = useRef(null)
  useEffect(() => {
    const tick = () => { if (ref.current) ref.current.textContent = new Date().toLocaleTimeString('en-AE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) + ' · GMT+4' }
    tick(); const t = setInterval(tick,1000); return () => clearInterval(t)
  }, [])
  return <span ref={ref} style={{ fontSize:11, color:isDark?'#9ca3af':'#64748b', fontVariantNumeric:'tabular-nums' }}/>
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime())/1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s/60); if (m < 60) return `${m} min ago`
  const h = Math.floor(m/60); if (h < 24) return `${h} hr ago`
  const days = Math.floor(h/24); return `${days} day${days>1?'s':''} ago`
}

const norm = v => String(v||'').trim().toLowerCase()
const normSource = raw => {
  const s = norm(raw); if(!s) return 'Other'
  if (/meta|facebook|fb|insta|ig/.test(s)) return 'Meta'
  if (/whats|wa\b/.test(s)) return 'WhatsApp'
  if (/form|web|site|landing|trustdubai/.test(s)) return 'Quvera'
  if (/manual|admin|direct|walk/.test(s)) return 'Manual'
  if (/google|ads|ppc/.test(s)) return 'Google'
  return raw ? String(raw).charAt(0).toUpperCase()+String(raw).slice(1) : 'Other'
}
const normTemp = raw => { const s=norm(raw); if(/hot|high/.test(s))return'hot'; if(/warm|med/.test(s))return'warm'; if(/cold|low/.test(s))return'cold'; return '' }
const isWonLost = st => { const s=norm(st); return /won|lost|reject|dead|drop|junk|spam|success|convert|deal/.test(s) }
const isWon = st => { const s=norm(st); return /won|success|convert|deal/.test(s) && !/lost/.test(s) }

// Read the LIVE theme from the DOM so isDark is always accurate (design colors stay the same).
function detectDark() {
  if (typeof document === 'undefined') return false
  const root = document.documentElement
  const ds = ((root.getAttribute('data-theme') || '') + ' ' + (root.className || '')).toLowerCase()
  if (ds.includes('dark')) return true
  if (ds.includes('light')) return false
  try {
    const v = (getComputedStyle(root).getPropertyValue('--bg') || '').trim() || getComputedStyle(document.body).backgroundColor
    const m = (v || '').match(/\d+(\.\d+)?/g)
    if (m && m.length >= 3) { const [r,g,b] = m.map(Number); return (0.299*r + 0.587*g + 0.114*b) < 128 }
  } catch (e) {}
  return false
}

/* ============================== main ============================== */
export default function DashboardPage({ onNavigate, theme }) {
  const { company, staff, user, role, hasFeature, hasAddon } = useAuth()
  // Accurate live theme (fixes dark cards desync) — colors stay exactly the same
  const [isDark, setIsDark] = useState(detectDark)
  useEffect(() => {
    setIsDark(detectDark())
    const root = document.documentElement
    const obs = new MutationObserver(() => setIsDark(detectDark()))
    obs.observe(root, { attributes:true, attributeFilter:['class','data-theme','style'] })
    if (document.body) obs.observe(document.body, { attributes:true, attributeFilter:['class','data-theme','style'] })
    return () => obs.disconnect()
  }, [theme])
  const adminName = staff?.name || company?.name || (user?.email||'').split('@')[0] || 'there'

  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  useEffect(() => { const r = () => setVw(window.innerWidth); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r) }, [])
  const mobile = vw < 768

  // Share Profile + QR (mobile header button)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const _slug = company?.slug || ''
  const _publicLink = `https://trustdubai.ae/${_slug}`
  const _profileQr = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=14&data=${encodeURIComponent(_publicLink)}`
  async function copyProfileLink() {
    try { await navigator.clipboard.writeText(_publicLink); setCopied(true); setTimeout(()=>setCopied(false),1800) }
    catch (e) { const ta=document.createElement('textarea'); ta.value=_publicLink; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy'); setCopied(true); setTimeout(()=>setCopied(false),1800)}catch(e2){} document.body.removeChild(ta) }
  }
  async function downloadProfileQR() {
    try { const res=await fetch(_profileQr); const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${(company?.name||'profile').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-qr.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url) }
    catch (e) { window.open(_profileQr,'_blank') }
  }
  function shareProfileWhatsApp() { const text=`Check out ${company?.name||'our'} verified profile on Quvera: ${_publicLink}`; window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank') }

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ trust:0, reviews:0, avgRating:'0.0', views:0, leads:0, hot:0, followDue:0, won:0, newReviews:0, profilePct:0 })
  const [delta, setDelta] = useState({ reviews:0, leads:0, rating:0 })
  const [spark, setSpark] = useState({ reviews:[], leads:[], rating:[] })
  const [reviewSeries, setReviewSeries] = useState([])
  const [sourceSegs, setSourceSegs] = useState([])
  const [recentReviews, setRecentReviews] = useState([])
  const [growth, setGrowth] = useState([])
  const [sentiment, setSentiment] = useState({ pos:0, neu:0, neg:0 })
  const [activity, setActivity] = useState([])

  useEffect(() => { if (company) fetchAll() }, [company])

  function pctChange(now, prev) { if (prev === 0) return now > 0 ? 100 : 0; return Math.round(((now - prev) / prev) * 100) }
  function calcProfile(c) { if(!c)return 0; const f=['name','description','phone','logo_url','category','location']; return Math.round(f.filter(x=>!!c[x]).length/f.length*100) }

  async function fetchAll() {
    setLoading(true)
    try {
      const now = new Date()
      const iso = (n) => new Date(now.getTime() - n*864e5).toISOString()
      const [reviewsRes, leadsRes, recentRes] = await Promise.all([
        supabase.from('reviews').select('rating,created_at').eq('company_id', company.id),
        supabase.from('lead_submissions').select('*').eq('company_id', company.id),
        supabase.from('reviews').select('*').eq('company_id', company.id).order('created_at',{ascending:false}).limit(4),
      ])
      const reviews = reviewsRes.data || []
      const leads   = leadsRes.data || []

      const avg = reviews.length ? (reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1) : '0.0'
      const monthStart = new Date(now.getFullYear(),now.getMonth(),1).toISOString()
      const lastMonthStart = new Date(now.getFullYear(),now.getMonth()-1,1).toISOString()
      const newReviews = reviews.filter(r=>r.created_at>=monthStart).length

      const inWin = (rows, from, to) => (rows||[]).filter(r=>{ const t=new Date(r.created_at).getTime(); return t>=now.getTime()-from*864e5 && t<now.getTime()-to*864e5 }).length
      const dReviews = pctChange(inWin(reviews,30,0), inWin(reviews,60,30))
      const dLeads   = pctChange(inWin(leads,30,0),   inWin(leads,60,30))

      const avgOf = rows => rows.length ? rows.reduce((s,r)=>s+r.rating,0)/rows.length : 0
      const thisMA = avgOf(reviews.filter(r=>r.created_at>=monthStart))
      const lastMA = avgOf(reviews.filter(r=>r.created_at>=lastMonthStart&&r.created_at<monthStart))
      const dRating = lastMA ? Math.round(((thisMA-lastMA)/lastMA)*100) : 0

      const dailyCounts = (rows) => { const d={}; for(let i=13;i>=0;i--)d[iso(i).slice(0,10)]=0; (rows||[]).forEach(r=>{const k=(r.created_at||'').slice(0,10); if(d[k]!==undefined)d[k]++}); return Object.values(d) }
      const ratingMonthly = []
      for (let i=5;i>=0;i--){ const ms=new Date(now.getFullYear(),now.getMonth()-i,1), me=new Date(now.getFullYear(),now.getMonth()-i+1,1)
        ratingMonthly.push(avgOf(reviews.filter(r=>{const t=new Date(r.created_at); return t>=ms&&t<me}))) }

      // 30-day review series (count + avg rating)
      const rs = []
      for (let i=29;i>=0;i--){ const day=iso(i).slice(0,10); const dr=reviews.filter(r=>(r.created_at||'').slice(0,10)===day)
        rs.push({ a: dr.length, b: dr.length?dr.reduce((s,r)=>s+r.rating,0)/dr.length:0 }) }
      setReviewSeries(rs)

      // leads by source donut
      const srcMap = {}; leads.forEach(l=>{ const s=normSource(l.source||l.lead_source); srcMap[s]=(srcMap[s]||0)+1 })
      const palette = ['#22c55e','#3b82f6','#a855f7','#f59e0b','#06b6d4','#64748b']
      const segs = Object.entries(srcMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,value],i)=>({name,value,color:palette[i%palette.length]}))
      setSourceSegs(segs)

      // reviews growth (6 months)
      const months = []
      for (let i=5;i>=0;i--){ const dt=new Date(now.getFullYear(),now.getMonth()-i,1); const key=dt.toISOString().slice(0,7)
        months.push({ label: dt.toLocaleDateString('en-AE',{month:'short'}), value: reviews.filter(r=>(r.created_at||'').slice(0,7)===key).length }) }
      setGrowth(months)

      // sentiment from rating
      const dist = {5:0,4:0,3:0,2:0,1:0}; reviews.forEach(r=>{ if(dist[r.rating]!==undefined)dist[r.rating]++ })
      setSentiment({ pos:dist[5]+dist[4], neu:dist[3], neg:dist[2]+dist[1] })

      // activity feed
      const feed = []
      ;(recentRes.data||[]).forEach(r=>feed.push({ icon:'⭐', color:'#f59e0b', text:`New review from ${r.reviewer_name||'a customer'}`, time:r.created_at }))
      ;leads.slice(-4).forEach(l=>feed.push({ icon:'📩', color:'#22c55e', text:`New lead from ${normSource(l.source||l.lead_source)}`, time:l.created_at }))
      feed.sort((a,b)=>new Date(b.time)-new Date(a.time))
      setActivity(feed.slice(0,6))

      // lead metrics
      const hot = leads.filter(l=>normTemp(l.temperature)==='hot').length
      const won = leads.filter(l=>isWon(l.status)).length
      const todayKey = new Date().setHours(0,0,0,0)
      let followDue = 0
      leads.forEach(l=>{ const f=l.follow_up_date; if(!f||isWonLost(l.status))return; const fd=new Date(f).setHours(0,0,0,0); if(fd<=todayKey)followDue++ })

      const verified = company.is_verified ? 1 : 0
      const fallbackTrust = Math.round(((verified*0.4)+(parseFloat(avg)/5*0.4)+Math.min(reviews.length/50,1)*0.2)*100)
      const trust = company.trust_score!=null ? Number(company.trust_score) : fallbackTrust

      setStats({ trust, reviews:reviews.length, avgRating:avg, views:company.profile_views||0, leads:leads.length, hot, followDue, won, newReviews, profilePct:calcProfile(company) })
      setDelta({ reviews:dReviews, leads:dLeads, rating:dRating })
      setSpark({ reviews:dailyCounts(reviews), leads:dailyCounts(leads), rating:ratingMonthly })
      setRecentReviews(recentRes.data||[])
    } catch(e){ console.error('Command Center fetch error:', e) }
    finally{ setLoading(false) }
  }

  /* ---------- theme tokens (admin green) ---------- */
  const C = {
    text:   isDark ? '#f1f5f9' : '#0f172a',
    text2:  isDark ? '#9ca3af' : '#475569',
    text3:  isDark ? '#6b7280' : '#94a3b8',
    border: isDark ? 'rgba(255,255,255,0.07)' : '#e5e9f0',
    card:   isDark ? '#141921' : '#ffffff',
    row:    isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
    shadow: isDark ? '0 4px 24px rgba(0,0,0,0.3)' : '0 1px 10px rgba(0,0,0,0.05)',
    bar:    isDark ? 'rgba(255,255,255,0.06)' : '#eef2f7',
    green:'#22c55e', blue:'#3b82f6', purple:'#a855f7', gold:'#f59e0b', cyan:'#06b6d4', pink:'#ec4899', red:'#ef4444',
  }
  const cardStyle = { background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:'16px 18px', boxShadow:C.shadow, minWidth:0 }
  const H = ({ children, right }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, gap:8 }}>
      <span style={{ fontSize:14, fontWeight:700, color:C.text }}>{children}</span>{right}
    </div>
  )

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'80vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:38, height:38, border:`3px solid ${C.green}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize:13, color:C.text3 }}>Loading dashboard...</div>
      </div>
    </div>
  )

  const STAT_CARDS = [
    { label:'Trust Score',   value:Math.round(stats.trust), icon:'ti-shield-check',   color:C.green,  spark:[],            page:'trust',   sub:'/ 100' },
    { label:'Total Reviews', value:stats.reviews,           icon:'ti-message-circle', color:C.gold,   spark:spark.reviews, delta:delta.reviews, page:'reviews' },
    { label:'Avg. Rating',   value:stats.avgRating,         icon:'ti-star',           color:C.gold,   spark:spark.rating,  delta:delta.rating,  page:'reviews', isRating:true },
    { label:'Profile Views', value:stats.views,             icon:'ti-eye',            color:C.blue,   spark:[],            page:'profile', sub:'all time' },
    { label:'Total Leads',   value:stats.leads,             icon:'ti-address-book',   color:C.cyan,   spark:spark.leads,   delta:delta.leads,   page:'leads' },
  ]

  const ALERTS = [
    { label:'New Reviews (30D)', value:stats.newReviews,  icon:'ti-message-plus', color:C.gold,  page:'reviews' },
    { label:'Hot Leads',         value:stats.hot,         icon:'ti-flame',        color:C.red,   page:'leads' },
    { label:'Follow-ups Due',    value:stats.followDue,   icon:'ti-clock',        color:C.cyan,  page:'leads' },
    { label:'Leads Won',         value:stats.won,         icon:'ti-trophy',       color:C.green, page:'leads' },
  ]

  const perms = staff?.permissions || null
  const checkAddon = (k) => (typeof hasAddon === 'function' ? hasAddon(k) : false)
  const checkFeature = (k) => (typeof hasFeature === 'function' ? hasFeature(k) : true)
  const sectionColor = {
    'MAIN': C.blue, 'LEAD HUB': C.green, 'SALES & QUOTES': C.cyan,
    'PROJECTS & OPS': C.gold, 'AI & CRM': C.purple, 'REPUTATION': C.pink,
    'MY PROFILE': C.blue, 'GROWTH': C.green, 'TEAM & ACCESS': C.text2, 'SETTINGS': C.text2,
  }
  const mobileGroups = (() => {
    const out = []; let cur = null
    for (const item of MENU) {
      if (item.section) { cur = { section: item.section, items: [] }; out.push(cur) }
      else if (cur) {
        if (item.id === 'controlwall' || item.id === 'dashboard') continue
        const permLocked = !can(role, perms, item.perm)
        const addonLocked = !permLocked && !!item.addon && !checkAddon(item.addon)
        const featureLocked = !permLocked && !addonLocked && !item.soon && item.featureKey ? !checkFeature(item.featureKey) : false
        const showSoon = !!item.soon && !addonLocked
        cur.items.push({ ...item, permLocked, addonLocked, featureLocked, showSoon })
      }
    }
    return out.filter(g => g.items.length)
  })()

  const fmtPct = (p) => `${p>=0?'+':''}${p}%`

  return (
    <div className="cc-root" style={{ color:C.text, width:'100%', maxWidth:1500, margin:'0 auto' }}>
      <style>{CC_CSS}</style>

      <MeetingBanner onNavigate={onNavigate} />

      {/* HEADER */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12, marginBottom:18 }}>
        <div style={{ minWidth:0 }}>
          <h1 style={{ fontSize: mobile?20:24, fontWeight:800, color:C.text, margin:0 }}>Welcome back, {adminName}! 👋</h1>
          <p style={{ fontSize:13, color:C.text2, marginTop:4 }}>Here's how your business is performing on Quvera.</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'8px 12px' }}>
            <i className="ti ti-calendar" style={{ fontSize:13, color:C.green }}/>
            <Clock isDark={isDark}/>
          </div>
          {mobile ? (
            <>
              <button onClick={() => onNavigate && onNavigate('dashboard')} title="Command Center"
                style={{ display:'flex', alignItems:'center', gap:6, background:'transparent', color:C.text, border:`1px solid ${C.border}`, borderRadius:10, padding:'9px 14px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                <i className="ti ti-layout-dashboard" style={{ fontSize:14, color:C.green }}/> Command Center
              </button>
              <button onClick={() => { setShareOpen(true); setCopied(false) }} title="Share your profile"
                style={{ display:'flex', alignItems:'center', gap:6, background:'transparent', color:C.text, border:`1px solid ${C.border}`, borderRadius:10, padding:'9px 14px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                <i className="ti ti-qrcode" style={{ fontSize:14, color:C.green }}/> Share Profile
              </button>
            </>
          ) : (
            <button onClick={() => onNavigate && onNavigate('controlwall')} title="Open the full-screen Control Wall"
              style={{ display:'flex', alignItems:'center', gap:6, background:'transparent', color:C.text, border:`1px solid ${C.border}`, borderRadius:10, padding:'9px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              <i className="ti ti-layout-grid" style={{ fontSize:14, color:C.green }}/> Control Wall
            </button>
          )}
          <button onClick={fetchAll} style={{ display:'flex', alignItems:'center', gap:6, background:C.green, color:'#fff', border:'none', borderRadius:10, padding:'9px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <i className="ti ti-refresh" style={{ fontSize:14 }}/> Refresh
          </button>
        </div>
      </div>

      {/* MOBILE-ONLY: quick stats + feature card launcher (PC unchanged) */}
      {mobile && (
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[['Trust Score', Math.round(stats.trust), C.green],['Total Leads', stats.leads, C.cyan],['Reviews', stats.reviews, C.gold]].map(([l,v,c]) => (
            <div key={l} style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'11px 6px', textAlign:'center', boxShadow:C.shadow }}>
              <div style={{ fontSize:20, fontWeight:800, color:c, lineHeight:1 }}>{v}</div>
              <div style={{ fontSize:10, color:C.text2, marginTop:4 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {mobile && (
        <div style={{ marginBottom:6 }}>
          {mobileGroups.map((g, gi) => (
            <div key={gi} style={{ marginBottom:18 }}>
              <div style={{ fontSize:11, color:C.text3, textTransform:'uppercase', letterSpacing:'.5px', fontWeight:700, margin:'0 2px 10px' }}>{g.section}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                {g.items.map(it => {
                  const col = sectionColor[g.section] || C.green
                  const dim = it.permLocked || it.addonLocked || it.featureLocked
                  return (
                    <div key={it.id}
                      onClick={() => { if (it.permLocked) return; if (it.addonLocked || it.featureLocked) { onNavigate && onNavigate('plans') } else { onNavigate && onNavigate(it.id) } }}
                      style={{ position:'relative', background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'14px 6px 12px', textAlign:'center', cursor: it.permLocked?'not-allowed':'pointer', opacity: dim?0.55:1, boxShadow:C.shadow, transition:'transform .12s' }}
                      onTouchStart={e=>{ e.currentTarget.style.transform='scale(0.96)' }}
                      onTouchEnd={e=>{ e.currentTarget.style.transform='none' }}>
                      {it.permLocked
                        ? <i className="ti ti-lock" style={{ position:'absolute', top:7, right:7, fontSize:11, color:C.text3 }}/>
                        : it.addonLocked
                          ? <span style={{ position:'absolute', top:6, right:6, fontSize:7.5, fontWeight:700, color:'#0099cc', background:'rgba(0,153,204,0.14)', padding:'1px 5px', borderRadius:99 }}>ADD-ON</span>
                          : it.showSoon
                            ? <span style={{ position:'absolute', top:6, right:6, fontSize:7.5, fontWeight:700, color:C.gold, background:C.gold+'22', padding:'1px 5px', borderRadius:99 }}>SOON</span>
                            : null}
                      <div style={{ width:42, height:42, margin:'0 auto 8px', borderRadius:12, background: dim?C.row:col+'1e', display:'flex', alignItems:'center', justifyContent:'center', color: dim?C.text3:col }}>
                        <i className={`ti ${it.icon}`} style={{ fontSize:21 }}/>
                      </div>
                      <div style={{ fontSize:11, color: dim?C.text2:C.text, lineHeight:1.25, fontWeight:500 }}>{it.label}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!mobile && (<>
      {/* 5 STAT CARDS */}
      <div className="cc-grid-stats" style={{ marginBottom:14 }}>
        {STAT_CARDS.map((s,i) => (
          <div key={i} onClick={()=> s.page && onNavigate && onNavigate(s.page)}
            style={{ ...cardStyle, cursor: s.page?'pointer':'default', transition:'all .15s' }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=s.color+'66'; e.currentTarget.style.transform='translateY(-2px)' }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=C.border; e.currentTarget.style.transform='none' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <span style={{ fontSize:12, color:C.text2, fontWeight:500 }}>{s.label}</span>
              <div style={{ width:34, height:34, borderRadius:10, background:s.color+'1e', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <i className={`ti ${s.icon}`} style={{ fontSize:17, color:s.color }}/>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
              <span style={{ fontSize:26, fontWeight:800, color:C.text, lineHeight:1 }}>
                {s.isRating ? <AnimatedNumber value={s.value} decimals={1}/> : <AnimatedNumber value={s.value}/>}
              </span>
              {s.isRating && <span style={{ color:C.gold, fontSize:13 }}>{'★'.repeat(Math.round(parseFloat(s.value)))}</span>}
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
              {s.delta!=null ? (
                <span style={{ fontSize:11, fontWeight:600, color: s.delta>=0?C.green:C.red, display:'flex', alignItems:'center', gap:2 }}>
                  <i className={`ti ${s.delta>=0?'ti-trending-up':'ti-trending-down'}`} style={{ fontSize:12 }}/>
                  {fmtPct(s.delta)} <span style={{ color:C.text3, fontWeight:400 }}>30d</span>
                </span>
              ) : <span style={{ fontSize:11, color:C.text3 }}>{s.sub}</span>}
              {s.spark && s.spark.length>=2 && <Sparkline data={s.spark} color={s.color} width={mobile?60:80} height={28}/>}
            </div>
          </div>
        ))}
      </div>

      {/* ROW 2 */}
      <div className="cc-grid-row2" style={{ marginBottom:14 }}>
        <div className="cc-row2-main" style={cardStyle}>
          <H right={<div style={{ display:'flex', gap:12, fontSize:11 }}>
            <span style={{ display:'flex', alignItems:'center', gap:5, color:C.text2 }}><span style={{ width:9, height:9, borderRadius:'50%', background:C.green }}/>Reviews</span>
            <span style={{ display:'flex', alignItems:'center', gap:5, color:C.text2 }}><span style={{ width:9, height:9, borderRadius:'50%', background:C.purple }}/>Ratings</span>
          </div>}>Reviews &amp; Ratings Overview</H>
          <DualLineChart series={reviewSeries} color1={C.green} color2={C.purple} isDark={isDark} height={mobile?150:190}/>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:9, color:C.text3 }}>
            <span>30 days ago</span><span>15 days ago</span><span>Today</span>
          </div>
        </div>

        <div style={cardStyle}>
          <H>Leads by Source</H>
          {sourceSegs.length===0 ? (
            <div style={{ textAlign:'center', padding:'30px 0', color:C.text3, fontSize:12 }}>No leads yet</div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', justifyContent:'center' }}>
              <Donut segments={sourceSegs} total={stats.leads} label="Leads" isDark={isDark} size={mobile?130:140}/>
              <div style={{ flex:1, minWidth:120 }}>
                {sourceSegs.map((seg,i) => { const sum=sourceSegs.reduce((s,x)=>s+x.value,0)||1; return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:8, fontSize:11.5 }}>
                    <span style={{ width:9, height:9, borderRadius:'50%', background:seg.color, flexShrink:0 }}/>
                    <span style={{ color:C.text2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{seg.name}</span>
                    <span style={{ color:C.text, fontWeight:700 }}>{Math.round(seg.value/sum*100)}%</span>
                  </div>
                )})}
              </div>
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <H right={<span onClick={()=>onNavigate&&onNavigate('reviews')} style={{ fontSize:11, color:C.green, cursor:'pointer', fontWeight:600 }}>View All</span>}>Recent Reviews</H>
          {recentReviews.length===0 ? (
            <div style={{ textAlign:'center', padding:'30px 0', color:C.text3, fontSize:12 }}>No reviews yet</div>
          ) : recentReviews.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ width:34, height:34, borderRadius:9, background:C.green+'1e', color:C.green, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, flexShrink:0 }}>
                {(r.reviewer_name||'A')[0].toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12.5, fontWeight:600, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.reviewer_name||'Anonymous'}</div>
                <div style={{ fontSize:10.5, color:C.text3 }}>{timeAgo(r.created_at)}</div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ color:C.gold, fontSize:11 }}>{'★'.repeat(r.rating)}</div>
                <div style={{ fontSize:11, fontWeight:700, color:C.text }}>{r.rating}.0</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ROW 3 */}
      <div className="cc-grid-row3" style={{ marginBottom:14 }}>
        <div style={cardStyle}>
          <H right={<span style={{ fontSize:10, color:C.text3, background:C.row, padding:'3px 10px', borderRadius:20, border:`1px solid ${C.border}` }}>6 months</span>}>Reviews Growth</H>
          <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:10, flexWrap:'wrap' }}>
            <span style={{ fontSize:24, fontWeight:800, color:C.text }}><AnimatedNumber value={stats.reviews}/></span>
            <span style={{ fontSize:11, color:C.text3 }}>total reviews</span>
            <span style={{ fontSize:11, fontWeight:600, color: delta.reviews>=0?C.green:C.red, marginLeft:'auto' }}>{fmtPct(delta.reviews)}</span>
          </div>
          <BarChart data={growth} color={C.green} isDark={isDark} height={mobile?140:160}/>
        </div>

        <div style={cardStyle}>
          <H>Review Sentiment</H>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:10 }}>
            <Donut segments={[{name:'Positive',value:sentiment.pos,color:C.green},{name:'Neutral',value:sentiment.neu,color:'#94a3b8'},{name:'Negative',value:sentiment.neg,color:C.red}]} total={stats.reviews} label="Reviews" isDark={isDark} size={mobile?130:140}/>
          </div>
          {[['Positive',C.green,sentiment.pos],['Neutral','#94a3b8',sentiment.neu],['Negative',C.red,sentiment.neg]].map(([l,c,v])=>(
            <div key={l} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:C.text2 }}><span style={{ width:8, height:8, borderRadius:'50%', background:c }}/>{l}</div>
              <span style={{ fontSize:11.5, fontWeight:700, color:C.text }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={cardStyle}>
          <H right={<span style={{ fontSize:10, color:C.green, display:'flex', alignItems:'center', gap:4 }}><span style={{ width:7, height:7, borderRadius:'50%', background:C.green, display:'inline-block' }}/>Live</span>}>Recent Activity</H>
          {activity.length===0 ? (
            <div style={{ textAlign:'center', padding:'30px 0', color:C.text3, fontSize:12 }}>No recent activity</div>
          ) : activity.map((a,i) => (
            <div key={i} style={{ display:'flex', gap:10, padding:'9px 0', borderBottom: i<activity.length-1?`1px solid ${C.border}`:'none', alignItems:'center' }}>
              <div style={{ width:30, height:30, borderRadius:8, background:a.color+'1e', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:14 }}>{a.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11.5, color:C.text, lineHeight:1.4 }}>{a.text}</div>
                <div style={{ fontSize:10, color:C.text3, marginTop:2 }}>{timeAgo(a.time)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM: 4 alert cards */}
      <div className="cc-grid-alerts">
        {ALERTS.map((a,i) => (
          <div key={i} onClick={()=>onNavigate&&onNavigate(a.page)}
            style={{ ...cardStyle, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, borderColor:a.color+'33', transition:'all .15s' }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=a.color+'88'; e.currentTarget.style.transform='translateY(-2px)' }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=a.color+'33'; e.currentTarget.style.transform='none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:11, minWidth:0 }}>
              <div style={{ width:42, height:42, borderRadius:11, background:a.color+'1e', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <i className={`ti ${a.icon}`} style={{ fontSize:19, color:a.color }}/>
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:22, fontWeight:800, color:C.text, lineHeight:1 }}><AnimatedNumber value={a.value}/></div>
                <div style={{ fontSize:11, color:C.text2, marginTop:3 }}>{a.label}</div>
              </div>
            </div>
            <span style={{ fontSize:11, color:a.color, fontWeight:600, whiteSpace:'nowrap', flexShrink:0 }}>View All →</span>
          </div>
        ))}
      </div>
      </>)}

      {shareOpen && (
        <div onClick={() => setShareOpen(false)} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, width:'min(440px,100%)', maxHeight:'calc(100vh - 32px)', overflowY:'auto', boxShadow:C.shadow }}>
            <div style={{ padding:'16px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:17, fontWeight:700, color:C.text }}>Share your profile</div>
                <div style={{ fontSize:11, color:C.text3, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{company?.name || 'Your business'}</div>
              </div>
              <button onClick={()=>setShareOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:C.text3, fontSize:20 }}><i className="ti ti-x"/></button>
            </div>
            <div style={{ padding:18 }}>
              {!_slug ? (
                <div style={{ textAlign:'center', padding:'24px 8px' }}>
                  <div style={{ width:52,height:52,borderRadius:'50%',background:'rgba(245,158,11,0.12)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px' }}><i className="ti ti-link-off" style={{ fontSize:24, color:'#d97706' }}/></div>
                  <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:6 }}>Your public link isn't ready yet</div>
                  <div style={{ fontSize:12.5, color:C.text2, lineHeight:1.6, marginBottom:18 }}>Complete your business profile to get a shareable Quvera profile URL & QR.</div>
                  <button onClick={()=>{ setShareOpen(false); onNavigate&&onNavigate('profile') }} style={{ padding:'10px 18px', borderRadius:9, border:'none', background:C.green, color:'#fff', fontWeight:600, fontSize:13, cursor:'pointer' }}>Complete profile →</button>
                </div>
              ) : (<>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:18 }}>
                  <div style={{ background:'#fff', padding:14, borderRadius:14, border:`1px solid ${C.border}` }}>
                    <img src={_profileQr} alt="Profile QR" width={200} height={200} style={{ display:'block', width:200, height:200 }}/>
                  </div>
                  <div style={{ fontSize:11.5, color:C.text3, marginTop:10, textAlign:'center', maxWidth:320, lineHeight:1.5 }}>Customers scan this to view your <b style={{ color:C.text2 }}>verified Quvera profile</b> — reviews, work, trust score & contact.</div>
                </div>
                <div style={{ fontSize:10, color:C.text3, textTransform:'uppercase', marginBottom:6, letterSpacing:'.3px' }}>Profile link</div>
                <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                  <input readOnly value={_publicLink} onFocus={e=>e.target.select()} style={{ flex:1, minWidth:0, padding:'10px 12px', border:`1px solid ${C.border}`, background:C.row, color:C.text, borderRadius:8, fontSize:12.5, boxSizing:'border-box', fontFamily:'inherit' }}/>
                  <button onClick={copyProfileLink} style={{ padding:'0 16px', borderRadius:8, background: copied?'#10b981':C.green, color:'#fff', border:'none', cursor:'pointer', fontSize:12.5, fontWeight:600, whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5, flexShrink:0 }}><i className={'ti '+(copied?'ti-check':'ti-copy')} style={{ fontSize:14 }}/> {copied?'Copied':'Copy'}</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <button onClick={downloadProfileQR} style={{ padding:11, borderRadius:8, background:C.row, color:C.text, border:`1px solid ${C.border}`, cursor:'pointer', fontSize:12.5, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><i className="ti ti-download" style={{ fontSize:15 }}/> Download QR</button>
                  <button onClick={shareProfileWhatsApp} style={{ padding:11, borderRadius:8, background:'#22c55e', color:'#fff', border:'none', cursor:'pointer', fontSize:12.5, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><i className="ti ti-brand-whatsapp" style={{ fontSize:15 }}/> Share</button>
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ====================== RESPONSIVE LAYOUT (CSS) ====================== */
const CC_CSS = `
.cc-root *{ box-sizing:border-box; }
.cc-grid-stats  { display:grid; gap:14px; grid-template-columns:repeat(5,1fr); }
.cc-grid-row2   { display:grid; gap:14px; grid-template-columns:1.6fr 1fr 1fr; }
.cc-grid-row3   { display:grid; gap:14px; grid-template-columns:repeat(3,1fr); }
.cc-grid-alerts { display:grid; gap:14px; grid-template-columns:repeat(4,1fr); }
.cc-grid-stats>*,.cc-grid-row2>*,.cc-grid-row3>*,.cc-grid-alerts>* { min-width:0; }

@media (max-width:1280px){
  .cc-grid-stats  { grid-template-columns:repeat(3,1fr); }
  .cc-grid-row2   { grid-template-columns:1fr 1fr; }
  .cc-row2-main   { grid-column:span 2; }
  .cc-grid-row3   { grid-template-columns:repeat(2,1fr); }
  .cc-grid-alerts { grid-template-columns:repeat(2,1fr); }
}
@media (max-width:900px){
  .cc-grid-row3   { grid-template-columns:1fr; }
}
@media (max-width:768px){
  .cc-grid-stats  { grid-template-columns:repeat(2,1fr); }
  .cc-grid-row2   { grid-template-columns:1fr; }
  .cc-row2-main   { grid-column:auto; }
}
@media (max-width:480px){
  .cc-grid-alerts { grid-template-columns:1fr; }
}
@media (max-width:380px){
  .cc-grid-stats  { grid-template-columns:1fr; }
}
`
