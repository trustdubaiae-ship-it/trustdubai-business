// trustdubai-business/src/App.jsx
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
import SponsoredPage from './pages/SponsoredPage'
import StaffManagement from './pages/StaffManagement'

const ROLE_LABEL = {
  owner: 'Owner', manager: 'Manager', sales: 'Sales', engineer: 'Engineer', staff: 'Staff',
}

function Portal() {
  const { user, company, staff, role, loading, signOut } = useAuth()
  const [activePage,   setActivePage]   = useState('dashboard')
  const [showRegister, setShowRegister] = useState(false)
  const [showProfile,  setShowProfile]  = useState(false)

  if (showRegister) return <RegisterPage onBack={() => setShowRegister(false)} />

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#f8fafc', gap:16 }}>
      <div style={{ width:44, height:44, background:'linear-gradient(135deg,#e8b84b,#c9952a)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:18, color:'#0d1117' }}>TD</div>
      <div style={{ width:28, height:28, border:'2px solid rgba(232,184,75,0.2)', borderTopColor:'#e8b84b', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize:12, color:'#94a3b8' }}>Loading TrustDubai Business...</div>
    </div>
  )

  if (!user)    return <LoginPage onRegister={() => setShowRegister(true)} />
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
    sponsored:  <SponsoredPage onNavigate={setActivePage} />,
    staff:      <StaffManagement />,
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
    sponsored:  'Sponsored Placement',
    staff:      'Team / Staff',
  }

  const planColors = { free:'#6b7280', silver:'#64748b', gold:'#d97706', platinum:'#8b5cf6' }
  const planName   = company?.plan || 'free'
  const isPlatinum = planName === 'platinum'
  const pageBg     = isPlatinum ? '#0f0e1a' : '#f8fafc'

  // logged-in person ka display naam
  const displayName  = staff?.name || company?.name || 'User'
  const displayEmail = user?.email || ''
  const roleLabel    = ROLE_LABEL[role] || 'Member'
  const avatarLetter = (displayName?.[0] || '?').toUpperCase()

  return (
    <div className="layout" style={{ background: pageBg }}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main" style={{ background: pageBg }}>

        {/* Topbar */}
        <div className="topbar" style={{ background: isPlatinum?'#161b2e':'var(--card)', borderBottom:`0.5px solid ${isPlatinum?'rgba(139,92,246,0.2)':'var(--border)'}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#e8b84b,#c9952a)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14, color:'#0d1117' }}>
              {company?.name?.[0]?.toUpperCase()||'?'}
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color: isPlatinum?'#f1f5f9':'var(--text)' }}>
                {company?.name||'My Business'}
              </div>
              <div style={{ fontSize:9, color: isPlatinum?'rgba(167,139,250,0.7)':'var(--text3)', marginTop:1 }}>
                {pageTitles[activePage]} · business.trustdubai.ae
              </div>
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ background: isPlatinum?'rgba(255,255,255,0.05)':'var(--bg2)', border:`0.5px solid ${isPlatinum?'rgba(255,255,255,0.08)':'var(--border)'}`, borderRadius:20, padding:'6px 12px', display:'flex', alignItems:'center', gap:6, minWidth:180 }}>
              <i className="ti ti-search" style={{ fontSize:11, color: isPlatinum?'rgba(255,255,255,0.3)':'var(--text3)' }}/>
              <input placeholder="Global search..." style={{ border:'none', background:'none', outline:'none', fontSize:10, color: isPlatinum?'rgba(255,255,255,0.6)':'var(--text)', width:'100%' }}/>
            </div>
            <div style={{ background: isPlatinum?'rgba(255,255,255,0.05)':'var(--bg2)', border:`0.5px solid ${isPlatinum?'rgba(255,255,255,0.08)':'var(--border)'}`, borderRadius:8, padding:'5px 10px', fontSize:9, color: isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)', display:'flex', alignItems:'center', gap:5 }}>
              <i className="ti ti-calendar" style={{ fontSize:10 }}/>
              Last 30 Days
              <i className="ti ti-chevron-down" style={{ fontSize:9 }}/>
            </div>
            <div style={{ position:'relative' }}>
              <i className="ti ti-bell" style={{ fontSize:18, color: isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)', cursor:'pointer' }}/>
              <div style={{ position:'absolute', top:-2, right:-2, width:7, height:7, background:'#ef4444', borderRadius:'50%', border:`1.5px solid ${isPlatinum?'#161b2e':'var(--card)'}` }}/>
            </div>
            <i className="ti ti-message-circle" style={{ fontSize:18, color: isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)', cursor:'pointer' }}/>
            <div style={{ background: planName==='gold'?'#fffbeb': planName==='platinum'?'rgba(139,92,246,0.15)':'var(--bg2)', border:`0.5px solid ${planName==='gold'?'#fcd34d': planName==='platinum'?'rgba(139,92,246,0.3)':'var(--border)'}`, borderRadius:8, padding:'4px 10px', fontSize:9, color: planColors[planName], fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
              <i className={`ti ${planName==='platinum'?'ti-diamond': planName==='gold'?'ti-star':'ti-building'}`} style={{ fontSize:10 }}/>
              {planName.charAt(0).toUpperCase()+planName.slice(1)} Plan
            </div>

            {/* PROFILE avatar + dropdown */}
            <div style={{ position:'relative' }}>
              <div
                onClick={() => setShowProfile(v => !v)}
                title={`${displayName} · ${displayEmail}`}
                style={{ width:32, height:32, borderRadius:8, background:'#0099cc', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, color:'#fff', cursor:'pointer' }}>
                {avatarLetter}
              </div>

              {showProfile && (
                <>
                  {/* click-away */}
                  <div onClick={() => setShowProfile(false)}
                    style={{ position:'fixed', inset:0, zIndex:40 }}/>
                  <div style={{ position:'absolute', right:0, top:42, zIndex:50, width:240,
                    background:'#fff', borderRadius:12, boxShadow:'0 10px 30px rgba(0,0,0,0.15)', border:'1px solid #eef2f6', overflow:'hidden' }}>
                    {/* header */}
                    <div style={{ padding:14, display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #f1f5f9' }}>
                      <div style={{ width:40, height:40, borderRadius:'50%', background:'#0099cc', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>
                        {avatarLetter}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayName}</div>
                        <div style={{ fontSize:11, color:'#64748b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayEmail}</div>
                      </div>
                    </div>
                    {/* details */}
                    <div style={{ padding:'10px 14px', fontSize:12, color:'#475569', display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ color:'#94a3b8' }}>Company</span>
                        <span style={{ fontWeight:600, color:'#0f172a' }}>{company?.name}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ color:'#94a3b8' }}>Role</span>
                        <span style={{ fontWeight:600, color:'#0099cc' }}>{roleLabel}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ color:'#94a3b8' }}>Plan</span>
                        <span style={{ fontWeight:600, color: planColors[planName], textTransform:'capitalize' }}>{planName}</span>
                      </div>
                    </div>
                    {/* actions */}
                    <div style={{ borderTop:'1px solid #f1f5f9', padding:8 }}>
                      <button onClick={() => { setShowProfile(false); signOut() }}
                        style={{ width:'100%', textAlign:'left', padding:'9px 10px', fontSize:13, color:'#dc2626', background:'none', border:'none', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
                        <i className="ti ti-logout"/> Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
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
