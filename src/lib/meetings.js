// Shared helpers for meeting reminders (organizer_items where type = 'meeting').
// Used by the top-bar MeetingBell, the dashboard banner and the Organizer.
import { supabase } from './supabase'

export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

// Split upcoming (not-done) meetings into today / tomorrow / later, plus overdue-today.
export function meetingBuckets(items) {
  const now = new Date()
  const t0 = startOfDay(now)
  const t1 = new Date(t0); t1.setDate(t1.getDate() + 1)
  const t2 = new Date(t0); t2.setDate(t2.getDate() + 2)
  const today = [], tomorrow = [], later = []
  for (const it of items || []) {
    if (it.type !== 'meeting' || !it.start_at || it.is_done) continue
    const s = new Date(it.start_at)
    if (s >= t0 && s < t1) today.push(it)
    else if (s >= t1 && s < t2) tomorrow.push(it)
    else if (s >= t2) later.push(it)
  }
  return { today, tomorrow, later }
}

// Meetings still ahead of "now" today (used for the badge count).
export function upcomingTodayCount(items) {
  const now = Date.now()
  return meetingBuckets(items).today.filter(it => new Date(it.start_at).getTime() >= now - 60 * 60 * 1000).length
}

export async function fetchMeetings() {
  const { data, error } = await supabase
    .from('organizer_items')
    .select('id,title,notes,start_at,alert_minutes_before,is_done,type')
    .eq('type', 'meeting').eq('is_done', false)
    .not('start_at', 'is', null)
    .order('start_at', { ascending: true })
  if (error) { console.error('fetchMeetings', error); return [] }
  return data || []
}

export function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-AE', { hour: 'numeric', minute: '2-digit' })
}
export function fmtDay(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short' })
}
// Human "in 25 min" / "in 2 h" / "now".
export function relTime(d) {
  const mins = Math.round((new Date(d).getTime() - Date.now()) / 60000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `in ${h} h ${m} min` : `in ${h} h`
}
