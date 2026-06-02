// trustdubai-business/src/App.jsx
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './lib/toast'
import { can } from './lib/permissions'
import { initTheme, toggleTheme, getTheme } from './lib/theme'
import Sidebar from './components/Sidebar'
import LoginNotificationPopup from './components/LoginNotificationPopup'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import NoCompanyPage from './pages/NoCompanyPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import ReviewsPage from './pages/ReviewsPage'
import PortfolioPage from './pages/PortfolioPage'
import AnalyticsPage from './pages/AnalyticsPage'
import LeadsPage from './pages/LeadsPage'
import SponsoredPage from './pages/SponsoredPage'
import StaffManagement from './pages/StaffManagement'
import TeamMembers from './pages/TeamMembers'
import DocumentVerification from './pages/DocumentVerification'
import FaqPage from './pages/FaqPage'
import NotificationsPage from './pages/NotificationsPage'
import InboxPage from './pages/InboxPage'
import TrustScorePage from './pages/TrustScorePage'
import ControlPanel from './pages/ControlPanel'

const ROLE_LABEL = { owner:'Owner', manager:'Manager', sales:'Sales', engineer:'Engineer', staff:'Staff' }

const PAGE_PERM = {
  dashboard:          'view_dashboard',
  inbox:              'view_dashboard',
  notifications:      'view_dashboard',
  profile:            'view_profile',
  reviews:            'view_reviews',
  portfolio:          'view_portfolio',
  analytics:          'view_analytics',
  leads:              'view_leads',
  sponsored:          'view_sponsored',
  staff:              'manage_staff',
  team:               'view_profile',
  documents:          'view_profile',
  faq:                'view_profile',
  trust:              'view_dashboard',
  controlpanel:       'view_profile',
  verification:       'view_profile',
  verificationStatus: 'view_profile',
  plans:              'view_profile',
  settings:           'view_profile',
}

const LIMITED_PAGES = ['dashboard', 'inbox', 'profile', 'portfolio', 'faq', 'notifications', 'team', 'documents']

// --- Refresh persistence (URL hash) ---
// activePage is mirrored in the URL hash (e.g. #leads) so a page refresh
// restores the same page instead of resetting to Dashboard. This also enables
// deep-linking (notification click -> #documents) for the Inbox ecosystem.
const VALID_PAGES = [
  'dashboard', 'inbox', 'profile', 'reviews', 'portfolio', 'analytics', 'leads',
  'sponsored', 'staff', 'team', 'documents', 'faq', 'notifications', 'trust',
  'controlpanel', 'verification', 'verificationStatus', 'plans', 'settings',
]

function getPageFromHash() {
  const raw = (window.location.hash || '').replace(/^#/, '')
  return VALID_PAGES.includes(raw) ? raw : 'dashboard'
}

function Portal() {
  const { user, company, staff, role, loading, signOut } = useAuth()
  const [activePage,   setActivePage]   = useState(getPageFromHash)
  const [showRegister, setShowRegister] = useState(false)
  const [showProfile,  setShowProfile]  = useState(false)
  const [theme,        setTheme]        = useState(getTheme)
  const [sidebarOpen,  setSidebarOpen]  = useState(false)

  useEffect(() => { initTheme() }, [])

  // Keep activePage in sync when the URL hash changes (refresh, back/forward button)
  useEffect(() => {
    const onHash = () => setActivePage(getPageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function navigate(page) {
    setActivePage(page)
    setSidebarOpen(false)
    if (window.location.hash.replace(/^#/, '') !== page) {
      window.location.hash = page
    }
  }

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

  const status     = (company.status || 'pending').toLowerCase()
  const isApproved = status === 'approved'
  const isRejected = status === 'rejected'

  const allPages = {
    dashboard:          <DashboardPage onNavigate={navigate} />,
    inbox:              <InboxPage />,
    profile:            <ProfilePage />,
    reviews:            <ReviewsPage />,
    portfolio:          <PortfolioPage />,
    analytics:          <AnalyticsPage onNavigate={navigate} />,
    leads:              <LeadsPage />,
    sponsored:          <SponsoredPage onNavigate={navigate} />,
    staff:              <StaffManagement />,
    team:               <TeamMembers />,
    documents:          <DocumentVerification />,
    faq:                <FaqPage />,
    notifications:      <NotificationsPage />,
    trust:              <TrustScorePage />,
    controlpanel:       <ControlPanel initialTab="general" />,
    verification:       <ControlPanel initialTab="verification" />,
    verificationStatus: <ControlPanel initialTab="verification" />,
    plans:              <ControlPanel initialTab="plans" />,
    settings:           <ControlPanel initialTab="settings" />,
  }

  const pageTitles = {
    dashboard:'Dashboard', inbox:'Inbox', profile:'Company Profile', reviews:'Reviews', portfolio:'Portfolio',
    analytics:'Analytics', leads:'Lead Form', sponsored:'Sponsored Placement', staff:'Staff & Access',
    team:'Our Team', documents:'Document Verification', faq:'FAQ Management', notifications:'Notifications', trust:'Trust Score', controlpanel:'Control Panel',
    verification:'Control Panel', verificationStatus:'Control Panel', plans:'Control Panel', settings:'Control Panel',
  }

  const neededPerm = PAGE_PERM[activePage]
  const permAllowed = !neededPerm || can(role, staff?.permissions, neededPerm)
  const limitedBlocked = !isApproved && !LIMITED_PAGES.includes(activePage)

  const planColors = { free:'#6b7280', silver:'#64748b', gold:'#d97706', platinum:'#8b5cf6' }
  const planName   = company?.plan || 'free'
  const isPlatinum = planName === 'platinum'
  const pageBg     = isPlatinum ? '#0f0e1a' : '#f8fafc'

  const displayName  = staff?.name || company?.name || 'User'
  const displayEmail = user?.email || ''
  const roleLabel    = ROLE_LABEL[role] || 'Member'
  const avatarLetter = (displayName?.[0] || '?').toUpperCase()

  const ReviewBanner = !isApproved && (
    <div style={{
      margin:'0 0 18px', padding:'14px 18px', borderRadius:12,
      background: isRejected ? 'rgba(220,38,38,0.08)' : 'rgba(0,153,204,0.08)',
      border:`1px solid ${isRejected ? 'rgba(220,38,38,0.3)' : 'rgba(0,153,204,0.3)'}`,
      display:'flex', alignItems:'center', gap:12,
    }}>
      <div style={{ fontSize:22 }}>{isRejected ? '⚠️' : '⏳'}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:14, fontWeight:700, color: isRejected ? '#dc2626' : '#0077a3' }}>
          {isRejected ? 'Application Rejected' : 'Application Under Review'}
        </div>
        <div style={{ fontSize:12.5, color:'#5d6b7e', marginTop:2 }}>
          {isRejected
            ? (company.rejection_reason || 'Please review and re-submit your details. Contact support if needed.')
            : 'Your business is being reviewed by our team. Meanwhile, you can set up your profile, logo, portfolio and FAQ — it will go live once approved. You\'ll be notified by email.'}
        </div>
      </div>
    </div>
  )

  const LockedScreen = (
    <div style={{ padding:40, display:'flex', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:440, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize:38, marginBottom:10 }}>🔒</div>
        <h3 style={{ margin:'0 0 6px', color:'#0f172a' }}>Available after approval</h3>
        <p style={{ fontSize:13, color:'#64748b', margin:'0 0 18px', lineHeight:1.5 }}>
          This section unlocks once your business is approved. For now, you can complete your profile, logo, portfolio and FAQ so you're ready to go live.
        </p>
        <button onClick={() => navigate('profile')}
          style={{ padding:'10px 18px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontWeight:600, cursor:'pointer' }}>
          Complete Your Profile →
        </button>
      </div>
    </div>
  )

  const AccessDenied = (
    <div style={{ padding:40, display:'flex', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:32, maxWidth:420, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize:34, marginBottom:8 }}>🔒</div>
        <h3 style={{ margin:'0 0 6px', color:'#0f172a' }}>Access Restricted</h3>
        <p style={{ fontSize:13, color:'#64748b', margin:'0 0 16px' }}>
          Restricted. Please contact {company?.name || 'your company'} admin.
        </p>
        <button onClick={() => navigate('dashboard')}
          style={{ padding:'10px 18px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontWeight:600, cursor:'pointer' }}>
          Go to Dashboard
        </button>
      </div>
    </div>
  )

  let mainContent
  if (!permAllowed) mainContent = AccessDenied
  else if (limitedBlocked) mainContent = LockedScreen
  else mainContent = (allPages[activePage] || allPages.dashboard)

  return (
    <div className="layout" style={{ background: pageBg }}>
      <div className={`sidebar-overlay${sidebarOpen ? ' show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <Sidebar
        activePage={activePage}
        onNavigate={navigate}
        limitedMode={!isApproved}
        limitedPages={LIMITED_PAGES}
        open={sidebarOpen}
      />

      <main className="main" style={{ background: pageBg }}>

        <div className="topbar" style={{ background: isPlatinum?'#161b2e':'var(--card)', borderBottom:`0.5px solid ${isPlatinum?'rgba(139,92,246,0.2)':'var(--border)'}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, flex:1 }}>
            <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Menu">
              <i className="ti ti-menu-2" />
            </button>

            <div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#e8b84b,#c9952a)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14, color:'#0d1117', flexShrink:0 }}>
              {company?.name?.[0]?.toUpperCase()||'?'}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color: isPlatinum?'#f1f5f9':'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {company?.name||'My Business'}
              </div>
              <div style={{ fontSize:9, color: isPlatinum?'rgba(167,139,250,0.7)':'var(--text3)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {pageTitles[activePage]} · business.trustdubai.ae
              </div>
            </div>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            {!isApproved && (
              <div className="topbar-statuspill" style={{ background: isRejected?'rgba(220,38,38,0.1)':'rgba(0,153,204,0.1)', border:`0.5px solid ${isRejected?'rgba(220,38,38,0.3)':'rgba(0,153,204,0.3)'}`, borderRadius:8, padding:'4px 10px', fontSize:9, fontWeight:700, color: isRejected?'#dc2626':'#0077a3', display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }}>
                <i className={`ti ${isRejected?'ti-alert-triangle':'ti-clock'}`} style={{ fontSize:10 }}/>
                {isRejected ? 'Rejected' : 'Under Review'}
              </div>
            )}
            <div className="topbar-search" style={{ background: isPlatinum?'rgba(255,255,255,0.05)':'var(--bg2)', border:`0.5px solid ${isPlatinum?'rgba(255,255,255,0.08)':'var(--border)'}`, borderRadius:20, padding:'6px 12px', display:'flex', alignItems:'center', gap:6, minWidth:180 }}>
              <i className="ti ti-search" style={{ fontSize:11, color: isPlatinum?'rgba(255,255,255,0.3)':'var(--text3)' }}/>
              <input placeholder="Global search..." style={{ border:'none', background:'none', outline:'none', fontSize:10, color: isPlatinum?'rgba(255,255,255,0.6)':'var(--text)', width:'100%' }}/>
            </div>
            <div className="topbar-date" style={{ background: isPlatinum?'rgba(255,255,255,0.05)':'var(--bg2)', border:`0.5px solid ${isPlatinum?'rgba(255,255,255,0.08)':'var(--border)'}`, borderRadius:8, padding:'5px 10px', fontSize:9, color: isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
              <i className="ti ti-calendar" style={{ fontSize:10 }}/> Last 30 Days <i className="ti ti-chevron-down" style={{ fontSize:9 }}/>
            </div>

            <div onClick={() => setTheme(toggleTheme())} title={theme==='dark'?'Switch to light':'Switch to dark'}
              style={{ cursor:'pointer', width:30, height:30, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', color: isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)', flexShrink:0 }}>
              <i className={`ti ${theme==='dark'?'ti-sun':'ti-moon'}`} style={{ fontSize:17 }}/>
            </div>

            <div onClick={() => navigate('notifications')} style={{ position:'relative', cursor:'pointer', flexShrink:0 }}>
              <i className="ti ti-bell" style={{ fontSize:18, color: isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)' }}/>
              <div style={{ position:'absolute', top:-2, right:-2, width:7, height:7, background:'#ef4444', borderRadius:'50%', border:`1.5px solid ${isPlatinum?'#161b2e':'var(--card)'}` }}/>
            </div>
            <i className="ti ti-message-circle topbar-msg" style={{ fontSize:18, color: isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)', cursor:'pointer' }}/>
            <div className="topbar-plan" style={{ background: planName==='gold'?'#fffbeb': planName==='platinum'?'rgba(139,92,246,0.15)':'var(--bg2)', border:`0.5px solid ${planName==='gold'?'#fcd34d': planName==='platinum'?'rgba(139,92,246,0.3)':'var(--border)'}`, borderRadius:8, padding:'4px 10px', fontSize:9, color: planColors[planName], fontWeight:700, display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }}>
              <i className={`ti ${planName==='platinum'?'ti-diamond': planName==='gold'?'ti-star':'ti-building'}`} style={{ fontSize:10 }}/>
              {planName.charAt(0).toUpperCase()+planName.slice(1)} Plan
            </div>

            <div style={{ position:'relative', flexShrink:0 }}>
              <div onClick={() => setShowProfile(v => !v)} title={`${displayName} · ${displayEmail}`}
                style={{ width:32, height:32, borderRadius:8, background:'#0099cc', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, color:'#fff', cursor:'pointer' }}>
                {avatarLetter}
              </div>
              {showProfile && (
                <>
                  <div onClick={() => setShowProfile(false)} style={{ position:'fixed', inset:0, zIndex:40 }}/>
                  <div style={{ position:'absolute', right:0, top:42, zIndex:50, width:240, background:'#fff', borderRadius:12, boxShadow:'0 10px 30px rgba(0,0,0,0.15)', border:'1px solid #eef2f6', overflow:'hidden' }}>
                    <div style={{ padding:14, display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #f1f5f9' }}>
                      <div style={{ width:40, height:40, borderRadius:'50%', background:'#0099cc', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>{avatarLetter}</div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayName}</div>
                        <div style={{ fontSize:11, color:'#64748b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayEmail}</div>
                      </div>
                    </div>
                    <div style={{ padding:'10px 14px', fontSize:12, color:'#475569', display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#94a3b8' }}>Company</span><span style={{ fontWeight:600, color:'#0f172a' }}>{company?.name}</span></div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#94a3b8' }}>Role</span><span style={{ fontWeight:600, color:'#0099cc' }}>{roleLabel}</span></div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#94a3b8' }}>Status</span><span style={{ fontWeight:600, color: isApproved?'#1e9e63':(isRejected?'#dc2626':'#0077a3'), textTransform:'capitalize' }}>{isApproved?'Approved':(isRejected?'Rejected':'Under Review')}</span></div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'#94a3b8' }}>Plan</span><span style={{ fontWeight:600, color: planColors[planName], textTransform:'capitalize' }}>{planName}</span></div>
                    </div>
                    <div style={{ borderTop:'1px solid #f1f5f9', padding:8 }}>
                      <button onClick={() => { setShowProfile(false); signOut() }} style={{ width:'100%', textAlign:'left', padding:'9px 10px', fontSize:13, color:'#dc2626', background:'none', border:'none', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
                        <i className="ti ti-logout"/> Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="page-content">
          {ReviewBanner}
          {mainContent}
        </div>
      </main>

      <LoginNotificationPopup onOpenPage={() => navigate('notifications')} />
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
