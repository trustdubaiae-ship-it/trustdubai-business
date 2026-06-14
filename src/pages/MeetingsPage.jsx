// Company Meetings — shared scheduler (owner + staff). Schedule meetings with
// reminders, link to a lead, and after the meeting capture Minutes of Meeting
// (MOM) + a follow-up that writes back to the lead. Table: company_meetings.
import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

const REMIND = [[0, 'No reminder'], [15, '15 min'], [30, '30 min'], [60, '1 hour'], [1440, '1 day']]

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' }) }
function fmtTime(d) { return new Date(d).toLocaleTimeString('en-AE', { hour: 'numeric', minute: '2-digit' }) }
function relTime(d) {
  const mins = Math.round((new Date(d).getTime() - Date.now()) / 60000)
  if (mins <= 0) return 'now / passed'
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  if (h < 24) return m ? `in ${h} h ${m} min` : `in ${h} h`
  return `in ${Math.round(h / 24)} d`
}

export default function MeetingsPage({ onNavigate }) {
  const { company, user } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('upcoming') // 'upcoming' | 'past'
  const [modal, setModal] = useState(null)   // { isNew, item }
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (company?.id) load() }, [company?.id])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('company_meetings').select('*')
      .order('start_at', { ascending: true })
    if (error) console.error('meetings load', error)
    setItems(data || [])
    setLoading(false)
  }

  function openNew() { setModal({ isNew: true, item: { title: '', start: '', remind: 30, location: '', notes: '' } }) }
  function openEdit(it) {
    setModal({
      isNew: false,
      item: {
        ...it,
        start: it.start_at ? toLocalInput(it.start_at) : '',
        remind: it.remind_minutes ?? 30,
        mom: it.mom || '',
        follow_up_date: it.follow_up_date || '',
      },
    })
  }
  function toLocalInput(iso) {
    const d = new Date(iso); const off = d.getTimezoneOffset()
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
  }

  async function save() {
    const it = modal.item
    if (!it.title?.trim()) { toast.error('Title is required'); return }
    if (!it.start) { toast.error('Pick a date & time'); return }
    setSaving(true)
    try {
      const payload = {
        company_id: company.id,
        title: it.title.trim(),
        start_at: new Date(it.start).toISOString(),
        remind_minutes: parseInt(it.remind) || 0,
        location: it.location || null,
        notes: it.notes || null,
        updated_at: new Date().toISOString(),
      }
      if (modal.isNew) {
        payload.created_by_email = user?.email || null
        payload.status = 'scheduled'
        const { error } = await supabase.from('company_meetings').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from('company_meetings').update(payload).eq('id', it.id)
        if (error) throw error
      }
      setModal(null); toast.success('Meeting saved ✓'); load()
    } catch (e) { console.error('save meeting', e); toast.error('Save failed: ' + (e?.message || e)) }
    finally { setSaving(false) }
  }

  async function markDone() {
    const it = modal.item
    setSaving(true)
    try {
      const { error } = await supabase.from('company_meetings').update({
        status: 'done', mom: it.mom || null, follow_up_date: it.follow_up_date || null, updated_at: new Date().toISOString(),
      }).eq('id', it.id)
      if (error) throw error
      // Write the minutes + follow-up back to the linked lead.
      if (it.lead_id && it.follow_up_date) {
        try {
          await supabase.from('lead_submissions').update({ follow_up_date: it.follow_up_date }).eq('id', it.lead_id)
          await supabase.from('lead_activity').insert({
            lead_id: it.lead_id, company_id: company.id, actor_name: company?.name || null,
            kind: 'follow_up', outcome: 'Meeting',
            note: it.mom ? ('MOM: ' + it.mom) : 'Meeting follow-up', next_follow_up: it.follow_up_date,
          })
        } catch (e) { console.error('lead writeback', e) }
      }
      setModal(null)
      toast.success(it.lead_id && it.follow_up_date ? 'Done — follow-up set on the lead ✓' : 'Marked done ✓')
      load()
    } catch (e) { console.error('markDone', e); toast.error('Failed: ' + (e?.message || e)) }
    finally { setSaving(false) }
  }

  async function remove(id) {
    try {
      const { error } = await supabase.from('company_meetings').delete().eq('id', id)
      if (error) throw error
      setModal(null); toast.success('Deleted'); load()
    } catch (e) { console.error(e); toast.error('Delete failed') }
  }

  const now = new Date()
  const t0 = startOfDay(now), t1 = new Date(t0); t1.setDate(t1.getDate() + 1)
  const t2 = new Date(t0); t2.setDate(t2.getDate() + 2)
  const scheduled = items.filter(it => it.status === 'scheduled')
  const upcoming = scheduled.filter(it => new Date(it.start_at) >= t0)
  const past = items.filter(it => it.status === 'done' || (it.status === 'scheduled' && new Date(it.start_at) < t0))
  const today = upcoming.filter(it => new Date(it.start_at) < t1)
  const tomorrow = upcoming.filter(it => { const s = new Date(it.start_at); return s >= t1 && s < t2 })
  const later = upcoming.filter(it => new Date(it.start_at) >= t2)

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 13, padding: '13px 15px' }

  function Row(it, done) {
    const overdue = !done && new Date(it.start_at) < now
    return (
      <div key={it.id} onClick={() => openEdit(it)} style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', opacity: done ? 0.75 : 1 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: done ? 'rgba(34,197,94,0.14)' : 'rgba(59,130,246,0.14)', color: done ? '#22c55e' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ti ${done ? 'ti-calendar-check' : 'ti-calendar-event'}`} style={{ fontSize: 18 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{it.title}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text2)' }}><i className="ti ti-clock" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {fmtDate(it.start_at)} · {fmtTime(it.start_at)}</span>
            {!done && <span style={{ fontSize: 11.5, fontWeight: 600, color: overdue ? '#ef4444' : '#3b82f6' }}>{overdue ? 'overdue' : relTime(it.start_at)}</span>}
            {it.location && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}><i className="ti ti-map-pin" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {it.location}</span>}
            {it.lead_name && <span style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6' }}><i className="ti ti-user" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {it.lead_name}</span>}
          </div>
          {done && it.mom && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><b>MOM:</b> {it.mom}</div>}
        </div>
        <i className="ti ti-chevron-right" style={{ fontSize: 16, color: 'var(--text3)', flexShrink: 0 }} />
      </div>
    )
  }

  const Section = (label, list, done) => list.length > 0 && (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label} · {list.length}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{list.map(it => Row(it, done))}</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: 'var(--text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize: 23, margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
            <i className="ti ti-calendar-event" style={{ color: '#3b82f6' }} /> Meetings
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Schedule meetings with reminders — shared across your team.</p>
        </div>
        <button onClick={openNew} className="btn btn-primary"><i className="ti ti-calendar-plus" style={{ fontSize: 16, verticalAlign: '-2px', marginRight: 4 }} /> New meeting</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
        {[['upcoming', 'Upcoming', upcoming.length], ['past', 'Past', past.length]].map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: tab === k ? 'var(--primary)' : 'var(--text2)', borderBottom: tab === k ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }}>
            {l} <span style={{ fontSize: 11, opacity: 0.7 }}>({n})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading...</div>
      ) : tab === 'upcoming' ? (
        (upcoming.length === 0) ? (
          <div style={{ ...card, textAlign: 'center', padding: '48px 20px' }}>
            <i className="ti ti-calendar-off" style={{ fontSize: 34, color: 'var(--text3)', display: 'block', marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>No upcoming meetings</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Schedule one, or add a meeting from a lead in Lead Hub.</div>
            <button onClick={openNew} className="btn btn-primary"><i className="ti ti-plus" /> New meeting</button>
          </div>
        ) : (<>{Section('Today', today)}{Section('Tomorrow', tomorrow)}{Section('Later', later)}</>)
      ) : (
        past.length === 0 ? <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>No past meetings yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{[...past].reverse().map(it => Row(it, true))}</div>
      )}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 480, padding: 24, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-calendar-event" style={{ color: '#3b82f6' }} /> {modal.isNew ? 'New meeting' : 'Meeting'}
            </div>

            {modal.item.lead_name && (
              <div style={{ fontSize: 12, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 8, padding: '7px 11px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-user" /> Linked lead: <b>{modal.item.lead_name}</b>
              </div>
            )}

            <label style={lbl}>Title</label>
            <input autoFocus value={modal.item.title || ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item, title: e.target.value } }))} placeholder="Client meeting / site visit…" style={{ ...input, marginBottom: 12 }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label style={lbl}>Date & time</label>
                <input type="datetime-local" value={modal.item.start || ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item, start: e.target.value } }))} style={input} /></div>
              <div><label style={lbl}>Remind before</label>
                <select value={modal.item.remind} onChange={e => setModal(m => ({ ...m, item: { ...m.item, remind: e.target.value } }))} style={input}>
                  {REMIND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
            </div>

            <label style={lbl}>Location (optional)</label>
            <input value={modal.item.location || ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item, location: e.target.value } }))} placeholder="Office / site address / video call" style={{ ...input, marginBottom: 12 }} />

            <label style={lbl}>Notes / agenda</label>
            <textarea value={modal.item.notes || ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item, notes: e.target.value } }))} rows={2} placeholder="Agenda…" style={{ ...input, resize: 'vertical', minHeight: 56, marginBottom: 14 }} />

            {!modal.isNew && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>After the meeting</div>
                <label style={lbl}>Minutes of meeting (MOM)</label>
                <textarea value={modal.item.mom || ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item, mom: e.target.value } }))} rows={2} placeholder="Discussion, decisions, next steps…" style={{ ...input, resize: 'vertical', minHeight: 56, marginBottom: 10 }} />
                <label style={lbl}>{modal.item.lead_id ? 'Next follow-up for this lead' : 'Next follow-up date'}</label>
                <input type="date" value={modal.item.follow_up_date || ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item, follow_up_date: e.target.value } }))} style={input} />
                {modal.item.lead_id && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>“Mark done” saves the minutes + this follow-up back to the lead.</div>}
                <button onClick={markDone} disabled={saving} style={{ marginTop: 12, width: '100%', padding: '10px', borderRadius: 9, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 600, fontSize: 13.5, cursor: saving ? 'wait' : 'pointer' }}>
                  <i className="ti ti-check" style={{ verticalAlign: '-2px', marginRight: 5 }} />{modal.item.status === 'done' ? 'Update minutes' : 'Mark done + save follow-up'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
              {!modal.isNew && (
                <button onClick={() => remove(modal.item.id)} style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}>
                  <i className="ti ti-trash" style={{ fontSize: 17 }} />
                </button>
              )}
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Close</button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const input = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2,rgba(127,127,127,0.05))', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
const lbl = { fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 5, fontWeight: 600 }
