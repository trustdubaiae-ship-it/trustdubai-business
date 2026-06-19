// tritova-business/src/pages/ControlWall.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/* =========================================================================
   Quvera Business — CONTROL WALL
   One full-screen board = Command Center + Revenue Engine (this company only).
   • Scale-to-fit: designed on a fixed 1600x900 canvas, auto-scaled to ANY
     screen (TV / desktop / laptop / tablet / phone) — no scroll ever.
   • Light + dark toggle (persisted) · Back · Fullscreen · Live auto-refresh.
   ========================================================================= */

const REFRESH_MS = 30000
const BASE_W = 1600, BASE_H = 900

/* ------------------------------ helpers -------------------------------- */
const pick = (o, ks) => { for (const k of ks) if (o && o[k]!==undefined && o[k]!==null && o[k]!=='') return o[k]; return null }
const norm = v => String(v||'').trim().toLowerCase()
const normStatus = raw => { const s=norm(raw); if(!s)return'new'; if(/won|success|convert|deal/.test(s)&&!/lost/.test(s))return'won'; if(/lost|reject|dead|drop|junk|spam/.test(s))return'lost'; if(/proposal|quot|estimat|sent/.test(s))return'quoted'; if(/in[_ ]?conversation|contact|reach|call|attempt/.test(s))return'contacted'; if(/qualif|interest/.test(s))return'contacted'; if(/negoti|discuss|follow/.test(s))return'negotiation'; return'new' }
const normSource = raw => { const s=norm(raw); if(!s)return'Other'; if(/meta|facebook|fb|insta|ig/.test(s))return'Meta Ads'; if(/whats|wa\b/.test(s))return'WhatsApp'; if(/trustdubai|trust dubai|td\b/.test(s))return'Quvera'; if(/form|web|site|landing/.test(s))return'Form'; if(/manual|admin|direct|walk/.test(s))return'Manual'; if(/google|ppc/.test(s))return'Google'; return raw?String(raw).charAt(0).toUpperCase()+String(raw).slice(1):'Other' }
const normTemp = raw => { const s=norm(raw); if(/hot|high/.test(s))return'hot'; if(/warm|med/.test(s))return'warm'; if(/cold|low/.test(s))return'cold'; return '' }
const normCat = raw => { const s=norm(raw); if(/resid|home|villa|apart/.test(s))return'Residential'; if(/commerc|office|retail|shop/.test(s))return'Commercial'; if(/indus|ware|factory/.test(s))return'Industrial'; if(/reno|fitout|fit-out|refurb/.test(s))return'Renovation'; return raw?String(raw).charAt(0).toUpperCase()+String(raw).slice(1):'Other' }
const parseBudget = raw => { if(raw==null)return 0; const d=String(raw).replace(/[, ]/g,'').match(/\d+/g); return d?Math.max(...d.map(Number)):0 }
const startOfDay = d => { const x=new Date(d); x.setHours(0,0,0,0); return x }
const daysBetween = (a,b) => Math.floor((a-b)/864e5)
const pctChange = (n,p) => p===0 ? (n>0?100:0) : Math.round(((n-p)/p)*100)
const timeAgo = s => { if(!s)return''; const d=(Date.now()-new Date(s).getTime())/1000; if(d<60)return'just now'; if(d<3600)return`${Math.floor(d/60)}m ago`; if(d<86400)return`${Math.floor(d/3600)}h ago`; if(d<604800)return`${Math.floor(d/86400)}d ago`; return new Date(s).toLocaleDateString() }
const fmtN = n => (n||0).toLocaleString()
const fmtMoney = n => { n = Number(n) || 0; const a = Math.abs(n); if (a >= 1e6) return 'AED ' + (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M'; if (a >= 1e3) return 'AED ' + Math.round(n/1e3) + 'k'; return 'AED ' + Math.round(n) }
// read the lead's real source like Lead Hub does: answers.Source first, then the column
const leadSrcRaw = l => (l && l.answers && l.answers.Source) || pick(l,['source','lead_source'])
const aiScore = l => { let s=0; const t=normTemp(pick(l,['temperature','temp','priority'])); s+=t==='hot'?40:t==='warm'?25:t==='cold'?10:15; const c=pick(l,['created_at','createdAt']); const dys=c?daysBetween(Date.now(),new Date(c).getTime()):999; s+=dys<=3?25:dys<=7?20:dys<=14?15:dys<=30?10:5; const src=normSource(leadSrcRaw(l)); s+=(src==='Meta Ads'||src==='Form'||src==='Quvera')?20:src==='WhatsApp'?15:src==='Manual'?10:12; const b=parseBudget(pick(l,['budget','budget_range','amount'])); s+=b>=1e5?15:b>=5e4?12:b>=2e4?8:b>0?5:6; return Math.min(100,s) }

/* --------------------------- chart atoms ------------------------------- */
function Spark({ data, color, w=120, h=30 }) {
  if (!data || data.length<2) return <svg width={w} height={h}><line x1="0" y1={h/2} x2={w} y2={h/2} stroke={color} strokeWidth="1.5" opacity="0.25" strokeDasharray="3,3"/></svg>
  const max=Math.max(...data), min=Math.min(...data), rng=max-min||1
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-min)/rng)*(h-6)-3}`).join(' ')
  const gid='g'+color.replace('#','')+w
  return <svg width={w} height={h} style={{ overflow:'visible' }}>
    <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gid})`}/>
    <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}

function Donut({ segs, total, label, size=110, C }) {
  const stroke=15, r=(size-stroke)/2, c=2*Math.PI*r
  const sum=segs.reduce((a,d)=>a+d.value,0)||1; let acc=0
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.track} strokeWidth={stroke}/>
    {segs.map((d,i)=>{ const len=(d.value/sum)*c; const el=<circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={d.color} strokeWidth={stroke} strokeDasharray={`${Math.max(len-2,0)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size/2} ${size/2})`}/>; acc+=len; return el })}
    <text x="50%" y="46%" textAnchor="middle" style={{ fontSize:17, fontWeight:800, fill:C.text }}>{fmtN(total)}</text>
    <text x="50%" y="61%" textAnchor="middle" style={{ fontSize:8.5, fill:C.text3 }}>{label}</text>
  </svg>
}

function DualLine({ series, c1, c2, C, h=120 }) {
  if (!series || series.length<2) return <div style={{ height:h, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:C.text3 }}>Not enough data</div>
  const w=1000, pad=6
  const aMax=Math.max(...series.map(s=>s.a),1), bMax=Math.max(...series.map(s=>s.b),1)
  const x=i=>(i/(series.length-1))*w, ya=v=>h-(v/aMax)*(h-pad*2)-pad, yb=v=>h-(v/bMax)*(h-pad*2)-pad
  const la=series.map((s,i)=>`${x(i)},${ya(s.a)}`).join(' '), lb=series.map((s,i)=>`${x(i)},${yb(s.b)}`).join(' ')
  return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display:'block' }}>
    <defs><linearGradient id="dlA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c1} stopOpacity="0.18"/><stop offset="100%" stopColor={c1} stopOpacity="0"/></linearGradient></defs>
    {[0,0.5,1].map((f,i)=><line key={i} x1="0" y1={h*f} x2={w} y2={h*f} stroke={C.track} strokeWidth="1"/>)}
    <polygon points={`0,${h} ${la} ${w},${h}`} fill="url(#dlA)"/>
    <polyline points={la} fill="none" stroke={c1} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
    <polyline points={lb} fill="none" stroke={c2} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
  </svg>
}

function VBars({ rows, C, h=110, suffix='' }) {
  const max=Math.max(1,...rows.map(r=>r.value))
  return <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-around', gap:6, height:h }}>
    {rows.map((r,i)=>(
      <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flex:1, height:'100%', justifyContent:'flex-end' }}>
        <span style={{ fontSize:10.5, fontWeight:700, color:C.text }}>{r.value}{suffix}</span>
        <div style={{ width:'58%', maxWidth:30, flex:1, display:'flex', alignItems:'flex-end' }}>
          <div style={{ width:'100%', height:`${(r.value/max)*100}%`, minHeight:3, background:r.color, borderRadius:'5px 5px 0 0' }}/>
        </div>
        <span style={{ fontSize:9, color:C.text3, fontWeight:600 }}>{r.label}</span>
      </div>
    ))}
    {rows.length===0 && <div style={{ color:C.text3, fontSize:11, margin:'auto' }}>No data</div>}
  </div>
}

function Funnel({ stages, C }) {
  const max=Math.max(1,...stages.map(s=>s.value)), total=stages[0]?.value||1
  return <div style={{ display:'flex', flexDirection:'column', gap:6, justifyContent:'center', height:'100%' }}>
    {stages.map((s,i)=>(
      <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:10, color:C.text3, width:62, flexShrink:0 }}>{s.label}</span>
        <div style={{ flex:1, background:C.track, borderRadius:5, height:16, overflow:'hidden' }}>
          <div style={{ width:`${Math.max((s.value/max)*100,6)}%`, height:'100%', background:s.color, borderRadius:5 }}/>
        </div>
        <span style={{ fontSize:10.5, fontWeight:700, color:C.text, width:58, textAlign:'right', flexShrink:0 }}>{fmtN(s.value)} <em style={{ color:C.text3, fontStyle:'normal', fontWeight:500, fontSize:9 }}>({Math.round(s.value/total*100)}%)</em></span>
      </div>
    ))}
  </div>
}

function Gauge({ value, C }) {
  const r=44, cx=58, cy=58, a0=Math.PI, a1=0, ang=a0+(value/100)*(a1-a0)
  const pt=an=>[cx+r*Math.cos(an), cy+r*Math.sin(an)]
  const [sx,sy]=pt(a0),[ex,ey]=pt(a1),[vx,vy]=pt(ang)
  const color=value>=80?'#22c55e':value>=50?'#f59e0b':'#ef4444'
  return <svg width="116" height="72" viewBox="0 0 116 72">
    <defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0%" stopColor="#ef4444"/><stop offset="50%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#22c55e"/></linearGradient></defs>
    <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke={C.track} strokeWidth="10" strokeLinecap="round"/>
    <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${value>50?1:0} 1 ${vx} ${vy}`} fill="none" stroke="url(#gg)" strokeWidth="10" strokeLinecap="round"/>
    <text x="58" y="50" textAnchor="middle" style={{ fontSize:22, fontWeight:800, fill:color }}>{value}</text>
    <text x="58" y="64" textAnchor="middle" style={{ fontSize:8.5, fill:C.text3 }}>Average Score</text>
  </svg>
}

function Ring({ value, color, size=78, C, sub, display }) {
  const stroke=9, r=(size-stroke)/2, c=2*Math.PI*r, filled=(Math.max(0,Math.min(100,value))/100)*c
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.track} strokeWidth={stroke}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${filled} ${c}`} strokeDashoffset={c*0.25} transform={`rotate(-90 ${size/2} ${size/2})`}/>
    <text x="50%" y="48%" textAnchor="middle" style={{ fontSize:size>=80?17:15, fontWeight:800, fill:C.text }}>{display!=null?display:`${Math.round(value)}%`}</text>
    {sub && <text x="50%" y="64%" textAnchor="middle" style={{ fontSize:8, fill:C.text3 }}>{sub}</text>}
  </svg>
}

function RingStat({ value, color, display, label, C }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flex:1, minWidth:0 }}>
      <Ring value={value} color={color} size={64} C={C} display={display}/>
      <div style={{ fontSize:9.5, color:C.text2, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%', textAlign:'center', lineHeight:1.2 }}>{label}</div>
    </div>
  )
}

/* ============================== MAIN ==================================== */
export default function ControlWall({ onBack, onNavigate, theme: initialTheme, embedded = false }) {
  const { company } = useAuth()
  const wrapRef = useRef(null)

  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('td-wall-theme') || initialTheme || 'dark' } catch { return initialTheme || 'dark' }
  })
  const isDark = theme !== 'light'
  const toggleTheme = () => setTheme(t => { const n = t==='dark'?'light':'dark'; try{localStorage.setItem('td-wall-theme',n)}catch{} return n })

  // Real browser fullscreen toggle — fullscreens just the wall wrapper (sidebar hides)
  const [isFs, setIsFs] = useState(false)
  const toggleFullscreen = () => {
    try {
      const el = wrapRef.current || document.documentElement
      if (!document.fullscreenElement) {
        (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el)
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document)
      }
    } catch (e) { /* ignore */ }
  }
  useEffect(() => {
    const onFsChange = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

  // Scale-to-fit based on the ACTUAL container size (works embedded + fullscreen)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current
      const w = el ? el.clientWidth : window.innerWidth
      const h = el ? el.clientHeight : window.innerHeight
      setScale(Math.min(w/BASE_W, h/BASE_H))
    }
    fit()
    let ro
    if (wrapRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(fit); ro.observe(wrapRef.current)
    }
    window.addEventListener('resize', fit)
    return () => { window.removeEventListener('resize', fit); if (ro) ro.disconnect() }
  }, [])

  const [d, setD] = useState(null)
  const [updated, setUpdated] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!company?.id) return
    setRefreshing(true)
    const safe = async (fn) => { try { return await fn() } catch (e) { console.warn('wall query', e); return null } }
    const now = Date.now()

    const reviews = (await safe(() => supabase.from('reviews').select('*').eq('company_id', company.id).limit(5000).then(r=>r.data))) || []
    const leads   = (await safe(() => supabase.from('lead_submissions').select('*').eq('company_id', company.id).limit(10000).then(r=>r.data))) || []
    const invoices = (await safe(() => supabase.from('invoices').select('total,payments,status,created_at').eq('company_id', company.id).limit(5000).then(r=>r.data))) || []
    const quotes   = (await safe(() => supabase.from('quotations').select('total,status,created_at').eq('company_id', company.id).limit(5000).then(r=>r.data))) || []
    const projects = (await safe(() => supabase.from('ops_projects').select('status,health,contract_value').eq('company_id', company.id).limit(2000).then(r=>r.data))) || []
    const viewLogs = (await safe(() => supabase.from('profile_views_log').select('visited_at').eq('company_id', company.id).limit(20000).then(r=>r.data))) || []

    // ---- revenue / quotes / projects (the business side) ----
    const liveInv = invoices.filter(iv => iv.status !== 'cancelled' && iv.status !== 'hold')
    const sumPay = iv => (Array.isArray(iv.payments) ? iv.payments : []).reduce((a,p)=>a+(Number(p.amount)||0),0)
    const collected = liveInv.reduce((a,iv)=>a+sumPay(iv),0)
    const invoicedTot = liveInv.reduce((a,iv)=>a+(Number(iv.total)||0),0)
    const outstanding = Math.max(0, invoicedTot - collected)
    const profit = Math.round(collected * 0.26)        // indicative margin (same basis as Dashboard)
    const approvedQ = quotes.filter(q => norm(q.status)==='approved').length
    const pendingQ  = quotes.filter(q => /sent|pending/.test(norm(q.status))).length
    const quotePipeline = quotes.filter(q => !/reject/.test(norm(q.status))).reduce((a,q)=>a+(Number(q.total)||0),0)
    const liveProjects = projects.filter(p => !/complete|closed|done|cancel/.test(norm(p.status))).length
    const atRiskProjects = projects.filter(p => /risk|delay|hold|stuck/.test(norm(p.status)) || (p.health!=null && Number(p.health)<60)).length
    const realProfileViews = viewLogs.length || (company.profile_views||0)

    const avgRating = reviews.length ? (reviews.reduce((s,r)=>s+(r.rating||0),0)/reviews.length).toFixed(1) : '0.0'
    const inWin = (rows, from, to) => (rows||[]).filter(r=>{ const t=pick(r,['created_at','createdAt'])?new Date(pick(r,['created_at','createdAt'])).getTime():0; return t>=now-from*864e5 && t<now-to*864e5 }).length
    const dailyN = rows => { const a=[]; for(let i=13;i>=0;i--){ const day=startOfDay(now-i*864e5).getTime(), nx=day+864e5; a.push((rows||[]).filter(r=>{const t=pick(r,['created_at','createdAt'])?new Date(pick(r,['created_at','createdAt'])).getTime():0; return t>=day&&t<nx}).length) } return a }

    // status / leads
    const sc={new:0,contacted:0,quoted:0,negotiation:0,won:0,lost:0}; leads.forEach(l=>sc[normStatus(pick(l,['status','stage']))]++)
    const totalLeads=leads.length, won=sc.won, conversion=totalLeads?Math.round((won/totalLeads)*100):0
    const active=sc.new+sc.contacted+sc.quoted+sc.negotiation
    const hot=leads.filter(l=>normTemp(pick(l,['temperature','temp','priority']))==='hot').length
    const today=startOfDay(now).getTime()
    let followDue=0; leads.forEach(l=>{ const f=pick(l,['follow_up_date','followup_date','next_follow_up']); if(!f)return; const st=normStatus(pick(l,['status'])); if(st==='won'||st==='lost')return; if(startOfDay(new Date(f)).getTime()<=today)followDue++ })

    // sources / categories
    const srcMap={}; leads.forEach(l=>{ const s=normSource(leadSrcRaw(l)); srcMap[s]=(srcMap[s]||0)+1 })
    const SRC_C={'Meta Ads':'#3b82f6','WhatsApp':'#22c55e','Quvera':'#16a34a','Manual':'#f59e0b','Form':'#8b5cf6','Google':'#06b6d4','Other':'#94a3b8'}
    const sources=Object.entries(srcMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label,value])=>({label,value,color:SRC_C[label]||'#94a3b8'}))
    const catMap={}; leads.forEach(l=>{ const c=normCat(pick(l,['project_type','category','service'])); catMap[c]=(catMap[c]||0)+1 })
    const CAT_C={Residential:'#3b82f6',Commercial:'#22c55e',Industrial:'#8b5cf6',Renovation:'#f59e0b',Other:'#94a3b8'}
    const cats=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([label,value])=>({label,value,color:CAT_C[label]||'#94a3b8'}))

    // pipeline + status donut
    const pipeline=[
      { label:'New', value:sc.new, color:'#3b82f6' },
      { label:'Contacted', value:sc.contacted, color:'#06b6d4' },
      { label:'Quoted', value:sc.quoted, color:'#f59e0b' },
      { label:'Won / Lost', value:sc.won+sc.lost, color:'#22c55e' },
    ]
    const statusDonut=[
      { label:'New', value:sc.new, color:'#3b82f6' },
      { label:'Contacted', value:sc.contacted, color:'#06b6d4' },
      { label:'Quoted', value:sc.quoted, color:'#22c55e' },
      { label:'Won', value:sc.won, color:'#16a34a' },
      { label:'Lost', value:sc.lost, color:'#ef4444' },
    ].filter(s=>s.value>0)

    // leads trend 30d
    const trend=[]; for(let i=29;i>=0;i--){ const day=startOfDay(now-i*864e5).getTime(), nx=day+864e5; trend.push({ a:leads.filter(l=>{const t=pick(l,['created_at'])?new Date(pick(l,['created_at'])).getTime():0; return t>=day&&t<nx}).length, b:0 }) }
    // reviews trend 30d (count + avg rating)
    const rTrend=[]; for(let i=29;i>=0;i--){ const day=startOfDay(now-i*864e5).getTime(), nx=day+864e5; const dr=reviews.filter(r=>{const t=r.created_at?new Date(r.created_at).getTime():0; return t>=day&&t<nx}); rTrend.push({ a:dr.length, b:dr.length?dr.reduce((s,r)=>s+(r.rating||0),0)/dr.length:0 }) }

    // reviews growth 6mo
    const months=[]; const nd=new Date()
    for(let i=5;i>=0;i--){ const dt=new Date(nd.getFullYear(),nd.getMonth()-i,1); const key=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; months.push({ label:dt.toLocaleDateString('en-AE',{month:'short'}), value:reviews.filter(r=>(r.created_at||'').slice(0,7)===key).length, color:'#22c55e' }) }

    // rating distribution 5..1
    const dist={5:0,4:0,3:0,2:0,1:0}; reviews.forEach(r=>{ const k=Math.round(r.rating||0); if(dist[k]!==undefined)dist[k]++ })
    const pos=dist[5]+dist[4], neu=dist[3], neg=dist[2]+dist[1]
    const sentiment=[ {label:'Positive',value:pos,color:'#22c55e'}, {label:'Neutral',value:neu,color:'#94a3b8'}, {label:'Negative',value:neg,color:'#ef4444'} ].filter(s=>s.value>0)

    // heatmap 5wk follow-ups
    const heat=[]; for(let wk=4;wk>=0;wk--){ const row=[]; for(let dy=0;dy<7;dy++){ const base=startOfDay(now-(wk*7+(6-dy))*864e5).getTime(), nx=base+864e5; row.push(leads.filter(l=>{const f=pick(l,['follow_up_date','followup_date']); if(!f)return false; const t=startOfDay(new Date(f)).getTime(); return t>=base&&t<nx}).length) } heat.push(row) }
    const heatMax=Math.max(1,...heat.flat())

    // ai score
    const scores=leads.map(aiScore); const avgScore=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0
    const scoreBuckets=[
      { label:'Hot (80-100)', value:scores.filter(s=>s>=80).length, color:'#ef4444' },
      { label:'Warm (50-79)', value:scores.filter(s=>s>=50&&s<80).length, color:'#f59e0b' },
      { label:'Cold (0-49)',  value:scores.filter(s=>s<50).length, color:'#3b82f6' },
    ]

    // conversion by source
    const convBySrc=sources.map(s=>{ const t=leads.filter(l=>normSource(leadSrcRaw(l))===s.label).length; const w=leads.filter(l=>normSource(leadSrcRaw(l))===s.label && normStatus(pick(l,['status']))==='won').length; return { label:s.label.replace(' Ads',''), value:t?Math.round((w/t)*100):0, color:s.color } })

    // recent reviews
    const recentReviews=[...reviews].sort((a,b)=>(+new Date(b.created_at)||0)-(+new Date(a.created_at)||0)).slice(0,4).map(r=>({ name:pick(r,['reviewer_name','customer_name','name'])||'Anonymous', rating:r.rating||0, time:r.created_at }))

    // recent activity (reviews + leads)
    const act=[]
    reviews.slice(-3).forEach(r=>act.push({ icon:'ti-star', color:'#f59e0b', text:`New review by ${pick(r,['reviewer_name','name'])||'a customer'}`, time:r.created_at }))
    leads.slice(-3).forEach(l=>act.push({ icon:'ti-user-plus', color:'#22c55e', text:`New lead from ${normSource(leadSrcRaw(l))}`, time:pick(l,['created_at']) }))
    act.sort((a,b)=>(+new Date(b.time)||0)-(+new Date(a.time)||0))

    // live lead activity
    const liveLeads=[...leads].sort((a,b)=>(+new Date(pick(b,['created_at']))||0)-(+new Date(pick(a,['created_at']))||0)).slice(0,5).map(l=>({ src:normSource(leadSrcRaw(l)), name:pick(l,['name','customer_name','full_name'])||'New lead', time:pick(l,['created_at']) }))

    // company-level (trust / verification / profile)
    const verified = company.is_verified ? 1 : 0
    const fallbackTrust = Math.round(((verified*0.4)+(parseFloat(avgRating)/5*0.4)+Math.min(reviews.length/50,1)*0.2)*100)
    const trust = company.trust_score!=null ? Number(company.trust_score) : fallbackTrust
    const verifPct = company.verification_percent!=null ? Number(company.verification_percent)
                   : company.doc_verification_percent!=null ? Number(company.doc_verification_percent)
                   : (company.is_verified ? 100 : 25)
    const profileFields = ['name','description','phone','logo_url','category','location']
    const profilePct = Math.round(profileFields.filter(f=>!!company[f]).length/profileFields.length*100)
    const tierLabel = ({listed:'Listed',verified:'Verified',trusted:'Trusted',top_rated:'Top Rated','top rated':'Top Rated'})[norm(company.trust_tier)] || (company.is_verified?'Verified':'Listed')

    const trustSteps=[
      { done:!!company.is_verified,            label:'Trade License verified' },
      { done:parseFloat(avgRating)>=4,         label:'Maintain 4+ star rating' },
      { done:reviews.length>=10,               label:'Get 10+ reviews' },
      { done:!!company.logo_url,               label:'Upload company logo' },
      { done:!!company.description,            label:'Complete description' },
    ]

    setD({
      stats:{ trust, totalReviews:reviews.length, avgRating, profileViews:realProfileViews,
              newReviews:inWin(reviews,30,0), totalLeads, conversion, hot, followDue, won,
              collected, outstanding, profit, quotePipeline, approvedQ, pendingQ, liveProjects, atRiskProjects },
      delta:{ reviews:pctChange(inWin(reviews,30,0),inWin(reviews,60,30)), leads:pctChange(inWin(leads,30,0),inWin(leads,60,30)) },
      spark:{ reviews:dailyN(reviews), leads:dailyN(leads) },
      rTrend, trend, sources, cats, pipeline, statusDonut, heat, heatMax, months, dist, sentiment,
      avgScore, scoreBuckets, convBySrc, recentReviews, act:act.slice(0,5), liveLeads,
      verifPct, profilePct, tierLabel, trustSteps,
      followToday: leads.filter(l=>{const f=pick(l,['follow_up_date']); if(!f)return false; return startOfDay(new Date(f)).getTime()===today}).length,
      followOverdue: leads.filter(l=>{const f=pick(l,['follow_up_date']); if(!f)return false; const st=normStatus(pick(l,['status'])); if(st==='won'||st==='lost')return false; return startOfDay(new Date(f)).getTime()<today}).length,
    })
    setUpdated(new Date()); setRefreshing(false)
  }, [company])

  useEffect(() => { load(); const t=setInterval(load, REFRESH_MS); return () => clearInterval(t) }, [load])

  const goBack = () => { if (onBack) onBack(); else if (onNavigate) onNavigate('dashboard'); else if (window.history.length>1) window.history.back() }

  /* ---------- theme tokens ---------- */
  const C = isDark ? {
    page:'#070b16', card:'rgba(255,255,255,0.045)', card2:'rgba(255,255,255,0.07)', border:'rgba(255,255,255,0.10)', track:'rgba(255,255,255,0.09)',
    text:'#eaf2ff', text2:'#9fb0d0', text3:'#6b7a98', topbar:'rgba(255,255,255,0.04)',
    glow:'radial-gradient(1100px 620px at 50% -8%, rgba(0,212,255,0.12), transparent 60%), radial-gradient(900px 620px at 93% 28%, rgba(139,92,246,0.12), transparent 55%), radial-gradient(820px 600px at 5% 88%, rgba(0,255,204,0.07), transparent 55%)',
  } : {
    page:'#eaf0f8', card:'rgba(255,255,255,0.80)', card2:'#f4f8fe', border:'rgba(12,32,64,0.10)', track:'#e9eef6',
    text:'#0b1530', text2:'#46587a', text3:'#7a8aa6', topbar:'rgba(255,255,255,0.75)',
    glow:'radial-gradient(1100px 620px at 50% -8%, rgba(0,160,220,0.12), transparent 60%), radial-gradient(900px 620px at 93% 28%, rgba(139,92,246,0.08), transparent 55%)',
  }
  const G={green:'#22c55e',blue:'#3b82f6',purple:'#8b5cf6',amber:'#f59e0b',cyan:'#06b6d4',red:'#ef4444',pink:'#ec4899'}
  const card={ background:C.card, border:`1px solid ${C.border}`, borderRadius:13, padding:'9px 11px', display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden', backdropFilter:'blur(11px)', WebkitBackdropFilter:'blur(11px)' }
  const Title=({children,right})=>(<div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6, gap:6 }}><span style={{ fontSize:12, fontWeight:700, color:C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{children}</span>{right}</div>)
  const delChip=v=>(<span style={{ fontSize:9.5, fontWeight:700, color:v>=0?G.green:G.red }}>{v>=0?'↑':'↓'} {Math.abs(v)}% <span style={{ color:C.text3, fontWeight:500 }}>30d</span></span>)

  // outer container: embedded → fill page area (relative); standalone/fullscreen → fixed full screen
  const outerStyle = (embedded && !isFs)
    ? { position:'relative', width:'100%', height:'calc(100dvh - 132px)', minHeight:520, background:C.page, borderRadius:14, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }
    : { position:'fixed', inset:0, zIndex:200, background:C.page, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }

  if (!d) return (
    <div ref={wrapRef} style={outerStyle}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:14 }}>
        <div style={{ width:40, height:40, border:`3px solid ${G.green}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize:13, color:C.text3 }}>Loading Control Wall…</div>
      </div>
    </div>
  )

  const stat = (icon,tint,label,value,delta,spark,sub) => (
    <div style={{ ...card, padding:'8px 10px', justifyContent:'center' }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
        <span style={{ width:26, height:26, borderRadius:7, background:tint+'26', color:tint, border:`1px solid ${tint}55`, boxShadow:`0 0 14px -3px ${tint}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><i className={`ti ${icon}`} style={{ fontSize:14 }}/></span>
        <span style={{ fontSize:10, color:C.text2, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{label}</span>
      </div>
      <div style={{ fontSize:19, fontWeight:800, color:C.text, lineHeight:1.05, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{value}</div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:4, marginTop:2 }}>
        {delta!=null ? delChip(delta) : <span style={{ fontSize:9.5, color:C.text3 }}>{sub}</span>}
        {spark && <Spark data={spark} color={tint} w={56} h={20}/>}
      </div>
    </div>
  )

  const heatColor=cnt=>{ if(cnt===0)return C.track; const r=cnt/d.heatMax; if(r>0.66)return G.red; if(r>0.33)return G.amber; return G.green }

  return (
    <div ref={wrapRef} style={outerStyle}>
      <div style={{ width:BASE_W, height:BASE_H, transform:`scale(${scale})`, transformOrigin:'center center', display:'flex', flexDirection:'column', gap:9, padding:16, color:C.text, fontFamily:"'Inter',system-ui,sans-serif", boxSizing:'border-box', background:C.glow }}>

        {/* TOP BAR */}
        <div style={{ flex:'0 0 46px', display:'flex', alignItems:'center', justifyContent:'space-between', background:C.topbar, border:`1px solid ${C.border}`, borderRadius:12, padding:'0 14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {isFs ? (
              <button onClick={toggleFullscreen} title="Exit fullscreen" style={{ display:'flex', alignItems:'center', gap:6, background:C.card2, border:`1px solid ${C.border}`, color:C.text, borderRadius:9, padding:'6px 12px', fontSize:12, fontWeight:600, cursor:'pointer' }}><i className="ti ti-arrow-left" style={{ fontSize:15 }}/> Exit Fullscreen</button>
            ) : (!embedded && (
              <button onClick={goBack} title="Back" style={{ display:'flex', alignItems:'center', gap:6, background:C.card2, border:`1px solid ${C.border}`, color:C.text, borderRadius:9, padding:'6px 12px', fontSize:12, fontWeight:600, cursor:'pointer' }}><i className="ti ti-arrow-left" style={{ fontSize:15 }}/> Back</button>
            ))}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:'linear-gradient(135deg,#00D4FF,#8B5CF6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', boxShadow:'0 0 16px -3px #00D4FF' }}><i className="ti ti-brain" style={{ fontSize:16 }}/></div>
              <div>
                <div style={{ fontSize:14, fontWeight:800, lineHeight:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:240 }}>{company?.name || 'My Business'}</div>
                <div style={{ fontSize:9, color:C.text3 }}>Control Wall · Command + Revenue</div>
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:G.green, background:G.green+'18', borderRadius:8, padding:'4px 9px', fontWeight:600 }}><span style={{ width:7, height:7, borderRadius:'50%', background:G.green }}/>Live</span>
            <span style={{ fontSize:10.5, color:C.text3 }}>Updated {updated?updated.toLocaleTimeString('en-AE',{hour:'2-digit',minute:'2-digit'}):'—'}</span>
            <button onClick={load} title="Refresh" style={{ width:30, height:30, borderRadius:8, background:C.card2, border:`1px solid ${C.border}`, color:C.text2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><i className="ti ti-refresh" style={{ fontSize:15, animation:refreshing?'spin .8s linear infinite':'none' }}/></button>
            <button onClick={toggleFullscreen} title={isFs?'Exit fullscreen':'Enter fullscreen'} style={{ width:30, height:30, borderRadius:8, background:C.card2, border:`1px solid ${C.border}`, color:C.text2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><i className={`ti ${isFs?'ti-minimize':'ti-maximize'}`} style={{ fontSize:15 }}/></button>
            <button onClick={toggleTheme} title="Toggle theme" style={{ width:30, height:30, borderRadius:8, background:C.card2, border:`1px solid ${C.border}`, color:C.text2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><i className={`ti ${isDark?'ti-sun':'ti-moon'}`} style={{ fontSize:15 }}/></button>
          </div>
        </div>

        {/* STATS (5 command + 5 revenue) */}
        <div style={{ flex:'0 0 92px', display:'grid', gridTemplateColumns:'repeat(12,1fr)', gap:7 }}>
          {stat('ti-shield-check',G.green,'Trust Score',fmtN(Math.round(d.stats.trust)),null,null,'/ 100')}
          {stat('ti-star-half-filled','#f59e0b','Avg. Rating',`${d.stats.avgRating}`,null,null,'/ 5')}
          {stat('ti-star',G.amber,'Reviews',fmtN(d.stats.totalReviews),d.delta.reviews,d.spark.reviews)}
          {stat('ti-eye',G.blue,'Profile Views',fmtN(d.stats.profileViews),null,null,'all time')}
          {stat('ti-address-book',G.cyan,'Leads',fmtN(d.stats.totalLeads),d.delta.leads,d.spark.leads)}
          {stat('ti-chart-line',G.blue,'Conversion',`${d.stats.conversion}%`,null,null,'won / total')}
          {stat('ti-flame',G.amber,'Hot Leads',fmtN(d.stats.hot),null,null,'priority')}
          {stat('ti-clock',G.purple,'Follow-ups',fmtN(d.stats.followDue),null,null,'due')}
          {stat('ti-cash',G.green,'Collected',fmtMoney(d.stats.collected),null,null,'revenue')}
          {stat('ti-clock-dollar',G.amber,'Outstanding',fmtMoney(d.stats.outstanding),null,null,'to collect')}
          {stat('ti-file-invoice',G.purple,'Quote Pipeline',fmtMoney(d.stats.quotePipeline),null,null,`${d.stats.approvedQ} approved`)}
          {stat('ti-stack-2',G.cyan,'Active Projects',fmtN(d.stats.liveProjects),null,null,`${d.stats.atRiskProjects} at risk`)}
        </div>

        {/* ROW 2 */}
        <div style={{ flex:'1.45', display:'grid', gridTemplateColumns:'1.7fr 1.2fr 1.25fr 1.2fr 1.25fr 1fr', gap:9, minHeight:0 }}>
          <div style={card}>
            <Title right={<span style={{ display:'flex', gap:9, fontSize:9.5 }}><span style={{ color:C.text2, display:'flex', alignItems:'center', gap:3 }}><span style={{ width:7, height:7, borderRadius:'50%', background:G.green }}/>Reviews</span><span style={{ color:C.text2, display:'flex', alignItems:'center', gap:3 }}><span style={{ width:7, height:7, borderRadius:'50%', background:G.purple }}/>Ratings</span></span>}>Reviews &amp; Ratings Overview</Title>
            <div style={{ flex:1, minHeight:0, display:'flex', alignItems:'center' }}><DualLine series={d.rTrend} c1={G.green} c2={G.purple} C={C} h={120}/></div>
          </div>
          <div style={card}>
            <Title>Review Sentiment</Title>
            {d.sentiment.length===0 ? <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:C.text3, fontSize:11 }}>No reviews yet</div> :
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, minHeight:0 }}>
              <Donut segs={d.sentiment} total={d.stats.totalReviews} label="Reviews" size={92} C={C}/>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
                {d.sentiment.map((s,i)=>(<div key={i} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10 }}><span style={{ width:7, height:7, borderRadius:2, background:s.color, flexShrink:0 }}/><span style={{ flex:1, color:C.text2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.label}</span><span style={{ color:C.text, fontWeight:700 }}>{s.value}</span></div>))}
              </div>
            </div>}
          </div>
          <div style={card}>
            <Title right={<span style={{ fontSize:9.5, color:G.green, cursor:'pointer' }} onClick={()=>onNavigate&&onNavigate('reviews')}>View All</span>}>Recent Reviews</Title>
            <div style={{ flex:1, overflow:'hidden' }}>
              {d.recentReviews.length===0 ? <div style={{ color:C.text3, fontSize:11, textAlign:'center', padding:14 }}>No reviews yet</div> :
              d.recentReviews.map((r,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:7, padding:'4px 0', borderBottom:i<d.recentReviews.length-1?`1px solid ${C.border}`:'none' }}>
                  <div style={{ width:24, height:24, borderRadius:6, background:G.amber+'22', color:G.amber, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{(r.name||'A')[0].toUpperCase()}</div>
                  <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:10.5, fontWeight:600, color:C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.name}</div><div style={{ fontSize:9, color:G.amber }}>{'★'.repeat(r.rating)}</div></div>
                  <span style={{ fontSize:9, color:C.text3, flexShrink:0 }}>{timeAgo(r.time)}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={card}>
            <Title>Pipeline Funnel</Title>
            <div style={{ flex:1, minHeight:0 }}><Funnel stages={d.pipeline} C={C}/></div>
          </div>
          <div style={card}>
            <Title>Leads by Source</Title>
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, minHeight:0 }}>
              <Donut segs={d.sources} total={d.stats.totalLeads} label="Total Leads" size={92} C={C}/>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:3, minWidth:0 }}>
                {d.sources.map((s,i)=>{ const sum=d.sources.reduce((a,x)=>a+x.value,0)||1; return (<div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:9.5 }}><span style={{ width:7, height:7, borderRadius:2, background:s.color, flexShrink:0 }}/><span style={{ flex:1, color:C.text2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.label}</span><span style={{ color:C.text, fontWeight:700 }}>{Math.round(s.value/sum*100)}%</span></div>) })}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:7, minHeight:0 }}>
            <div style={{ ...card, flex:1, background:G.green+'12', borderColor:G.green+'33', justifyContent:'center', padding:'8px 11px' }}>
              <div style={{ fontSize:9.5, color:C.text2, fontWeight:600 }}>Due Today</div>
              <div style={{ fontSize:20, fontWeight:800, color:G.green }}>{d.followToday}</div>
            </div>
            <div style={{ ...card, flex:1, background:G.red+'12', borderColor:G.red+'33', justifyContent:'center', padding:'8px 11px' }}>
              <div style={{ fontSize:9.5, color:C.text2, fontWeight:600 }}>Overdue</div>
              <div style={{ fontSize:20, fontWeight:800, color:G.red }}>{d.followOverdue}</div>
            </div>
            <div style={{ ...card, flex:1, justifyContent:'center', padding:'7px 10px' }}>
              <div style={{ fontSize:9.5, fontWeight:700, color:G.purple, marginBottom:2 }}>✨ AI Insights</div>
              <div style={{ fontSize:9, color:C.text2, lineHeight:1.4 }}>{d.followOverdue>0?`${d.followOverdue} overdue follow-ups need attention.`:(d.stats.hot>0?`${d.stats.hot} hot leads — prioritise today.`:'Follow-ups on track.')}</div>
            </div>
          </div>
        </div>

        {/* ROW 3 */}
        <div style={{ flex:'1.4', display:'grid', gridTemplateColumns:'1.25fr 1.1fr 1.3fr 1.25fr 1.3fr 1.45fr', gap:9, minHeight:0 }}>
          <div style={card}>
            <Title right={<span style={{ fontSize:9, color:C.text3 }}>6 months</span>}>Reviews Growth</Title>
            <div style={{ flex:1, minHeight:0, display:'flex', alignItems:'flex-end' }}><VBars rows={d.months} C={C} h={104}/></div>
          </div>
          <div style={card}>
            <Title>Rating Distribution</Title>
            <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', gap:5 }}>
              {[5,4,3,2,1].map(star=>{ const v=d.dist[star]; const tot=d.stats.totalReviews||1; const col=star>=4?G.green:star===3?G.amber:G.red; return (
                <div key={star} style={{ display:'flex', alignItems:'center', gap:6, fontSize:10 }}>
                  <span style={{ color:C.text2, width:22 }}>{star}★</span>
                  <div style={{ flex:1, background:C.track, borderRadius:4, height:6 }}><div style={{ width:`${Math.round(v/tot*100)}%`, height:'100%', background:col, borderRadius:4 }}/></div>
                  <span style={{ fontWeight:700, color:C.text, width:24, textAlign:'right' }}>{v}</span>
                </div>
              )})}
            </div>
          </div>
          <div style={card}>
            <Title right={<span style={{ fontSize:9, color:G.green, display:'flex', alignItems:'center', gap:3 }}><span style={{ width:6, height:6, borderRadius:'50%', background:G.green }}/>Live</span>}>Recent Activity</Title>
            <div style={{ flex:1, overflow:'hidden' }}>
              {d.act.length===0 ? <div style={{ color:C.text3, fontSize:11, textAlign:'center', padding:14 }}>No activity</div> :
              d.act.map((a,i)=>(<div key={i} style={{ display:'flex', alignItems:'center', gap:7, padding:'3.5px 0' }}><span style={{ width:22, height:22, borderRadius:6, background:a.color+'22', color:a.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><i className={`ti ${a.icon}`} style={{ fontSize:12 }}/></span><span style={{ flex:1, fontSize:10, color:C.text2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.text}</span><span style={{ fontSize:9, color:C.text3, flexShrink:0 }}>{timeAgo(a.time)}</span></div>))}
            </div>
          </div>
          <div style={card}>
            <Title>Build Your Trust Score</Title>
            <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', gap:6 }}>
              {d.trustSteps.map((s,i)=>(<div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:10 }}><i className={`ti ${s.done?'ti-circle-check-filled':'ti-circle'}`} style={{ fontSize:13, color:s.done?G.green:C.text3, flexShrink:0 }}/><span style={{ flex:1, color:s.done?C.text2:C.text, textDecoration:s.done?'line-through':'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.label}</span></div>))}
            </div>
          </div>
          <div style={card}>
            <Title right={<span style={{ fontSize:9, color:C.text3 }}>30 Days</span>}>Leads Trend</Title>
            <div style={{ flex:1, minHeight:0, display:'flex', alignItems:'center' }}><DualLine series={d.trend} c1={G.purple} c2={G.purple} C={C} h={100}/></div>
          </div>
          <div style={card}>
            <Title>Follow-ups Heatmap</Title>
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:3, justifyContent:'center' }}>
              <div style={{ display:'grid', gridTemplateColumns:'34px repeat(7,1fr)', gap:3, fontSize:8, color:C.text3, textAlign:'center' }}><span/>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=><span key={x}>{x}</span>)}</div>
              {d.heat.map((row,wi)=>(<div key={wi} style={{ display:'grid', gridTemplateColumns:'34px repeat(7,1fr)', gap:3, alignItems:'center' }}><span style={{ fontSize:8, color:C.text3 }}>W{wi+1}</span>{row.map((c,di)=><span key={di} style={{ height:10, borderRadius:2, background:heatColor(c) }}/>)}</div>))}
              <div style={{ display:'flex', gap:9, justifyContent:'center', marginTop:3, fontSize:8.5, color:C.text3 }}>{[[G.green,'Good'],[G.amber,'Due'],[G.red,'Overdue']].map(([c,l])=><span key={l} style={{ display:'flex', alignItems:'center', gap:3 }}><i style={{ width:8, height:8, borderRadius:2, background:c }}/>{l}</span>)}</div>
            </div>
          </div>
        </div>

        {/* ROW 4 — Profile & Trust Health (7 rings) + Verification */}
        <div style={{ flex:'1.45', display:'grid', gridTemplateColumns:'1.85fr 1fr', gap:9, minHeight:0 }}>
          <div style={card}>
            <Title right={<span style={{ fontSize:9.5, color:C.text2, fontWeight:600 }}>{d.tierLabel}</span>}>Profile &amp; Trust Health</Title>
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'space-between', gap:4, minHeight:0 }}>
              <RingStat value={d.stats.trust}   color={d.stats.trust>=70?G.green:d.stats.trust>=40?G.amber:G.red} display={Math.round(d.stats.trust)} label="Trust Score" C={C}/>
              <RingStat value={d.profilePct}    color={G.blue}   display={`${d.profilePct}%`} label="Profile" C={C}/>
              <RingStat value={d.verifPct}      color={company?.is_verified?G.green:G.amber} display={`${Math.round(d.verifPct)}%`} label="Verified" C={C}/>
              <RingStat value={(parseFloat(d.stats.avgRating)/5)*100} color={G.amber} display={d.stats.avgRating} label="Avg Rating" C={C}/>
              <RingStat value={Math.min(d.stats.totalReviews/10*100,100)} color={G.purple} display={d.stats.totalReviews} label="Reviews / 10" C={C}/>
              <RingStat value={d.stats.conversion} color={d.stats.conversion>=30?G.green:d.stats.conversion>=10?G.amber:G.red} display={`${d.stats.conversion}%`} label="Conversion" C={C}/>
              <RingStat value={d.avgScore} color={d.avgScore>=80?G.green:d.avgScore>=50?G.amber:G.cyan} display={d.avgScore} label="Lead Quality" C={C}/>
            </div>
          </div>
          <div style={card}>
            <Title right={<span style={{ fontSize:9.5, fontWeight:700, color:company?.is_verified?G.green:G.amber }}>{company?.is_verified?'Verified':'Not Verified'}</span>}>Verification Status</Title>
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:12, minHeight:0 }}>
              <Ring value={d.verifPct} color={company?.is_verified?G.green:G.amber} size={66} C={C} sub="Verified"/>
              <div style={{ flex:1, display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, minWidth:0 }}>
                {[
                  ['Trade License', company?.is_verified?'Verified':'Pending', company?.is_verified?G.green:G.amber],
                  ['Doc Verify', `${Math.round(d.verifPct)}%`, G.blue],
                  ['Plan', (company?.plan||'Free'), G.purple],
                  ['Tier', d.tierLabel, C.text],
                ].map(([lab,val,col],i)=>(
                  <div key={i} style={{ background:C.card2, border:`1px solid ${C.border}`, borderRadius:8, padding:'5px 8px', minWidth:0 }}>
                    <div style={{ fontSize:8.5, color:C.text3, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{lab}</div>
                    <div style={{ fontSize:11.5, fontWeight:800, color:col, textTransform:'capitalize', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ROW 5 — Score / Status / Category / Conversion */}
        <div style={{ flex:'1.35', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:9, minHeight:0 }}>
          <div style={card}>
            <Title>AI Lead Score</Title>
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, minHeight:0 }}>
              <Gauge value={d.avgScore} C={C}/>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>{d.scoreBuckets.map((b,i)=>(<div key={i} style={{ display:'flex', alignItems:'center', gap:5, fontSize:9.5 }}><span style={{ width:7, height:7, borderRadius:'50%', background:b.color, flexShrink:0 }}/><span style={{ flex:1, color:C.text2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{b.label}</span><span style={{ color:C.text, fontWeight:700 }}>{b.value}</span></div>))}</div>
            </div>
          </div>
          <div style={card}>
            <Title>Lead Status</Title>
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, minHeight:0 }}>
              <Donut segs={d.statusDonut} total={d.stats.totalLeads} label="Total" size={92} C={C}/>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:3, minWidth:0 }}>{d.statusDonut.map((s,i)=>(<div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:9.5 }}><span style={{ width:7, height:7, borderRadius:2, background:s.color, flexShrink:0 }}/><span style={{ flex:1, color:C.text2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.label}</span><span style={{ color:C.text, fontWeight:700 }}>{s.value}</span></div>))}</div>
            </div>
          </div>
          <div style={card}>
            <Title>Leads by Category</Title>
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, minHeight:0 }}>
              <Donut segs={d.cats} total={d.stats.totalLeads} label="Total" size={92} C={C}/>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:3, minWidth:0 }}>{d.cats.map((s,i)=>{ const sum=d.cats.reduce((a,x)=>a+x.value,0)||1; return (<div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:9.5 }}><span style={{ width:7, height:7, borderRadius:2, background:s.color, flexShrink:0 }}/><span style={{ flex:1, color:C.text2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.label}</span><span style={{ color:C.text, fontWeight:700 }}>{Math.round(s.value/sum*100)}%</span></div>) })}</div>
            </div>
          </div>
          <div style={card}>
            <Title>Conversion by Source</Title>
            <div style={{ flex:1, minHeight:0, display:'flex', alignItems:'flex-end' }}><VBars rows={d.convBySrc} C={C} h={104} suffix="%"/></div>
          </div>
        </div>

        {/* ROW 6 — alerts + live feed */}
        <div style={{ flex:'1', display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 2fr', gap:9, minHeight:0 }}>
          {[['ti-calendar-plus',G.green,'New Reviews',d.stats.newReviews,'last 30 days','reviews'],['ti-flame',G.amber,'Hot Leads',d.stats.hot,'priority leads','leads'],['ti-clock',G.purple,'Follow-ups Due',d.stats.followDue,'pending','leads'],['ti-trophy',G.blue,'Leads Won',d.stats.won,'closed deals','leads']].map(([ic,col,lab,val,sub,pg],i)=>(
            <div key={i} onClick={()=>onNavigate&&onNavigate(pg)} style={{ ...card, justifyContent:'center', borderColor:col+'33', cursor:'pointer' }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                <span style={{ width:34, height:34, borderRadius:9, background:col+'1e', color:col, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><i className={`ti ${ic}`} style={{ fontSize:17 }}/></span>
                <div><div style={{ fontSize:20, fontWeight:800, color:C.text, lineHeight:1 }}>{fmtN(val)}</div><div style={{ fontSize:9.5, color:C.text2, marginTop:2 }}>{lab}</div></div>
              </div>
              <div style={{ fontSize:9, color:col, fontWeight:600, marginTop:5 }}>{sub} →</div>
            </div>
          ))}
          <div style={card}>
            <Title right={<span style={{ fontSize:9, color:G.green, display:'flex', alignItems:'center', gap:3 }}><span style={{ width:6, height:6, borderRadius:'50%', background:G.green }}/>Live</span>}>Live Lead Feed</Title>
            <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:7, overflow:'hidden' }}>
              {d.liveLeads.length===0 ? <div style={{ color:C.text3, fontSize:11, gridColumn:'1/-1', textAlign:'center', alignSelf:'center' }}>No recent leads</div> :
              d.liveLeads.map((l,i)=>{ const col={'Meta Ads':G.blue,'WhatsApp':G.green,'Quvera':'#16a34a','Form':G.purple,'Manual':G.amber,'Google':G.cyan,'Other':C.text3}[l.src]||C.text3; return (
                <div key={i} style={{ background:C.card2, border:`1px solid ${C.border}`, borderRadius:8, padding:'6px 7px', display:'flex', flexDirection:'column', gap:2, minWidth:0 }}>
                  <span style={{ width:20, height:20, borderRadius:6, background:col+'22', color:col, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><i className="ti ti-bolt" style={{ fontSize:11 }}/></span>
                  <div style={{ fontSize:9, fontWeight:700, color:C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.src}</div>
                  <div style={{ fontSize:8.5, color:C.text2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.name}</div>
                  <div style={{ fontSize:8, color:C.text3 }}>{timeAgo(l.time)}</div>
                </div>
              )})}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
