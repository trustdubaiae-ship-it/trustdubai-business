// trustdubai-business/src/pages/RevenueEngine.jsx
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/* =========================================================================
   TrustDubai Business — REVENUE ENGINE (company-specific sales dashboard)
   - Only THIS company's leads (lead_submissions filtered by company_id)
   - Light + dark via app --css tokens · fully responsive
   - 100% real data · resilient to status/source/temperature/column names
   ========================================================================= */

const STATUS_ORDER = [
  { key:'new',         label:'New',         color:'#3b82f6' },
  { key:'contacted',   label:'Contacted',   color:'#06b6d4' },
  { key:'quoted',      label:'Quoted',      color:'#10b981' },
  { key:'negotiation', label:'Negotiation', color:'#e8b84b' },
  { key:'won',         label:'Won',         color:'#16a34a' },
  { key:'lost',        label:'Lost',        color:'#ef4444' },
]
const SOURCE_COLORS = ['#6366f1','#10b981','#e8b84b','#8b5cf6','#06b6d4','#f97316','#ef4444']
const TYPE_COLORS   = ['#8b5cf6','#3b82f6','#10b981','#e8b84b','#06b6d4','#f97316']

/* ---------- field helpers (resilient) ---------- */
const pick = (o, ks) => { for (const k of ks) if (o && o[k]!==undefined && o[k]!==null && o[k]!=='') return o[k]; return null }
const fStatus = l => pick(l,['status','stage','lead_status','pipeline_status'])
const fSource = l => pick(l,['source','lead_source','channel'])
const fTemp   = l => pick(l,['temperature','temp','priority'])
const fType   = l => pick(l,['project_type','projectType','category','service','service_type','project'])
const fBudget = l => pick(l,['budget','budget_range','estimated_budget','amount'])
const fFollow = l => pick(l,['follow_up_date','followup_date','follow_up','next_follow_up','next_followup'])
const fCreated= l => pick(l,['created_at','createdAt','created','inserted_at'])

const norm = v => String(v||'').trim().toLowerCase()
const normStatus = raw => {
  const s = norm(raw); if(!s) return 'new'
  if (/contact|reach|call|attempt/.test(s)) return 'contacted'
  if (/quot|propos|estimat|sent/.test(s)) return 'quoted'
  if (/negoti|discuss|follow/.test(s)) return 'negotiation'
  if (/won|success|convert|deal|closed.?won/.test(s)) return 'won'
  if (/lost|reject|dead|drop|junk|spam|closed.?lost/.test(s)) return 'lost'
  return 'new'
}
const normSource = raw => {
  const s = norm(raw); if(!s) return 'Other'
  if (/meta|facebook|fb|insta|ig/.test(s)) return 'Meta'
  if (/whats|wa\b/.test(s)) return 'WhatsApp'
  if (/form|web|site|landing|trustdubai/.test(s)) return 'TrustDubai'
  if (/manual|admin|direct|walk/.test(s)) return 'Manual'
  if (/google|ads|ppc/.test(s)) return 'Google'
  return raw ? String(raw).charAt(0).toUpperCase()+String(raw).slice(1) : 'Other'
}
const normTemp = raw => { const s=norm(raw); if(/hot|high/.test(s))return'hot'; if(/warm|med/.test(s))return'warm'; if(/cold|low/.test(s))return'cold'; return '' }
const parseBudget = raw => { if(raw==null)return 0; const d=String(raw).replace(/[, ]/g,'').match(/\d+/g); return d?Math.max(...d.map(Number)):0 }

const startOfDay = d => { const x=new Date(d); x.setHours(0,0,0,0); return x }
const daysBetween = (a,b) => Math.floor((a-b)/86400000)
const timeAgo = s => { if(!s)return''; const d=(Date.now()-new Date(s).getTime())/1000; if(d<60)return'just now'; if(d<3600)return`${Math.floor(d/60)} min ago`; if(d<86400)return`${Math.floor(d/3600)} hr ago`; if(d<604800)return`${Math.floor(d/86400)}d ago`; return new Date(s).toLocaleDateString() }
const pctChange = (n,p) => p===0 ? (n>0?100:0) : Math.round(((n-p)/p)*100)

const aiScore = lead => {
  let s=0
  const t=normTemp(fTemp(lead)); s+= t==='hot'?40 : t==='warm'?25 : t==='cold'?10 : 15
  const c=fCreated(lead); const days=c?daysBetween(Date.now(),new Date(c).getTime()):999
  s+= days<=3?25 : days<=7?20 : days<=14?15 : days<=30?10 : 5
  const src=normSource(fSource(lead)); s+= (src==='Meta'||src==='TrustDubai')?20 : src==='WhatsApp'?15 : src==='Manual'?10 : 12
  const b=parseBudget(fBudget(lead)); s+= b>=100000?15 : b>=50000?12 : b>=20000?8 : b>0?5 : 6
  return Math.min(100,s)
}

/* ---------- atoms ---------- */
function Card({ title, action, children, className }) {
  return (
    <div className={`re-card ${className||''}`}>
      {title && (
        <div className="re-card-head">
          <h3 className="re-card-title">{title}</h3>
          {action && <button className="re-card-action" onClick={action.fn}>{action.label}</button>}
        </div>
      )}
      <div>{children}</div>
    </div>
  )
}

function Donut({ data, centerLabel, centerSub, size=140 }) {
  const stroke=size*0.13, r=(size-stroke)/2, c=2*Math.PI*r
  const sum=data.reduce((a,d)=>a+d.value,0)||1
  let acc=0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg2)" strokeWidth={stroke}/>
      {data.map((d,i)=>{ const len=(d.value/sum)*c; const el=(
        <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={d.color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${Math.max(len-2,0)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size/2} ${size/2})`}/>
      ); acc+=len; return el })}
      <text x="50%" y="46%" textAnchor="middle" style={{ fontSize:20, fontWeight:800, fill:'var(--text)' }}>{centerLabel}</text>
      {centerSub && <text x="50%" y="60%" textAnchor="middle" style={{ fontSize:9, fill:'var(--text3)' }}>{centerSub}</text>}
    </svg>
  )
}

function Legend({ data, suffix='' }) {
  const sum=data.reduce((a,d)=>a+d.value,0)||1
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, flex:1, minWidth:120 }}>
      {data.map((d,i)=>(
        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
          <span style={{ width:9, height:9, borderRadius:3, background:d.color, flexShrink:0 }}/>
          <span style={{ flex:1, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.label}</span>
          <span style={{ fontWeight:700, color:'var(--text)' }}>{d.value}{suffix} <em style={{ color:'var(--text3)', fontStyle:'normal', fontWeight:500, fontSize:11 }}>({Math.round(d.value/sum*100)}%)</em></span>
        </div>
      ))}
      {data.length===0 && <div style={{ color:'var(--text3)', fontSize:12, textAlign:'center', padding:12 }}>No data yet</div>}
    </div>
  )
}

function LineTrend({ points, height=160 }) {
  const W=600, pad=24
  const max=Math.max(1,...points.map(p=>p.v))
  const innerW=W-pad*2, innerH=height-pad
  const x=i=> pad+(points.length<=1?0:(i/(points.length-1))*innerW)
  const y=v=> pad/2+innerH-(v/max)*innerH
  const path=points.map((p,i)=>`${i===0?'M':'L'} ${x(i)} ${y(p.v)}`).join(' ')
  const area=`${path} L ${x(points.length-1)} ${pad/2+innerH} L ${x(0)} ${pad/2+innerH} Z`
  const last=points[points.length-1]
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ display:'block' }}>
      <defs><linearGradient id="reBizArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.35"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0"/></linearGradient></defs>
      {[0,0.5,1].map((g,i)=><line key={i} x1={pad} x2={W-pad} y1={pad/2+innerH-g*innerH} y2={pad/2+innerH-g*innerH} stroke="var(--bg2)" strokeWidth="1" strokeDasharray="3 4"/>)}
      <path d={area} fill="url(#reBizArea)"/>
      <path d={path} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
      {last && <circle cx={x(points.length-1)} cy={y(last.v)} r="4.5" fill="#6366f1" stroke="var(--card)" strokeWidth="2"/>}
    </svg>
  )
}

function Funnel({ stages }) {
  const max=Math.max(1,...stages.map(s=>s.value)), total=stages[0]?.value||1
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {stages.map((s,i)=>{ const pct=Math.round((s.value/max)*100); return (
        <div key={i} style={{ display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ display:'flex', justifyContent:'center' }}>
            <div style={{ height:20, borderRadius:6, minWidth:30, width:`${Math.max(pct,8)}%`, background:s.color, transition:'width .5s' }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
            <span style={{ color:'var(--text2)', fontWeight:600 }}>{s.label}</span>
            <span style={{ fontWeight:700, color:'var(--text)' }}>{s.value} <em style={{ color:'var(--text3)', fontStyle:'normal', fontWeight:500 }}>({Math.round(s.value/total*100)}%)</em></span>
          </div>
        </div>
      )})}
    </div>
  )
}

function Gauge({ value }) {
  const r=70, cx=90, cy=90, a0=Math.PI, a1=0
  const ang=a0+(value/100)*(a1-a0)
  const pt=an=>[cx+r*Math.cos(an), cy+r*Math.sin(an)]
  const [sx,sy]=pt(a0), [ex,ey]=pt(a1), [vx,vy]=pt(ang)
  const color=value>=80?'#10b981':value>=50?'#e8b84b':'#ef4444'
  return (
    <svg width="180" height="110" viewBox="0 0 180 110">
      <defs><linearGradient id="reBizGauge" x1="0" x2="1"><stop offset="0%" stopColor="#ef4444"/><stop offset="50%" stopColor="#e8b84b"/><stop offset="100%" stopColor="#10b981"/></linearGradient></defs>
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke="var(--bg2)" strokeWidth="14" strokeLinecap="round"/>
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${value>50?1:0} 1 ${vx} ${vy}`} fill="none" stroke="url(#reBizGauge)" strokeWidth="14" strokeLinecap="round"/>
      <text x="90" y="78" textAnchor="middle" style={{ fontSize:30, fontWeight:800, fill:color }}>{value}</text>
      <text x="90" y="98" textAnchor="middle" style={{ fontSize:11, fill:'var(--text3)' }}>Avg Lead Score</text>
    </svg>
  )
}

function VBars({ rows }) {
  const max=Math.max(1,...rows.map(r=>r.value))
  return (
    <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-around', gap:8, height:170, paddingTop:10 }}>
      {rows.map((r,i)=>(
        <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flex:1, height:'100%', justifyContent:'flex-end' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{r.value}%</span>
          <div style={{ width:'60%', maxWidth:40, flex:1, display:'flex', alignItems:'flex-end' }}>
            <div style={{ width:'100%', height:`${(r.value/max)*100}%`, minHeight:4, background:r.color, borderRadius:'6px 6px 0 0', transition:'height .5s' }}/>
          </div>
          <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600, textAlign:'center' }}>{r.label}</span>
        </div>
      ))}
      {rows.length===0 && <div style={{ color:'var(--text3)', fontSize:12, margin:'auto' }}>No data yet</div>}
    </div>
  )
}

/* ============================== MAIN ============================== */
export default function RevenueEngine({ onNavigate }) {
  const { company } = useAuth()
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState([])

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('lead_submissions').select('*').eq('company_id', company.id).order('created_at',{ascending:false}).limit(5000)
      setLeads(data||[])
    } catch(e){ console.error('RevenueEngine load error', e) }
    setLoading(false)
  }

  const m = useMemo(() => {
    const now=Date.now(), today=startOfDay(now)
    const d30=now-30*86400000, d60=now-60*86400000
    const total=leads.length
    const inWin=(from,to)=> leads.filter(l=>{ const t=fCreated(l)?new Date(fCreated(l)).getTime():0; return t>=now-from*86400000 && t<now-to*86400000 }).length
    const totalChange=pctChange(inWin(30,0), inWin(60,30))

    const statusCount={}; STATUS_ORDER.forEach(s=>statusCount[s.key]=0)
    leads.forEach(l=>statusCount[normStatus(fStatus(l))]++)
    const won=statusCount.won
    const conversion=total?Math.round((won/total)*100):0

    const hot=leads.filter(l=>normTemp(fTemp(l))==='hot').length

    let dueToday=0, overdue=0, followDue=0
    leads.forEach(l=>{ const f=fFollow(l); if(!f)return; const st=normStatus(fStatus(l)); if(st==='won'||st==='lost')return
      const fd=startOfDay(new Date(f)).getTime(), td=today.getTime()
      if(fd===td){dueToday++;followDue++} else if(fd<td){overdue++;followDue++} })

    const srcMap={}; leads.forEach(l=>{ const s=normSource(fSource(l)); srcMap[s]=(srcMap[s]||0)+1 })
    const sources=Object.entries(srcMap).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,color:SOURCE_COLORS[i%SOURCE_COLORS.length]}))

    const typeMap={}; leads.forEach(l=>{ const t=fType(l); if(t){const k=String(t); typeMap[k]=(typeMap[k]||0)+1} })
    const types=Object.entries(typeMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([label,value],i)=>({label,value,color:TYPE_COLORS[i%TYPE_COLORS.length]}))

    const trend=[]
    for(let i=29;i>=0;i--){ const day=startOfDay(now-i*86400000), next=day.getTime()+86400000
      trend.push({ v: leads.filter(l=>{const t=fCreated(l)?new Date(fCreated(l)).getTime():0; return t>=day.getTime()&&t<next}).length }) }

    const pipeline=STATUS_ORDER.filter(s=>s.key!=='lost').map(s=>({
      label: s.key==='won'?'Won / Lost':s.label,
      value: s.key==='won'?statusCount.won+statusCount.lost:statusCount[s.key],
      color: s.color,
    }))

    const statusDonut=STATUS_ORDER.map(s=>({label:s.label,value:statusCount[s.key],color:s.color})).filter(s=>s.value>0)

    const convBySrc=sources.slice(0,5).map(s=>{
      const t=leads.filter(l=>normSource(fSource(l))===s.label).length
      const w=leads.filter(l=>normSource(fSource(l))===s.label && normStatus(fStatus(l))==='won').length
      return { label:s.label, value:t?Math.round((w/t)*100):0, color:s.color }
    })

    const scores=leads.map(aiScore)
    const avgScore=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0
    const scoreBuckets=[
      { label:'Hot (80-100)', value:scores.filter(s=>s>=80).length, color:'#ef4444' },
      { label:'Warm (50-79)', value:scores.filter(s=>s>=50&&s<80).length, color:'#e8b84b' },
      { label:'Cold (0-49)',  value:scores.filter(s=>s<50).length, color:'#3b82f6' },
    ]

    // heatmap 5 weeks x 7 days (follow-up load)
    const heat=[]
    for(let wk=4;wk>=0;wk--){ const row=[]
      for(let dy=0;dy<7;dy++){ const base=startOfDay(now-(wk*7+(6-dy))*86400000).getTime(), next=base+86400000
        row.push(leads.filter(l=>{const f=fFollow(l); if(!f)return false; const t=startOfDay(new Date(f)).getTime(); return t>=base&&t<next}).length) }
      heat.push(row) }
    const heatMax=Math.max(1,...heat.flat())

    const activity=leads.slice(0,6).map(l=>({ text:`New lead from ${normSource(fSource(l))}`, time:timeAgo(fCreated(l)) }))

    const insights=[]
    if(sources[0]) insights.push(`${sources[0].label} is your top lead source (${Math.round(sources[0].value/(total||1)*100)}%).`)
    if(overdue>0) insights.push(`You have ${overdue} overdue follow-up${overdue>1?'s':''} — clear them to lift conversion.`)
    if(hot>0) insights.push(`${hot} hot lead${hot>1?'s':''} need attention now.`)
    if(insights.length===0) insights.push('No leads yet. Insights will appear once leads start flowing in.')

    return { total, totalChange, conversion, hot, followDue, dueToday, overdue, won, active: total-won-statusCount.lost,
      sources, types, trend, pipeline, statusDonut, convBySrc, avgScore, scoreBuckets, heat, heatMax, activity, insights }
  }, [leads])

  const heatColor = cnt => { if(cnt===0)return'var(--bg2)'; const r=cnt/m.heatMax; if(r>0.66)return'#ef4444'; if(r>0.33)return'#e8b84b'; return'#10b981' }

  const KPIS = [
    { icon:'ti-users',         tint:'#6366f1', label:'Total Leads',     value:m.total,            change:m.totalChange },
    { icon:'ti-refresh',       tint:'#3b82f6', label:'Conversion Rate', value:`${m.conversion}%`, sub:'won / total' },
    { icon:'ti-flame',         tint:'#f97316', label:'Hot Leads',       value:m.hot,              sub:'high priority' },
    { icon:'ti-clock',         tint:'#06b6d4', label:'Follow-ups Due',  value:m.followDue,        sub:'pending' },
    { icon:'ti-trophy',        tint:'#10b981', label:'Leads Won',       value:m.won,              sub:'closed' },
    { icon:'ti-arrows-right',  tint:'#8b5cf6', label:'Active Pipeline', value:Math.max(0,m.active), sub:'in progress' },
  ]

  return (
    <div className="re-root page-content animate-in">
      <style>{RE_CSS}</style>

      <div style={{ marginBottom:16 }}>
        <h1 className="font-syne" style={{ fontSize:'clamp(19px,2.4vw,24px)', fontWeight:800, color:'var(--text)', letterSpacing:'-0.3px', margin:0, display:'flex', alignItems:'center', gap:10 }}>
          Revenue Engine <span className="re-badge">CRM</span>
        </h1>
        <p style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>Your sales pipeline & lead performance on TrustDubai.</p>
      </div>

      {loading && leads.length===0 ? (
        <div style={{ padding:60, textAlign:'center', color:'var(--text3)' }}>Loading your leads…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="re-kpis">
            {KPIS.map((k,i)=>(
              <div key={i} className="re-card re-kpi" onClick={()=>onNavigate&&onNavigate('leads')}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <span style={{ width:34, height:34, borderRadius:9, background:k.tint+'22', color:k.tint, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <i className={`ti ${k.icon}`} style={{ fontSize:17 }}/>
                  </span>
                  <span style={{ fontSize:11.5, color:'var(--text2)', fontWeight:600, lineHeight:1.2 }}>{k.label}</span>
                </div>
                <div style={{ fontSize:'clamp(20px,2.4vw,26px)', fontWeight:800, color:'var(--text)', marginBottom:5 }}>{loading?'—':k.value}</div>
                {k.change!=null
                  ? <div style={{ fontSize:11, fontWeight:700, color:k.change>=0?'#10b981':'#ef4444' }}>{k.change>=0?'↑':'↓'} {Math.abs(k.change)}% <span style={{ color:'var(--text3)', fontWeight:500 }}>vs last 30 days</span></div>
                  : <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600 }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* Row: Funnel | Source | Trend | Follow-ups */}
          <div className="re-g4">
            <Card title="Pipeline Funnel"><Funnel stages={m.pipeline}/></Card>
            <Card title="Leads by Source">
              <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <Donut data={m.sources} centerLabel={m.total} centerSub="Leads" size={130}/>
                <Legend data={m.sources}/>
              </div>
            </Card>
            <Card title="Leads Trend (30 days)"><LineTrend points={m.trend}/></Card>
            <Card title="Follow-ups">
              <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                <button className="re-fbox" onClick={()=>onNavigate&&onNavigate('leads')}>
                  <span style={{ fontSize:24, fontWeight:800, color:'#e8b84b' }}>{m.dueToday}</span>
                  <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600 }}>Due Today</span>
                </button>
                <button className="re-fbox" onClick={()=>onNavigate&&onNavigate('leads')}>
                  <span style={{ fontSize:24, fontWeight:800, color:'#ef4444' }}>{m.overdue}</span>
                  <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600 }}>Overdue</span>
                </button>
              </div>
              <div style={{ border:'0.5px solid var(--border)', borderRadius:12, padding:12, background:'var(--bg2)' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:8 }}>✨ Insights</div>
                {m.insights.map((t,i)=><p key={i} style={{ fontSize:11.5, color:'var(--text2)', margin:'0 0 7px', lineHeight:1.5 }}>{t}</p>)}
              </div>
            </Card>
          </div>

          {/* Row: Project Types | Lead Status | Conversion by Source */}
          <div className="re-g3">
            <Card title="Leads by Project Type">
              <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <Donut data={m.types} centerLabel={m.total} centerSub="Total" size={140}/>
                <Legend data={m.types}/>
              </div>
            </Card>
            <Card title="Lead Status">
              <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                <Donut data={m.statusDonut} centerLabel={m.total} centerSub="Total" size={130}/>
                <Legend data={m.statusDonut}/>
              </div>
            </Card>
            <Card title="Conversion Rate by Source"><VBars rows={m.convBySrc}/></Card>
          </div>

          {/* Row: Lead Score | Heatmap */}
          <div className="re-g2">
            <Card title="Lead Score Distribution">
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
                <Gauge value={m.avgScore}/>
                <div style={{ width:'100%' }}><Legend data={m.scoreBuckets}/></div>
              </div>
            </Card>
            <Card title="Follow-ups Heatmap">
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, fontSize:10, color:'var(--text3)', textAlign:'center', marginBottom:2 }}>
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><span key={d}>{d}</span>)}
                </div>
                {m.heat.map((row,wi)=>(
                  <div key={wi} style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
                    {row.map((c,di)=><span key={di} title={`${c} follow-ups`} style={{ aspectRatio:'1', borderRadius:4, minHeight:14, background:heatColor(c) }}/>)}
                  </div>
                ))}
                <div style={{ display:'flex', gap:14, justifyContent:'center', marginTop:10, fontSize:11, color:'var(--text3)' }}>
                  {[['#10b981','Light'],['#e8b84b','Medium'],['#ef4444','Heavy']].map(([c,l])=>(
                    <span key={l} style={{ display:'flex', alignItems:'center', gap:5 }}><i style={{ width:10, height:10, borderRadius:3, background:c }}/>{l}</span>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Live Activity */}
          <Card title="Recent Lead Activity">
            <div>
              {m.activity.length===0 && <div style={{ color:'var(--text3)', fontSize:12, textAlign:'center', padding:20 }}>No recent activity</div>}
              {m.activity.map((a,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:i<m.activity.length-1?'0.5px solid var(--border)':'none', fontSize:13 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:'#10b981', flexShrink:0 }}/>
                  <span style={{ flex:1, color:'var(--text)' }}>{a.text}</span>
                  <span style={{ color:'var(--text3)', fontSize:11.5 }}>{a.time}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

/* ====================== RESPONSIVE LAYOUT (CSS) ====================== */
const RE_CSS = `
.re-root * { box-sizing:border-box; }
.re-badge { font-size:11px; font-weight:700; letter-spacing:.5px; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; padding:3px 9px; border-radius:6px; }
.re-card { background:var(--card); border:0.5px solid var(--border); border-radius:14px; padding:16px; min-width:0; }
.re-card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; gap:8px; }
.re-card-title { font-size:13.5px; font-weight:700; margin:0; color:var(--text); }
.re-card-action { background:none; border:none; color:#6366f1; font-size:12px; font-weight:600; cursor:pointer; }
.re-kpi { cursor:pointer; transition:transform .15s, border-color .15s; }
.re-kpi:hover { transform:translateY(-2px); border-color:#6366f1; }
.re-fbox { flex:1; border:0.5px solid var(--border); border-radius:12px; padding:14px; display:flex; flex-direction:column; align-items:center; gap:3px; cursor:pointer; background:var(--bg2); transition:transform .15s; }
.re-fbox:hover { transform:translateY(-2px); }

.re-kpis { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-bottom:14px; }
.re-g4   { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:14px; }
.re-g3   { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:14px; }
.re-g2   { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-bottom:14px; }
.re-kpis>*,.re-g4>*,.re-g3>*,.re-g2>* { min-width:0; }

@media (max-width:1280px){
  .re-kpis { grid-template-columns:repeat(3,1fr); }
  .re-g4   { grid-template-columns:repeat(2,1fr); }
  .re-g3   { grid-template-columns:repeat(2,1fr); }
}
@media (max-width:768px){
  .re-kpis { grid-template-columns:repeat(2,1fr); }
  .re-g4, .re-g3, .re-g2 { grid-template-columns:1fr; }
}
@media (max-width:380px){
  .re-kpis { grid-template-columns:1fr; }
}
`
