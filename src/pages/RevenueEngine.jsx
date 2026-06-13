// tritova-business/src/pages/RevenueEngine.jsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/* =========================================================================
   Tritova Business — REVENUE ENGINE (company-specific sales dashboard)
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
  if (/form|web|site|landing|trustdubai/.test(s)) return 'TrustDubai'
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
  const src = normSource(fSource(lead)); s += (src==='Meta'||src==='TrustDubai')?20 : src==='WhatsApp'?15 : src==='Manual'?10 : 12
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

function LineTrend({ points, height = 160 }) {
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
      <svg width={w} height={height} className="re-line">
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

function Card({ title, action, children }) {
  return (
    <div className="re-card">
      <div className="re-card-head">
        <h3 className="re-card-title">{title}</h3>
        {action && <button className="re-card-action" onClick={action.fn}>{action.label}</button>}
      </div>
      <div className="re-card-body">{children}</div>
    </div>
  )
}

function KPI({ icon, tint, label, value, change, sub }) {
  const up = (change ?? 0) >= 0
  return (
    <div className="re-kpi">
      <div className="re-kpi-top">
        <span className="re-kpi-icon" style={{ background: `${tint}22`, color: tint }}>
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

  return (
    <div className="re-root" data-theme={isDark ? 'dark' : 'light'}>
      <style>{CSS}</style>

      <div className="re-header">
        <div>
          <h1 className="re-title">Revenue Engine <span className="re-badge">CRM</span></h1>
          <p className="re-subtitle">Your sales pipeline & lead performance on Tritova.</p>
        </div>
        <button className="re-refresh" onClick={load} disabled={loading}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d={Ic.refresh} /></svg>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {loading && leads.length === 0 ? (
        <div className="re-loading">Loading your leads…</div>
      ) : (
        <>
          <div className="re-kpis">
            <KPI icon={Ic.users}   tint="#6366f1" label="Total Leads"     value={m.total}            change={m.totalChange} />
            <KPI icon={Ic.refresh} tint="#3b82f6" label="Conversion Rate" value={`${m.conversion}%`} sub="won / total" />
            <KPI icon={Ic.fire}    tint="#f97316" label="Hot Leads"       value={m.hot}              sub="high priority" />
            <KPI icon={Ic.clock}   tint="#06b6d4" label="Follow-ups Due"  value={m.followDue}        sub="pending" />
            <KPI icon={Ic.trophy}  tint="#22c55e" label="Leads Won"       value={m.won}              sub="closed" />
            <KPI icon={Ic.arrows}  tint="#8b5cf6" label="Active Pipeline" value={m.active}           sub="in progress" />
          </div>

          <div className="re-grid re-grid-4">
            <Card title="Pipeline Funnel"><Funnel stages={m.pipeline} /></Card>
            <Card title="Leads by Source">
              <div className="re-donut-wrap"><Donut data={m.sources} total={m.total} size={140} /><Legend data={m.sources} /></div>
            </Card>
            <Card title="Leads Trend (30 days)"><LineTrend points={m.trend} /></Card>
            <Card title="Follow-ups">
              <div className="re-follow">
                <button className="re-follow-box re-amber" onClick={() => onNavigate && onNavigate('leads')}>
                  <span className="re-follow-num">{m.dueToday}</span><span className="re-follow-label">Due Today</span>
                </button>
                <button className="re-follow-box re-red" onClick={() => onNavigate && onNavigate('leads')}>
                  <span className="re-follow-num">{m.overdue}</span><span className="re-follow-label">Overdue</span>
                </button>
              </div>
              <div className="re-insights">
                <div className="re-insights-head">✨ Insights</div>
                {m.insights.map((t, i) => <p className="re-insight" key={i}>{t}</p>)}
              </div>
            </Card>
          </div>

          <div className="re-grid re-grid-3">
            <Card title="Leads by Project Type">
              <div className="re-donut-wrap"><Donut data={m.types} total={m.total} centerLabel={m.total} centerSub="Total" size={150} /><Legend data={m.types} /></div>
            </Card>
            <Card title="Lead Status">
              <div className="re-donut-wrap"><Donut data={m.statusDonut} total={m.total} centerLabel={m.total} centerSub="Total" size={140} /><Legend data={m.statusDonut} /></div>
            </Card>
            <Card title="Follow-ups Heatmap">
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
          </div>

          <div className="re-grid re-grid-2">
            <Card title="Lead Score Distribution">
              <div className="re-score"><Gauge value={m.avgScore} /><Legend data={m.scoreBuckets} /></div>
            </Card>
            <Card title="Conversion Rate by Source"><VBars rows={m.convBySrc} /></Card>
          </div>

          <Card title="Recent Lead Activity">
            <div className="re-activity">
              {m.activity.length === 0 && <div className="re-empty">No recent activity</div>}
              {m.activity.map((a, i) => (
                <div className="re-activity-row" key={i}>
                  <span className="re-activity-dot" /><span className="re-activity-text">{a.text}</span><span className="re-activity-time">{a.time}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

/* ------------------------------- STYLES -------------------------------- */
const CSS = `
.re-root{
  --re-blue:#6366f1; --re-up:#22c55e; --re-down:#ef4444;
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  width:100%; box-sizing:border-box;
}
.re-root *{box-sizing:border-box;}
.re-root[data-theme="dark"]{
  --re-card:#161b22; --re-card2:#1c232c;
  --re-border:rgba(255,255,255,.08); --re-text:#e6edf3; --re-muted:#8b949e;
  --re-track:rgba(255,255,255,.08); --re-hover:rgba(255,255,255,.04);
  color:var(--re-text);
}
.re-root[data-theme="light"]{
  --re-card:#ffffff; --re-card2:#f8fafc;
  --re-border:#e5e7eb; --re-text:#111827; --re-muted:#6b7280;
  --re-track:#eef2f6; --re-hover:#f3f4f6;
  color:var(--re-text);
}
.re-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:20px;}
.re-title{font-size:clamp(20px,2.4vw,28px);font-weight:800;margin:0;display:flex;align-items:center;gap:10px;}
.re-badge{font-size:11px;font-weight:700;letter-spacing:.5px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;padding:3px 9px;border-radius:6px;}
.re-subtitle{color:var(--re-muted);margin:6px 0 0;font-size:clamp(12px,1.4vw,14px);}
.re-refresh{display:flex;align-items:center;gap:7px;background:var(--re-card);border:1px solid var(--re-border);color:var(--re-text);padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:.15s;}
.re-refresh:hover{background:var(--re-hover);}
.re-refresh:disabled{opacity:.6;cursor:default;}
.re-loading{padding:60px;text-align:center;color:var(--re-muted);}

.re-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:18px;}
.re-kpi{background:var(--re-card);border:1px solid var(--re-border);border-radius:16px;padding:16px;transition:.15s;}
.re-kpi:hover{transform:translateY(-2px);border-color:var(--re-up);}
.re-kpi-top{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.re-kpi-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.re-kpi-label{font-size:12.5px;color:var(--re-muted);font-weight:600;line-height:1.25;}
.re-kpi-value{font-size:clamp(22px,2.6vw,30px);font-weight:800;margin-bottom:6px;}
.re-kpi-change{font-size:12px;font-weight:700;}
.re-kpi-change span{color:var(--re-muted);font-weight:500;}
.re-kpi-change.up{color:var(--re-up);}
.re-kpi-change.down{color:var(--re-down);}
.re-kpi-change.muted{color:var(--re-muted);font-weight:600;}

.re-grid{display:grid;gap:14px;margin-bottom:18px;}
.re-grid-4{grid-template-columns:repeat(4,1fr);}
.re-grid-3{grid-template-columns:repeat(3,1fr);}
.re-grid-2{grid-template-columns:repeat(2,1fr);}
.re-kpis>*,.re-grid>*{min-width:0;}

.re-card{background:var(--re-card);border:1px solid var(--re-border);border-radius:16px;padding:18px;display:flex;flex-direction:column;}
.re-card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:8px;}
.re-card-title{font-size:14.5px;font-weight:700;margin:0;}
.re-card-action{background:none;border:none;color:var(--re-up);font-size:12.5px;font-weight:600;cursor:pointer;}
.re-card-body{flex:1;}

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

.re-vbars{display:flex;align-items:flex-end;justify-content:space-around;gap:8px;height:170px;padding-top:10px;}
.re-vbar-col{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;height:100%;justify-content:flex-end;}
.re-vbar-num{font-size:12px;font-weight:700;}
.re-vbar-track{width:60%;max-width:40px;flex:1;display:flex;align-items:flex-end;}
.re-vbar-fill{width:100%;border-radius:6px 6px 0 0;min-height:4px;transition:height .5s;}
.re-vbar-label{font-size:11px;color:var(--re-muted);font-weight:600;text-align:center;}

.re-score{display:flex;flex-direction:column;align-items:center;gap:14px;}
.re-gauge-num{font-size:30px;font-weight:800;}
.re-gauge-sub{font-size:11px;fill:var(--re-muted);}
.re-score .re-legend{width:100%;}

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
