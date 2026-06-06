// trustdubai-business/src/components/LoginNotificationPopup.jsx
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const BRAND = '#0099cc'
const TYPE_ICON = {
  general:'ti-bell', lead:'ti-phone', review:'ti-star',
  comment:'ti-message-circle', announcement:'ti-speakerphone', system:'ti-settings',
}

function leadSummary(l) {
  const a = l.answers || {}
  const proj = a['Project Type'] || a.category || a['Service'] || ''
  const src  = a.Source || l.source || ''
  const bits = [proj, src].filter(Boolean)
  return bits.length ? bits.join(' · ') : 'New enquiry received'
}

export default function LoginNotificationPopup({ onOpenPage }) {
  const { company, staff, role } = useAuth()
  const [open, setOpen]   = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [leadCount, setLeadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const seeAll = role === 'owner' || role === 'manager'

  useEffect(() => {
    if (!company?.id) return
    // session mein ek hi baar dikhe
    const key = `td_login_popup_${company.id}_${staff?.id || 'owner'}`
    if (sessionStorage.getItem(key)) return

    async function run() {
      // 1) Notifications
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

      // 2) New leads since the user was last shown the popup
      const leadsKey = `td_leads_seen_${company.id}_${staff?.id || 'owner'}`
      let lastSeen
      try { lastSeen = localStorage.getItem(leadsKey) } catch (e) {}
      if (!lastSeen) lastSeen = new Date(Date.now() - 3 * 864e5).toISOString() // first time: last 3 days

      let leadItems = []
      try {
        const { data: leadsData } = await supabase
          .from('lead_submissions')
          .select('id,name,source,answers,created_at')
          .eq('company_id', company.id)
          .gt('created_at', lastSeen)
          .order('created_at', { ascending:false })
          .limit(10)
        leadItems = (leadsData || []).map(l => ({
          id: 'lead-' + l.id,
          _lead: true,
          type: 'lead',
          sender_type: 'lead',
          title: `New lead: ${l.name || 'Anonymous'}`,
          message: leadSummary(l),
          created_at: l.created_at,
        }))
      } catch (e) { console.error('popup leads', e) }

      // mark "seen" baseline = now (so next login only shows newer leads)
      try { localStorage.setItem(leadsKey, new Date().toISOString()) } catch (e) {}

      // 3) Merge leads + unread notifications, newest first
      const combined = [...leadItems, ...unreadRows]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

      setItems(combined.slice(0, 5))
      setUnread(combined.length)
      setLeadCount(leadItems.length)
      setLoading(false)
      setOpen(true)
      sessionStorage.setItem(key, '1')
    }
    run()
  }, [company, staff, seeAll])

  if (!open) return null

  function close() { setOpen(false) }
  function goToPage() { close(); onOpenPage && onOpenPage() }
  function goToLeads() { close(); window.location.hash = 'leads' }

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
              <div style={{ fontSize:12, opacity:0.9, marginTop:3 }}>
                {leadCount > 0
                  ? `${leadCount} new lead${leadCount>1?'s':''} waiting — welcome back, ${staff?.name || company?.name}!`
                  : `Welcome back, ${staff?.name || company?.name}!`}
              </div>
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
                {items.map(n => {
                  const isLead = n._lead || n.type === 'lead'
                  const iconColor = isLead ? '#16a34a' : (n.sender_type==='admin' ? '#d97706' : BRAND)
                  return (
                    <div key={n.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', background: isLead ? 'rgba(22,163,74,0.07)' : '#f8fafc', borderRadius:10, border: isLead ? '1px solid rgba(22,163,74,0.18)' : '1px solid transparent' }}>
                      <i className={`ti ${TYPE_ICON[n.type]||'ti-bell'}`} style={{ fontSize:16, color:iconColor, marginTop:1, flexShrink:0 }}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#0f172a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{n.title}</div>
                        {n.message && <div style={{ fontSize:11, color:'#64748b', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{n.message}</div>}
                        <div style={{ fontSize:9.5, color:'#94a3b8', marginTop:2 }}>
                          {isLead ? '📩 New Lead' : (n.sender_type==='admin' ? '📢 Trust Dubai' : '👥 Internal')}
                          {n.priority==='high' && <span style={{ color:'#dc2626', fontWeight:600 }}> · High</span>}
                          {' · '}{new Date(n.created_at).toLocaleDateString('en-GB')}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {unread > items.length && (
                  <div style={{ textAlign:'center', fontSize:11, color:'#94a3b8' }}>+ {unread - items.length} more</div>
                )}
              </div>

              {leadCount > 0 && (
                <button onClick={goToLeads}
                  style={{ width:'100%', padding:'12px', borderRadius:10, border:'none', color:'#fff', fontWeight:700, fontSize:14, background:'#16a34a', cursor:'pointer', marginBottom:8, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                  <i className="ti ti-phone" style={{ fontSize:16 }}/> View {leadCount} New Lead{leadCount>1?'s':''}
                </button>
              )}

              <button onClick={goToPage}
                style={{ width:'100%', padding:'12px', borderRadius:10, border: leadCount>0 ? '1px solid #e2e8f0' : 'none', color: leadCount>0 ? '#475569' : '#fff', fontWeight:700, fontSize:14, background: leadCount>0 ? '#fff' : BRAND, cursor:'pointer', marginBottom:8 }}>
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
