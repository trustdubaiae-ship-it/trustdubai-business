// tritova-business/src/pages/RevenueEngine.jsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import HeroActions from '../components/HeroActions'

/* =========================================================================
   Quvera Business — REVENUE ENGINE (company-specific sales dashboard)
   Same look & theme as the Admin Revenue Engine (self-contained green theme,
   light + dark via `theme` prop, fully responsive). Data is THIS company only.
   ========================================================================= */

const STATUS_ORDER = [
  { key:'new',         label:'New',         color:'#3b82f6' },
  { key:'contacted',   label:'Contacted',   color:'#06b6d4' },
  { key:'quoted',      label:'Quoted',      color:'#22c55e' },
  { key:'negotiation', label:'Negotiation', color:'#fbbf24' },
  { key:'won',         label:'Won',         color:'#16a34a' },
  { key:'lost',        label:'Lost',        color:'#ef4444' },
]
const SOURCE_COLORS = ['#6366f1', '#22c55e', '#fbbf24', '#8b5cf6', '#06b6d4', '#f97316', '#ef4444']
const TYPE_COLORS   = ['#8b5cf6', '#3b82f6', '#22c55e', '#fbbf24', '#06b6d4', '#f97316']

/* ----------------------------- helpers ---------------------------------- */
const pick = (obj, keys) => { for (const k of keys) if (obj && obj[k]!==undefined && obj[k]!==null && obj[k]!=='') return obj[k]; return null }
const fStatus = (l) => pick(l, ['status', 'stage', 'lead_status', 'pipeline_status'])
const fSource = (l) => pick(l, ['source', 'lead_source', 'channel'])
const fTemp   = (l) => pick(l, ['temperature', 'temp', 'priority'])
const fType   = (l) => pick(l, ['project_type', 'projectType', 'category', 'service', 'service_type', 'project'])
const fBudget = (l) => pick(l, ['budget', 'budget_range', 'estimated_budget', 'amount'])
const fFollow = (l) => pick(l, ['follow_up_date', 'followup_date', 'follow_up', 'next_follow_up', 'next_followup'])
const fCreated= (l) => pick(l, ['created_at', 'createdAt', 'created', 'inserted_at'])

const norm = (v) => String(v || '').trim().toLowerCase()
const normStatus = (raw) => {
  const s = norm(raw); if (!s) return 'new'
  if (/contact|reach|call|attempt/.test(s)) return 'contacted'
  if (/quot|propos|estimat|sent/.test(s)) return 'quoted'
  if (/negoti|discuss|follow/.test(s)) return 'negotiation'
  if (/won|closed.?won|success|convert|deal/.test(s)) return 'won'
  if (/lost|reject|dead|closed.?lost|drop|junk|spam/.test(s)) return 'lost'
  return 'new'
}
const normSource = (raw) => {
  const s = norm(raw); if (!s) return 'Other'
  if (/meta|facebook|fb|insta|ig/.test(s)) return 'Meta'
  if (/whats|wa\b/.test(s)) return 'WhatsApp'
  if (/form|web|site|landing|trustdubai/.test(s)) return 'Quvera'
  if (/manual|admin|direct|walk/.test(s)) return 'Manual'
  if (/google|ads|ppc/.test(s)) return 'Google'
  return raw ? String(raw).charAt(0).toUpperCase() + String(raw).slice(1) : 'Other'
}
const normTemp = (raw) => { const s=norm(raw); if(/hot|high/.test(s))return'hot'; if(/warm|med/.test(s))return'warm'; if(/cold|low/.test(s))return'cold'; return '' }
const parseBudget = (raw) => { if(raw==null)return 0; const d=String(raw).replace(/[, ]/g,'').match(/\d+/g); return d?Math.max(...d.map(Number)):0 }

const daysBetween = (a, b) => Math.floor((a - b) / 86400000)
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const timeAgo = (s) => { if(!s)return''; const d=(Date.now()-new Date(s).getTime())/1000; if(d<60)return'just now'; if(d<3600)return`${Math.floor(d/60)} min ago`; if(d<86400)return`${Math.floor(d/3600)} hr ago`; if(d<604800)return`${Math.floor(d/86400)}d ago`; return new Date(s).toLocaleDateString() }
const pctChange = (n, p) => p===0 ? (n>0?100:0) : Math.round(((n-p)/p)*100)

const aiScore = (lead) => {
  let s = 0
  const t = normTemp(fTemp(lead)); s += t==='hot'?40 : t==='warm'?25 : t==='cold'?10 : 15
  const c = fCreated(lead); const days = c ? daysBetween(Date.now(), new Date(c).getTime()) : 999
  s += days<=3?25 : days<=7?20 : days<=14?15 : days<=30?10 : 5
  const src = normSource(fSource(lead)); s += (src==='Meta'||src==='Quvera')?20 : src==='WhatsApp'?15 : src==='Manual'?10 : 12
  const b = parseBudget(fBudget(lead)); s += b>=100000?15 : b>=50000?12 : b>=20000?8 : b>0?5 : 6
  return Math.min(100, s)
}

const Ic = {
  users:  'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  refresh:'M4 4v5h5M20 20v-5h-5M5.5 9a7 7 0 0112-3.5L20 8M18.5 15a7 7 0 01-12 3.5L4 16',
  fire:   'M12 2c1 3-1 4-1 6 2 0 3-1 3-3 2 2 3 4 3 7a6 6 0 11-12 0c0-2 1-4 3-5 0 2 1 3 2 3-1-3 0-6 2-8z',
  clock:  'M12 8v4l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  trophy: 'M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3',
  arrows: 'M4 12h16M14 6l6 6-6 6',
  funnel: 'M3 4h18l-7 8v6l-4 2v-8L3 4z',
  share:  'M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14',
  trend:  'M3 17l6-6 4 4 7-7M14 8h6v6',
  grid:   'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  pie:    'M12 3a9 9 0 109 9h-9V3z',
  cal:    'M3 9h18M7 3v4M17 3v4M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8z',
  bars:   'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pulse:  'M3 12h4l3 8 4-16 3 8h4',
  maximize:'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  minimize:'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
}

/* --------------------------- mini components ---------------------------- */
function Donut({ data, total, centerLabel, centerSub, size = 150 }) {
  const stroke = size * 0.13, r = (size - stroke) / 2, c = 2 * Math.PI * r
  const sum = data.reduce((a, d) => a + d.value, 0) || 1
  let acc = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="re-donut">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--re-track)" strokeWidth={stroke} />
      {data.map((d, i) => {
        const len = (d.value / sum) * c
        const seg = (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={d.color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${Math.max(len - 2, 0)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size/2} ${size/2})`} />
        )
        acc += len; return seg
      })}
      <text x="50%" y="46%" textAnchor="middle" className="re-donut-num">{centerLabel ?? total}</text>
      {centerSub && <text x="50%" y="60%" textAnchor="middle" className="re-donut-sub">{centerSub}</text>}
    </svg>
  )
}

function Legend({ data, suffix = '' }) {
  const sum = data.reduce((a, d) => a + d.value, 0) || 1
  return (
    <div className="re-legend">
      {data.map((d, i) => (
        <div className="re-legend-row" key={i}>
          <span className="re-dot" style={{ background: d.color }} />
          <span className="re-legend-label">{d.label}</span>
          <span className="re-legend-val">{d.value}{suffix} <em>({Math.round((d.value / sum) * 100)}%)</em></span>
        </div>
      ))}
      {data.length === 0 && <div className="re-empty">No data yet</div>}
    </div>
  )
}

function LineTrend({ points, height = 132 }) {
  const ref = useRef(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width))
    ro.observe(ref.current); return () => ro.disconnect()
  }, [])
  const pad = 28
  const max = Math.max(1, ...points.map(p => p.v))
  const innerW = w - pad * 2, innerH = height - pad
  const x = i => pad + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW)
  const y = v => pad / 2 + innerH - (v / max) * innerH
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.v)}`).join(' ')
  const area = `${path} L ${x(points.length - 1)} ${pad / 2 + innerH} L ${x(0)} ${pad / 2 + innerH} Z`
  const last = points[points.length - 1]
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="re-line">
        <defs><linearGradient id="reBizArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" /><stop offset="100%" stopColor="#22c55e" stopOpacity="0" /></linearGradient></defs>
        {[0, 0.5, 1].map((g, i) => (
          <line key={i} x1={pad} x2={w - pad} y1={pad/2+innerH-g*innerH} y2={pad/2+innerH-g*innerH} stroke="var(--re-track)" strokeWidth="1" strokeDasharray="3 4" />
        ))}
        <path d={area} fill="url(#reBizArea)" />
        <path d={path} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {last && <circle cx={x(points.length - 1)} cy={y(last.v)} r="5" fill="#22c55e" stroke="#fff" strokeWidth="2" />}
      </svg>
    </div>
  )
}

function Funnel({ stages }) {
  const max = Math.max(1, ...stages.map(s => s.value))
  return (
    <div className="re-funnel">
      {stages.map((s, i) => {
        const pct = Math.round((s.value / max) * 100)
        const total = stages[0].value || 1
        return (
          <div className="re-funnel-row" key={i}>
            <div className="re-funnel-bar-wrap"><div className="re-funnel-bar" style={{ width: `${Math.max(pct, 8)}%`, background: s.color }} /></div>
            <div className="re-funnel-meta">
              <span className="re-funnel-label">{s.label}</span>
              <span className="re-funnel-val">{s.value} <em>({Math.round((s.value / total) * 100)}%)</em></span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Gauge({ value }) {
  const r = 70, cx = 90, cy = 90, a0 = Math.PI, a1 = 0
  const ang = a0 + (value / 100) * (a1 - a0)
  const pt = (an) => [cx + r * Math.cos(an), cy + r * Math.sin(an)]
  const [sx, sy] = pt(a0), [ex, ey] = pt(a1), [vx, vy] = pt(ang)
  const color = value >= 80 ? '#22c55e' : value >= 50 ? '#fbbf24' : '#ef4444'
  return (
    <svg width="180" height="110" viewBox="0 0 180 110" className="re-gauge">
      <defs><linearGradient id="reBizGauge" x1="0" x2="1"><stop offset="0%" stopColor="#ef4444" /><stop offset="50%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#22c55e" /></linearGradient></defs>
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke="var(--re-track)" strokeWidth="14" strokeLinecap="round" />
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${value > 50 ? 1 : 0} 1 ${vx} ${vy}`} fill="none" stroke="url(#reBizGauge)" strokeWidth="14" strokeLinecap="round" />
      <text x="90" y="78" textAnchor="middle" className="re-gauge-num" style={{ fill: color }}>{value}</text>
      <text x="90" y="98" textAnchor="middle" className="re-gauge-sub">Avg Lead Score</text>
    </svg>
  )
}

function VBars({ rows }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="re-vbars">
      {rows.map((r, i) => (
        <div className="re-vbar-col" key={i}>
          <span className="re-vbar-num">{r.value}%</span>
          <div className="re-vbar-track"><div className="re-vbar-fill" style={{ height: `${(r.value / max) * 100}%`, background: r.color }} /></div>
          <span className="re-vbar-label">{r.label}</span>
        </div>
      ))}
      {rows.length === 0 && <div className="re-empty">No data yet</div>}
    </div>
  )
}

function Card({ title, icon, accent = '#00D4FF', action, children }) {
  return (
    <div className="re-card" style={{ '--ca': accent }}>
      <div className="re-card-head">
        <div className="re-card-titlewrap">
          {icon && <span className="re-card-ic"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg></span>}
          <h3 className="re-card-title">{title}</h3>
        </div>
        {action && <button className="re-card-action" onClick={action.fn}>{action.label}</button>}
      </div>
      <div className="re-card-body">{children}</div>
    </div>
  )
}

function KPI({ icon, tint, label, value, change, sub }) {
  const up = (change ?? 0) >= 0
  return (
    <div className="re-kpi" style={{ '--c': tint }}>
      <div className="re-kpi-top">
        <span className="re-kpi-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
        </span>
        <span className="re-kpi-label">{label}</span>
      </div>
      <div className="re-kpi-value">{value}</div>
      {change != null
        ? <div className={`re-kpi-change ${up ? 'up' : 'down'}`}>{up ? '↑' : '↓'} {Math.abs(change)}% <span>vs last 30 days</span></div>
        : <div className="re-kpi-change muted">{sub}</div>}
    </div>
  )
}

/* ============================== MAIN ==================================== */
export default function RevenueEngine({ onNavigate, theme = 'dark' }) {
  const { company } = useAuth()
  const isDark = theme !== 'light'
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState([])

  // ---- Fit-to-screen / fullscreen: everything fills ONE screen, no scroll ----
  const wrapRef = useRef(null)
  const [fit, setFit] = useState(false)
  const toggleFit = () => {
    if (!fit) {
      setFit(true)
      try { const el = wrapRef.current; (el?.requestFullscreen || el?.webkitRequestFullscreen || el?.msRequestFullscreen)?.call(el) } catch (e) { /* overlay still applies */ }
    } else {
      setFit(false)
      try { if (document.fullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document) } catch (e) { /* ignore */ }
    }
  }
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) setFit(false) }
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs)
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs) }
  }, [])

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('lead_submissions').select('*').eq('company_id', company.id).order('created_at', { ascending: false }).limit(5000)
      setLeads(data || [])
    } catch (e) { console.error('RevenueEngine load error', e) }
    setLoading(false)
  }

  const m = useMemo(() => {
    const now = Date.now(), today = startOfDay(now)
    const total = leads.length
    const inWin = (from, to) => leads.filter(l => { const t = fCreated(l) ? new Date(fCreated(l)).getTime() : 0; return t >= now - from*86400000 && t < now - to*86400000 }).length
    const totalChange = pctChange(inWin(30, 0), inWin(60, 30))

    const statusCount = {}; STATUS_ORDER.forEach(s => statusCount[s.key] = 0)
    leads.forEach(l => statusCount[normStatus(fStatus(l))]++)
    const won = statusCount.won
    const conversion = total ? Math.round((won / total) * 100) : 0
    const hot = leads.filter(l => normTemp(fTemp(l)) === 'hot').length

    let dueToday = 0, overdue = 0, followDue = 0
    leads.forEach(l => { const f = fFollow(l); if (!f) return; const st = normStatus(fStatus(l)); if (st==='won'||st==='lost') return
      const fd = startOfDay(new Date(f)).getTime(), td = today.getTime()
      if (fd === td) { dueToday++; followDue++ } else if (fd < td) { overdue++; followDue++ } })

    const srcMap = {}; leads.forEach(l => { const s = normSource(fSource(l)); srcMap[s] = (srcMap[s]||0)+1 })
    const sources = Object.entries(srcMap).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,color:SOURCE_COLORS[i%SOURCE_COLORS.length]}))

    const typeMap = {}; leads.forEach(l => { const t = fType(l); if (t) { const k = String(t); typeMap[k] = (typeMap[k]||0)+1 } })
    const types = Object.entries(typeMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([label,value],i)=>({label,value,color:TYPE_COLORS[i%TYPE_COLORS.length]}))

    const trend = []
    for (let i=29;i>=0;i--){ const day=startOfDay(now-i*86400000), next=day.getTime()+86400000
      trend.push({ v: leads.filter(l=>{const t=fCreated(l)?new Date(fCreated(l)).getTime():0; return t>=day.getTime()&&t<next}).length }) }

    const pipeline = STATUS_ORDER.filter(s=>s.key!=='lost').map(s=>({
      label: s.key==='won'?'Won / Lost':s.label,
      value: s.key==='won'?statusCount.won+statusCount.lost:statusCount[s.key],
      color: s.color,
    }))

    const statusDonut = STATUS_ORDER.map(s=>({label:s.label,value:statusCount[s.key],color:s.color})).filter(s=>s.value>0)

    const convBySrc = sources.slice(0,5).map(s=>{
      const t = leads.filter(l=>normSource(fSource(l))===s.label).length
      const w = leads.filter(l=>normSource(fSource(l))===s.label && normStatus(fStatus(l))==='won').length
      return { label:s.label, value:t?Math.round((w/t)*100):0, color:s.color }
    })

    const scores = leads.map(aiScore)
    const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0
    const scoreBuckets = [
      { label:'Hot (80-100)', value:scores.filter(s=>s>=80).length, color:'#ef4444' },
      { label:'Warm (50-79)', value:scores.filter(s=>s>=50&&s<80).length, color:'#fbbf24' },
      { label:'Cold (0-49)',  value:scores.filter(s=>s<50).length, color:'#3b82f6' },
    ]

    const heat = []
    for (let wk=4;wk>=0;wk--){ const row=[]
      for (let dy=0;dy<7;dy++){ const base=startOfDay(now-(wk*7+(6-dy))*86400000).getTime(), next=base+86400000
        row.push(leads.filter(l=>{const f=fFollow(l); if(!f)return false; const t=startOfDay(new Date(f)).getTime(); return t>=base&&t<next}).length) }
      heat.push(row) }
    const heatMax = Math.max(1, ...heat.flat())

    const activity = leads.slice(0,6).map(l=>({ text:`New lead from ${normSource(fSource(l))}`, time:timeAgo(fCreated(l)) }))

    const insights = []
    if (sources[0]) insights.push(`${sources[0].label} is your top lead source (${Math.round(sources[0].value/(total||1)*100)}%).`)
    if (overdue>0) insights.push(`You have ${overdue} overdue follow-up${overdue>1?'s':''} — clearing these can lift conversion.`)
    if (hot>0) insights.push(`${hot} hot lead${hot>1?'s':''} need attention now.`)
    if (insights.length===0) insights.push('No leads yet. Insights will appear once leads start flowing in.')

    return { total, totalChange, conversion, hot, followDue, dueToday, overdue, won, active: Math.max(0, total - won - statusCount.lost),
      sources, types, trend, pipeline, statusDonut, convBySrc, avgScore, scoreBuckets, heat, heatMax, activity, insights }
  }, [leads])

  const heatColor = (cnt) => { if(cnt===0)return'var(--re-track)'; const r=cnt/m.heatMax; if(r>0.66)return'#ef4444'; if(r>0.33)return'#fbbf24'; return'#22c55e' }

  // orbital pipeline nodes around the Revenue Core (2 left, 2 right)
  const stageIcons = [Ic.users, Ic.clock, Ic.arrows, Ic.trophy]
  const coreNodes = m.pipeline.slice(0, 4).map((s, i) => ({
    label: s.label, value: s.value, color: s.color, icon: stageIcons[i] || Ic.arrows,
    side: i < 2 ? 'left' : 'right', y: i % 2 === 0 ? 12 : 60, ly: i % 2 === 0 ? 95 : 330,
  }))

  return (
    <div className={'re-root' + (fit ? ' re-fit' : '')} ref={wrapRef} data-theme={isDark ? 'dark' : 'light'}>
      <style>{CSS}</style>

      <HeroActions>
        <button className="re-refresh" onClick={load} disabled={loading}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d={Ic.refresh} /></svg>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </HeroActions>

      {fit && (
        <button onClick={toggleFit} className="re-fitexit" title="Exit full screen">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={Ic.minimize} /></svg> Exit
        </button>
      )}

      <div className="re-fitwrap">
      {loading && leads.length === 0 ? (
        <div className="re-loading">Loading your leads…</div>
      ) : (
        <>
          <div className="re-sechead">
            <h2>Revenue Intelligence</h2>
            <span className="re-sub">Your sales pipeline, end to end</span>
            <span className="re-hline" />
            <span className="re-live"><span className="re-livedot" />Live</span>
            <button className="re-fitbtn" onClick={toggleFit} title={fit ? 'Exit full screen' : 'Fit everything on one screen'}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={fit ? Ic.minimize : Ic.maximize} /></svg>
              {fit ? 'Exit' : 'Fit screen'}
            </button>
          </div>
          <div className="re-kpis">
            <KPI icon={Ic.users}   tint="#00D4FF" label="Total Leads"     value={m.total}            change={m.totalChange} />
            <KPI icon={Ic.refresh} tint="#00FFCC" label="Conversion Rate" value={`${m.conversion}%`} sub="won / total" />
            <KPI icon={Ic.fire}    tint="#ffb020" label="Hot Leads"       value={m.hot}              sub="high priority" />
            <KPI icon={Ic.clock}   tint="#ec4899" label="Follow-ups Due"  value={m.followDue}        sub="pending" />
            <KPI icon={Ic.trophy}  tint="#22c55e" label="Leads Won"       value={m.won}              sub="closed" />
            <KPI icon={Ic.arrows}  tint="#8B5CF6" label="Active Pipeline" value={m.active}           sub="in progress" />
          </div>

          {/* ===== Revenue Core — cockpit hero (Command Center concept) ===== */}
          <div className="re-cockpit">
            <div className="re-glass re-core-card">
              <div className="re-core-sec">
                <svg className="re-neural" viewBox="0 0 1000 440" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="reLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#00D4FF" /><stop offset="1" stopColor="#8B5CF6" /></linearGradient>
                    <filter id="reGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  </defs>
                  <g filter="url(#reGlow)" stroke="url(#reLine)" strokeWidth="1.6" fill="none" strokeLinecap="round">
                    {coreNodes.map((n, i) => { const ex = n.side === 'left' ? 250 : 750; const mx = (500 + ex) / 2; return <path key={i} className="re-flowline" d={`M ${ex} ${n.ly} C ${mx} ${n.ly}, ${mx} 220, 500 220`} /> })}
                  </g>
                  {coreNodes.map((n, i) => { const ex = n.side === 'left' ? 250 : 750; const mx = (500 + ex) / 2; return (
                    <circle key={'d' + i} r="3" fill={n.color} className="re-flowdot"><animateMotion dur={`${2.6 + i * 0.3}s`} repeatCount="indefinite" path={`M ${ex} ${n.ly} C ${mx} ${n.ly}, ${mx} 220, 500 220`} /></circle>
                  ) })}
                </svg>
                <div className="re-ring r3" /><div className="re-ring r2" /><div className="re-ring r1" />
                <div className="re-core" onClick={() => onNavigate && onNavigate('leads')}><div className="re-core-inner">
                  <div className="re-core-k">Conversion</div>
                  <div className="re-core-v re-grad">{m.conversion}%</div>
                  <div className="re-core-sub">{m.won} won · {m.total} leads</div>
                </div></div>
                {coreNodes.map((n, i) => (
                  <div key={i} className={`re-node ${n.side}`} style={{ '--c': n.color, top: `${n.y}%`, [n.side]: 0 }} onClick={() => onNavigate && onNavigate('leads')}>
                    <div className="re-node-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg></div>
                    <div style={{ minWidth: 0 }}><div className="re-node-name">{n.label}</div><div className="re-node-val">{n.value}</div></div>
                  </div>
                ))}
              </div>
              <div className="re-core-cap">Lead → Contact → Quote → Negotiation → Won</div>
            </div>

            <div className="re-rail">
              <div className="re-glass re-rpanel">
                <div className="re-rpanel-h"><span className="re-rpanel-orb">✨</span> AI Insights</div>
                {m.insights.map((t, i) => <div className="re-insight2" key={i}>{t}</div>)}
              </div>
              <div className="re-glass re-rpanel">
                <div className="re-rpanel-h">Follow-ups</div>
                <div className="re-follow2">
                  <div className="re-fbox" onClick={() => onNavigate && onNavigate('leads')}><span className="n" style={{ color: '#ffb020' }}>{m.dueToday}</span><span className="l">Due Today</span></div>
                  <div className="re-fbox" onClick={() => onNavigate && onNavigate('leads')}><span className="n" style={{ color: '#ec4899' }}>{m.overdue}</span><span className="l">Overdue</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* masonry bento — cards pack by their own height, no ragged gaps */}
          <div className="re-bento">
            <Card title="Pipeline Funnel" icon={Ic.funnel} accent="#8B5CF6"><Funnel stages={m.pipeline} /></Card>
            <Card title="Leads Trend (30 days)" icon={Ic.trend} accent="#22c55e"><LineTrend points={m.trend} /></Card>
            <Card title="Leads by Source" icon={Ic.share} accent="#00D4FF">
              <div className="re-donut-wrap"><Donut data={m.sources} total={m.total} size={120} /><Legend data={m.sources} /></div>
            </Card>
            <Card title="Conversion Rate by Source" icon={Ic.bars} accent="#8B5CF6"><VBars rows={m.convBySrc} /></Card>
            <Card title="Leads by Project Type" icon={Ic.grid} accent="#ffb020">
              <div className="re-donut-wrap"><Donut data={m.types} total={m.total} centerLabel={m.total} centerSub="Total" size={126} /><Legend data={m.types} /></div>
            </Card>
            <Card title="Lead Score Distribution" icon={Ic.target} accent="#00D4FF">
              <div className="re-score"><Gauge value={m.avgScore} /><Legend data={m.scoreBuckets} /></div>
            </Card>
            <Card title="Lead Status" icon={Ic.pie} accent="#ec4899">
              <div className="re-donut-wrap"><Donut data={m.statusDonut} total={m.total} centerLabel={m.total} centerSub="Total" size={120} /><Legend data={m.statusDonut} /></div>
            </Card>
            <Card title="Follow-ups Heatmap" icon={Ic.cal} accent="#00FFCC">
              <div className="re-heat">
                <div className="re-heat-days">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}</div>
                {m.heat.map((row, wi) => (
                  <div className="re-heat-row" key={wi}>{row.map((c, di) => <span key={di} className="re-heat-cell" style={{ background: heatColor(c) }} title={`${c} follow-ups`} />)}</div>
                ))}
                <div className="re-heat-legend">
                  <span><i style={{ background:'#22c55e' }} /> Light</span>
                  <span><i style={{ background:'#fbbf24' }} /> Medium</span>
                  <span><i style={{ background:'#ef4444' }} /> Heavy</span>
                </div>
              </div>
            </Card>
            <Card title="Recent Lead Activity" icon={Ic.pulse} accent="#22c55e">
              <div className="re-activity">
                {m.activity.length === 0 && <div className="re-empty">No recent activity</div>}
                {m.activity.map((a, i) => (
                  <div className="re-activity-row" key={i}>
                    <span className="re-activity-dot" /><span className="re-activity-text">{a.text}</span><span className="re-activity-time">{a.time}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
      </div>
    </div>
  )
}

/* ------------------------------- STYLES -------------------------------- */
const CSS = `
.re-root{
  --re-glow1:#00D4FF; --re-glow2:#8B5CF6; --re-up:#22c55e; --re-down:#ef4444;
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  width:100%; box-sizing:border-box; position:relative;
}
.re-root *{box-sizing:border-box;}
.re-root[data-theme="dark"]{
  --re-card:rgba(255,255,255,0.045); --re-card2:rgba(255,255,255,0.06);
  --re-border:rgba(255,255,255,.10); --re-text:#e8f0ff; --re-muted:#aeb9d6; --re-muted2:#7e8aa8;
  --re-track:rgba(255,255,255,.09); --re-hover:rgba(255,255,255,.06);
  --re-grad:radial-gradient(900px 480px at 50% -8%, rgba(0,212,255,0.10), transparent 60%), radial-gradient(720px 520px at 96% 28%, rgba(139,92,246,0.10), transparent 55%), radial-gradient(640px 520px at 3% 82%, rgba(0,255,204,0.06), transparent 55%);
  color:var(--re-text);
}
.re-root[data-theme="light"]{
  --re-card:rgba(255,255,255,0.82); --re-card2:#f5f9ff;
  --re-border:rgba(12,32,64,.10); --re-text:#0b1530; --re-muted:#46587a; --re-muted2:#6b7a98;
  --re-track:#e9eef6; --re-hover:#f1f5fb;
  --re-grad:radial-gradient(900px 480px at 50% -8%, rgba(0,160,220,0.10), transparent 60%), radial-gradient(720px 520px at 96% 28%, rgba(139,92,246,0.07), transparent 55%);
  color:var(--re-text);
}
.re-root::before{ content:''; position:absolute; inset:0; background:var(--re-grad); z-index:0; pointer-events:none; }
.re-root>*{ position:relative; z-index:1; }
.re-glass{ border:1px solid var(--re-border); background:var(--re-card); backdrop-filter:blur(12px); }

/* cockpit section header */
.re-sechead{ display:flex; align-items:center; gap:12px; margin:0 0 16px; flex-wrap:wrap; }
.re-sechead h2{ font-weight:800; font-size:clamp(16px,2vw,20px); letter-spacing:-.3px; margin:0; }
.re-sechead .re-sub{ font-size:12.5px; color:var(--re-muted); }
.re-hline{ flex:1; min-width:24px; height:1px; background:linear-gradient(90deg,var(--re-border),transparent); }
.re-live{ display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--re-up); font-weight:700; }
.re-livedot{ width:7px; height:7px; border-radius:50%; background:var(--re-up); box-shadow:0 0 8px var(--re-up); animation:repulse 1.8s infinite; }
@keyframes repulse{ 0%,100%{opacity:1} 50%{opacity:.4} }
.re-fitbtn{ display:inline-flex; align-items:center; gap:6px; border:1px solid var(--re-border); background:var(--re-card); color:var(--re-text); padding:6px 11px; border-radius:9px; font-size:12px; font-weight:600; cursor:pointer; backdrop-filter:blur(8px); transition:.15s; }
.re-fitbtn:hover{ border-color:color-mix(in srgb,var(--re-glow1) 50%, var(--re-border)); color:var(--re-glow1); }
.re-fitexit{ position:fixed; top:14px; right:16px; z-index:10000; display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(255,255,255,.18); background:rgba(10,16,30,.72); color:#e8f0ff; padding:8px 13px; border-radius:10px; font-size:12.5px; font-weight:700; cursor:pointer; backdrop-filter:blur(10px); box-shadow:0 6px 20px -6px rgba(0,0,0,.6); }
.re-fitexit:hover{ border-color:rgba(0,212,255,.6); color:#00D4FF; }
.re-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:20px;}
.re-title{font-size:clamp(20px,2.4vw,28px);font-weight:800;margin:0;display:flex;align-items:center;gap:10px;}
.re-badge{font-size:11px;font-weight:700;letter-spacing:.5px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;padding:3px 9px;border-radius:6px;}
.re-subtitle{color:var(--re-muted);margin:6px 0 0;font-size:clamp(12px,1.4vw,14px);}
.re-refresh{display:flex;align-items:center;gap:7px;background:var(--re-card);border:1px solid var(--re-border);color:var(--re-text);padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:.15s;backdrop-filter:blur(8px);}
.re-refresh:hover{border-color:color-mix(in srgb,var(--re-glow1) 50%, var(--re-border));color:var(--re-glow1);}
.re-refresh:disabled{opacity:.6;cursor:default;}
.re-loading{padding:60px;text-align:center;color:var(--re-muted);}

.re-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:18px;}
.re-kpi{background:var(--re-card);border:1px solid var(--re-border);backdrop-filter:blur(12px);border-radius:16px;padding:15px 16px;transition:transform .15s,border-color .15s,box-shadow .15s;}
.re-kpi:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--c) 55%, transparent);box-shadow:0 14px 34px -16px var(--c);}
.re-kpi-top{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.re-kpi-icon{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:color-mix(in srgb,var(--c) 20%, transparent);color:var(--c);border:1px solid color-mix(in srgb,var(--c) 45%, transparent);box-shadow:0 0 18px -3px color-mix(in srgb,var(--c) 60%, transparent);}
.re-kpi-label{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--re-muted2);font-weight:600;line-height:1.3;}
.re-kpi-value{font-size:clamp(22px,2.6vw,29px);font-weight:800;margin-bottom:5px;font-variant-numeric:tabular-nums;line-height:1;color:var(--c);}
.re-kpi-change{font-size:11.5px;font-weight:700;}
.re-kpi-change span{color:var(--re-muted);font-weight:500;}
.re-kpi-change.up{color:var(--re-up);}
.re-kpi-change.down{color:var(--re-down);}
.re-kpi-change.muted{color:var(--re-muted);font-weight:600;}

.re-grid{display:grid;gap:14px;margin-bottom:14px;align-items:start;}
.re-grid-4{grid-template-columns:repeat(4,1fr);}
.re-grid-3{grid-template-columns:repeat(3,1fr);}
.re-grid-2{grid-template-columns:repeat(2,1fr);}
.re-kpis>*,.re-grid>*{min-width:0;}

.re-card{position:relative;background:var(--re-card);border:1px solid var(--re-border);backdrop-filter:blur(12px);border-radius:16px;padding:15px 16px;display:flex;flex-direction:column;overflow:hidden;transition:border-color .18s,box-shadow .18s,transform .18s;}
.re-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--ca),transparent 70%);opacity:.55;}
.re-card:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--ca) 45%, var(--re-border));box-shadow:0 18px 44px -24px rgba(0,0,0,.6),0 0 28px -16px var(--ca);}
.re-card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;gap:8px;}
.re-card-titlewrap{display:flex;align-items:center;gap:9px;min-width:0;}
.re-card-ic{width:28px;height:28px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--ca) 18%, transparent);color:var(--ca);border:1px solid color-mix(in srgb,var(--ca) 40%, transparent);box-shadow:0 0 14px -4px var(--ca);}
.re-card-title{font-size:11.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;margin:0;color:var(--re-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.re-card-action{background:none;border:none;color:var(--ca);font-size:12.5px;font-weight:600;cursor:pointer;}
.re-card-body{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0;}
.re-card-head{margin-bottom:13px;}

/* masonry bento — varied-height cards pack tightly, no ragged empty space */
.re-bento{ columns:3 300px; column-gap:14px; }
.re-bento>.re-card{ break-inside:avoid; -webkit-column-break-inside:avoid; page-break-inside:avoid; width:100%; margin:0 0 14px; }
@media (max-width:1100px){ .re-bento{ columns:2 280px; } }
@media (max-width:680px){ .re-bento{ column-count:1; } }

/* ===== Fit-to-screen: fill the WHOLE screen (full width), no scroll ===== */
.re-fit{ position:fixed; inset:0; z-index:9999; width:100vw; height:100dvh; overflow:hidden; display:flex; flex-direction:column; padding:12px clamp(14px,1.6vw,26px); }
.re-fit[data-theme="dark"]{ background:#070b16; }
.re-fit[data-theme="light"]{ background:#eef3fa; }
.re-fit .re-fitwrap{ flex:1; min-height:0; display:flex; flex-direction:column; gap:10px; width:100%; }
.re-fit .re-sechead{ margin:0; flex:none; }
.re-fit .re-kpis{ margin:0; flex:none; gap:10px; }
.re-fit .re-kpi{ padding:10px 13px; }
.re-fit .re-kpi-top{ margin-bottom:6px; }
.re-fit .re-kpi-value{ font-size:21px; }
.re-fit .re-cockpit{ margin:0; flex:none; }
.re-fit .re-core-card{ min-height:0; padding:12px; }
.re-fit .re-core-sec{ min-height:200px; }
.re-fit .re-bento{ flex:1; min-height:0; columns:auto; display:grid; grid-template-columns:repeat(3,1fr); grid-auto-rows:1fr; gap:10px; overflow:hidden; }
.re-fit .re-bento>.re-card{ margin:0; min-height:0; overflow:hidden; padding:12px 14px; }
.re-fit .re-card-body{ overflow:hidden; }
.re-fit .re-card-head{ margin-bottom:9px; }
/* shrink each chart so it fills its cell without overflowing/overlapping */
.re-fit .re-funnel{ gap:6px; }
.re-fit .re-funnel-bar{ height:15px; }
.re-fit .re-vbars{ height:100%; min-height:0; padding-top:2px; }
.re-fit .re-line{ height:94px; }
.re-fit .re-donut{ width:88px; height:88px; }
.re-fit .re-donut-num{ font-size:15px; }
.re-fit .re-donut-sub{ font-size:9px; }
.re-fit .re-gauge{ width:128px; height:78px; }
.re-fit .re-score{ gap:10px; flex-wrap:nowrap; }
.re-fit .re-donut-wrap{ flex-wrap:nowrap; gap:10px; }
.re-fit .re-legend{ gap:5px; font-size:11px; min-width:0; }
.re-fit .re-heat{ gap:3px; }
.re-fit .re-heat-cell{ aspect-ratio:auto; height:15px; min-height:0; }
.re-fit .re-heat-legend{ margin-top:5px; }
.re-fit .re-activity-row{ padding:5px 0; font-size:12px; }
@media (max-width:900px){ .re-fit{ overflow:auto; } .re-fit .re-bento{ grid-template-columns:repeat(2,1fr); grid-auto-rows:minmax(150px,auto); } }

.re-donut-wrap{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.re-donut-num{font-size:22px;font-weight:800;fill:var(--re-text);}
.re-donut-sub{font-size:11px;fill:var(--re-muted);}
.re-donut{flex-shrink:0;}
.re-legend{display:flex;flex-direction:column;gap:8px;flex:1;min-width:130px;}
.re-legend-row{display:flex;align-items:center;gap:8px;font-size:12.5px;}
.re-dot{width:9px;height:9px;border-radius:3px;flex-shrink:0;}
.re-legend-label{flex:1;color:var(--re-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.re-legend-val{font-weight:700;}
.re-legend-val em{color:var(--re-muted);font-style:normal;font-weight:500;font-size:11px;}
.re-line{display:block;}

.re-funnel{display:flex;flex-direction:column;gap:12px;}
.re-funnel-row{display:flex;flex-direction:column;gap:5px;}
.re-funnel-bar-wrap{display:flex;justify-content:center;}
.re-funnel-bar{height:22px;border-radius:6px;min-width:30px;transition:width .5s;}
.re-funnel-meta{display:flex;justify-content:space-between;font-size:12.5px;}
.re-funnel-label{color:var(--re-muted);font-weight:600;}
.re-funnel-val{font-weight:700;}
.re-funnel-val em{color:var(--re-muted);font-style:normal;font-weight:500;}

.re-follow{display:flex;gap:10px;margin-bottom:14px;}
.re-follow-box{flex:1;border:1px solid var(--re-border);border-radius:12px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;background:var(--re-card2);transition:.15s;}
.re-follow-box:hover{transform:translateY(-2px);}
.re-follow-num{font-size:26px;font-weight:800;}
.re-follow-label{font-size:11.5px;color:var(--re-muted);font-weight:600;}
.re-amber .re-follow-num{color:#fbbf24;}
.re-red .re-follow-num{color:#ef4444;}
.re-insights{border:1px solid var(--re-border);border-radius:12px;padding:12px;background:var(--re-card2);}
.re-insights-head{font-size:12.5px;font-weight:700;margin-bottom:8px;}
.re-insight{font-size:12px;color:var(--re-muted);margin:0 0 7px;line-height:1.5;}
.re-insight:last-child{margin-bottom:0;}

.re-vbars{display:flex;align-items:flex-end;justify-content:space-around;gap:8px;height:148px;padding-top:8px;}
.re-vbar-col{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;height:100%;justify-content:flex-end;}
.re-vbar-num{font-size:12px;font-weight:700;}
.re-vbar-track{width:60%;max-width:40px;flex:1;display:flex;align-items:flex-end;}
.re-vbar-fill{width:100%;border-radius:6px 6px 0 0;min-height:4px;transition:height .5s;}
.re-vbar-label{font-size:11px;color:var(--re-muted);font-weight:600;text-align:center;}

.re-score{display:flex;flex-direction:row;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;}
.re-gauge-num{font-size:30px;font-weight:800;}
.re-gauge-sub{font-size:11px;fill:var(--re-muted);}
.re-score .re-legend{flex:1;min-width:120px;}

.re-heat{display:flex;flex-direction:column;gap:4px;}
.re-heat-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;font-size:10px;color:var(--re-muted);text-align:center;margin-bottom:2px;}
.re-heat-row{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}
.re-heat-cell{aspect-ratio:1;border-radius:4px;min-height:14px;}
.re-heat-legend{display:flex;gap:14px;justify-content:center;margin-top:10px;font-size:11px;color:var(--re-muted);}
.re-heat-legend span{display:flex;align-items:center;gap:5px;}
.re-heat-legend i{width:10px;height:10px;border-radius:3px;}

.re-activity{display:flex;flex-direction:column;}
.re-activity-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--re-border);font-size:13px;}
.re-activity-row:last-child{border-bottom:none;}
.re-activity-dot{width:8px;height:8px;border-radius:50%;background:var(--re-up);flex-shrink:0;}
.re-activity-text{flex:1;}
.re-activity-time{color:var(--re-muted);font-size:11.5px;}
.re-empty{color:var(--re-muted);font-size:13px;text-align:center;padding:20px;}

/* ===== Revenue Core — cockpit hero ===== */
.re-grad{ background:linear-gradient(100deg,#00D4FF,#00FFCC 55%,#8B5CF6); -webkit-background-clip:text; background-clip:text; color:transparent; }
.re-cockpit{ display:grid; grid-template-columns:1.9fr 1fr; gap:16px; margin-bottom:18px; }
.re-rail{ display:flex; flex-direction:column; gap:14px; min-width:0; }
.re-core-card{ border-radius:22px; padding:16px; position:relative; overflow:hidden; display:flex; flex-direction:column; min-height:380px; }
.re-core-sec{ position:relative; width:100%; flex:1; min-height:330px; }
.re-neural{ position:absolute; inset:0; width:100%; height:100%; z-index:0; opacity:.85; }
.re-flowline{ stroke-dasharray:6 10; animation:redash 1s linear infinite; opacity:.7; }
@keyframes redash{ to{ stroke-dashoffset:-16; } }
.re-flowdot{ filter:drop-shadow(0 0 4px currentColor); }
.re-ring{ position:absolute; left:50%; top:50%; border-radius:50%; border:1px solid rgba(0,212,255,.38); z-index:1; box-shadow:0 0 22px -6px rgba(0,212,255,.4); }
.re-ring.r1{ width:178px; height:178px; margin:-89px 0 0 -89px; border-style:dashed; animation:respin 26s linear infinite; }
.re-ring.r2{ width:226px; height:226px; margin:-113px 0 0 -113px; border-color:rgba(139,92,246,.34); box-shadow:0 0 26px -6px rgba(139,92,246,.4); animation:respin 40s linear infinite reverse; }
.re-ring.r3{ width:282px; height:282px; margin:-141px 0 0 -141px; border-color:rgba(0,255,204,.22); box-shadow:0 0 30px -8px rgba(0,255,204,.3); }
@keyframes respin{ to{ transform:rotate(360deg); } }
.re-core{ position:absolute; left:50%; top:50%; width:170px; height:170px; margin:-85px 0 0 -85px; border-radius:50%; display:flex; align-items:center; justify-content:center; z-index:2; cursor:pointer;
  background:radial-gradient(circle at 50% 40%, rgba(0,212,255,.48), rgba(139,92,246,.26) 60%, transparent 72%);
  box-shadow:0 0 90px rgba(0,212,255,.5), 0 0 180px rgba(139,92,246,.4); }
.re-core-inner{ width:126px; height:126px; border-radius:50%; background:radial-gradient(circle at 50% 38%,#0bd,#1b2b6b); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; box-shadow:0 0 40px rgba(0,212,255,.6) inset; animation:refloat 6s ease-in-out infinite; color:#eaf6ff; }
@keyframes refloat{ 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
.re-core-k{ font-size:9px; letter-spacing:2.5px; text-transform:uppercase; color:#bfe9ff; }
.re-core-v{ font-size:30px; font-weight:800; margin-top:3px; font-variant-numeric:tabular-nums; }
.re-core-sub{ font-size:9.5px; color:#bfe9ff; margin-top:3px; }
.re-node{ position:absolute; width:clamp(150px,14vw,200px); display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:14px; cursor:pointer; z-index:3;
  border:1px solid color-mix(in srgb, var(--c) 38%, var(--re-border)); background:var(--re-card2); backdrop-filter:blur(6px);
  box-shadow:0 0 24px -14px var(--c); transition:transform .15s, border-color .15s, box-shadow .15s; }
.re-node.right{ flex-direction:row-reverse; text-align:right; }
.re-node:hover{ transform:translateY(-2px); border-color:var(--c); box-shadow:0 12px 30px -12px var(--c); }
.re-node-ic{ width:38px; height:38px; border-radius:11px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
  background:color-mix(in srgb, var(--c) 18%, transparent); color:var(--c); border:1px solid color-mix(in srgb, var(--c) 40%, transparent); }
.re-node-name{ font-weight:700; font-size:12.5px; }
.re-node-val{ font-size:18px; font-weight:800; color:var(--c); font-variant-numeric:tabular-nums; }
.re-core-cap{ text-align:center; color:var(--re-muted2); font-size:10px; letter-spacing:2px; text-transform:uppercase; margin-top:10px; }
.re-rpanel{ border-radius:18px; padding:16px; display:flex; flex-direction:column; }
.re-rpanel-h{ display:flex; align-items:center; gap:9px; margin-bottom:12px; font-weight:800; font-size:13px; }
.re-rpanel-orb{ width:30px; height:30px; border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:15px;
  background:radial-gradient(circle at 50% 38%, rgba(0,212,255,.5), rgba(139,92,246,.25) 65%, transparent); box-shadow:0 0 16px -2px rgba(0,212,255,.5); }
.re-insight2{ font-size:12px; color:var(--re-muted); line-height:1.5; padding:9px 11px; border:1px solid var(--re-border); border-radius:11px; background:var(--re-card2); margin-bottom:8px; }
.re-insight2:last-child{ margin-bottom:0; }
.re-follow2{ display:flex; gap:10px; }
.re-fbox{ flex:1; border:1px solid var(--re-border); border-radius:12px; padding:13px; text-align:center; cursor:pointer; background:var(--re-card2); transition:.15s; }
.re-fbox:hover{ transform:translateY(-2px); }
.re-fbox .n{ font-size:24px; font-weight:800; display:block; line-height:1; }
.re-fbox .l{ font-size:11px; color:var(--re-muted2); font-weight:600; }

@media (max-width:1100px){
  .re-cockpit{ grid-template-columns:1fr; }
}
@media (max-width:760px){
  .re-core-sec{ display:flex; flex-direction:column; align-items:center; gap:12px; min-height:0; }
  .re-neural,.re-ring{ display:none; }
  .re-core{ position:relative; left:auto; top:auto; margin:6px auto 4px; }
  .re-node{ position:relative !important; left:auto !important; right:auto !important; top:auto !important; width:100%; max-width:360px; }
  .re-node.right{ flex-direction:row; text-align:left; }
}

@media (max-width:1280px){
  .re-kpis{grid-template-columns:repeat(3,1fr);}
  .re-grid-4{grid-template-columns:repeat(2,1fr);}
  .re-grid-3{grid-template-columns:repeat(2,1fr);}
}
@media (max-width:768px){
  .re-kpis{grid-template-columns:repeat(2,1fr);}
  .re-grid-4,.re-grid-3,.re-grid-2{grid-template-columns:1fr;}
}
@media (max-width:380px){
  .re-kpis{grid-template-columns:1fr;}
}
`
