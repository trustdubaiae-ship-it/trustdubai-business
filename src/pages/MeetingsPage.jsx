// Company Meetings — calendar workspace.
// Left: month calendar (dots per day). Right: selected day's agenda grouped by
// client, or a client's full history (added date, past meetings, MOMs, next
// follow-up, activity timeline). Everything stays in sync with the lead log:
// meetings + MOM + follow-ups write back to lead_submissions / lead_activity.
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

const KINDS = {
  meeting:    { label: 'Meeting',    icon: 'ti-calendar-event', color: '#3b82f6' },
  site_visit: { label: 'Site Visit', icon: 'ti-map-pin',        color: '#f59e0b' },
  call:       { label: 'Call',       icon: 'ti-phone',          color: '#22c55e' },
  followup:   { label: 'Follow-up',  icon: 'ti-flag',           color: '#8b5cf6' },
}
const REMIND = [[0, 'No reminder'], [15, '15 min'], [30, '30 min'], [60, '1 hour'], [1440, '1 day']]
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const GRAD = 'linear-gradient(135deg,#3b82f6 0%,#8b5cf6 55%,#06b6d4 100%)'

const MEET_CSS = `
@keyframes mtgFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes mtgPop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
.mtg-card{animation:mtgFade .35s cubic-bezier(.2,.7,.2,1) both}
.mtg-grad-text{background:${GRAD};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.mtg-cell{transition:transform .12s ease, background .15s, box-shadow .2s}
.mtg-cell:hover{transform:translateY(-2px)}
.mtg-cell:hover .mtg-cellbg{opacity:1}
.mtg-row{transition:background .15s, transform .12s}
.mtg-row:hover{background:rgba(99,102,241,.07)}
.mtg-grp{transition:box-shadow .2s, transform .12s}
.mtg-grp:hover{box-shadow:0 10px 30px -14px rgba(99,102,241,.5)}
.mtg-btn-grad{background:${GRAD};background-size:160% 160%;transition:background-position .4s, box-shadow .2s, transform .1s;box-shadow:0 6px 18px -6px rgba(99,102,241,.6)}
.mtg-btn-grad:hover{background-position:100% 100%;transform:translateY(-1px)}
.mtg-glow{box-shadow:0 10px 34px -14px rgba(99,102,241,.4)}
`

function pad(n) { return String(n).padStart(2, '0') }
function dateKey(d) { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}` }
function fmtTime(d) { return new Date(d).toLocaleTimeString('en-AE', { hour: 'numeric', minute: '2-digit' }) }
function fmtLong(key) { const [y, m, dd] = key.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' }) }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' }) }
function todayKey() { return dateKey(new Date()) }

function monthMatrix(viewDate) {
  const y = viewDate.getFullYear(), m = viewDate.getMonth()
  const startDay = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function MeetingsPage({ onNavigate }) {
  const { company, user } = useAuth()
  const toast = useToast()
  const [meetings, setMeetings] = useState([])
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const mobile = vw < 880
  const [now, setNow] = useState(Date.now())

  const [viewDate, setViewDate] = useState(new Date())
  const [selected, setSelected] = useState(todayKey())
  const [openClient, setOpenClient] = useState(null) // lead_submissions.id
  const [clientActivity, setClientActivity] = useState([])
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { const r = () => setVw(window.innerWidth); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r) }, [])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  useEffect(() => { if (company?.id) load() }, [company?.id])

  async function load() {
    setLoading(true)
    const [m, l] = await Promise.all([
      supabase.from('company_meetings').select('*').order('start_at', { ascending: true }),
      supabase.from('lead_submissions').select('id,name,phone,status,created_at,follow_up_date,answers,source').eq('company_id', company.id).order('created_at', { ascending: false }).limit(1000),
    ])
    if (m.error) console.error('meetings', m.error)
    if (l.error) console.error('leads', l.error)
    setMeetings(m.data || [])
    setLeads(l.data || [])
    setLoading(false)
  }

  const leadById = useMemo(() => { const o = {}; for (const l of leads) o[l.id] = l; return o }, [leads])

  // date-key -> [items]
  const byDate = useMemo(() => {
    const map = {}
    const push = (k, it) => { (map[k] = map[k] || []).push(it) }
    for (const mt of meetings) {
      if (mt.status === 'cancelled' || !mt.start_at) continue
      push(dateKey(mt.start_at), { type: 'meeting', kind: mt.status === 'done' ? mt.kind : mt.kind, done: mt.status === 'done', time: new Date(mt.start_at), title: mt.title, clientId: mt.lead_id, clientName: mt.lead_name, meeting: mt })
    }
    for (const l of leads) {
      if (l.follow_up_date && !['won', 'lost'].includes(l.status)) {
        push(String(l.follow_up_date).slice(0, 10), { type: 'followup', kind: 'followup', time: null, title: 'Follow-up due', clientId: l.id, clientName: l.name, lead: l })
      }
    }
    for (const k in map) map[k].sort((a, b) => (a.time?.getTime() || 0) - (b.time?.getTime() || 0))
    return map
  }, [meetings, leads])

  const dayItems = byDate[selected] || []
  const dayGroups = useMemo(() => {
    const groups = []
    const idx = {}
    for (const it of dayItems) {
      const key = it.clientId || ('x:' + it.title)
      if (idx[key] == null) { idx[key] = groups.length; groups.push({ clientId: it.clientId, clientName: it.clientName || it.title, items: [] }) }
      groups[idx[key]].items.push(it)
    }
    return groups
  }, [dayItems])

  async function openClientDetail(leadId) {
    setOpenClient(leadId); setClientActivity([])
    if (!leadId) return
    const { data } = await supabase.from('lead_activity').select('*').eq('company_id', company.id).eq('lead_id', leadId).order('created_at', { ascending: false }).limit(50)
    setClientActivity(data || [])
  }

  // ---- meeting modal ----
  function openNew(prefill = {}) {
    const d = prefill.date || (selected !== todayKey() ? selected : todayKey())
    setModal({ isNew: true, item: { title: prefill.title || '', kind: prefill.kind || 'meeting', start: d + 'T10:00', remind: 30, location: '', notes: '', lead_id: prefill.lead_id || null, lead_name: prefill.lead_name || null } })
  }
  function openEdit(mt) {
    const off = new Date(mt.start_at).getTimezoneOffset()
    setModal({ isNew: false, item: { ...mt, start: new Date(new Date(mt.start_at).getTime() - off * 60000).toISOString().slice(0, 16), remind: mt.remind_minutes ?? 30, mom: mt.mom || '', follow_up_date: mt.follow_up_date || '' } })
  }

  async function saveMeeting() {
    const it = modal.item
    if (!it.title?.trim()) { toast.error('Title is required'); return }
    if (!it.start) { toast.error('Pick a date & time'); return }
    setSaving(true)
    try {
      const payload = {
        company_id: company.id, title: it.title.trim(), kind: it.kind || 'meeting',
        start_at: new Date(it.start).toISOString(), remind_minutes: parseInt(it.remind) || 0,
        location: it.location || null, notes: it.notes || null, updated_at: new Date().toISOString(),
      }
      if (modal.isNew) {
        payload.created_by_email = user?.email || null; payload.status = 'scheduled'
        payload.lead_id = it.lead_id || null; payload.lead_name = it.lead_name || null
        const { error } = await supabase.from('company_meetings').insert(payload); if (error) throw error
      } else {
        const { error } = await supabase.from('company_meetings').update(payload).eq('id', it.id); if (error) throw error
      }
      setModal(null); toast.success('Saved ✓'); await load()
    } catch (e) { console.error(e); toast.error('Save failed: ' + (e?.message || e)) }
    finally { setSaving(false) }
  }

  async function completeMeeting() {
    const it = modal.item
    setSaving(true)
    try {
      const { error } = await supabase.from('company_meetings').update({ status: 'done', mom: it.mom || null, follow_up_date: it.follow_up_date || null, updated_at: new Date().toISOString() }).eq('id', it.id)
      if (error) throw error
      if (it.lead_id && (it.follow_up_date || it.mom)) await writeToLead(it.lead_id, it.follow_up_date, it.mom)
      setModal(null); toast.success(it.lead_id ? 'Done — saved to lead ✓' : 'Marked done ✓'); await load()
      if (openClient) openClientDetail(openClient)
    } catch (e) { console.error(e); toast.error('Failed: ' + (e?.message || e)) }
    finally { setSaving(false) }
  }

  async function writeToLead(leadId, followUp, mom) {
    try {
      if (followUp) await supabase.from('lead_submissions').update({ follow_up_date: followUp }).eq('id', leadId)
      await supabase.from('lead_activity').insert({
        lead_id: leadId, company_id: company.id, actor_name: company?.name || null,
        kind: 'follow_up', outcome: 'Meeting', note: mom ? ('MOM: ' + mom) : 'Meeting follow-up', next_follow_up: followUp || null,
      })
    } catch (e) { console.error('writeToLead', e) }
  }

  async function removeMeeting(id) {
    try { const { error } = await supabase.from('company_meetings').delete().eq('id', id); if (error) throw error; setModal(null); toast.success('Deleted'); await load() }
    catch (e) { console.error(e); toast.error('Delete failed') }
  }

  // quick follow-up date set from client detail
  async function setClientFollowup(leadId, date) {
    try {
      await supabase.from('lead_submissions').update({ follow_up_date: date || null }).eq('id', leadId)
      if (date) await supabase.from('lead_activity').insert({ lead_id: leadId, company_id: company.id, actor_name: company?.name || null, kind: 'follow_up', outcome: 'Scheduled', note: 'Next follow-up set', next_follow_up: date })
      toast.success('Follow-up updated ✓'); await load(); openClientDetail(leadId)
    } catch (e) { console.error(e); toast.error('Could not update') }
  }

  // Planner follows the app theme (light / dark) via CSS variables.
  const C = { card: 'var(--card)', border: 'var(--border)', text: 'var(--text)', t2: 'var(--text2)', t3: 'var(--text3)', bg2: 'var(--bg2)' }
  const cells = monthMatrix(viewDate)

  return (
    <div style={{ color: C.text }}>
      <style>{MEET_CSS}</style>
      {/* gradient hero header */}
      <div style={{ background: GRAD, borderRadius: 18, padding: 'clamp(16px,4vw,22px) clamp(18px,4vw,26px)', marginBottom: 16, position: 'relative', overflow: 'hidden', boxShadow: '0 16px 44px -18px rgba(99,102,241,.65)' }}>
        <div style={{ position: 'absolute', top: -45, right: -30, width: 170, height: 170, borderRadius: '50%', background: 'rgba(255,255,255,0.13)' }} />
        <div style={{ position: 'absolute', bottom: -55, left: 40, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-calendar-event" style={{ fontSize: 25, color: '#fff' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 className="font-syne fw-700" style={{ fontSize: 'clamp(21px,5vw,27px)', margin: 0, color: '#fff', letterSpacing: '-0.5px' }}>Planner</h1>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', margin: '2px 0 0' }}>Meetings, site visits &amp; follow-ups — synced with every lead.</p>
            </div>
          </div>
          <button onClick={() => openNew()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 18px', borderRadius: 11, border: 'none', background: '#fff', color: '#4f46e5', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 16px -6px rgba(0,0,0,0.3)', flexShrink: 0 }}><i className="ti ti-plus" style={{ fontSize: 17 }} /> New</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: C.t3 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
          {/* ===== Calendar ===== */}
          <div className="mtg-card mtg-glow" style={{ width: mobile ? '100%' : 460, flexShrink: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: GRAD }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={navBtn(C)}><i className="ti ti-chevron-left" /></button>
                <button onClick={() => { setViewDate(new Date()); setSelected(todayKey()); setOpenClient(null) }} style={{ ...navBtn(C), width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600 }}>Today</button>
                <button onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={navBtn(C)}><i className="ti ti-chevron-right" /></button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
              {WEEK.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.t3, padding: '4px 0' }}>{w[0]}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
              {cells.map((d, i) => {
                if (!d) return <div key={i} />
                const k = dateKey(d)
                const items = byDate[k] || []
                const isToday = k === todayKey()
                const isSel = k === selected
                const kinds = [...new Set(items.map(it => it.kind))].slice(0, 4)
                return (
                  <button key={i} onClick={() => { setSelected(k); setOpenClient(null) }} className="mtg-cell"
                    style={{ aspectRatio: '1', border: isSel ? 'none' : `1px solid ${isToday ? 'rgba(99,130,246,0.55)' : 'transparent'}`, background: isSel ? '#3b82f6' : (isToday ? 'rgba(59,130,246,0.12)' : 'transparent'), borderRadius: 11, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: 2, position: 'relative', boxShadow: isSel ? '0 8px 22px -5px rgba(59,130,246,0.7)' : 'none' }}>
                    <span style={{ fontSize: 14.5, fontWeight: isSel || isToday ? 800 : 500, color: isSel ? '#fff' : (isToday ? '#6366f1' : C.text) }}>{d.getDate()}</span>
                    <span style={{ display: 'flex', gap: 2, height: 5 }}>
                      {kinds.map(kn => { const c = (KINDS[kn] || KINDS.meeting).color; return <span key={kn} style={{ width: 5, height: 5, borderRadius: '50%', background: isSel ? '#fff' : c, boxShadow: isSel ? 'none' : `0 0 5px ${c}` }} /> })}
                    </span>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              {Object.entries(KINDS).map(([k, v]) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.t2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: v.color }} /> {v.label}
                </span>
              ))}
            </div>
          </div>

          {/* ===== Right panel ===== */}
          <div style={{ flex: 1, minWidth: 0, width: mobile ? '100%' : 'auto' }}>
            {openClient != null
              ? <ClientDetail
                  lead={leadById[openClient]} meetings={meetings.filter(m => m.lead_id === openClient)} activity={clientActivity}
                  onBack={() => setOpenClient(null)} onSchedule={() => openNew({ lead_id: openClient, lead_name: leadById[openClient]?.name })}
                  onOpenMeeting={openEdit} onSetFollowup={setClientFollowup} onOpenLead={() => onNavigate && onNavigate('leads')} C={C} />
              : <DayPanel dateKey={selected} items={dayItems} now={now} onOpenClient={openClientDetail} onOpenMeeting={openEdit} onNew={() => openNew()} C={C} />}
          </div>
        </div>
      )}

      {modal && <MeetingModal modal={modal} setModal={setModal} saving={saving} onSave={saveMeeting} onComplete={completeMeeting} onDelete={removeMeeting} C={C} leads={leads} />}
    </div>
  )
}

/* ---------------- Day agenda ---------------- */
const SLOTS = [
  { label: '8 – 10 AM', s: 8, e: 10 },
  { label: '10 – 12 PM', s: 10, e: 12 },
  { label: '12 – 2 PM', s: 12, e: 14 },
  { label: '2 – 4 PM', s: 14, e: 16 },
  { label: '4 – 6 PM', s: 16, e: 18 },
  { label: '6 – 8 PM', s: 18, e: 20 },
  { label: '8 – 10 PM', s: 20, e: 22 },
]
// Live countdown to a meeting start — colour shifts green → amber → red as it nears.
function countdown(target, now) {
  const ms = new Date(target).getTime() - now
  if (ms <= -3600000) return { txt: 'ended', color: '#94a3b8' }
  if (ms <= 0) return { txt: 'now', color: '#ef4444' }
  const mins = Math.floor(ms / 60000)
  if (mins >= 1440) return { txt: `in ${Math.floor(mins / 1440)}d`, color: '#22c55e' }
  const h = Math.floor(mins / 60), m = mins % 60
  const txt = h > 0 ? `in ${h}h ${m}m` : `in ${m}m`
  let color = '#22c55e'
  if (mins <= 30) color = '#ef4444'
  else if (mins <= 120) color = '#f59e0b'
  return { txt, color }
}

function DayPanel({ dateKey: dk, items, now, onOpenClient, onOpenMeeting, onNew, C }) {
  const total = items.length
  const remindTxt = (m) => m ? (m >= 1440 ? '1 day before' : m + ' min before') : ''
  const allDay = items.filter(it => !it.time)
  const timed = items.filter(it => it.time)
  const bucket = {}; const other = []
  for (const it of timed) {
    const h = new Date(it.time).getHours()
    const slot = SLOTS.find(s => h >= s.s && h < s.e)
    if (slot) (bucket[slot.label] = bucket[slot.label] || []).push(it)
    else other.push(it)
  }

  function card(it, i) {
    const kd = KINDS[it.kind] || KINDS.meeting
    const open = () => it.meeting ? onOpenMeeting(it.meeting) : (it.clientId && onOpenClient(it.clientId))
    const av = ((it.clientName || it.title || '?').trim()[0] || '?').toUpperCase()
    const cd = (it.time && !it.done) ? countdown(it.time, now) : null
    return (
      <div key={it.meeting?.id || it.clientId || i} onClick={open} className="mtg-row" style={{ background: kd.color + '14', border: `1px solid ${kd.color}3a`, borderLeft: `3px solid ${kd.color}`, borderRadius: 12, padding: '11px 13px', cursor: 'pointer', opacity: it.done ? 0.7 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: kd.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0, boxShadow: `0 4px 11px -3px ${kd.color}` }}>{av}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, textDecoration: it.done ? 'line-through' : 'none', wordBreak: 'break-word' }}>{it.title}</div>
            {cd && <div style={{ marginTop: 5 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: cd.color + '22', color: cd.color, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99, border: `1px solid ${cd.color}66` }}><i className="ti ti-clock-hour-4" style={{ fontSize: 12 }} /> {cd.txt}</span>
            </div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: kd.color, color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}><i className={'ti ' + kd.icon} style={{ fontSize: 10 }} /> {kd.label}</span>
              {it.time && <span style={{ fontSize: 11.5, color: C.t2, fontWeight: 600 }}><i className="ti ti-clock" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {fmtTime(it.time)}</span>}
              {it.clientName && <span onClick={e => { e.stopPropagation(); it.clientId && onOpenClient(it.clientId) }} style={{ fontSize: 12, color: '#8b5cf6', fontWeight: 600 }}><i className="ti ti-user" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {it.clientName}</span>}
            </div>
            <div style={{ display: 'flex', gap: 11, flexWrap: 'wrap', marginTop: 4 }}>
              {it.meeting?.location && <span style={{ fontSize: 11, color: C.t2 }}><i className="ti ti-map-pin" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {it.meeting.location}</span>}
              {it.meeting?.remind_minutes ? <span style={{ fontSize: 11, color: C.t2 }}><i className="ti ti-bell" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {remindTxt(it.meeting.remind_minutes)}</span> : null}
              {it.done && <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}><i className="ti ti-circle-check-filled" style={{ fontSize: 12, verticalAlign: '-1px' }} /> Done</span>}
            </div>
            {it.meeting?.notes && <div style={{ fontSize: 11.5, color: C.t2, marginTop: 6, lineHeight: 1.5, wordBreak: 'break-word' }}>{it.meeting.notes}</div>}
            {it.meeting?.mom && <div style={{ fontSize: 11, color: C.t2, marginTop: 5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 9px', lineHeight: 1.5, wordBreak: 'break-word' }}><b style={{ color: C.text }}>MOM:</b> {it.meeting.mom}</div>}
          </div>
        </div>
      </div>
    )
  }

  const slotRow = (label, list, key) => (
    <div key={key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '9px 0', borderTop: `1px solid ${C.border}` }}>
      <div style={{ width: 66, flexShrink: 0, paddingTop: 4, fontSize: 11, fontWeight: 700, color: list.length ? C.text : C.t3, textAlign: 'right', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.length ? list.map((it, i) => card(it, i)) : <div style={{ fontSize: 11, color: C.t3, opacity: 0.4, padding: '5px 0' }}>—</div>}
      </div>
    </div>
  )

  return (
    <div className="mtg-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, minHeight: 320, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: GRAD }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{fmtLong(dk)}</div>
          <div style={{ fontSize: 12, color: C.t2 }}>{total} {total === 1 ? 'item' : 'items'} scheduled</div>
        </div>
        <button onClick={onNew} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 9, border: 'none', background: GRAD, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 16px -6px rgba(99,102,241,0.6)' }}>
          <i className="ti ti-plus" /> Add
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {allDay.length > 0 && slotRow('All day', allDay, 'allday')}
        {SLOTS.map(s => slotRow(s.label, bucket[s.label] || [], s.label))}
        {other.length > 0 && slotRow('Other', other, 'other')}
      </div>
    </div>
  )
}

/* ---------------- Client detail ---------------- */
function ClientDetail({ lead, meetings, activity, onBack, onSchedule, onOpenMeeting, onSetFollowup, onOpenLead, C }) {
  const [fu, setFu] = useState(lead?.follow_up_date || '')
  useEffect(() => { setFu(lead?.follow_up_date || '') }, [lead?.id])
  if (!lead) return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18 }}>
      <button onClick={onBack} style={linkBtn}>← Back</button>
      <div style={{ padding: 30, textAlign: 'center', color: C.t3 }}>This item isn't linked to a saved lead.</div>
    </div>
  )
  const now = Date.now()
  const upcoming = meetings.filter(m => m.status !== 'done' && new Date(m.start_at).getTime() >= now).sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
  const pastM = meetings.filter(m => m.status === 'done' || new Date(m.start_at).getTime() < now).sort((a, b) => new Date(b.start_at) - new Date(a.start_at))
  return (
    <div className="mtg-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: GRAD }} />
      <button onClick={onBack} style={linkBtn}>← Back to day</button>
      {/* client head */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 14px' }}>
        <span style={{ width: 48, height: 48, borderRadius: '50%', background: GRAD, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, flexShrink: 0, boxShadow: '0 8px 20px -6px rgba(99,102,241,0.6)' }}>{(lead.name || '?')[0]?.toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{lead.name || 'Lead'}</div>
          <div style={{ fontSize: 12, color: C.t2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {lead.phone && <span><i className="ti ti-phone" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {lead.phone}</span>}
            <span><i className="ti ti-user-plus" style={{ fontSize: 12, verticalAlign: '-1px' }} /> Added {fmtDate(lead.created_at)}</span>
            {lead.status && <span style={{ textTransform: 'capitalize' }}>· {String(lead.status).replace(/_/g, ' ')}</span>}
          </div>
        </div>
      </div>

      {/* quick actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={onSchedule} className="btn btn-primary btn-sm"><i className="ti ti-calendar-plus" style={{ verticalAlign: '-2px', marginRight: 4 }} /> Schedule</button>
        <button onClick={onOpenLead} className="btn btn-secondary btn-sm"><i className="ti ti-external-link" style={{ verticalAlign: '-2px', marginRight: 4 }} /> Open in Lead Hub</button>
      </div>

      {/* next follow-up */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 16, flexWrap: 'wrap' }}>
        <i className="ti ti-flag" style={{ color: '#8b5cf6', fontSize: 16 }} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Next follow-up</span>
        <input type="date" value={fu} onChange={e => setFu(e.target.value)} style={{ ...field(C), width: 'auto', flex: '0 1 auto', padding: '7px 10px' }} />
        <button onClick={() => onSetFollowup(lead.id, fu)} className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}>Save</button>
      </div>

      {/* meetings */}
      <Section title={`Upcoming (${upcoming.length})`} C={C}>
        {upcoming.length === 0 ? <Empty C={C}>No upcoming meetings.</Empty> : upcoming.map(m => <MeetingRow key={m.id} m={m} onClick={() => onOpenMeeting(m)} C={C} />)}
      </Section>
      <Section title={`History (${pastM.length})`} C={C}>
        {pastM.length === 0 ? <Empty C={C}>No past meetings yet.</Empty> : pastM.map(m => <MeetingRow key={m.id} m={m} past onClick={() => onOpenMeeting(m)} C={C} />)}
      </Section>

      {/* activity timeline */}
      <Section title="Activity timeline" C={C}>
        {activity.length === 0 ? <Empty C={C}>No activity logged.</Empty> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activity.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: C.text }}>{a.note || a.outcome || a.kind || 'Activity'}</div>
                  <div style={{ fontSize: 10.5, color: C.t3 }}>{fmtDate(a.created_at)}{a.next_follow_up ? ' · next: ' + fmtDate(a.next_follow_up) : ''}{a.new_stage ? ' · → ' + a.new_stage : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function MeetingRow({ m, past, onClick, C }) {
  const kd = KINDS[m.kind] || KINDS.meeting
  return (
    <div onClick={onClick} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
      <span style={{ width: 28, height: 28, borderRadius: 8, background: kd.color + '1f', color: kd.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={'ti ' + kd.icon} style={{ fontSize: 14 }} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{m.title}</div>
        <div style={{ fontSize: 11, color: C.t3 }}>{kd.label} · {fmtDate(m.start_at)} {fmtTime(m.start_at)}{m.status === 'done' ? ' · done' : ''}</div>
        {m.mom && <div style={{ fontSize: 11.5, color: C.t2, marginTop: 3, whiteSpace: 'pre-wrap' }}><b>MOM:</b> {m.mom}</div>}
      </div>
    </div>
  )
}
function Section({ title, children, C }) {
  return <div style={{ marginBottom: 16 }}><div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{title}</div>{children}</div>
}
function Empty({ children, C }) { return <div style={{ fontSize: 12.5, color: C.t3, padding: '6px 0' }}>{children}</div> }

/* ---------------- Meeting modal ---------------- */
function MeetingModal({ modal, setModal, saving, onSave, onComplete, onDelete, C, leads }) {
  const it = modal.item
  const set = (patch) => setModal(m => ({ ...m, item: { ...m.item, ...patch } }))
  const [q, setQ] = useState('')
  const matches = q.trim().length >= 1 ? (leads || []).filter(l => (l.name || '').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : []
  return (
    <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, width: '100%', maxWidth: 480, padding: 22, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}><i className="ti ti-calendar-event" style={{ color: '#3b82f6' }} /> {modal.isNew ? 'New' : 'Edit'}</div>
        <label style={lbl(C)}>Who is this with? <span style={{ fontWeight: 400, color: C.t3 }}>(client / lead)</span></label>
        {it.lead_id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, padding: '8px 11px', marginBottom: 12 }}>
            <i className="ti ti-user" style={{ color: '#8b5cf6' }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text, minWidth: 0 }}>{it.lead_name}</span>
            <button onClick={() => set({ lead_id: null, lead_name: null })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3 }}><i className="ti ti-x" style={{ fontSize: 15 }} /></button>
          </div>
        ) : (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Type a client / lead name…" style={field(C)} />
            {matches.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 30, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                {matches.map(l => (
                  <div key={l.id} onClick={() => { set({ lead_id: l.id, lead_name: l.name, title: it.title || `Meeting — ${l.name}` }); setQ('') }}
                    style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{l.name}</div>
                    {l.phone && <div style={{ fontSize: 11, color: C.t3 }}>{l.phone}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {['meeting', 'site_visit', 'call'].map(k => { const v = KINDS[k]; const on = (it.kind || 'meeting') === k; return (
            <button key={k} onClick={() => set({ kind: k })} style={{ flex: '1 1 90px', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: on ? v.color + '1f' : 'transparent', color: on ? v.color : C.t3, border: `1px solid ${on ? v.color : C.border}` }}><i className={'ti ' + v.icon} /> {v.label}</button>
          ) })}
        </div>

        <label style={lbl(C)}>Title</label>
        <input autoFocus value={it.title || ''} onChange={e => set({ title: e.target.value })} placeholder="e.g. Kitchen design review" style={{ ...field(C), marginBottom: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}><label style={lbl(C)}>Date</label><input type="date" value={(it.start || '').slice(0, 10)} onChange={e => set({ start: e.target.value + 'T' + ((it.start || '').slice(11, 16) || '10:00') })} style={field(C)} /></div>
          <div style={{ minWidth: 0 }}><label style={lbl(C)}>Time</label><input type="time" value={(it.start || '').slice(11, 16)} onChange={e => set({ start: ((it.start || '').slice(0, 10) || dateKey(new Date())) + 'T' + (e.target.value || '10:00') })} style={field(C)} /></div>
          <div style={{ minWidth: 0 }}><label style={lbl(C)}>Remind</label><select value={it.remind} onChange={e => set({ remind: e.target.value })} style={field(C)}>{REMIND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <label style={lbl(C)}>Location</label>
        <input value={it.location || ''} onChange={e => set({ location: e.target.value })} placeholder="Office / site / video call" style={{ ...field(C), marginBottom: 12 }} />
        <label style={lbl(C)}>Notes / agenda</label>
        <textarea value={it.notes || ''} onChange={e => set({ notes: e.target.value })} rows={2} style={{ ...field(C), resize: 'vertical', minHeight: 54, marginBottom: 14 }} />

        {!modal.isNew && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>After the meeting</div>
            <label style={lbl(C)}>Minutes of meeting (MOM)</label>
            <textarea value={it.mom || ''} onChange={e => set({ mom: e.target.value })} rows={2} placeholder="Discussion, decisions, next steps…" style={{ ...field(C), resize: 'vertical', minHeight: 54, marginBottom: 10 }} />
            <label style={lbl(C)}>Next follow-up date</label>
            <input type="date" value={it.follow_up_date || ''} onChange={e => set({ follow_up_date: e.target.value })} style={field(C)} />
            {it.lead_id && <div style={{ fontSize: 10.5, color: C.t3, marginTop: 4 }}>“Mark done” saves the minutes + follow-up back to the lead.</div>}
            <button onClick={onComplete} disabled={saving} style={{ marginTop: 12, width: '100%', padding: 10, borderRadius: 9, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 600, fontSize: 13.5, cursor: saving ? 'wait' : 'pointer' }}><i className="ti ti-check" style={{ verticalAlign: '-2px', marginRight: 5 }} />{it.status === 'done' ? 'Update minutes' : 'Mark done + save follow-up'}</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          {!modal.isNew && <button onClick={() => onDelete(it.id)} style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}><i className="ti ti-trash" style={{ fontSize: 17 }} /></button>}
          <button onClick={() => setModal(null)} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.t2, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Close</button>
          <button onClick={onSave} disabled={saving} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

const navBtn = (C) => ({ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' })
const linkBtn = { background: 'none', border: 'none', color: '#3b82f6', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }
const field = (C) => ({ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'var(--bg2,rgba(127,127,127,0.05))', color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' })
const lbl = (C) => ({ fontSize: 12, color: C.t2, display: 'block', marginBottom: 5, fontWeight: 600 })
