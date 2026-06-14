// Top-bar meeting reminder: calendar bell with a badge for today's meetings,
// a dropdown of today/tomorrow meetings, and a near-meeting pop-up + browser
// notification when a meeting enters its "remind before" window.
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { fetchMeetings, meetingBuckets, upcomingTodayCount, fmtTime, relTime } from '../lib/meetings'

export default function MeetingBell({ navigate, isPlatinum }) {
  const { user } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const notified = useRef(new Set())

  async function refresh() { setItems(await fetchMeetings()) }

  // load + poll every 60s
  useEffect(() => {
    if (!user?.email) return
    refresh()
    const t = setInterval(refresh, 60000)
    return () => clearInterval(t)
  }, [user?.email])

  // near-meeting check every 30s → toast + browser notification (once per meeting)
  useEffect(() => {
    function check() {
      const now = Date.now()
      for (const it of meetingBuckets(items).today) {
        const start = new Date(it.start_at).getTime()
        const minsUntil = (start - now) / 60000
        const windowMin = Number(it.alert_minutes_before) || 0
        // fire when within the remind-before window (or at start), but not long past
        if (minsUntil <= windowMin && minsUntil >= -2 && !notified.current.has(it.id)) {
          notified.current.add(it.id)
          const when = relTime(it.start_at)
          toast.success(`📅 Meeting ${when}: ${it.title}`)
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('Meeting reminder', { body: `${it.title} — ${when} (${fmtTime(it.start_at)})` })
            }
          } catch { /* ignore */ }
        }
      }
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [items])

  // ask for notification permission once when we actually have upcoming meetings
  useEffect(() => {
    if (!items.length) return
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {})
      }
    } catch { /* ignore */ }
  }, [items.length])

  const { today, tomorrow } = meetingBuckets(items)
  const badge = upcomingTodayCount(items)
  const idle = isPlatinum ? 'rgba(255,255,255,0.5)' : 'var(--text3)'

  function goItem() { setOpen(false); navigate && navigate('organizer') }

  const Row = (it) => (
    <div key={it.id} onClick={goItem}
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(59,130,246,0.14)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className="ti ti-calendar-event" style={{ fontSize: 15 }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtTime(it.start_at)} · {relTime(it.start_at)}</div>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div onClick={() => setOpen(v => !v)} title={badge > 0 ? `${badge} meeting${badge > 1 ? 's' : ''} today` : 'Meetings'} style={{ position: 'relative', cursor: 'pointer' }}>
        <i className="ti ti-calendar-event" style={{ fontSize: 18, color: badge > 0 ? '#3b82f6' : idle }} />
        {badge > 0 && (
          <div style={{ position: 'absolute', top: -6, right: -7, minWidth: 15, height: 15, padding: '0 4px', background: '#3b82f6', color: '#fff', borderRadius: 8, fontSize: 9, fontWeight: 800, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${isPlatinum ? '#161b2e' : 'var(--card)'}` }}>
            {badge > 9 ? '9+' : badge}
          </div>
        )}
      </div>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', right: 0, top: 34, zIndex: 50, width: 290, background: 'var(--card)', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.18)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Meetings</span>
              <span onClick={goItem} style={{ fontSize: 11, color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }}>Open Organizer</span>
            </div>
            {today.length === 0 && tomorrow.length === 0 ? (
              <div style={{ padding: '18px 14px', textAlign: 'center', fontSize: 12.5, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>No meetings today or tomorrow.</div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {today.length > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px 4px', borderTop: '1px solid var(--border)' }}>Today</div>}
                {today.map(Row)}
                {tomorrow.length > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px 4px', borderTop: '1px solid var(--border)' }}>Tomorrow</div>}
                {tomorrow.map(Row)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
