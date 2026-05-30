// trustdubai-business/src/components/Sidebar.jsx
import { useAuth } from '../lib/auth'
import { can } from '../lib/permissions'

const planColors = { free:'#6b7280', silver:'#64748b', gold:'#d97706', platinum:'#8b5cf6' }
const PLAN_RANK = { free:0, silver:1, gold:2, platinum:3 }
function hasAccess(userPlan, requiredPlan) {
  return (PLAN_RANK[userPlan]||0) >= (PLAN_RANK[requiredPlan]||0)
}

// har item apne specific permission se bandha
const MENU = [
  { section: 'OVERVIEW' },
  { id:'dashboard',  icon:'ti-layout-dashboard',  label:'Dashboard',            perm:'view_dashboard' },
  { id:'reviews',    icon:'ti-star',               label:'Reviews',              perm:'view_reviews' },
  { id:'analytics',  icon:'ti-chart-bar',          label:'Analytics',            perm:'view_analytics', requiredPlan:'gold' },

  { section: 'CUSTOMERS' },
  { id:'leads',      icon:'ti-message-circle',     label:'Customer Feedback',    perm:'view_leads' },
  { id:'leads',      icon:'ti-mood-smile',         label:'Customer Sentiment',   perm:'view_sentiment' },

  { section: 'REPUTATION' },
  { id:'trust_score',icon:'ti-shield-check',       label:'Trust Score',          perm:'view_trust_score' },
  { id:'reviews',    icon:'ti-chart-line',         label:'Reputation Monitor',   perm:'view_reputation' },
  { id:'reviews',    icon:'ti-list-check',         label:'Review Management',    perm:'view_reviews' },
  { id:'profile',    icon:'ti-rosette-discount-check', label:'Verification Status', perm:'view_verification' },

  { section: 'MARKETING' },
  { id:'sponsored',  icon:'ti-ad-2',               label:'Sponsored Placement',  perm:'view_sponsored' },
  { id:'portfolio',  icon:'ti-speakerphone',        label:'Promotions',           perm:'view_promotions', requiredPlan:'silver' },
  { id:'portfolio',  icon:'ti-star',               label:'Featured Listings',    perm:'view_promotions', requiredPlan:'gold' },
  { id:'analytics',  icon:'ti-trending-up',        label:'Campaign Analytics',   perm:'view_analytics', requiredPlan:'gold' },

  { section: 'BUSINESS' },
  { id:'profile',    icon:'ti-building-store',     label:'Business Profile',     perm:'view_profile' },
  { id:'portfolio',  icon:'ti-photo',              label:'Portfolio',            perm:'view_portfolio' },
  { id:'leads',      icon:'ti-mail',               label:'Lead Form',            perm:'view_leads' },
  { id:'staff',      icon:'ti-users',              label:'Team Members',         perm:'manage_staff' },
  { id:'settings',   icon:'ti-bell',               label:'Notifications',        perm:'view_dashboard' },

  { section: 'SETTINGS' },
  { id:'plans',      icon:'ti-credit-card',        label:'Plans & Billing',      perm:'view_plans' },
  { id:'settings',   icon:'ti-plug',               label:'Integrations',         perm:'manage_settings' },
  { id:'settings',   icon:'ti-settings',           label:'Preferences',          perm:'manage_settings' },
]

export default function Sidebar({ activePage, onNavigate }) {
  const { company, staff, role, signOut } = useAuth()
  const planName  = company?.plan || 'free'
  const planColor = planColors[planName] || planColors.free
  const perms     = staff?.permissions || null
  const initials  = company?.name
    ? company.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '?'
  const isExpired = company?.plan_expires_at
    ? new Date(company.plan_expires_at) < new Date() : false

  const planIcons = { free:'ti-building', silver:'ti-medal', gold:'ti-star', platinum:'ti-diamond' }

  function handleNav(item) {
    if (item.requiredPlan && !hasAccess(planName, item.requiredPlan)) { onNavigate('plans'); return }
    onNavigate(item.id)
  }

  // section tabhi dikhe jab uske neeche koi allowed item ho
  const visibleMenu = []
  for (let i = 0; i < MENU.length; i++) {
    const item = MENU[i]
    if (item.section) {
      let hasChild = false
      for (let j = i + 1; j < MENU.length && !MENU[j].section; j++) {
        if (can(role, perms, MENU[j].perm)) { hasChild = true; break }
      }
      if (hasChild) visibleMenu.push(item)
    } else if (can(role, perms, item.perm)) {
      visibleMenu.push(item)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">TD</div>
        <div>
          <div className="sidebar-logo-text">TrustDubai</div>
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
            <div className="sidebar-company-plan" style={{ color: isExpired?'#ef4444':planColor }}>
              <i className={`ti ${planIcons[planName]||'ti-building'}`} style={{ fontSize:9 }}/>
              {isExpired ? 'Expired' : planName.charAt(0).toUpperCase()+planName.slice(1)}
            </div>
          </div>
        </div>
      )}

      <nav className="sidebar-nav">
        {visibleMenu.map((item, i) => {
          if (item.section) return (
            <div key={`sec-${i}`} className="nav-section-label">{item.section}</div>
          )
          const locked   = item.requiredPlan && !hasAccess(planName, item.requiredPlan)
          const isActive = activePage === item.id
          return (
            <button key={`${item.id}-${i}`}
              className={`nav-item${isActive?' active':''}`}
              onClick={() => handleNav(item)}
              style={{ opacity: locked ? 0.55 : 1 }}
              title={locked ? `Requires ${item.requiredPlan} plan` : ''}>
              <i className={`ti ${item.icon}`}/>
              {item.label}
              {locked && (
                <span style={{ marginLeft:'auto', background:'rgba(232,184,75,0.15)', color:'#d97706', fontSize:7.5, fontWeight:700, padding:'1px 5px', borderRadius:99 }}>
                  {item.requiredPlan.toUpperCase()}
                </span>
              )}
            </button>
          )
        })}

        <div className="nav-section-label" style={{ marginTop:4 }}>QUICK LINKS</div>
        <button className="nav-item" onClick={() => window.open(`https://trustdubai.ae/${company?.slug||''}`, '_blank')}>
          <i className="ti ti-external-link"/>
          View Public Profile
        </button>
      </nav>

      {planName === 'free' && role === 'owner' && (
        <div style={{ margin:'8px 10px', background:'rgba(232,184,75,0.08)', border:'0.5px solid rgba(232,184,75,0.2)', borderRadius:10, padding:'10px 12px', cursor:'pointer' }}
          onClick={() => onNavigate('plans')}>
          <div style={{ fontSize:11, fontWeight:700, color:'#d97706', marginBottom:3 }}>Upgrade Plan</div>
          <div style={{ fontSize:10, color:'#94a3b8', lineHeight:1.5 }}>Unlock analytics & priority listing</div>
        </div>
      )}

      {isExpired && planName !== 'free' && role === 'owner' && (
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
    </aside>
  )
}
