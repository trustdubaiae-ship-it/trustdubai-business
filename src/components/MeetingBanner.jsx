// Dashboard reminder banner: shows today's / tomorrow's meeting counts and the
// next one. Renders nothing when there are no upcoming meetings. Click → Organizer.
import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { fetchMeetings, meetingBuckets, fmtTime, fmtDay, relTime } from '../lib/meetings'

export default function MeetingBanner({ onNavigate }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!user?.email) return
    let active = true
    ;(async () => { const m = await fetchMeetings(); if (active) setItems(m) })()
    return () => { active = false }
  }, [user?.email])

  const { today, tomorrow } = meetingBuckets(items)
  if (!today.length && !tomorrow.length) return null

  const next = today[0] || tomorrow[0]
  const summary = [
    today.length ? `${today.length} meeting${today.length > 1 ? 's' : ''} today` : '',
    tomorrow.length ? `${tomorrow.length} tomorrow` : '',
  ].filter(Boolean).join(' · ')

  return (
    <div onClick={() => onNavigate && onNavigate('organizer')}
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.28)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(59,130,246,0.16)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className="ti ti-calendar-event" style={{ fontSize: 20 }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{summary}</div>
        {next && (
          <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Next: <b style={{ color: 'var(--text)' }}>{next.title}</b> · {fmtDay(next.start_at)} {fmtTime(next.start_at)} · {relTime(next.start_at)}
          </div>
        )}
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', whiteSpace: 'nowrap', flexShrink: 0 }}>View →</span>
    </div>
  )
}
