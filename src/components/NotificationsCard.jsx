// tritova-business/src/components/NotificationsCard.jsx
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const BRAND = '#0099cc'
const TYPE_ICON = {
  general:'ti-bell', lead:'ti-phone', review:'ti-star',
  comment:'ti-message-circle', announcement:'ti-speakerphone', system:'ti-settings',
}
const STATUS = {
  unread:      { label:'New',         bg:'#dbeafe', fg:'#1d4ed8' },
  noted:       { label:'Noted',       bg:'#fef3c7', fg:'#b45309' },
  in_progress: { label:'In Progress', bg:'#ede9fe', fg:'#6d28d9' },
  done:        { label:'Done',        bg:'#dcfce7', fg:'#15803d' },
}

export default function NotificationsCard({ cardStyle, C, onOpenPage }) {
  const { company, staff, role } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .or(`company_id.eq.${company.id},company_id.is.null`)
      .order('created_at', { ascending:false })
      .limit(15)
    let rows = data || []
    const seeAll = role === 'owner' || role === 'manager'
    if (!seeAll && staff?.id) {
      rows = rows.filter(n => !n.recipient_staff_id || n.recipient_staff_id === staff.id)
    }
    setItems(rows)
    setLoading(false)
  }, [company, staff, role])

  useEffect(() => { load() }, [load])

  const unread = items.filter(n => n.status === 'unread').length
  const text = C?.text||'#0f172a', text2 = C?.text2||'#475569', text3 = C?.text3||'#94a3b8', border = C?.border||'#e2e8f0'

  return (
    <div style={cardStyle}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <i className="ti ti-bell" style={{ fontSize:14, color:BRAND }}/>
          <div style={{ fontSize:11, fontWeight:700, color:text, textTransform:'uppercase', letterSpacing:'0.04em' }}>Notifications</div>
          {unread > 0 && <span style={{ background:BRAND, color:'#fff', fontSize:8, fontWeight:700, padding:'1px 6px', borderRadius:99 }}>{unread}</span>}
        </div>
        <button onClick={onOpenPage}
          style={{ padding:'3px 8px', background:C?.bg||'#f8fafc', border:`0.5px solid ${border}`, borderRadius:6, fontSize:9, color:text2, cursor:'pointer' }}>
          View All
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'20px 0', color:text3, fontSize:11 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign:'center', padding:'24px 0', color:text3, fontSize:11 }}>
          <i className="ti ti-bell-off" style={{ fontSize:22, color:text3, display:'block', marginBottom:6 }}/>
          No notifications yet
        </div>
      ) : (
        items.slice(0, 6).map((n, i) => {
          const st = STATUS[n.status] || STATUS.unread
          return (
            <div key={n.id} onClick={onOpenPage}
              style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'7px 0',
                borderBottom: i < Math.min(items.length,6)-1 ? `0.5px solid ${border}` : 'none', cursor:'pointer' }}>
              <i className={`ti ${TYPE_ICON[n.type]||'ti-bell'}`} style={{ fontSize:13, color:n.sender_type==='admin'?'#d97706':BRAND, marginTop:1, flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                  <span style={{ fontSize:10, fontWeight:n.status==='unread'?700:500, color:text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{n.title}</span>
                  <span style={{ fontSize:7.5, fontWeight:600, padding:'1px 6px', borderRadius:99, background:st.bg, color:st.fg, whiteSpace:'nowrap' }}>{st.label}</span>
                </div>
                <div style={{ fontSize:8.5, color:text3, marginTop:1 }}>
                  {n.sender_type === 'admin' ? 'Tritova' : 'Internal'} · {new Date(n.created_at).toLocaleDateString('en-GB')}
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
