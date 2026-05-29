import { useAuth } from '../lib/auth'
import {
  LayoutDashboard, User, Star, Image, CreditCard,
  BarChart2, Settings, LogOut, Shield, ExternalLink, MessageSquare, Lock
} from 'lucide-react'

const planColors = {
  free:     '#6e7681',
  silver:   '#94a3b8',
  gold:     '#e8b84b',
  platinum: '#8b5cf6'
}

// Minimum plan required for each feature
const PLAN_REQUIRED = {
  analytics: 'gold',
}

const PLAN_RANK = { free: 0, silver: 1, gold: 2, platinum: 3 }

function hasAccess(userPlan, requiredPlan) {
  return (PLAN_RANK[userPlan] || 0) >= (PLAN_RANK[requiredPlan] || 0)
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'profile',   label: 'Company Profile',  icon: User },
  { id: 'reviews',   label: 'Reviews',          icon: Star },
  { id: 'portfolio', label: 'Portfolio',         icon: Image },
  { id: 'leads',     label: 'Lead Form',         icon: MessageSquare },
  { id: 'plans',     label: 'Plans & Billing',   icon: CreditCard },
  { id: 'analytics', label: 'Analytics',         icon: BarChart2, requiredPlan: 'gold' },
  { id: 'settings',  label: 'Settings',          icon: Settings },
]

export default function Sidebar({ activePage, onNavigate }) {
  const { company, signOut } = useAuth()
  const planName = company?.plan || 'free'
  const planColor = planColors[planName] || planColors.free

  const initials = company?.name
    ? company.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?'

  const profileUrl = company?.slug
    ? 'https://trustdubai.ae/' + company.slug
    : 'https://trustdubai.ae'

  // Expiry check
  const isExpired = company?.plan_expires_at
    ? new Date(company.plan_expires_at) < new Date()
    : false

  function handleNavClick(item) {
    if (item.requiredPlan && !hasAccess(planName, item.requiredPlan)) {
      onNavigate('plans')
      return
    }
    onNavigate(item.id)
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
            {company.logo_url
              ? <img src={company.logo_url} alt={company.name} />
              : initials
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-company-name" style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>{company.name}</div>
            <div className="sidebar-company-plan" style={{ color: isExpired ? '#ef4444' : planColor }}>
              <Shield size={10} />
              {isExpired
                ? 'Expired'
                : planName.charAt(0).toUpperCase() + planName.slice(1)}
            </div>
          </div>
        </div>
      )}

      <nav className="sidebar-nav">
        <div className="nav-section-label">Menu</div>
        {navItems.map(({ id, label, icon: Icon, requiredPlan }) => {
          const locked = requiredPlan && !hasAccess(planName, requiredPlan)
          const isActive = activePage === id

          return (
            <button
              key={id}
              className={'nav-item ' + (isActive ? 'active' : '')}
              onClick={() => handleNavClick({ id, requiredPlan })}
              style={{
                opacity: locked ? 0.6 : 1,
                position: 'relative'
              }}
              title={locked ? 'Requires ' + requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1) + ' plan' : ''}
            >
              <Icon size={16} />
              {label}
              {locked && (
                <span style={{
                  marginLeft: 'auto',
                  display: 'flex', alignItems: 'center', gap: 3,
                  background: 'rgba(232,184,75,0.15)',
                  color: '#e8b84b',
                  fontSize: 9, fontWeight: 700,
                  padding: '2px 6px', borderRadius: 99,
                  letterSpacing: '0.05em'
                }}>
                  <Lock size={8} />
                  {requiredPlan.toUpperCase()}
                </span>
              )}
            </button>
          )
        })}

        <div className="nav-section-label" style={{ marginTop: 8 }}>Quick Links</div>
        <button
          className="nav-item"
          onClick={() => window.open(profileUrl, '_blank')}
        >
          <ExternalLink size={16} />
          View Public Profile
        </button>
      </nav>

      {/* Upgrade nudge for free plan */}
      {planName === 'free' && (
        <div style={{
          margin: '8px 12px',
          background: 'rgba(232,184,75,0.08)',
          border: '1px solid rgba(232,184,75,0.2)',
          borderRadius: 10, padding: '10px 12px',
          cursor: 'pointer'
        }} onClick={() => onNavigate('plans')}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e8b84b', marginBottom: 3 }}>
            ⚡ Upgrade Plan
          </div>
          <div style={{ fontSize: 10, color: '#6e7681', lineHeight: 1.5 }}>
            Unlock analytics, more photos & priority listing
          </div>
        </div>
      )}

      {/* Expiry warning in sidebar */}
      {isExpired && planName !== 'free' && (
        <div style={{
          margin: '8px 12px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 10, padding: '10px 12px',
          cursor: 'pointer'
        }} onClick={() => onNavigate('plans')}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 3 }}>
            ⚠️ Plan Expired
          </div>
          <div style={{ fontSize: 10, color: '#6e7681', lineHeight: 1.5 }}>
            Renew to restore your features
          </div>
        </div>
      )}

      <div className="sidebar-bottom">
        <button className="nav-item" onClick={signOut}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
