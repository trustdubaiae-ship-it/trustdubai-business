import { useState, useEffect, useRef, useMemo } from 'react'

/*
  LeadVisualViews — Flow / Galaxy / Embedding visualizations for the Lead Hub.
  Fully theme-aware (light + dark, uses CSS vars), mobile responsive.
  Props:
    mode       : 'flow' | 'galaxy' | 'embedding'
    leads      : array of unified lead objects (the page's `filtered` array)
    onOpenLead : (lead) => void   // opens the existing rich lead modal
    mobile     : boolean
  Notes:
    - "intent" / "engagement" scores are a transparent heuristic (temperature +
      stage + recency + rank). Swap with a real model/`match_score` later.
    - Dots/stages are clickable; stage chips open a lead list popup.
*/

const TEMP_COL = { hot: '#ef4444', warm: '#f59e0b', cold: '#06b6d4' }
const STAGE = {
  new:       { label: 'New',       color: '#06b6d4' },
  contacted: { label: 'Contacted', color: '#6366f1' },
  quoted:    { label: 'Quoted',    color: '#f59e0b' },
  won:       { label: 'Won',       color: '#10b981' },
  lost:      { label: 'Lost',      color: '#ef4444' },
}
const STAGE_KEYS = ['new', 'contacted', 'quoted', 'won', 'lost']

function toStage(status) {
  switch (status) {
    case 'new': case 'qualified': return 'new'
    case 'in_conversation': return 'contacted'
    case 'proposal_given': return 'quoted'
    case 'won': return 'won'
    case 'lost': return 'lost'
    default: return 'new'
  }
}
function leadName(l) { return l.name || 'Anonymous' }
function leadColor(l) { return TEMP_COL[l.temperature] || TEMP_COL.warm }
function leadProject(l) { return l.answers?.['Project Type'] || l.answers?.category || '' }
function leadLoc(l) { return l.answers?.['Location'] || l.answers?.area || '' }
function recencyH(l) {
  const t = l.assigned_at || l.created_at
  if (!t) return 0.5
  const h = (Date.now() - new Date(t).getTime()) / 3600000
  return h < 6 ? 1 : h < 24 ? 0.7 : h < 72 ? 0.4 : 0.2
}
const STAGE_RANK = { new: 0.3, contacted: 0.55, quoted: 0.8, won: 1, lost: 0.12 }
function tempH(t) { return t === 'hot' ? 1 : t === 'warm' ? 0.6 : 0.3 }
function intentScore(l) {
  const s = toStage(l.status)
  const v = 0.45 * tempH(l.temperature) + 0.35 * (STAGE_RANK[s] ?? 0.4) + 0.20 * recencyH(l)
  return Math.round(Math.max(8, Math.min(98, v * 100)))
}
function engagementScore(l) {
  const s = toStage(l.status)
  const rankH = l.isPlatform && l.rank ? (1 - Math.min(1, (l.rank - 1) / 4)) : 0.55
  const v = 0.5 * (STAGE_RANK[s] ?? 0.4) + 0.3 * recencyH(l) + 0.2 * rankH
  return Math.round(Math.max(6, Math.min(96, v * 100)))
}
function isOverdue(l) {
  if (!l.isPlatform || toStage(l.status) !== 'new') return false
  const t = l.assigned_at || l.created_at
  return t ? (Date.now() - new Date(t).getTime()) / 3600000 > 12 : false
}
function initial(name) { return (name || 'A').replace(/^(Mr|Mrs|Ms)\.?\s*/, '')[0].toUpperCase() }

export default function LeadVisualViews({ mode = 'flow', leads = [], onOpenLead, mobile = false }) {
  const rootRef = useRef(null)
  const [isDark, setIsDark] = useState(true)

  // detect theme from the panel's computed --text colour (works regardless of how theme is toggled)
  useEffect(() => {
    function detect() {
      try {
        const el = rootRef.current || document.body
        const c = getComputedStyle(el).getPropertyValue('--text').trim() ||
                  getComputedStyle(el).color
        const m = c.match(/\d+/g)
        if (m && m.length >= 3) {
          const lum = (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) / 255
          setIsDark(lum > 0.6) // text is light => dark mode
        }
      } catch (e) {}
    }
    detect()
    const obs = new MutationObserver(detect)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })
    return () => obs.disconnect()
  }, [])

  // cap how many nodes we animate (DOM views), keep most relevant first
  const CAP = mode === 'embedding' ? 140 : 60
  const nodes = useMemo(() => {
    const arr = leads.map(l => ({
      key: l.key, lead: l, stage: toStage(l.status), name: leadName(l),
      color: leadColor(l), score: intentScore(l), eng: engagementScore(l), overdue: isOverdue(l),
    }))
    const order = { new: 0, contacted: 1, quoted: 2, won: 3, lost: 4 }
    arr.sort((a, b) => (order[a.stage] - order[b.stage]) || (b.score - a.score))
    return arr.slice(0, CAP)
  }, [leads, mode])

  const counts = useMemo(() => {
    const c = { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 }
    leads.forEach(l => { c[toStage(l.status)]++ })
    return c
  }, [leads])

  const [stageOpen, setStageOpen] = useState(null)
  function openStage(key) { setStageOpen(key) }
  function rowOpen(lead) { setStageOpen(null); onOpenLead && onOpenLead(lead) }

  const panel = {
    background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14,
    overflow: 'hidden', position: 'relative',
  }

  return (
    <div ref={rootRef}>
      <style>{`
        @keyframes lvSpin { to { transform: rotate(360deg) } }
        @keyframes lvPulse { 0%,100%{opacity:.55} 50%{opacity:1} }
        @keyframes lvDash { to { stroke-dashoffset: -290 } }
        .lv-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:99px;cursor:pointer;font-size:11.5px;font-weight:600;border:1px solid var(--border);background:var(--bg2);transition:all .15s}
        .lv-chip:hover{border-color:var(--text3)}
        .lv-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .lv-orb{position:absolute;top:0;left:0;border-radius:50%;cursor:pointer;will-change:transform;z-index:2}
        .lv-tag{position:absolute;left:50%;top:50%;transform:translate(-50%,-150%);white-space:nowrap;font-size:9px;font-weight:600;color:var(--text);background:var(--card);border:1px solid var(--border);border-radius:6px;padding:1px 6px;pointer-events:none}
        .lv-hub{position:absolute;transform:translate(-50%,-50%);text-align:center;cursor:pointer;z-index:3}
        .lv-ring{width:54px;height:54px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;background:var(--card);transition:transform .2s}
        .lv-hub:hover .lv-ring{transform:scale(1.08)}
        .lv-grl{position:absolute;transform:translate(-50%,-130%);font-size:9.5px;font-weight:600;padding:3px 9px;border-radius:7px;background:var(--card);border:1px solid var(--border);cursor:pointer;z-index:6}
        .lv-srow{display:flex;align-items:center;gap:11px;padding:10px 11px;border-radius:11px;border:0.5px solid var(--border);background:var(--bg2);cursor:pointer;margin-bottom:8px}
        .lv-srow:hover{border-color:var(--text3)}
      `}</style>

      {/* stage chips — clickable, work on every view incl. mobile */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
        {STAGE_KEYS.map(k => (
          <div key={k} className="lv-chip" onClick={() => openStage(k)} style={{ color: STAGE[k].color }}>
            <span className="lv-dot" style={{ background: STAGE[k].color }} />
            {STAGE[k].label}
            <span style={{ fontFamily: 'monospace', color: 'var(--text2)' }}>{counts[k]}</span>
          </div>
        ))}
      </div>

      <div style={panel}>
        {nodes.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No leads to visualize — adjust your filters.
          </div>
        ) : mode === 'galaxy' ? (
          <GalaxyView nodes={nodes} counts={counts} isDark={isDark} mobile={mobile} onOpenLead={onOpenLead} onOpenStage={openStage} />
        ) : mode === 'embedding' ? (
          <EmbeddingView nodes={nodes} isDark={isDark} mobile={mobile} onOpenLead={onOpenLead} />
        ) : (
          <FlowView nodes={nodes} counts={counts} isDark={isDark} mobile={mobile} onOpenLead={onOpenLead} onOpenStage={openStage} />
        )}
      </div>

      {leads.length > nodes.length && mode !== 'embedding' && (
        <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 8, textAlign: 'center' }}>
          Showing {nodes.length} of {leads.length} leads (most relevant first)
        </div>
      )}

      {stageOpen && (
        <StageList
          stageKey={stageOpen} leads={leads.filter(l => toStage(l.status) === stageOpen)}
          mobile={mobile} onClose={() => setStageOpen(null)} onRow={rowOpen}
        />
      )}
    </div>
  )
}

/* ---------------- FLOW ---------------- */
function FlowView({ nodes, counts, isDark, mobile, onOpenLead, onOpenStage }) {
  const wrapRef = useRef(null)
  const stageRef = useRef(null)
  const orbRefs = useRef({})
  const W = 920, H = 300
  const HUBS = { new: [110, 150], contacted: [340, 150], quoted: [570, 150], won: [800, 150], lost: [455, 250] }

  useEffect(() => {
    function fit() {
      const w = wrapRef.current ? wrapRef.current.clientWidth : W
      const sc = Math.min(1, w / W)
      if (stageRef.current) {
        stageRef.current.style.transform = `scale(${sc})`
        wrapRef.current.style.height = (H * sc) + 'px'
      }
    }
    fit(); window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    const anim = nodes.map((n, i) => ({ n, ang: (i * 1.7) % 6.28, spd: 0.004 + (i % 5) * 0.0012, r: 22 + (i % 3) * 9 }))
    let raf
    function tick() {
      for (const a of anim) {
        const el = orbRefs.current[a.n.key]; if (!el) continue
        a.ang += a.spd
        const [hx, hy] = HUBS[a.n.stage] || HUBS.new
        const x = hx + Math.cos(a.ang) * a.r, y = hy + Math.sin(a.ang) * a.r * 0.7
        el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [nodes])

  const railBase = isDark ? 'rgba(99,179,237,0.18)' : 'rgba(8,145,178,0.22)'
  const railLine = isDark ? '#35d6ff' : '#0891b2'

  return (
    <div ref={wrapRef} style={{ width: '100%', overflow: 'hidden' }}>
      <div ref={stageRef} style={{ width: W, height: H, position: 'relative', transformOrigin: 'top left' }}>
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
          <path d="M110,150 C225,112 225,188 340,150 S455,112 570,150 S685,188 800,150" fill="none" stroke={railBase} strokeWidth="3" />
          <path d="M340,150 C352,210 410,238 455,250" fill="none" stroke={isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.25)'} strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
          <path d="M110,150 C225,112 225,188 340,150 S455,112 570,150 S685,188 800,150" fill="none" stroke={railLine} strokeWidth="2" strokeDasharray="3 24" strokeLinecap="round" style={{ animation: 'lvDash 3s linear infinite' }} opacity={isDark ? 0.8 : 0.6} />
        </svg>

        {Object.entries(HUBS).map(([k, [x, y]]) => (
          <div key={k} className="lv-hub" style={{ left: x, top: y }} onClick={() => onOpenStage(k)}>
            <div className="lv-ring" style={{ border: `1.6px ${k === 'lost' ? 'dashed' : 'solid'} ${STAGE[k].color}`, boxShadow: `0 0 0 4px var(--bg), 0 0 ${isDark ? 16 : 8}px ${STAGE[k].color}${isDark ? '66' : '33'}` }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: STAGE[k].color }}>{counts[k]}</span>
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--text)', marginTop: 7 }}>{STAGE[k].label}</div>
          </div>
        ))}

        {nodes.map(n => (
          <div key={n.key} ref={el => (orbRefs.current[n.key] = el)} className="lv-orb"
            onClick={() => onOpenLead && onOpenLead(n.lead)}
            style={{ width: 12, height: 12, background: n.color, boxShadow: `0 0 ${isDark ? 9 : 5}px ${n.color}${isDark ? '' : '88'}` }}>
            <span className="lv-tag">{n.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- GALAXY ---------------- */
function GalaxyView({ nodes, counts, isDark, mobile, onOpenLead, onOpenStage }) {
  const wrapRef = useRef(null)
  const orbRefs = useRef({})
  const hoverRef = useRef({})
  const [dim, setDim] = useState({ w: 600, h: 460 })
  const RAD = { new: 200, contacted: 148, quoted: 96, won: 44, lost: 250 }
  const TILT = 0.52

  useEffect(() => {
    function fit() {
      const w = wrapRef.current ? wrapRef.current.clientWidth : 600
      setDim({ w, h: Math.min(460, Math.max(320, w * 0.62)) })
    }
    fit(); window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    const cx = dim.w / 2, cy = dim.h / 2
    const sc = Math.min(1, dim.w / 600)
    const anim = nodes.map((n, i) => ({ n, ang: (i * 0.9) % 6.28, spd: (0.004 + (i % 6) * 0.001) * (i % 2 ? 1 : -1) }))
    let raf
    function tick() {
      for (const a of anim) {
        const el = orbRefs.current[a.n.key]; if (!el) continue
        if (!hoverRef.current[a.n.key]) a.ang += a.spd
        const R = (RAD[a.n.stage] ?? RAD.new) * sc
        const x = cx + Math.cos(a.ang) * R, y = cy + Math.sin(a.ang) * R * TILT
        const depth = (Math.sin(a.ang) + 1) / 2
        el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${(0.85 + depth * 0.4).toFixed(2)})`
        el.style.opacity = a.n.stage === 'lost' ? 0.5 : 1
        el.style.zIndex = depth > 0.5 ? 4 : 1
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [nodes, dim])

  const cx = dim.w / 2, cy = dim.h / 2, sc = Math.min(1, dim.w / 600)
  const ringCol = { new: STAGE.new.color, contacted: STAGE.contacted.color, quoted: STAGE.quoted.color }

  return (
    <div ref={wrapRef} style={{ width: '100%', height: dim.h, position: 'relative', overflow: 'hidden' }}>
      {['new', 'contacted', 'quoted'].map(k => {
        const d = RAD[k] * 2 * sc
        return <div key={k} style={{ position: 'absolute', left: cx, top: cy, width: d, height: d, borderRadius: '50%', transform: 'translate(-50%,-50%) scaleY(0.52)', border: `1px dashed ${ringCol[k]}${isDark ? '55' : '66'}`, pointerEvents: 'none' }} />
      })}
      {['new', 'contacted', 'quoted'].map(k => (
        <div key={'l' + k} className="lv-grl" style={{ left: cx, top: cy - RAD[k] * TILT * sc, color: ringCol[k] }} onClick={() => onOpenStage(k)}>{STAGE[k].label}</div>
      ))}

      {/* sun = Won */}
      <div onClick={() => onOpenStage('won')} title="Won"
        style={{ position: 'absolute', left: cx, top: cy, width: 50, height: 50, margin: '-25px 0 0 -25px', borderRadius: '50%', cursor: 'pointer', zIndex: 3,
          background: 'radial-gradient(circle at 50% 42%, #fff3c4, #f6c453 40%, #ef9f27 75%)', boxShadow: `0 0 ${isDark ? 26 : 14}px #f6a23c, 0 0 ${isDark ? 52 : 26}px ${STAGE.won.color}55` }} />
      <div style={{ position: 'absolute', left: cx, top: cy + 32, transform: 'translate(-50%,0)', fontSize: 9.5, fontWeight: 600, color: STAGE.won.color, fontFamily: 'monospace', pointerEvents: 'none' }}>WON · {counts.won}</div>

      {nodes.map(n => (
        <div key={n.key} ref={el => (orbRefs.current[n.key] = el)}
          onMouseEnter={() => { hoverRef.current[n.key] = true }} onMouseLeave={() => { hoverRef.current[n.key] = false }}
          onClick={() => onOpenLead && onOpenLead(n.lead)}
          style={{ position: 'absolute', left: 0, top: 0, width: 24, height: 24, transform: 'translate(-50%,-50%)', cursor: 'pointer', zIndex: 2 }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 12, height: 12, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: n.color, boxShadow: `0 0 ${isDark ? 9 : 5}px ${n.color}${isDark ? '' : '88'}` }} />
          <span className="lv-tag">{n.name}</span>
        </div>
      ))}
    </div>
  )
}

/* ---------------- EMBEDDING ---------------- */
function EmbeddingView({ nodes, isDark, mobile, onOpenLead }) {
  const wrapRef = useRef(null)
  const cvRef = useRef(null)
  const stateRef = useRef([])

  useEffect(() => {
    const cv = cvRef.current, ctx = cv.getContext('2d')
    let W = 600, H = mobile ? 320 : 380, dpr = 1, raf
    function fit() {
      W = wrapRef.current.clientWidth; dpr = window.devicePixelRatio || 1
      cv.style.width = '100%'; cv.style.height = H + 'px'
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const padX = 60, padY = 44
      stateRef.current = nodes.map((n, i) => {
        const tx = padX + (n.eng / 100) * (W - padX - 28)
        const ty = (H - padY) - (n.score / 100) * (H - padY - 28)
        const prev = stateRef.current.find(p => p.key === n.key)
        return { key: n.key, n, x: prev ? prev.x : tx + (Math.random() - 0.5) * 30, y: prev ? prev.y : ty + (Math.random() - 0.5) * 30, tx, ty, ph: (i % 20) * 6 }
      })
    }
    fit(); window.addEventListener('resize', fit)

    const lineCol = isDark ? '130,170,255' : '90,110,180'
    function draw() {
      ctx.clearRect(0, 0, W, H)
      const arr = stateRef.current
      // gentle settle + drift
      for (const s of arr) {
        s.x += (s.tx - s.x) * 0.05 + (Math.random() - 0.5) * 0.4
        s.y += (s.ty - s.y) * 0.05 + (Math.random() - 0.5) * 0.4
        s.ph += 0.04
      }
      // connection lines (similarity by proximity)
      const TH = 110
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j], d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d < TH) { ctx.strokeStyle = `rgba(${lineCol},${((1 - d / TH) * (isDark ? 0.34 : 0.22)).toFixed(3)})`; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke() }
      }
      // dots + names
      ctx.font = '9px monospace'; ctx.textBaseline = 'middle'
      for (const s of arr) {
        const col = s.n.color
        if (s.n.overdue) { const p = (Math.sin(s.ph) + 1) / 2; ctx.strokeStyle = `rgba(239,68,68,${(0.5 * p).toFixed(2)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 8 + p * 8, 0, 7); ctx.stroke() }
        ctx.save(); ctx.shadowBlur = isDark ? 10 : 5; ctx.shadowColor = col; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s.x, s.y, 4.5, 0, 7); ctx.fill(); ctx.restore()
        ctx.fillStyle = isDark ? 'rgba(223,231,255,0.92)' : 'rgba(30,41,59,0.9)'; ctx.fillText(s.n.name, s.x + 8, s.y)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    function onClick(e) {
      const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top
      let best = null, bd = 1e9
      for (const s of stateRef.current) { const d = Math.hypot(s.x - mx, s.y - my); if (d < bd) { bd = d; best = s } }
      if (best && bd < 16) onOpenLead && onOpenLead(best.n.lead)
    }
    cv.addEventListener('click', onClick)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); cv.removeEventListener('click', onClick) }
  }, [nodes, isDark, mobile])

  return (
    <div ref={wrapRef} style={{ width: '100%', position: 'relative' }}>
      <canvas ref={cvRef} style={{ display: 'block', cursor: 'pointer' }} />
      <div style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 9.5, color: 'var(--text3)', fontFamily: 'monospace', pointerEvents: 'none' }}>engagement →</div>
      <div style={{ position: 'absolute', top: 12, left: 10, fontSize: 9.5, color: 'var(--text3)', fontFamily: 'monospace', writingMode: 'vertical-rl', transform: 'rotate(180deg)', pointerEvents: 'none' }}>intent →</div>
    </div>
  )
}

/* ---------------- STAGE LIST POPUP ---------------- */
function StageList({ stageKey, leads, mobile, onClose, onRow }) {
  const m = STAGE[stageKey]
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 240, display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', padding: mobile ? 0 : 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: mobile ? '100%' : 430, maxHeight: '82vh', overflowY: 'auto', background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: mobile ? '16px 16px 0 0' : 16 }}>
        <div style={{ position: 'sticky', top: 0, background: 'var(--card)', padding: '14px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 11, borderRadius: mobile ? '16px 16px 0 0' : '16px 16px 0 0' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, background: m.color + '22', color: m.color }}>{leads.length}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{m.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{leads.length} {leads.length === 1 ? 'lead' : 'leads'}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: 17 }}>×</button>
        </div>
        <div style={{ padding: 14 }}>
          {leads.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, padding: '22px 0' }}>Is stage mein abhi koi lead nahi</div>
          ) : leads.map(l => (
            <div key={l.key} className="lv-srow" onClick={() => onRow(l)}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0, background: (TEMP_COL[l.temperature] || TEMP_COL.warm) + '22', color: TEMP_COL[l.temperature] || TEMP_COL.warm }}>{initial(leadName(l))}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{leadName(l)}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{[leadProject(l), leadLoc(l)].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 11, color: TEMP_COL[l.temperature] || TEMP_COL.warm }}>{intentScore(l)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
