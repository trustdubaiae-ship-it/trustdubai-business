import { useAuth } from '../lib/auth'
import {
  LayoutDashboard, User, Star, Image, CreditCard,
  BarChart2, Settings, LogOut, Shield, ExternalLink
} from 'lucide-react'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'profile', label: 'Company Profile', icon: User },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'portfolio', label: 'Portfolio', icon: Image },
  { id: 'plans', label: 'Plans & Billing', icon: CreditCard },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const planColors = {
  free: '#6e7681',
  basic: '#3b82f6',
  premium: '#e8b84b',
  enterprise: '#8b5cf6'
}

export default function Sidebar({ activePage, onNavigate }) {
  const { company, signOut } = useAuth()

  const planName = company?.plan || 'free'
  const planColor = planColors[planName] || planColors.free

  const initials = company?.name
    ? company.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?'

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">TD</div>
        <div>
          <div className="sidebar-logo-text">TrustDubai</div>
          <div className="sidebar-logo-sub">Business Portal</div>
        </div>
      </div>

      {/* Company Info */}
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
            <div className="sidebar-company-plan" style={{ color: planColor }}>
              <Shield size={10} />
              {planName.charAt(0).toUpperCase() + planName.slice(1)}
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Menu</div>
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${activePage === id ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}

        <div className="nav-section-label" style={{ marginTop: 8 }}>Quick Links</div>
        <a
          href={company?.slug ? `https://trustdubai.ae/companies/${company.slug}` : 'https://trustdubai.ae'}
          target="_blank"
          rel="noopener noreferrer"
          className="nav-item"
        >
          <ExternalLink size={16} />
          View Public Profile
        </a>
      </nav>

      {/* Bottom */}
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={signOut}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
