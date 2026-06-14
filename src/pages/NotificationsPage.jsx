// tritova-business/src/pages/NotificationsPage.jsx
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const BRAND = '#0099cc'
const TYPE_ICON = {
  general:'ti-bell', lead:'ti-phone', review:'ti-star',
  comment:'ti-message-circle', system:'ti-settings',
}
const STATUS = {
  unread:      { label:'New',         bg:'#dbeafe', fg:'#1d4ed8' },
  noted:       { label:'Noted',       bg:'#fef3c7', fg:'#b45309' },
  in_progress: { label:'In Progress', bg:'#ede9fe', fg:'#6d28d9' },
  done:        { label:'Done',        bg:'#dcfce7', fg:'#15803d' },
}
const FILTERS = [
  { key:'all',         label:'All' },
  { key:'unread',      label:'Unread' },
  { key:'in_progress', label:'In Progress' },
  { key:'done',        label:'Done' },
]

export default function NotificationsPage() {
  const { company, staff, role } = useAuth()
  const [items, setItems] = useState([])
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [active, setActive] = useState(null)
  const [showSend, setShowSend] = useState(false)

  const canSend = role === 'owner' || role === 'manager'
  const seeAll  = role === 'owner' || role === 'manager'

  const load = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    // INTERNAL ONLY: company's own staff notifications (sender_type = 'business').
    // External / admin announcements now live in the Inbox, not here.
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('company_id', company.id)
      .eq('sender_type', 'business')
      .order('created_at', { ascending:false })
      .limit(100)
    let rows = data || []
    if (!seeAll && staff?.id) {
      rows = rows.filter(n => !n.recipient_staff_id || n.recipient_staff_id === staff.id)
    }
    setItems(rows)
    setLoading(false)
  }, [company, staff, seeAll])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!company?.id || !canSend) return
    supabase.from('business_staff')
      .select('id,name,role,active')
      .eq('company_id', company.id).eq('active', true)
      .then(({ data }) => setStaffList(data || []))
  }, [company, canSend])

  const filtered = items.filter(n => filter === 'all' ? true : n.status === filter)
  const unread = items.filter(n => n.status === 'unread').length

  async function setStatus(n, newStatus) {
    const patch = { status:newStatus }
    if (newStatus !== 'unread') patch.read_at = new Date().toISOString()
    const { error } = await supabase.from('notifications').update(patch).eq('id', n.id)
    if (!error) {
      await supabase.from('notification_activity').insert({
        notification_id:n.id, staff_id:staff?.id||null, old_status:n.status, new_status:newStatus,
      })
      setItems(p => p.map(x => x.id===n.id ? { ...x, ...patch } : x))
    }
    setActive(null)
  }

  if (loading) return <div style={{ padding:32, color:'#94a3b8' }}>Loading notifications…</div>

  return (
    <div style={{ padding:24, maxWidth:860, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap', marginBottom:6 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:0 }}>
          Notifications {unread>0 && <span style={{ fontSize:13, color:BRAND }}>({unread} new)</span>}
        </h1>
        {canSend && (
          <button onClick={() => setShowSend(true)}
            style={{ padding:'9px 16px', borderRadius:9, border:'none', color:'#fff', fontWeight:600, fontSize:13, background:BRAND, cursor:'pointer' }}>
            + Send Notification
          </button>
        )}
      </div>
      <p style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>
        Internal team reminders &amp; tasks · {company?.name}
      </p>

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding:'6px 14px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer',
              border: filter===f.key ? 'none' : '1px solid #e2e8f0',
              background: filter===f.key ? BRAND : '#fff',
              color: filter===f.key ? '#fff' : '#64748b' }}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background:'#f8fafc', borderRadius:16, padding:48, textAlign:'center', color:'#94a3b8' }}>
          <i className="ti ti-bell-off" style={{ fontSize:32, display:'block', marginBottom:8 }}/>
          No notifications {filter !== 'all' ? `in "${filter}"` : 'yet'}.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(n => {
            const st = STATUS[n.status] || STATUS.unread
            return (
              <div key={n.id} onClick={() => setActive(n)}
                style={{ display:'flex', alignItems:'flex-start', gap:12, background:'#fff', border:'0.5px solid #e2e8f0',
                  borderRadius:12, padding:14, cursor:'pointer' }}>
                <div style={{ width:38, height:38, borderRadius:10, background:'#e6f6fb',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className={`ti ${TYPE_ICON[n.type]||'ti-bell'}`} style={{ fontSize:17, color:BRAND }}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <span style={{ fontSize:14, fontWeight:n.status==='unread'?700:600, color:'#0f172a' }}>{n.title}</span>
                    <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background:st.bg, color:st.fg, whiteSpace:'nowrap' }}>{st.label}</span>
                  </div>
                  {n.message && <p style={{ fontSize:12, color:'#64748b', margin:'3px 0 0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{n.message}</p>}
                  <div style={{ fontSize:11, color:'#94a3b8', marginTop:4 }}>
                    <i className="ti ti-users" style={{ fontSize:11, verticalAlign:'-1px', marginRight:3 }}/>Internal
                    {n.priority==='high' && <span style={{ color:'#dc2626', fontWeight:600 }}> · High Priority</span>}
                    {' · '}{new Date(n.created_at).toLocaleString('en-GB')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {active && (
        <DetailModal n={active} onClose={() => setActive(null)} onStatus={setStatus} />
      )}

      {showSend && (
        <SendModal company={company} staff={staff} staffList={staffList}
          onClose={() => setShowSend(false)} onSent={() => { setShowSend(false); load() }} />
      )}
    </div>
  )
}

/* ---------- Detail + Activity history ---------- */
function DetailModal({ n, onClose, onStatus }) {
  const [activity, setActivity] = useState([])

  useEffect(() => {
    supabase.from('notification_activity')
      .select('*')
      .eq('notification_id', n.id)
      .order('created_at', { ascending:true })
      .then(({ data }) => setActivity(data || []))
  }, [n.id])

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:460, padding:20, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
          <i className={`ti ${TYPE_ICON[n.type]||'ti-bell'}`} style={{ fontSize:22, color:BRAND }}/>
          <h4 style={{ margin:0, fontSize:16, fontWeight:700, color:'#0f172a' }}>{n.title}</h4>
        </div>
        {n.message && <p style={{ fontSize:13, color:'#475569', margin:'0 0 8px' }}>{n.message}</p>}
        <p style={{ fontSize:11, color:'#94a3b8', margin:'0 0 16px' }}>
          Internal · {new Date(n.created_at).toLocaleString('en-GB')}
        </p>

        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <button onClick={() => onStatus(n,'noted')} style={{ flex:1, padding:'10px', borderRadius:8, border:'none', fontSize:12, fontWeight:600, background:'#fef3c7', color:'#b45309', cursor:'pointer' }}>✔ Noted</button>
          <button onClick={() => onStatus(n,'in_progress')} style={{ flex:1, padding:'10px', borderRadius:8, border:'none', fontSize:12, fontWeight:600, background:'#ede9fe', color:'#6d28d9', cursor:'pointer' }}>⏳ Take Action</button>
          <button onClick={() => onStatus(n,'done')} style={{ flex:1, padding:'10px', borderRadius:8, border:'none', fontSize:12, fontWeight:600, background:'#dcfce7', color:'#15803d', cursor:'pointer' }}>✅ Done</button>
        </div>

        <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#64748b', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.04em' }}>Activity History</div>
          {activity.length === 0 ? (
            <p style={{ fontSize:12, color:'#94a3b8', margin:0 }}>No status changes yet.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {activity.map(a => (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:BRAND, flexShrink:0 }}/>
                  <span style={{ color:'#475569' }}>
                    {(STATUS[a.old_status]?.label || a.old_status || '—')} → <b>{STATUS[a.new_status]?.label || a.new_status}</b>
                  </span>
                  <span style={{ marginLeft:'auto', color:'#94a3b8', fontSize:11 }}>{new Date(a.created_at).toLocaleString('en-GB')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- Send Notification (internal) ---------- */
function SendModal({ company, staff, staffList, onClose, onSent }) {
  const [to, setTo] = useState('')
  const [title, setTitle] = useState('')
  const [msg, setMsg] = useState('')
  const [priority, setPriority] = useState('normal')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  async function send() {
    setErr('')
    if (!title.trim()) { setErr('Title is required.'); return }
    setSending(true)
    const { error } = await supabase.from('notifications').insert({
      company_id: company.id,
      recipient_staff_id: to || null,
      sender_type: 'business',
      sender_staff_id: staff?.id || null,
      title: title.trim(),
      message: msg.trim() || null,
      type: 'general',
      priority,
      status: 'unread',
    })
    setSending(false)
    if (error) { setErr(error.message); return }
    onSent()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:440, padding:20 }}>
        <h4 style={{ fontWeight:700, color:'#0f172a', marginTop:0, marginBottom:16 }}>Send Internal Notification</h4>

        <label style={lbl}>To</label>
        <select value={to} onChange={e => setTo(e.target.value)} style={inp}>
          <option value="">All Staff</option>
          {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
        </select>

        <label style={lbl}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Follow up Mr. Ankit" style={inp} />

        <label style={lbl}>Message</label>
        <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Reminder / details…" rows={3} style={{ ...inp, resize:'vertical' }} />

        <label style={lbl}>Priority</label>
        <select value={priority} onChange={e => setPriority(e.target.value)} style={inp}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>

        {err && <p style={{ fontSize:12, color:'#dc2626', marginBottom:12 }}>{err}</p>}

        <button onClick={send} disabled={sending}
          style={{ width:'100%', padding:'11px', borderRadius:9, border:'none', color:'#fff', fontWeight:600, background:BRAND, cursor:'pointer', opacity:sending?0.5:1 }}>
          {sending ? 'Sending…' : 'Send Notification'}
        </button>
      </div>
    </div>
  )
}

const lbl = { fontSize:12, color:'#64748b', display:'block' }
const inp = { width:'100%', marginTop:4, marginBottom:14, border:'1px solid #e2e8f0', borderRadius:9, padding:'9px 12px', fontSize:13, boxSizing:'border-box' }
