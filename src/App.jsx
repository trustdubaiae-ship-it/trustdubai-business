import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './lib/toast'
import Sidebar from './components/Sidebar'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import NoCompanyPage from './pages/NoCompanyPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import ReviewsPage from './pages/ReviewsPage'
import PortfolioPage from './pages/PortfolioPage'
import PlansPage from './pages/PlansPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import LeadsPage from './pages/LeadsPage'

function Portal() {
  const { user, company, loading } = useAuth()
  const [activePage, setActivePage] = useState('dashboard')
  const [showRegister, setShowRegister] = useState(false)

  if (showRegister) return <RegisterPage onBack={() => setShowRegister(false)} />

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0d1117', gap: 16
      }}>
        <div style={{
          width: 44, height: 44,
          background: 'linear-gradient(135deg, #e8b84b, #c9952a)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: '#0d1117'
        }}>TD</div>
        <div style={{ width: 28, height: 28, border: '2px solid rgba(232,184,75,0.2)', borderTopColor: '#e8b84b', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  if (!user) return <LoginPage onRegister={() => setShowRegister(true)} />
  if (!company) return <NoCompanyPage />

  const pages = {
    dashboard:  <DashboardPage onNavigate={setActivePage} />,
    profile:    <ProfilePage />,
    reviews:    <ReviewsPage />,
    portfolio:  <PortfolioPage />,
    plans:      <PlansPage />,
    analytics:  <AnalyticsPage onNavigate={setActivePage} />,
    settings:   <SettingsPage />,
    leads:      <LeadsPage />,
  }

  const pageTitles = {
    dashboard:  'Dashboard',
    profile:    'Company Profile',
    reviews:    'Reviews',
    portfolio:  'Portfolio',
    plans:      'Plans & Billing',
    analytics:  'Analytics',
    settings:   'Settings',
    leads:      'Lead Form',
  }

  return (
    <div className="layout">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main">
        <div className="topbar">
          <div>
            <div className="topbar-title">{pageTitles[activePage]}</div>
            <div className="topbar-subtitle">business.trustdubai.ae</div>
          </div>
          <div className="topbar-right">
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'linear-gradient(135deg, #e8b84b, #c9952a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Syne', sans-serif", fontWeight: 700,
              fontSize: 13, color: '#0d1117', cursor: 'default'
            }}>
              {company?.name?.[0]?.toUpperCase() || '?'}
            </div>
          </div>
        </div>
        {pages[activePage] || pages.dashboard}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Portal />
      </ToastProvider>
    </AuthProvider>
  )
}
