// trustdubai-business/src/components/LoginNotificationPopup.jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const BRAND = '#0099cc'
const TYPE_ICON = {
  general:'ti-bell', lead:'ti-phone', review:'ti-star',
  comment:'ti-message-circle', announcement:'ti-speakerphone', system:'ti-settings',
}

export default function LoginNotificationPopup({ onOpenPage }) {
  const { company, staff, role } = useAuth()
  const [open, setOpen]   = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)

  const seeAll = role === 'owner' || role === 'manager'

  useEffect(() => {
    if (!company?.id) return
    // session mein ek hi baar dikhe
    const key = `td_login_popup_${company.id}_${staff?.id || 'owner'}`
    if (sessionStorage.getItem(key)) return

    async function run() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .or(`company_id.eq.${company.id},company_id.is.null`)
        .order('created_at', { ascending:false })
        .limit(50)
      let rows = data || []
      if (!seeAll && staff?.id) {
        rows = rows.filter(n => !n.recipient_staff_id || n.recipient_staff_id === staff.id)
      }
      const unreadRows = rows.filter(n => n.status === 'unread')
      setItems(unreadRows.slice(0, 5))
      setUnread(unreadRows.length)
      setLoading(false)
      setOpen(true)
      sessionStorage.setItem(key, '1')
    }
    run()
  }, [company, staff, seeAll])

  if (!open) return null

  function close() { setOpen(false) }
  function goToPage() { close(); onOpenPage && onOpenPage() }

  const hasUnread = unread > 0

  return (
    <div onClick={close} style={{ position:'fixed', inset:0, zIndex:80, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:440, padding:0, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* header */}
        <div style={{ background: hasUnread ? `linear-gradient(135deg,${BRAND},#007aa3)` : 'linear-gradient(135deg,#10b981,#059669)', padding:'20px 24px', color:'#fff', textAlign:'center' }}>
          <div style={{ width:54, height:54, borderRadius:'50%', background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
            <i className={`ti ${hasUnread ? 'ti-bell-ringing' : 'ti-circle-check'}`} style={{ fontSize:28 }}/>
          </div>
          {hasUnread ? (
            <>
              <div style={{ fontSize:18, fontWeight:800 }}>You have {unread} new notification{unread>1?'s':''}</div>
              <div style={{ fontSize:12, opacity:0.9, marginTop:3 }}>Welcome back, {staff?.name || company?.name}!</div>
            </>
          ) : (
            <>
              <div style={{ fontSize:18, fontWeight:800 }}>You're all caught up! 🎉</div>
              <div style={{ fontSize:12, opacity:0.9, marginTop:3 }}>No new notifications right now.</div>
            </>
          )}
        </div>

        {/* body */}
        <div style={{ padding:'18px 24px' }}>
          {loading ? (
            <div style={{ textAlign:'center', color:'#94a3b8', fontSize:13, padding:'10px 0' }}>Loading…</div>
          ) : hasUnread ? (
            <>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                {items.map(n => (
                  <div key={n.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', background:'#f8fafc', borderRadius:10 }}>
                    <i className={`ti ${TYPE_ICON[n.type]||'ti-bell'}`} style={{ fontSize:16, color:n.sender_type==='admin'?'#d97706':BRAND, marginTop:1, flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#0f172a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{n.title}</div>
                      {n.message && <div style={{ fontSize:11, color:'#64748b', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{n.message}</div>}
                      <div style={{ fontSize:9.5, color:'#94a3b8', marginTop:2 }}>
                        {n.sender_type==='admin' ? '📢 Trust Dubai' : '👥 Internal'}
                        {n.priority==='high' && <span style={{ color:'#dc2626', fontWeight:600 }}> · High</span>}
                        {' · '}{new Date(n.created_at).toLocaleDateString('en-GB')}
                      </div>
                    </div>
                  </div>
                ))}
                {unread > items.length && (
                  <div style={{ textAlign:'center', fontSize:11, color:'#94a3b8' }}>+ {unread - items.length} more</div>
                )}
              </div>
              <button onClick={goToPage}
                style={{ width:'100%', padding:'12px', borderRadius:10, border:'none', color:'#fff', fontWeight:700, fontSize:14, background:BRAND, cursor:'pointer', marginBottom:8 }}>
                View All Notifications
              </button>
              <button onClick={close}
                style={{ width:'100%', padding:'10px', borderRadius:10, border:'1px solid #e2e8f0', color:'#64748b', fontWeight:600, fontSize:13, background:'#fff', cursor:'pointer' }}>
                Close
              </button>
            </>
          ) : (
            <button onClick={close}
              style={{ width:'100%', padding:'12px', borderRadius:10, border:'none', color:'#fff', fontWeight:700, fontSize:14, background:'#10b981', cursor:'pointer' }}>
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
