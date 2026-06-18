// trustdubai-business/src/pages/DashboardPage.jsx
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { MENU } from '../components/Sidebar'
import { can } from '../lib/permissions'
import MeetingBanner from '../components/MeetingBanner'

/* =========================================================================
   Quvera Business — AI CORE COCKPIT  (the "555" Business OS dashboard)
   Desktop: immersive AI-Core cockpit, faithful to the 555 mockup, live data.
   Mobile : keeps the existing tile launcher (user preference).
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

function LiveClock() {
  const ref = useRef(null)
  useEffect(() => {
    const tick = () => { if (ref.current) ref.current.textContent = 'Updated ' + new Date().toLocaleTimeString('en-AE',{hour:'2-digit',minute:'2-digit'}) }
    tick(); const t = setInterval(tick,1000); return () => clearInterval(t)
  }, [])
  return <span ref={ref} style={{ fontVariantNumeric:'tabular-nums' }}/>
}

/* Subtle particle starfield, scoped to the cockpit wrapper. */
function Starfield({ containerRef }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current, host = containerRef.current
    if (!canvas || !host) return
    const ctx = canvas.getContext('2d')
    let w = 0, h = 0, pts = [], raf
    const init = () => {
      w = canvas.width = host.clientWidth
      h = canvas.height = host.clientHeight
      pts = Array.from({ length: Math.min(90, Math.floor(w / 16)) }, () => ({
        x: Math.random()*w, y: Math.random()*h, r: Math.random()*1.5+0.3,
        vx:(Math.random()-0.5)*0.16, vy:(Math.random()-0.5)*0.16, a: Math.random()*0.5+0.18,
      }))
    }
    const draw = () => {
      ctx.clearRect(0,0,w,h)
      for (const p of pts) {
        p.x+=p.vx; p.y+=p.vy
        if (p.x<0)p.x=w; if (p.x>w)p.x=0; if (p.y<0)p.y=h; if (p.y>h)p.y=0
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fillStyle='rgba(0,212,255,'+p.a+')'; ctx.fill()
      }
      for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++){
        const a=pts[i], b=pts[j], dd=Math.hypot(a.x-b.x,a.y-b.y)
        if (dd<120){ ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.strokeStyle='rgba(139,92,246,'+(0.10*(1-dd/120))+')'; ctx.stroke() }
      }
      raf = requestAnimationFrame(draw)
    }
    init(); draw()
    const ro = new ResizeObserver(init); ro.observe(host)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [containerRef])
  return <canvas ref={canvasRef} style={{ position:'absolute', inset:0, zIndex:0, pointerEvents:'none' }}/>
}

/* Decorative neon city skyline for the hero banner. */
function Skyline() {
  return (
    <svg className="qc-skyline" viewBox="0 0 1200 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="qcsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b3a8f" stopOpacity="0.0"/>
          <stop offset="1" stopColor="#00aaff" stopOpacity="0.55"/>
        </linearGradient>
      </defs>
      <g fill="url(#qcsky)">
        {[[20,70],[55,110],[90,55],[120,95],[160,40],[205,120],[250,75],[290,130],[330,60],[375,100],[420,45],[470,115],[520,80],[565,135],[610,55],[660,105],[710,70],[760,125],[810,50],[860,110],[910,85],[960,60],[1010,120],[1060,75],[1110,100],[1150,55]].map(([x,top],i)=>(
          <rect key={i} x={x} y={160-top} width={i%3===0?34:26} height={top} rx="2"/>
        ))}
      </g>
    </svg>
  )
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime())/1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s/60); if (m < 60) return `${m} min ago`
  const h = Math.floor(m/60); if (h < 24) return `${h} hr ago`
  const days = Math.floor(h/24); return `${days} day${days>1?'s':''} ago`
}

const norm = v => String(v||'').trim().toLowerCase()
const normSource = raw => {
  const s = norm(raw); if(!s) return 'Direct'
  if (/meta|facebook|fb|insta|ig/.test(s)) return 'Meta Ads'
  if (/whats|wa\b/.test(s)) return 'WhatsApp'
  if (/form|web|site|landing|trustdubai|quvera/.test(s)) return 'Quvera'
  if (/manual|admin|direct|walk/.test(s)) return 'Manual'
  if (/google|ads|ppc/.test(s)) return 'Google'
  return raw ? String(raw).charAt(0).toUpperCase()+String(raw).slice(1) : 'Direct'
}
const normTemp = raw => { const s=norm(raw); if(/hot|high/.test(s))return'hot'; if(/warm|med/.test(s))return'warm'; if(/cold|low/.test(s))return'cold'; return '' }
const isWonLost = st => { const s=norm(st); return /won|lost|reject|dead|drop|junk|spam|success|convert|deal/.test(s) }
const isWon = st => { const s=norm(st); return /won|success|convert|deal/.test(s) && !/lost/.test(s) }
const isQualified = st => { const s=norm(st); return /qualif|proposal|quote|negoti|meeting|won|deal/.test(s) }

const num = v => Number(v) || 0
const fmtAED = (n) => {
  n = num(n)
  if (Math.abs(n) >= 1e6) return `AED ${(n/1e6).toFixed(n>=1e7?0:1)}M`
  if (Math.abs(n) >= 1e3) return `AED ${Math.round(n/1e3)}K`
  return `AED ${Math.round(n)}`
}
const greeting = () => { const h = new Date().getHours(); return h<12?'Good Morning':h<17?'Good Afternoon':'Good Evening' }

/* ============================== main ============================== */
export default function DashboardPage({ onNavigate, theme }) {
  const { company, staff, user, role, hasFeature, hasAddon } = useAuth()
  const adminName = staff?.name || (user?.email||'').split('@')[0] || 'there'
  const firstName = String(adminName).split(' ')[0]
  const companyName = company?.name || 'Your Business'
  const cockpitRef = useRef(null)
  const isDark = theme === 'dark'
  const T = isDark ? {
    text:'#e8f0ff', text2:'#aeb9d6',
    glassBg:'rgba(255,255,255,0.04)', glassBd:'rgba(255,255,255,0.10)',
    cardBg:'#0b1326', nodeBg:'rgba(8,13,30,0.74)', line:'rgba(255,255,255,0.07)',
    rootGrad:'radial-gradient(900px 480px at 50% -10%, rgba(0,212,255,0.10), transparent 60%), radial-gradient(700px 520px at 94% 64%, rgba(0,255,204,0.07), transparent 55%)',
    heroBg:'linear-gradient(180deg, rgba(0,40,90,0.35), transparent 75%)',
  } : {
    text:'#0b1530', text2:'#46587a',
    glassBg:'rgba(255,255,255,0.78)', glassBd:'rgba(12,32,64,0.10)',
    cardBg:'#ffffff', nodeBg:'rgba(255,255,255,0.94)', line:'rgba(12,32,64,0.08)',
    rootGrad:'radial-gradient(900px 480px at 50% -10%, rgba(0,160,220,0.10), transparent 60%), radial-gradient(700px 520px at 94% 64%, rgba(0,200,170,0.08), transparent 55%)',
    heroBg:'linear-gradient(180deg, rgba(190,225,255,0.6), transparent 78%)',
  }

  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  useEffect(() => { const r = () => setVw(window.innerWidth); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r) }, [])
  const mobile = vw < 768

  // Share Profile + QR (mobile header button)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const _slug = company?.slug || ''
  const _publicLink = `https://quvera.ae/${_slug}`
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
  const [d, setD] = useState({
    health:0, aiScore:0, pipeline:0, liveProjects:0, aiActions:0,
    leads:0, activeLeads:0, hot:0, newToday:0, qualified:0, won:0, winRate:0, followDue:0,
    quotes:0, approved:0, conversion:0, quotePipeline:0, pendingQuotes:0,
    projects:0, onTrack:0, atRisk:0, health_proj:0,
    revenue:0, profit:0, outstanding:0,
    trust:0, reviews:0, avgRating:'0.0', verified:false,
    awaiting:0,
  })
  const [activity, setActivity] = useState([])
  const [priorities, setPriorities] = useState([])

  useEffect(() => { if (company) fetchAll() }, [company])

  const safe = async (p) => { try { const r = await p; return r && !r.error ? (r.data || []) : [] } catch (e) { return [] } }
  const safeCount = async (p) => { try { const r = await p; return r && !r.error ? (r.count || 0) : 0 } catch (e) { return 0 } }

  function calcProfile(c) { if(!c)return 0; const f=['name','description','phone','logo_url','category','location']; return Math.round(f.filter(x=>!!c[x]).length/f.length*100) }

  async function fetchAll() {
    setLoading(true)
    try {
      const cid = company.id
      const [reviews, leads, quotes, invoices, projects, recentReviews, awaitingCount] = await Promise.all([
        safe(supabase.from('reviews').select('rating,reviewer_name,created_at').eq('company_id', cid)),
        safe(supabase.from('lead_submissions').select('*').eq('company_id', cid)),
        safe(supabase.from('quotations').select('status,total,created_at').eq('company_id', cid)),
        safe(supabase.from('invoices').select('total,payments,status,created_at').eq('company_id', cid)),
        safe(supabase.from('ops_projects').select('status,contract_value,health,created_at').eq('company_id', cid)),
        safe(supabase.from('reviews').select('*').eq('company_id', cid).order('created_at',{ascending:false}).limit(6)),
        safeCount(supabase.from('inbox_messages').select('*',{count:'exact',head:true}).eq('company_id', cid).eq('read', false)),
      ])

      /* Trust / reviews */
      const avg = reviews.length ? (reviews.reduce((s,r)=>s+num(r.rating),0)/reviews.length).toFixed(1) : '0.0'
      const verified = !!company.is_verified
      const fallbackTrust = Math.round(((verified?0.4:0)+(parseFloat(avg)/5*0.4)+Math.min(reviews.length/50,1)*0.2)*100)
      const trust = company.trust_score!=null ? Number(company.trust_score) : fallbackTrust

      /* Leads */
      const todayKey = new Date().setHours(0,0,0,0)
      const totalLeads = leads.length
      const hot = leads.filter(l=>normTemp(l.temperature)==='hot').length
      const won = leads.filter(l=>isWon(l.status)).length
      const qualified = leads.filter(l=>isQualified(l.status)).length
      const decided = leads.filter(l=>isWonLost(l.status)).length
      const winRate = decided ? Math.round(won/decided*100) : 0
      const activeLeads = leads.filter(l=>!isWonLost(l.status)).length
      const newToday = leads.filter(l=>new Date(l.created_at).setHours(0,0,0,0)===todayKey).length
      let followDue = 0
      leads.forEach(l=>{ const f=l.follow_up_date; if(!f||isWonLost(l.status))return; if(new Date(f).setHours(0,0,0,0)<=todayKey)followDue++ })

      /* Quotes / revenue pipeline */
      const quoteCount = quotes.length
      const approved = quotes.filter(q=>norm(q.status)==='approved').length
      const pendingQuotes = quotes.filter(q=>/sent|pending/.test(norm(q.status))).length
      const conversion = quoteCount ? Math.round(approved/quoteCount*100) : 0
      const quotePipeline = quotes.filter(q=>!/reject/.test(norm(q.status))).reduce((s,q)=>s+num(q.total),0)

      /* Invoices / finance */
      const sumPay = iv => (Array.isArray(iv.payments)?iv.payments:[]).reduce((a,x)=>a+num(x.amount),0)
      const invoiceTotal = invoices.reduce((s,iv)=>s+num(iv.total),0)
      const revenue = invoices.reduce((s,iv)=>s+sumPay(iv),0)
      const outstanding = Math.max(0, invoiceTotal - revenue)
      const profit = Math.round(revenue * 0.26) // indicative margin until cost engine is wired

      /* Projects */
      const liveProjects = projects.filter(p=>!/complete|closed|done|cancel/.test(norm(p.status))).length
      const atRisk = projects.filter(p=>/risk|delay|hold|stuck/.test(norm(p.status)) || (p.health!=null && num(p.health)<60)).length
      const onTrack = Math.max(0, liveProjects - atRisk)
      const healthVals = projects.map(p=>p.health!=null?num(p.health):(/risk|delay|hold/.test(norm(p.status))?55:88))
      const projHealth = healthVals.length ? Math.round(healthVals.reduce((a,b)=>a+b,0)/healthVals.length) : 0

      /* Composite scores */
      const aiScore = Math.min(100, Math.round((trust/100)*40 + (winRate/100)*25 + (projHealth/100)*20 + (calcProfile(company)/100)*15))
      const health  = Math.min(100, Math.round((projHealth*0.4) + (trust*0.3) + (conversion*0.3)))
      const aiActions = followDue + pendingQuotes + atRisk + (outstanding>0?1:0)

      setD({
        health, aiScore, pipeline: quotePipeline, liveProjects, aiActions,
        leads: totalLeads, activeLeads, hot, newToday, qualified, won, winRate, followDue,
        quotes: quoteCount, approved, conversion, quotePipeline, pendingQuotes,
        projects: liveProjects, onTrack, atRisk, health_proj: projHealth,
        revenue, profit, outstanding,
        trust: Math.round(trust), reviews: reviews.length, avgRating: avg, verified,
        awaiting: awaitingCount,
      })

      /* Activity feed */
      const feed = []
      ;(recentReviews||[]).forEach(r=>feed.push({ dot:'#f59e0b', text:`New review by ${r.reviewer_name||'a customer'}`, time:r.created_at }))
      ;leads.slice(-6).forEach(l=>feed.push({ dot:'#00D4FF', text:`New lead from ${normSource(l.source||l.lead_source)}`, time:l.created_at }))
      feed.sort((a,b)=>new Date(b.time)-new Date(a.time))
      setActivity(feed.slice(0,6))

      /* Today's priorities */
      const pr = []
      if (hot)           pr.push({ icon:'ti-flame',          color:'#ff7a59', text:`${hot} hot lead${hot>1?'s':''} — prioritise today`, page:'leadengine' })
      if (followDue)     pr.push({ icon:'ti-clock',          color:'#00D4FF', text:`${followDue} follow-up${followDue>1?'s':''} due`, page:'leadengine' })
      if (pendingQuotes) pr.push({ icon:'ti-file-invoice',   color:'#8B5CF6', text:`${pendingQuotes} quotation${pendingQuotes>1?'s':''} need approval`, page:'quotations' })
      if (atRisk)        pr.push({ icon:'ti-alert-triangle', color:'#ff5d5d', text:`${atRisk} project${atRisk>1?'s':''} at risk`, page:'projects' })
      if (outstanding>0) pr.push({ icon:'ti-cash',           color:'#ffb020', text:`${fmtAED(outstanding)} outstanding to collect`, page:'invoices' })
      setPriorities(pr.slice(0,4))
    } catch(e){ console.error('Cockpit fetch error:', e) }
    finally{ setLoading(false) }
  }

  /* ---------------- mobile launcher (unchanged behaviour) ---------------- */
  const perms = staff?.permissions || null
  const checkAddon = (k) => (typeof hasAddon === 'function' ? hasAddon(k) : false)
  const checkFeature = (k) => (typeof hasFeature === 'function' ? hasFeature(k) : true)
  const sectionColor = {
    'MAIN':'#3b82f6','LEAD HUB':'#22c55e','SALES & QUOTES':'#06b6d4','PROJECTS & OPS':'#f59e0b',
    'AI & CRM':'#a855f7','REPUTATION':'#ec4899','MY PROFILE':'#3b82f6','GROWTH':'#22c55e',
    'TEAM & ACCESS':'#94a3b8','SETTINGS':'#94a3b8',
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

  const go = (id) => onNavigate && onNavigate(id)

  /* ---------------- mobile render (tile launcher preserved) ---------------- */
  if (mobile) {
    // Theme-aware (follows the 555 shell light/dark) — greeting now lives in the global hero.
    const MC = { card:'var(--card)', border:'var(--border)', text:'var(--text)', text2:'var(--text2)', text3:'var(--text3)', row:'var(--bg2)', green:'#22c55e', cyan:'#06b6d4', gold:'#f59e0b', shadow:'var(--shadow)' }
    return (
      <div style={{ color:MC.text }}>
        <MeetingBanner onNavigate={onNavigate} />
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[['Trust', d.trust, MC.green],['Leads', d.leads, MC.cyan],['Reviews', d.reviews, MC.gold]].map(([l,v,c]) => (
            <div key={l} style={{ flex:1, background:MC.card, border:`1px solid ${MC.border}`, borderRadius:14, padding:'11px 6px', textAlign:'center', boxShadow:MC.shadow }}>
              <div style={{ fontSize:20, fontWeight:800, color:c, lineHeight:1 }}>{v}</div>
              <div style={{ fontSize:10, color:MC.text2, marginTop:4 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:18 }}>
          <button onClick={()=>go('dashboard')} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:'transparent', color:MC.text, border:`1px solid ${MC.border}`, borderRadius:10, padding:'10px', fontSize:13, fontWeight:600 }}><i className="ti ti-layout-dashboard" style={{ color:MC.green }}/> Command Center</button>
          <button onClick={()=>{ setShareOpen(true); setCopied(false) }} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:'transparent', color:MC.text, border:`1px solid ${MC.border}`, borderRadius:10, padding:'10px', fontSize:13, fontWeight:600 }}><i className="ti ti-qrcode" style={{ color:MC.green }}/> Share Profile</button>
        </div>
        {mobileGroups.map((g, gi) => (
          <div key={gi} style={{ marginBottom:18 }}>
            <div style={{ fontSize:11, color:MC.text3, textTransform:'uppercase', letterSpacing:'.5px', fontWeight:700, margin:'0 2px 10px' }}>{g.section}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {g.items.map(it => {
                const col = sectionColor[g.section] || MC.green
                const dim = it.permLocked || it.addonLocked || it.featureLocked
                return (
                  <div key={it.id}
                    onClick={() => { if (it.permLocked) return; if (it.addonLocked || it.featureLocked) go('plans'); else go(it.id) }}
                    style={{ position:'relative', background:MC.card, border:`1px solid ${MC.border}`, borderRadius:14, padding:'14px 6px 12px', textAlign:'center', cursor: it.permLocked?'not-allowed':'pointer', opacity: dim?0.55:1, boxShadow:MC.shadow }}>
                    {it.permLocked
                      ? <i className="ti ti-lock" style={{ position:'absolute', top:7, right:7, fontSize:11, color:MC.text3 }}/>
                      : it.addonLocked
                        ? <span style={{ position:'absolute', top:6, right:6, fontSize:7.5, fontWeight:700, color:'#0099cc', background:'rgba(0,153,204,0.14)', padding:'1px 5px', borderRadius:99 }}>ADD-ON</span>
                        : it.showSoon
                          ? <span style={{ position:'absolute', top:6, right:6, fontSize:7.5, fontWeight:700, color:MC.gold, background:MC.gold+'22', padding:'1px 5px', borderRadius:99 }}>SOON</span>
                          : null}
                    <div style={{ width:42, height:42, margin:'0 auto 8px', borderRadius:12, background: dim?MC.row:col+'1e', display:'flex', alignItems:'center', justifyContent:'center', color: dim?MC.text3:col }}>
                      <i className={`ti ${it.icon}`} style={{ fontSize:21 }}/>
                    </div>
                    <div style={{ fontSize:11, color: dim?MC.text2:MC.text, lineHeight:1.25, fontWeight:500 }}>{it.label}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {shareOpen && <ShareModal {...{ company, _slug, _publicLink, _profileQr, copied, copyProfileLink, downloadProfileQR, shareProfileWhatsApp, onClose:()=>setShareOpen(false), onNavigate }}/>}
      </div>
    )
  }

  /* ===================== desktop COCKPIT (555) ===================== */
  const KPIS = [
    { k:'Business Health',    v:d.health,  suffix:'%', icon:'ti-heartbeat',      c:'#ec4899', page:'analytics' },
    { k:'AI Score',           v:d.aiScore, suffix:'',  icon:'ti-brain',          c:'#00FFCC', page:'analytics' },
    { k:'Revenue Pipeline',   raw:fmtAED(d.pipeline),  icon:'ti-database',       c:'#8B5CF6', page:'quotations' },
    { k:'Projects Active',    v:d.liveProjects,        icon:'ti-folders',        c:'#ffb020', page:'projects' },
    { k:'AI Recommendations', v:d.aiActions,           icon:'ti-bulb',           c:'#00D4FF', page:'organizer' },
  ]

  // Radial engine nodes around the AI Core (side + vertical % + matching SVG endpoint)
  const NODES = [
    { name:'LEAD AI',    c:'#00D4FF', icon:'ti-users',        tag:'Detect. Score. Convert.',     page:'leadengine', side:'left',  y:6,  ly:70  },
    { name:'REVENUE AI', c:'#8B5CF6', icon:'ti-file-invoice', tag:'Quote. Close. Grow.',         page:'quotations', side:'left',  y:39, ly:220 },
    { name:'FINANCE AI', c:'#ffb020', icon:'ti-cash',         tag:'Monitor. Predict. Optimize.', page:'ledger',     side:'left',  y:72, ly:370 },
    { name:'PROJECT AI', c:'#00FFCC', icon:'ti-stack-2',      tag:'Plan. Track. Deliver.',       page:'projects',   side:'right', y:6,  ly:70  },
    { name:'CLIENT AI',  c:'#ec4899', icon:'ti-messages',     tag:'Engage. Delight. Retain.',    page:'inbox',      side:'right', y:39, ly:220 },
    { name:'TRUST AI',   c:'#22c55e', icon:'ti-shield-check', tag:'Verify. Review. Build Trust.',page:'trust',      side:'right', y:72, ly:370 },
  ]

  const AI_QUESTIONS = [
    'How many quotations need approval?',
    'Which projects are delayed?',
    'Show expected profit this month',
    'Which leads have highest chance of closing?',
  ]

  const METRICS = [
    { name:'LEAD INTELLIGENCE', c:'#00D4FF', icon:'ti-bolt', big:d.activeLeads, label:'Active Leads', page:'leadengine', open:'Open Lead Hub',
      rows:[['Hot Leads',d.hot],['New Today',d.newToday],['Qualified',d.qualified],['Won',d.won]] },
    { name:'REVENUE ENGINE', c:'#8B5CF6', icon:'ti-file-invoice', big:d.quotes, label:'Quotations', page:'quotations', open:'Open Quotations',
      rows:[['Approved',d.approved],['Conversion',`${d.conversion}%`],['Pending',d.pendingQuotes],['Pipeline',fmtAED(d.quotePipeline)]] },
    { name:'PROJECT INTELLIGENCE', c:'#00FFCC', icon:'ti-stack-2', big:d.projects, label:'Active Projects', page:'projects', open:'Open Projects',
      rows:[['On Track',d.onTrack],['At Risk',d.atRisk],['Health',`${d.health_proj}%`]] },
    { name:'FINANCE INTELLIGENCE', c:'#22c55e', icon:'ti-chart-line', bigRaw:fmtAED(d.revenue), label:'Collected Revenue', page:'ledger', open:'Open Ledger',
      rows:[['Profit',fmtAED(d.profit)],['Outstanding',fmtAED(d.outstanding)],['VAT','Ready']] },
    { name:'REPUTATION ENGINE', c:'#ec4899', icon:'ti-star', big:d.trust, bigSuffix:'/100', label:'Trust Score', page:'trust', open:'Open Reviews',
      rows:[['Reviews',d.reviews],['Rating',d.avgRating],['Verified',d.verified?'✓':'—']] },
  ]

  const FLOW = [
    { ic:'ti-clock',        label:'LEAD',    page:'leadengine' },
    { ic:'ti-file-invoice', label:'QUOTE',   page:'quotations' },
    { ic:'ti-stack-2',      label:'PROJECT', page:'projects' },
    { ic:'ti-receipt',      label:'INVOICE', page:'invoices' },
    { ic:'ti-cash',         label:'PAYMENT', page:'ledger' },
    { ic:'ti-star',         label:'REVIEW',  page:'reviews' },
    { ic:'ti-shield-check', label:'TRUST',   page:'trust' },
  ]

  const NodeCard = ({ e }) => (
    <div className={`qc-node-card ${e.side}`} onClick={()=>go(e.page)} style={{ '--c':e.c, top:`${e.y}%`, [e.side]:0 }}>
      <div className="qc-eng-ic"><i className={`ti ${e.icon}`}/></div>
      <div style={{ minWidth:0 }}>
        <div className="qc-eng-name">{e.name}</div>
        <div className="qc-eng-tag">{e.tag}</div>
        <div className="qc-eng-online"><span className="qc-dot-sm"/> ONLINE</div>
      </div>
    </div>
  )

  return (
    <div ref={cockpitRef} className={`qc-root${isDark?' qc-dark':' qc-light'}`} style={{ position:'relative', overflow:'hidden',
      background:T.rootGrad, color:T.text,
      '--qc-text':T.text, '--qc-text2':T.text2, '--qc-glass-bg':T.glassBg, '--qc-glass-bd':T.glassBd,
      '--qc-card-bg':T.cardBg, '--qc-node-bg':T.nodeBg, '--qc-line':T.line, '--qc-hero-bg':T.heroBg }}>
      <style>{QC_CSS}</style>
      <Starfield containerRef={cockpitRef} />

      <div style={{ position:'relative', zIndex:2, padding:'0 0 36px' }}>

        {/* ============ KPI BAND ============ */}
        <div style={{ padding:'12px clamp(16px,2.4vw,28px) 0' }}>
          <MeetingBanner onNavigate={onNavigate} />

          {/* KPI TILES */}
          <div className="qc-kpis" style={{ marginTop:0 }}>
            {KPIS.map((s,i)=>(
              <div key={i} className="qc-kpi" onClick={()=>s.page&&go(s.page)} style={{ '--c':s.c }}>
                <div className="qc-kpi-ic"><i className={`ti ${s.icon}`}/></div>
                <div style={{ minWidth:0 }}>
                  <div className="qc-kpi-k">{s.k}</div>
                  <div className="qc-kpi-v">{s.raw ? s.raw : <><AnimatedNumber value={s.v}/>{s.suffix}</>}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:'0 clamp(16px,2.4vw,28px)' }}>
          {/* ============ AI CORE BAND ============ */}
          <div className="qc-sec-head">
            <h2>AI Core</h2>
            <span style={{ color:'var(--qc-text2)', fontSize:13 }}>Your entire business is connected</span>
            <span className="qc-line"/>
            <span className="qc-live"><span className="qc-livedot"/>Live</span>
            <span style={{ color:'var(--qc-text2)', fontSize:12 }}><LiveClock/></span>
            <button className="qc-refresh" onClick={fetchAll} title="Refresh"><i className="ti ti-refresh"/></button>
          </div>

          <div className="qc-core-band">
            <div className="qc-glass qc-core-card">
              {loading && <div className="qc-loadbar"/>}
              <div className="qc-core-sec">
                <svg className="qc-neural" viewBox="0 0 1000 440" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="qcline" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#00D4FF"/><stop offset="1" stopColor="#8B5CF6"/></linearGradient>
                    <filter id="qcglow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  <g filter="url(#qcglow)" stroke="url(#qcline)" strokeWidth="1.6" fill="none" strokeLinecap="round">
                    {NODES.map((n,i)=>{
                      const ex = n.side==='left' ? 250 : 750
                      const cx = 500, cy = 220
                      const mx = (cx+ex)/2
                      return <path key={i} className="qc-flowline" d={`M ${ex} ${n.ly} C ${mx} ${n.ly}, ${mx} ${cy}, ${cx} ${cy}`}/>
                    })}
                  </g>
                  {NODES.map((n,i)=>(
                    <circle key={'d'+i} r="3" fill={n.c} className="qc-flowdot">
                      <animateMotion dur={`${2.6+i*0.3}s`} repeatCount="indefinite"
                        path={`M ${n.side==='left'?250:750} ${n.ly} C ${((n.side==='left'?250:750)+500)/2} ${n.ly}, ${((n.side==='left'?250:750)+500)/2} 220, 500 220`}/>
                    </circle>
                  ))}
                </svg>

                <div className="qc-ring r3"/><div className="qc-ring r2"/><div className="qc-ring r1"/>
                <div className="qc-core"><div className="qc-core-inner">
                  <div style={{ fontWeight:800, fontSize:17, letterSpacing:.5 }}>QUVERA</div>
                  <div style={{ fontSize:9, letterSpacing:2.5, color:'#bfe9ff', textTransform:'uppercase', marginTop:3 }}>AI Core</div>
                  <div className="qc-grad" style={{ fontSize:22, fontWeight:800, marginTop:6, fontVariantNumeric:'tabular-nums' }}><AnimatedNumber value={d.aiScore}/></div>
                </div></div>

                {NODES.map((n,i)=><NodeCard key={i} e={n}/>)}
              </div>
              <div className="qc-flow-cap">One platform · one workflow · one source of truth</div>
            </div>

            {/* AI ASSISTANT */}
            <div className="qc-glass qc-ai">
              <div className="qc-ai-head">
                <span style={{ fontWeight:800, fontSize:14, letterSpacing:.3 }}>AI ASSISTANT</span>
                <span className="qc-beta">BETA</span>
              </div>
              <div className="qc-ai-orb"><i className="ti ti-robot"/></div>
              <div style={{ textAlign:'center', marginBottom:14 }}>
                <div style={{ fontWeight:700, fontSize:14 }}>Hi {firstName}! 👋</div>
                <div style={{ color:'#7e8aa8', fontSize:12.5, marginTop:2 }}>How can I help you today?</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {AI_QUESTIONS.map((q,i)=>(
                  <div key={i} className="qc-ai-q" onClick={()=>go('aiassistant')}>
                    <span style={{ flex:1 }}>{q}</span><i className="ti ti-arrow-right" style={{ color:'#7e8aa8' }}/>
                  </div>
                ))}
              </div>
              <button className="qc-ai-open" onClick={()=>go('aiassistant')}>Open Full AI Assistant <i className="ti ti-arrow-right"/></button>
            </div>
          </div>

          {/* ============ INTELLIGENCE METRIC CARDS + ACTIVITY ============ */}
          <div className="qc-metrics">
            {METRICS.map((m,i)=>(
              <div key={i} className="qc-metric" onClick={()=>go(m.page)} style={{ '--c':m.c }}>
                <div className="qc-metric-top">
                  <div className="qc-metric-ic"><i className={`ti ${m.icon}`}/></div>
                  <div className="qc-metric-name">{m.name}</div>
                </div>
                <div className="qc-metric-big">
                  {m.bigRaw ? m.bigRaw : <><AnimatedNumber value={m.big}/>{m.bigSuffix||''}</>}
                </div>
                <div className="qc-metric-label">{m.label}</div>
                <div className="qc-metric-rows">
                  {m.rows.map((r,j)=>(
                    <div key={j} className="qc-metric-row"><span>{r[0]}</span><b>{r[1]}</b></div>
                  ))}
                </div>
                <div className="qc-metric-open">{m.open} <i className="ti ti-arrow-right"/></div>
              </div>
            ))}

            <div className="qc-glass qc-act-panel">
              <div className="qc-panel-h"><span>Recent Activity</span><span className="qc-live"><span className="qc-livedot"/>Live</span></div>
              {activity.length===0 ? (
                <div style={{ textAlign:'center', padding:'24px 0', color:'#7e8aa8', fontSize:12 }}>No recent activity</div>
              ) : activity.map((a,i)=>(
                <div key={i} className="qc-act">
                  <span className="qc-act-dot" style={{ background:a.dot, boxShadow:`0 0 8px ${a.dot}` }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, lineHeight:1.35 }}>{a.text}</div>
                    <div style={{ fontSize:10, color:'#7e8aa8', marginTop:1 }}>{timeAgo(a.time)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ============ WORKFLOW + PRIORITIES ============ */}
          <div className="qc-bottom">
            <div className="qc-glass qc-flow-card">
              <div className="qc-flow-title">ONE PLATFORM. ONE WORKFLOW. ONE SOURCE OF TRUTH.</div>
              <div className="qc-flow-track">
                {FLOW.map((f,i)=>(
                  <span key={i} style={{ display:'contents' }}>
                    <div className="qc-step" onClick={()=>go(f.page)}>
                      <span className="qc-step-b"><i className={`ti ${f.ic}`}/></span>
                      <span className="qc-step-l">{f.label}</span>
                    </div>
                    {i<FLOW.length-1 && <span className="qc-arrowf"/>}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="qc-glass qc-panel">
                <div className="qc-panel-h"><span>Today's Priorities</span></div>
                {priorities.length===0 ? (
                  <div style={{ textAlign:'center', padding:'18px 0', color:'#7e8aa8', fontSize:12 }}>
                    <i className="ti ti-circle-check" style={{ fontSize:24, color:'#22c55e', display:'block', marginBottom:6 }}/>All clear.
                  </div>
                ) : priorities.map((p,i)=>(
                  <div key={i} className="qc-prio" onClick={()=>go(p.page)}>
                    <div className="qc-prio-ic" style={{ background:p.color+'1e', color:p.color }}><i className={`ti ${p.icon}`}/></div>
                    <span style={{ flex:1, fontSize:12 }}>{p.text}</span>
                  </div>
                ))}
                <button className="qc-ai-open" style={{ marginTop:10 }} onClick={()=>go('organizer')}>Open My Organizer <i className="ti ti-arrow-right"/></button>
              </div>

              <div className="qc-wordmark">
                <div className="qc-grad" style={{ fontSize:22, fontWeight:800, letterSpacing:.5, lineHeight:1.1 }}>QUVERA<br/>BUSINESS OS</div>
                <div style={{ color:'#7e8aa8', fontSize:11, marginTop:8, lineHeight:1.5 }}>Powered by AI. Built for Growth.<br/>Engineered for Trust.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {shareOpen && <ShareModal {...{ company, _slug, _publicLink, _profileQr, copied, copyProfileLink, downloadProfileQR, shareProfileWhatsApp, onClose:()=>setShareOpen(false), onNavigate }}/>}
    </div>
  )
}

/* ====================== Share modal (shared by both views) ====================== */
function ShareModal({ company, _slug, _publicLink, _profileQr, copied, copyProfileLink, downloadProfileQR, shareProfileWhatsApp, onClose, onNavigate }) {
  const C = { card:'#0a1024', border:'rgba(255,255,255,0.10)', text:'#e8f0ff', text2:'#aeb9d6', text3:'#7e8aa8', row:'rgba(255,255,255,0.04)', green:'#22c55e' }
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, width:'min(440px,100%)', maxHeight:'calc(100vh - 32px)', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ padding:'16px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:17, fontWeight:700, color:C.text }}>Share your profile</div>
            <div style={{ fontSize:11, color:C.text3, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{company?.name || 'Your business'}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:C.text3, fontSize:20 }}><i className="ti ti-x"/></button>
        </div>
        <div style={{ padding:18 }}>
          {!_slug ? (
            <div style={{ textAlign:'center', padding:'24px 8px' }}>
              <div style={{ width:52,height:52,borderRadius:'50%',background:'rgba(245,158,11,0.12)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px' }}><i className="ti ti-link-off" style={{ fontSize:24, color:'#d97706' }}/></div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:6 }}>Your public link isn't ready yet</div>
              <div style={{ fontSize:12.5, color:C.text2, lineHeight:1.6, marginBottom:18 }}>Complete your business profile to get a shareable Quvera profile URL & QR.</div>
              <button onClick={()=>{ onClose(); onNavigate&&onNavigate('profile') }} style={{ padding:'10px 18px', borderRadius:9, border:'none', background:C.green, color:'#fff', fontWeight:600, fontSize:13, cursor:'pointer' }}>Complete profile →</button>
            </div>
          ) : (<>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:18 }}>
              <div style={{ background:'#fff', padding:14, borderRadius:14 }}>
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
  )
}

/* ====================== COCKPIT STYLES ====================== */
const QC_CSS = `
.qc-root *{ box-sizing:border-box; }
.qc-grad{ background:linear-gradient(100deg,#00D4FF,#00FFCC 55%,#8B5CF6); -webkit-background-clip:text; background-clip:text; color:transparent; }
.qc-glass{ border:1px solid var(--qc-glass-bd); background:var(--qc-glass-bg); backdrop-filter:blur(10px); }
.qc-dot-sm{ width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 8px #22c55e; display:inline-block; }

/* ---- hero ---- */
.qc-hero{ position:relative; padding:26px clamp(16px,2.4vw,28px) 0; overflow:hidden;
  background:var(--qc-hero-bg); border-bottom:1px solid var(--qc-line); padding-bottom:18px; }
.qc-skyline{ position:absolute; left:0; right:0; bottom:108px; width:100%; height:150px; z-index:0; opacity:.5; pointer-events:none; mix-blend-mode:screen; }
.qc-hero-inner{ position:relative; z-index:5; display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.qc-eyebrow{ font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#d9b676; }
.qc-coname{ font-weight:800; font-size:clamp(24px,3.2vw,38px); line-height:1.04; letter-spacing:-.6px; margin:8px 0 8px; }
.qc-subtitle{ display:flex; align-items:center; gap:8px; font-size:13.5px; color:var(--qc-text2); }
.qc-live-stamp{ display:flex; align-items:center; gap:12px; }
.qc-live{ display:flex; align-items:center; gap:6px; font-size:11.5px; color:#22c55e; font-weight:700; }
.qc-livedot{ width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 8px #22c55e; animation:qcpulse 1.8s infinite; }
.qc-refresh{ width:32px; height:32px; border-radius:9px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.05); color:#aeb9d6; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; }
.qc-refresh:hover{ color:#00D4FF; border-color:rgba(0,212,255,0.5); transform:rotate(90deg); }

/* ---- KPI tiles ---- */
.qc-kpis{ position:relative; z-index:5; display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-top:18px; }
.qc-kpi{ display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:16px; cursor:pointer;
  border:1px solid var(--qc-glass-bd); background:var(--qc-glass-bg); backdrop-filter:blur(10px); transition:transform .15s, border-color .15s; }
.qc-kpi:hover{ transform:translateY(-2px); border-color:color-mix(in srgb, var(--c) 55%, transparent); }
.qc-kpi-ic{ width:42px; height:42px; border-radius:12px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:21px;
  background:color-mix(in srgb, var(--c) 18%, transparent); color:var(--c); border:1px solid color-mix(in srgb, var(--c) 40%, transparent); }
.qc-kpi-k{ font-size:10px; letter-spacing:1px; text-transform:uppercase; color:#7e8aa8; white-space:nowrap; }
.qc-kpi-v{ font-size:23px; font-weight:800; margin-top:3px; font-variant-numeric:tabular-nums; line-height:1; color:var(--c); }

/* ---- section head ---- */
.qc-sec-head{ display:flex; align-items:center; gap:12px; margin:24px 0 14px; }
.qc-sec-head h2{ font-weight:800; font-size:18px; letter-spacing:-.3px; }
.qc-line{ flex:1; height:1px; background:linear-gradient(90deg,rgba(255,255,255,0.12),transparent); }

/* ---- core band ---- */
.qc-core-band{ display:grid; grid-template-columns:1.85fr 1fr; gap:16px; }
.qc-core-card{ border-radius:22px; padding:16px; position:relative; overflow:hidden; }
.qc-loadbar{ position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,#00D4FF,transparent); background-size:50% 100%; animation:qcload 1.1s linear infinite; z-index:6; }
.qc-core-sec{ position:relative; width:100%; height:440px; }
.qc-neural{ position:absolute; inset:0; width:100%; height:100%; z-index:0; opacity:.9; }
.qc-flowline{ stroke-dasharray:6 10; animation:qcdash 1s linear infinite; opacity:.5; }
.qc-flowdot{ filter:drop-shadow(0 0 4px currentColor); }

.qc-node-card{ position:absolute; width:clamp(186px,15vw,224px); display:flex; align-items:center; gap:11px; padding:11px 13px; border-radius:14px; cursor:pointer; z-index:3;
  border:1px solid color-mix(in srgb, var(--c) 32%, var(--qc-glass-bd)); background:var(--qc-node-bg); backdrop-filter:blur(6px);
  transition:transform .15s, border-color .15s, box-shadow .15s; }
.qc-node-card.right{ flex-direction:row-reverse; text-align:right; }
.qc-node-card:hover{ transform:translateY(-2px); border-color:var(--c); box-shadow:0 12px 32px -10px var(--c); }
.qc-node-card.right .qc-eng-online{ justify-content:flex-end; }
.qc-eng-ic{ width:40px; height:40px; border-radius:11px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:20px;
  background:color-mix(in srgb, var(--c) 18%, transparent); color:var(--c); border:1px solid color-mix(in srgb, var(--c) 40%, transparent); }
.qc-eng-name{ font-weight:700; font-size:13px; letter-spacing:.4px; }
.qc-eng-tag{ font-size:10.5px; color:var(--qc-text2); margin-top:2px; line-height:1.3; }
.qc-eng-online{ font-size:9.5px; font-weight:700; letter-spacing:.6px; color:#22c55e; margin-top:5px; display:flex; align-items:center; gap:5px; }

.qc-ring{ position:absolute; left:50%; top:50%; border-radius:50%; border:1px solid rgba(0,212,255,0.25); z-index:1; }
.qc-ring.r1{ width:184px; height:184px; margin:-92px 0 0 -92px; border-style:dashed; animation:qcspin 26s linear infinite; }
.qc-ring.r2{ width:230px; height:230px; margin:-115px 0 0 -115px; border-color:rgba(139,92,246,0.22); animation:qcspin 40s linear infinite reverse; }
.qc-ring.r3{ width:286px; height:286px; margin:-143px 0 0 -143px; border-color:rgba(0,255,204,0.12); }
.qc-core{ position:absolute; left:50%; top:50%; width:176px; height:176px; margin:-88px 0 0 -88px; border-radius:50%; display:flex; align-items:center; justify-content:center; z-index:2;
  background:radial-gradient(circle at 50% 40%, rgba(0,212,255,0.40), rgba(139,92,246,0.22) 60%, transparent 72%);
  box-shadow:0 0 70px rgba(0,212,255,0.45), 0 0 150px rgba(139,92,246,0.30); }
.qc-core-inner{ width:128px; height:128px; border-radius:50%; background:radial-gradient(circle at 50% 38%,#0bd,#1b2b6b);
  display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; box-shadow:0 0 40px rgba(0,212,255,0.6) inset; animation:qcfloat 6s ease-in-out infinite; }
.qc-flow-cap{ text-align:center; color:#7e8aa8; font-size:10.5px; letter-spacing:2px; text-transform:uppercase; margin-top:8px; }

/* hero light-trail rings */
.qc-lighttrails{ position:absolute; left:0; right:0; bottom:64px; height:240px; z-index:1; pointer-events:none; opacity:.92; mix-blend-mode:screen; }
.qc-lighttrails svg{ width:100%; height:100%; display:block; }
/* light mode: screen-blend would wash out on a light bg → normal blend, softer */
.qc-light .qc-lighttrails{ mix-blend-mode:normal; opacity:.55; }
.qc-light .qc-skyline{ opacity:.32; mix-blend-mode:multiply; }
.qc-light .qc-flow-cap, .qc-light .qc-metric-label{ color:#5a6b8a; }

/* ---- AI assistant ---- */
.qc-ai{ border-radius:20px; padding:18px; border-color:rgba(0,212,255,0.20); display:flex; flex-direction:column; }
.qc-ai-head{ display:flex; align-items:center; gap:9px; margin-bottom:14px; }
.qc-beta{ font-size:8.5px; font-weight:800; letter-spacing:1px; color:#00FFCC; border:1px solid rgba(0,255,204,0.4); background:rgba(0,255,204,0.08); padding:2px 6px; border-radius:6px; }
.qc-ai-orb{ width:54px; height:54px; border-radius:50%; margin:0 auto 12px; display:flex; align-items:center; justify-content:center; font-size:26px; color:#cdebff;
  background:radial-gradient(circle at 50% 38%, rgba(0,212,255,0.5), rgba(139,92,246,0.25) 65%, transparent);
  box-shadow:0 0 30px rgba(0,212,255,0.55); animation:qcfloat 5s ease-in-out infinite; }
.qc-ai-q{ display:flex; align-items:center; gap:8px; font-size:12px; color:var(--qc-text); border:1px solid var(--qc-glass-bd); background:var(--qc-glass-bg); padding:10px 12px; border-radius:11px; cursor:pointer; transition:all .15s; }
.qc-ai-q:hover{ border-color:rgba(0,212,255,0.5); background:rgba(0,212,255,0.06); }
.qc-ai-open{ margin-top:14px; width:100%; padding:10px; border-radius:11px; border:1px solid rgba(0,212,255,0.3); background:rgba(0,212,255,0.08); color:#00D4FF; font-weight:700; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:7px; transition:all .15s; }
.qc-ai-open:hover{ background:rgba(0,212,255,0.16); }

/* ---- metric cards ---- */
.qc-metrics{ display:grid; grid-template-columns:repeat(5,1fr) 0.95fr; gap:14px; margin-top:22px; }
.qc-metric{ position:relative; border:1px solid var(--qc-glass-bd); border-radius:18px; padding:16px; cursor:pointer; overflow:hidden;
  background:var(--qc-card-bg); backdrop-filter:blur(12px); transition:transform .2s, border-color .2s, box-shadow .2s; }
.qc-metric::before{ content:''; position:absolute; inset:0; opacity:0; transition:opacity .2s; pointer-events:none; background:radial-gradient(120% 80% at 100% 0%, var(--c), transparent 50%); }
.qc-metric:hover{ transform:translateY(-4px); border-color:var(--c); box-shadow:0 18px 44px rgba(0,0,0,0.5), 0 0 28px -10px var(--c); }
.qc-metric:hover::before{ opacity:.10; }
.qc-metric-top{ display:flex; align-items:center; gap:9px; margin-bottom:12px; }
.qc-metric-ic{ width:36px; height:36px; border-radius:10px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:18px;
  background:color-mix(in srgb, var(--c) 18%, transparent); color:var(--c); border:1px solid color-mix(in srgb, var(--c) 40%, transparent); }
.qc-metric-name{ font-size:10.5px; font-weight:800; letter-spacing:.7px; color:var(--c); line-height:1.2; }
.qc-metric-big{ font-size:30px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1; }
.qc-metric-label{ font-size:11px; color:#7e8aa8; margin-top:3px; }
.qc-metric-rows{ margin-top:13px; display:flex; flex-direction:column; gap:7px; }
.qc-metric-row{ display:flex; align-items:center; justify-content:space-between; font-size:11.5px; color:#9aa6c4; }
.qc-metric-row b{ color:var(--qc-text); font-weight:700; }
.qc-metric-open{ margin-top:14px; padding-top:11px; border-top:1px solid var(--qc-line); font-size:11px; font-weight:700; color:var(--c); display:flex; align-items:center; gap:6px; }

/* ---- activity panel ---- */
.qc-act-panel{ border-radius:18px; padding:15px 16px; }
.qc-panel-h{ display:flex; align-items:center; justify-content:space-between; font-size:13px; font-weight:700; margin-bottom:12px; }
.qc-act{ display:flex; gap:10px; align-items:flex-start; padding:8px 0; border-bottom:1px solid var(--qc-line); }
.qc-act:last-child{ border-bottom:none; }
.qc-act-dot{ width:8px; height:8px; border-radius:50%; flex-shrink:0; margin-top:4px; }

/* ---- bottom: workflow + priorities ---- */
.qc-bottom{ display:grid; grid-template-columns:1.85fr 1fr; gap:16px; margin-top:18px; }
.qc-flow-card{ border-radius:20px; padding:22px; display:flex; flex-direction:column; justify-content:center; }
.qc-flow-title{ text-align:center; font-weight:800; font-size:15px; letter-spacing:1px; margin-bottom:22px; color:var(--qc-text); }
.qc-flow-track{ display:flex; align-items:center; justify-content:center; gap:4px; flex-wrap:wrap; }
.qc-step{ display:flex; flex-direction:column; align-items:center; gap:8px; font-size:10.5px; font-weight:700; letter-spacing:.5px; cursor:pointer; transition:color .15s; color:var(--qc-text2); }
.qc-step:hover{ color:#00D4FF; }
.qc-step-b{ width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:19px;
  background:radial-gradient(circle at 50% 40%, rgba(0,212,255,0.22), rgba(139,92,246,0.12)); color:#00D4FF; border:1px solid rgba(0,212,255,0.35); box-shadow:0 0 18px -4px rgba(0,212,255,0.5); transition:transform .15s; }
.qc-step:hover .qc-step-b{ transform:translateY(-3px); }
.qc-arrowf{ width:26px; height:2px; align-self:flex-start; margin-top:21px; background:linear-gradient(90deg,#00D4FF,#8B5CF6); border-radius:2px; opacity:.6; }

.qc-prio{ display:flex; align-items:center; gap:11px; padding:8px 0; border-bottom:1px solid var(--qc-line); cursor:pointer; transition:padding-left .15s; }
.qc-prio:last-child{ border-bottom:none; }
.qc-prio:hover{ padding-left:4px; }
.qc-prio-ic{ width:30px; height:30px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
.qc-panel{ border-radius:18px; padding:16px; }
.qc-wordmark{ border-radius:18px; padding:18px; border:1px solid var(--qc-glass-bd); background:linear-gradient(160deg, rgba(0,212,255,0.06), rgba(139,92,246,0.04)); }

@keyframes qcspin{ to{ transform:rotate(360deg); } }
@keyframes qcpulse{ 0%,100%{ opacity:1; } 50%{ opacity:.3; } }
@keyframes qcfloat{ 0%,100%{ transform:translateY(0); } 50%{ transform:translateY(-7px); } }
@keyframes qcload{ 0%{ background-position:-50% 0; } 100%{ background-position:150% 0; } }
@keyframes qcdash{ to{ stroke-dashoffset:-16; } }

@media (max-width:1240px){
  .qc-kpis{ grid-template-columns:repeat(3,1fr); }
  .qc-core-band{ grid-template-columns:1fr; }
  .qc-metrics{ grid-template-columns:repeat(3,1fr); }
  .qc-bottom{ grid-template-columns:1fr; }
}
@media (max-width:1024px){
  /* radial hub → stacked on narrow desktops */
  .qc-core-sec{ height:auto; display:flex; flex-direction:column; align-items:center; gap:12px; padding:10px 0; }
  .qc-neural{ display:none; }
  .qc-ring{ display:none; }
  .qc-core{ position:static; margin:4px auto 10px; }
  .qc-node-card{ position:static; width:100%; max-width:440px; }
  .qc-node-card.right{ flex-direction:row; text-align:left; }
  .qc-node-card.right .qc-eng-online{ justify-content:flex-start; }
}
@media (max-width:900px){
  /* iPad portrait & small tablets — clean 2-column, stacked core */
  .qc-kpis{ grid-template-columns:repeat(2,1fr); }
  .qc-metrics{ grid-template-columns:repeat(2,1fr); }
}
@media (max-width:560px){
  .qc-kpis{ grid-template-columns:repeat(2,1fr); }
  .qc-metrics{ grid-template-columns:1fr; }
}
`
