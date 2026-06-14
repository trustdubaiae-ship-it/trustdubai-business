import { useState, Fragment } from 'react'
import { useAuth } from '../lib/auth'
import { can } from '../lib/permissions'
import UpgradeLockModal from './UpgradeLockModal'

const planColors = { free:'#6b7280', silver:'#64748b', gold:'#d97706', platinum:'#8b5cf6' }
const PLAN_RANK = { free:0, silver:1, gold:2, platinum:3 }
function hasAccess(userPlan, requiredPlan) {
  return (PLAN_RANK[userPlan]||0) >= (PLAN_RANK[requiredPlan]||0)
}

const CONTROL_PANEL_PAGES = ['controlpanel','verification','verificationStatus','plans','settings']

// Which plan unlocks each premium feature — used only to label the crown 👑.
// (Display hint for the trial upsell; does not gate anything by itself.)
const FEATURE_UNLOCK_PLAN = {
  lead_email:        'silver',
  reply_reviews:     'silver',
  analytics:         'gold',
  featured_homepage: 'platinum',
}
const ADDON_UNLOCK_LABEL = {
  crm:       'Add-on',
  quotation: 'Add-on',
  projects:  'Add-on',
  ai:        'Add-on',
}

// soon:true  → feature not built yet, opens a Coming Soon page (still navigable, shows "Soon" tag)
export const MENU = [
  { section: 'MAIN' },
  { id:'controlwall',   icon:'ti-layout-grid',      label:'Control Wall',     perm:'view_dashboard' },
  { id:'dashboard',     icon:'ti-layout-dashboard', label:'Command Center',   perm:'view_dashboard' },
  { id:'revenueengine', icon:'ti-gauge',            label:'Revenue Engine',   perm:'view_leads' },
  { id:'inbox',         icon:'ti-mail',             label:'Inbox',            perm:'view_dashboard' },
  { id:'notifications', icon:'ti-bell',             label:'Notifications',    perm:'view_dashboard' },

  { section: 'LEAD HUB' },
  { id:'leadengine', icon:'ti-bolt',           label:'Lead Engine',      perm:'view_leads' },
  { id:'leads',      icon:'ti-forms',          label:'Lead Hub',         perm:'view_leads', featureKey:'lead_email' },
  { id:'meetings',   icon:'ti-calendar-event', label:'Planner',          perm:'view_leads' },
  { id:'metaads',    icon:'ti-ad-2',           label:'Meta Ads',         perm:'view_leads', addon:'crm', soon:true },

  { section: 'SALES & QUOTES' },
  { id:'quotations',    icon:'ti-file-invoice', label:'Quotations',         perm:'view_leads' },
  { id:'invoices',      icon:'ti-receipt',      label:'Invoices',           perm:'view_leads' },
  { id:'ledger',        icon:'ti-book-2',       label:'Ledger',             perm:'view_leads' },
  { id:'quotelibrary',  icon:'ti-books',        label:'Description Library',perm:'view_leads' },
  { id:'quoteSettings', icon:'ti-settings',     label:'Quote Settings',     perm:'view_profile' },
  { id:'quoteapprovals',icon:'ti-checklist',    label:'Quote Approvals',    perm:'view_leads', addon:'quotation', soon:true },
  { id:'aiquote',       icon:'ti-sparkles',     label:'AI Quote Builder',   perm:'view_leads' },

  { section: 'PROJECTS & OPS' },
  { id:'projects',  icon:'ti-briefcase',     label:'Projects',          perm:'view_profile', addon:'projects', soon:true },
  { id:'materials', icon:'ti-package',       label:'Material Requests', perm:'view_profile', addon:'projects', soon:true },
  { id:'expenses',  icon:'ti-coin',          label:'Site Expenses',     perm:'view_profile', addon:'projects', soon:true },

  { section: 'AI & CRM' },
  { id:'aiassistant', icon:'ti-robot',          label:'AI Assistant',   perm:'view_dashboard', addon:'ai' },
  { id:'organizer',   icon:'ti-calendar-bolt',  label:'My Organizer',   perm:'view_dashboard' },

  { section: 'REPUTATION' },
  { id:'trust',   icon:'ti-shield-check', label:'Trust Score', perm:'view_dashboard' },
  { id:'reviews', icon:'ti-star',         label:'Reviews',     perm:'view_reviews', featureKey:'reply_reviews' },

  { section: 'MY PROFILE' },
  { id:'profile',    icon:'ti-building-store',   label:'Business Profile', perm:'view_profile' },
  { id:'portfolio',  icon:'ti-photo',            label:'Portfolio',        perm:'view_portfolio' },
  { id:'documents',  icon:'ti-file-certificate', label:'Verification',     perm:'view_profile' },
  { id:'team',       icon:'ti-users-group',      label:'Our Team',         perm:'view_profile' },
  { id:'faq',        icon:'ti-help-circle',      label:'FAQ',              perm:'view_profile' },

  { section: 'GROWTH' },
  { id:'analytics',  icon:'ti-chart-bar', label:'Analytics',           perm:'view_analytics', featureKey:'analytics' },
  { id:'sponsored',  icon:'ti-ad-2',      label:'Sponsored Placement', perm:'view_sponsored', featureKey:'featured_homepage' },

  { section: 'TEAM & ACCESS' },
  { id:'staff', icon:'ti-key', label:'Staff & Access', perm:'manage_staff' },

  { section: 'SETTINGS' },
  { id:'controlpanel', icon:'ti-adjustments', label:'Control Panel', perm:'view_profile' },
]

// add-on key → display name (for the upsell modal)
const ADDON_NAMES = {
  crm:       'CRM / Lead Engine',
  quotation: 'Quotation Suite',
  projects:  'Projects & Ops',
  ai:        'AI Assistant',
}

export default function Sidebar({ activePage, onNavigate, limitedMode = false, limitedPages = [], open = false }) {
  const { company, staff, role, signOut, hasFeature, hasAddon, isTrial, trialDaysLeft } = useAuth()
  const planName  = company?.plan || 'free'
  const planColor = planColors[planName] || planColors.free
  const perms     = staff?.permissions || null
  const initials  = company?.name
    ? company.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '?'
  const isExpired = company?.plan_expires_at
    ? new Date(company.plan_expires_at) < new Date() : false

  const planIcons = { free:'ti-building', silver:'ti-medal', gold:'ti-star', platinum:'ti-diamond' }

  const [lockModal, setLockModal] = useState({ open:false, name:'' })
  const [restrictModal, setRestrictModal] = useState({ open:false, name:'' })
  const [addonModal, setAddonModal] = useState({ open:false, name:'', addon:'' })

  // Share Profile + QR
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const slug        = company?.slug || ''
  const publicLink  = `https://trustdubai.ae/${slug}`
  const profileQrSrc= `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=14&data=${encodeURIComponent(publicLink)}`

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(publicLink)
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch (e) {
      const ta = document.createElement('textarea')
      ta.value = publicLink; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch (e2) {}
      document.body.removeChild(ta)
    }
  }
  async function downloadProfileQR() {
    try {
      const res = await fetch(profileQrSrc)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(company?.name || 'profile').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) { window.open(profileQrSrc, '_blank') }
  }
  function shareProfileWhatsApp() {
    const text = `Check out ${company?.name || 'our'} verified profile on Tritova: ${publicLink}`
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')
  }

  // safe fallback if hasAddon not provided by older auth
  const checkAddon = (k) => (typeof hasAddon === 'function' ? hasAddon(k) : false)

  // priority: permission lock → add-on lock → plan/feature lock.
  // soon items (with add-on enabled) navigate to Coming Soon page.
  function handleNav(item, permLocked, featureLocked, addonLocked) {
    if (permLocked)  { setRestrictModal({ open:true, name:item.label }); return }
    if (addonLocked) { setAddonModal({ open:true, name:item.label, addon:item.addon }); return }
    if (!item.soon && featureLocked) { setLockModal({ open:true, name:item.label }); return }
    onNavigate(item.id)
  }

  // Build menu WITHOUT hiding items on permission.
  const visibleMenu = []
  for (let i = 0; i < MENU.length; i++) {
    const item = MENU[i]
    if (item.section) {
      let hasChild = false
      for (let j = i + 1; j < MENU.length && !MENU[j].section; j++) { hasChild = true; break }
      if (hasChild) visibleMenu.push(item)
    } else {
      visibleMenu.push({ ...item, permLocked: !can(role, perms, item.perm) })
    }
  }

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">T</div>
        <div>
          <div className="sidebar-logo-text">Tritova</div>
          <div className="sidebar-logo-sub">Business Portal</div>
        </div>
      </div>

      {company && (
        <div className="sidebar-company">
          <div className="sidebar-company-avatar">
            {company.logo_url ? <img src={company.logo_url} alt={company.name}/> : initials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="sidebar-company-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {company.name}
            </div>
            <div className="sidebar-company-plan" style={{ color: isTrial ? '#8b5cf6' : (isExpired?'#ef4444':planColor) }}>
              <i className={`ti ${isTrial ? 'ti-rocket' : (planIcons[planName]||'ti-building')}`} style={{ fontSize:9 }}/>
              {isTrial ? 'Launch Plan' : (isExpired ? 'Expired' : planName.charAt(0).toUpperCase()+planName.slice(1))}
            </div>
          </div>
        </div>
      )}

      {/* Launch Plan countdown banner — visible only while the trial is active */}
      {isTrial && (
        <div
          onClick={() => onNavigate('plans')}
          style={{ margin:'8px 10px', background:'linear-gradient(135deg, rgba(139,92,246,0.16), rgba(0,153,204,0.12))', border:'0.5px solid rgba(139,92,246,0.35)', borderRadius:10, padding:'10px 12px', cursor:'pointer' }}
          title="You're on the free Launch Plan — full access for a limited time">
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
            <i className="ti ti-rocket" style={{ fontSize:13, color:'#8b5cf6' }}/>
            <span style={{ fontSize:11, fontWeight:700, color:'#8b5cf6' }}>Launch Plan active</span>
          </div>
          <div style={{ fontSize:10, color:'var(--text2, #94a3b8)', lineHeight:1.5 }}>
            <b style={{ color:'#8b5cf6' }}>{trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'}</b> of full access left · Upgrade to keep these features
          </div>
        </div>
      )}

      <nav className="sidebar-nav">
        {visibleMenu.map((item, i) => {
          if (item.section) return (
            <div key={`sec-${i}`} className="nav-section-label">{item.section}</div>
          )

          const permLocked   = item.permLocked
          // add-on lock: item belongs to an add-on the company hasn't purchased
          const addonLocked  = !permLocked && !!item.addon && !checkAddon(item.addon)
          const limitLocked  = !permLocked && !addonLocked && limitedMode && !item.soon && !limitedPages.includes(item.id)
          const featureLocked= !permLocked && !addonLocked && !limitLocked && !item.soon && item.featureKey ? !hasFeature(item.featureKey) : false
          const locked       = permLocked || addonLocked || limitLocked || featureLocked
          // a soon item is only "available" (shows SOON) if its add-on is owned (or it has no add-on)
          const showSoon     = item.soon && !addonLocked

          // Crown 👑 — shown on premium features (plan-feature or add-on items).
          // During the trial these are unlocked, so the crown signals "this is a
          // paid feature you're trying for free". After trial it sits next to the lock.
          const isPremium    = !!item.featureKey || !!item.addon
          const unlockPlan   = item.featureKey ? (FEATURE_UNLOCK_PLAN[item.featureKey] || null) : null
          const crownTitle   = item.addon
            ? `${ADDON_NAMES[item.addon] || 'Add-on'} feature`
            : (unlockPlan ? `Unlocks on ${unlockPlan.charAt(0).toUpperCase()+unlockPlan.slice(1)} plan` : 'Premium feature')
          const showCrown    = isPremium && !permLocked

          const isActive = !permLocked && (item.id === 'controlpanel'
            ? CONTROL_PANEL_PAGES.includes(activePage)
            : activePage === item.id)

          const titleText = permLocked
            ? 'Restricted — contact your company admin'
            : (addonLocked ? `${ADDON_NAMES[item.addon] || 'Add-on'} — add this service to unlock`
              : (item.soon ? 'Coming soon'
                : (featureLocked ? 'Upgrade plan to unlock'
                  : (limitLocked ? 'Available after approval' : (isPremium && isTrial ? crownTitle + ' · included in Launch Plan' : '')))))

          // right-side adornment: ADD-ON tag / SOON / lock / crown
          let rightEl = null
          if (addonLocked) {
            rightEl = (
              <span style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:3, fontSize:8.5, fontWeight:700, letterSpacing:'.03em', color:'#0099cc', background:'rgba(0,153,204,0.12)', border:'0.5px solid rgba(0,153,204,0.25)', padding:'1px 6px', borderRadius:6 }}>
                <i className="ti ti-plus" style={{ fontSize:9 }}/> ADD-ON
              </span>
            )
          } else if (showSoon) {
            rightEl = (
              <span style={{ marginLeft:'auto', fontSize:8.5, fontWeight:700, letterSpacing:'.03em', color:'#d97706', background:'rgba(245,158,11,0.14)', border:'0.5px solid rgba(245,158,11,0.25)', padding:'1px 6px', borderRadius:6 }}>SOON</span>
            )
          } else if (locked) {
            rightEl = <i className="ti ti-lock" style={{ marginLeft:'auto', fontSize:11, color:'#94a3b8' }}/>
          } else if (showCrown) {
            // unlocked premium → crown. Gold while trialing (you're enjoying it), muted otherwise.
            rightEl = (
              <i className="ti ti-crown"
                title={crownTitle}
                style={{ marginLeft:'auto', fontSize:12, color: isTrial ? '#f59e0b' : '#cbd5e1' }} />
            )
          }

          const navBtn = (
            <button key={`${item.id}-${i}`}
              className={`nav-item${isActive?' active':''}`}
              onClick={() => handleNav(item, permLocked, featureLocked, addonLocked)}
              style={{ opacity: (locked && !showSoon) ? 0.5 : 1, cursor: permLocked ? 'not-allowed' : 'pointer' }}
              title={titleText}>
              <i className={`ti ${item.icon}`}/>
              {item.label}
              {rightEl}
            </button>
          )

          // Inject "Share Profile" right next to Command Center (in MAIN).
          if (item.id === 'dashboard') {
            return (
              <Fragment key={`grp-${item.id}-${i}`}>
                {navBtn}
                <button className="nav-item" onClick={() => { setCopied(false); setShareOpen(true) }} title="Share your public profile (link + QR)">
                  <i className="ti ti-qrcode"/>
                  Share Profile
                </button>
              </Fragment>
            )
          }
          return navBtn
        })}

        <div className="nav-section-label" style={{ marginTop:4 }}>QUICK LINKS</div>
        <button className="nav-item" onClick={() => window.open(`https://trustdubai.ae/${company?.slug||''}`, '_blank')}>
          <i className="ti ti-external-link"/>
          View Public Profile
        </button>
      </nav>

      {/* Upgrade nudge — only when NOT trialing (during trial the countdown banner covers this) */}
      {!isTrial && planName === 'free' && role === 'owner' && (
        <div style={{ margin:'8px 10px', background:'rgba(232,184,75,0.08)', border:'0.5px solid rgba(232,184,75,0.2)', borderRadius:10, padding:'10px 12px', cursor:'pointer' }}
          onClick={() => onNavigate('plans')}>
          <div style={{ fontSize:11, fontWeight:700, color:'#d97706', marginBottom:3 }}>Upgrade Plan</div>
          <div style={{ fontSize:10, color:'#94a3b8', lineHeight:1.5 }}>Unlock analytics & priority listing</div>
        </div>
      )}

      {!isTrial && isExpired && planName !== 'free' && role === 'owner' && (
        <div style={{ margin:'8px 10px', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:10, padding:'10px 12px', cursor:'pointer' }}
          onClick={() => onNavigate('plans')}>
          <div style={{ fontSize:11, fontWeight:700, color:'#ef4444', marginBottom:3 }}>Plan Expired</div>
          <div style={{ fontSize:10, color:'#94a3b8', lineHeight:1.5 }}>Renew to restore features</div>
        </div>
      )}

      <div className="sidebar-bottom">
        <button className="nav-item" onClick={signOut}>
          <i className="ti ti-logout"/>
          Sign Out
        </button>
      </div>

      <UpgradeLockModal
        open={lockModal.open}
        featureName={lockModal.name}
        currentPlan={planName}
        onClose={() => setLockModal({ open:false, name:'' })}
        onUpgrade={() => { setLockModal({ open:false, name:'' }); onNavigate('plans') }}
      />

      {shareOpen && (
        <div
          onClick={() => setShareOpen(false)}
          style={{ position:'fixed', inset:0, zIndex:80, background:'rgba(0,0,0,0.5)',
            display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:16, width:'min(440px, 100%)', maxHeight:'calc(100vh - 32px)', overflowY:'auto' }}>

            <div style={{ padding:'16px 18px', borderBottom:'0.5px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:17, fontWeight:700, color:'var(--text)' }}>Share your profile</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{company?.name || 'Your business'}</div>
              </div>
              <button onClick={() => setShareOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text3)', fontSize:20, flexShrink:0, marginLeft:10 }}><i className="ti ti-x" /></button>
            </div>

            <div style={{ padding:18 }}>
              {!slug ? (
                <div style={{ textAlign:'center', padding:'24px 8px' }}>
                  <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(245,158,11,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                    <i className="ti ti-link-off" style={{ fontSize:24, color:'#d97706' }}/>
                  </div>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:6 }}>Your public link isn't ready yet</div>
                  <div style={{ fontSize:12.5, color:'var(--text2)', lineHeight:1.6, marginBottom:18 }}>Complete your business profile to get a shareable Tritova profile URL and QR code.</div>
                  <button onClick={() => { setShareOpen(false); onNavigate('profile') }}
                    style={{ padding:'10px 18px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                    Complete profile →
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:18 }}>
                    <div style={{ background:'#fff', padding:14, borderRadius:14, border:'0.5px solid var(--border)' }}>
                      <img src={profileQrSrc} alt="Profile QR code" width={200} height={200} style={{ display:'block', width:200, height:200 }} />
                    </div>
                    <div style={{ fontSize:11.5, color:'var(--text3)', marginTop:10, textAlign:'center', maxWidth:320, lineHeight:1.5 }}>
                      Customers scan this to view your <b style={{ color:'var(--text2)' }}>verified Tritova profile</b> — reviews, work, trust score &amp; contact.
                    </div>
                  </div>

                  <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:6, letterSpacing:'.3px' }}>Profile link</div>
                  <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                    <input readOnly value={publicLink} onFocus={e => e.target.select()}
                      style={{ flex:1, minWidth:0, padding:'10px 12px', border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)', borderRadius:8, fontSize:12.5, boxSizing:'border-box', fontFamily:'inherit' }} />
                    <button onClick={copyProfileLink}
                      style={{ padding:'0 16px', borderRadius:8, background: copied ? '#10b981' : '#0099cc', color:'#fff', border:'none', cursor:'pointer', fontSize:12.5, fontWeight:600, whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                      <i className={'ti ' + (copied ? 'ti-check' : 'ti-copy')} style={{ fontSize:14 }} /> {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <button onClick={downloadProfileQR}
                      style={{ padding:11, borderRadius:8, background:'var(--bg2)', color:'var(--text)', border:'0.5px solid var(--border)', cursor:'pointer', fontSize:12.5, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                      <i className="ti ti-download" style={{ fontSize:15 }} /> Download QR
                    </button>
                    <button onClick={shareProfileWhatsApp}
                      style={{ padding:11, borderRadius:8, background:'#22c55e', color:'#fff', border:'none', cursor:'pointer', fontSize:12.5, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                      <i className="ti ti-brand-whatsapp" style={{ fontSize:15 }} /> Share
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {restrictModal.open && (
        <div
          onClick={() => setRestrictModal({ open:false, name:'' })}
          style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.45)',
            display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:16, width:'100%', maxWidth:380, padding:24, textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(220,38,38,0.1)',
              display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <i className="ti ti-lock" style={{ fontSize:24, color:'#dc2626' }}/>
            </div>
            <h4 style={{ margin:'0 0 8px', fontSize:16, fontWeight:700, color:'var(--text)' }}>Access Restricted</h4>
            <p style={{ margin:'0 0 18px', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
              Restricted. Please contact {company?.name || 'your company'} admin.
            </p>
            <button
              onClick={() => setRestrictModal({ open:false, name:'' })}
              style={{ width:'100%', padding:'11px', borderRadius:9, border:'none', color:'#fff',
                fontWeight:600, fontSize:13, background:'#0099cc', cursor:'pointer' }}>
              OK
            </button>
          </div>
        </div>
      )}

      {addonModal.open && (
        <div
          onClick={() => setAddonModal({ open:false, name:'', addon:'' })}
          style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.45)',
            display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:16, width:'100%', maxWidth:400, padding:24, textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(0,153,204,0.1)',
              display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <i className="ti ti-puzzle" style={{ fontSize:24, color:'#0099cc' }}/>
            </div>
            <h4 style={{ margin:'0 0 8px', fontSize:16, fontWeight:700, color:'var(--text)' }}>
              {ADDON_NAMES[addonModal.addon] || 'Add-on Service'}
            </h4>
            <p style={{ margin:'0 0 6px', fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
              <b style={{ color:'var(--text)' }}>{addonModal.name}</b> is part of the {ADDON_NAMES[addonModal.addon] || 'add-on'} service.
            </p>
            <p style={{ margin:'0 0 18px', fontSize:12.5, color:'var(--text3)', lineHeight:1.6 }}>
              This add-on isn't active on your account yet. Add it anytime to unlock these features — your current plan stays the same.
            </p>
            <div style={{ display:'flex', gap:9 }}>
              <button
                onClick={() => setAddonModal({ open:false, name:'', addon:'' })}
                style={{ flex:1, padding:'11px', borderRadius:9, border:'0.5px solid var(--border)', color:'var(--text2)',
                  fontWeight:600, fontSize:13, background:'transparent', cursor:'pointer' }}>
                Maybe later
              </button>
              <button
                onClick={() => { setAddonModal({ open:false, name:'', addon:'' }); onNavigate('plans') }}
                style={{ flex:1, padding:'11px', borderRadius:9, border:'none', color:'#fff',
                  fontWeight:600, fontSize:13, background:'#0099cc', cursor:'pointer' }}>
                Add this service
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
