import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './lib/toast'
import { can } from './lib/permissions'
import { initTheme, toggleTheme, getTheme } from './lib/theme'
import { supabase } from './lib/supabase'
import Sidebar from './components/Sidebar'
import LoginNotificationPopup from './components/LoginNotificationPopup'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import NoCompanyPage from './pages/NoCompanyPage'
import DashboardPage from './pages/DashboardPage'
import RevenueEngine from './pages/RevenueEngine'
import ControlWall from './pages/ControlWall'
import ComingSoon from './pages/ComingSoon'
import Organizer from './pages/Organizer'
import MeetingsPage from './pages/MeetingsPage'
import ProjectsPage from './pages/ProjectsPage'
import MeetingBell from './components/MeetingBell'
import AIAssistant from './pages/AIAssistant'
import TrustDubaiLeads from './pages/TrustDubaiLeads'
import ProfilePage from './pages/ProfilePage'
import ReviewsPage from './pages/ReviewsPage'
import PortfolioPage from './pages/PortfolioPage'
import AnalyticsPage from './pages/AnalyticsPage'
import LeadsPage from './pages/LeadsPage'
import LeadEngine from './pages/LeadEngine'
import Quotations from './pages/Quotations'
import Invoices from './pages/Invoices'
import Purchases from './pages/Purchases'
import Ledger from './pages/Ledger'
import QuoteSettings from './pages/QuoteSettings'
import QuoteLibrary from './pages/QuoteLibrary'
import SponsoredPage from './pages/SponsoredPage'
import StaffManagement from './pages/StaffManagement'
import TeamMembers from './pages/TeamMembers'
import DocumentVerification from './pages/DocumentVerification'
import FaqPage from './pages/FaqPage'
import NotificationsPage from './pages/NotificationsPage'
import InboxPage from './pages/InboxPage'
import TrustScorePage from './pages/TrustScorePage'
import ControlPanel from './pages/ControlPanel'
import MenuPage from './pages/MenuPage'
import QuoteApproval from './pages/QuoteApproval'
import ClientProject from './pages/ClientProject'

const ROLE_LABEL = { owner:'Owner', manager:'Manager', sales:'Sales', engineer:'Engineer', staff:'Staff' }

const PAGE_PERM = {
  dashboard:          'view_dashboard',
  menu:               'view_dashboard',
  revenueengine:      'view_leads',
  controlwall:        'view_dashboard',
  leadform:           'view_leads',
  tdleads:            'view_leads',
  metaads:            'view_leads',
  quoteapprovals:     'view_leads',
  aiquote:            'view_leads',
  projects:           'view_profile',
  materials:          'view_profile',
  expenses:           'view_profile',
  aiassistant:        'view_dashboard',
  organizer:          'view_dashboard',
  meetings:           'view_leads',
  inbox:              'view_dashboard',
  notifications:      'view_dashboard',
  profile:            'view_profile',
  reviews:            'view_reviews',
  portfolio:          'view_portfolio',
  analytics:          'view_analytics',
  leads:              'view_leads',
  leadengine:         'view_leads',
  quotations:         'view_leads',
  invoices:           'view_leads',
  purchases:          'view_leads',
  ledger:             'view_leads',
  quoteSettings:      'view_profile',
  quotelibrary:       'view_leads',
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

const LIMITED_PAGES = ['controlwall', 'dashboard', 'menu', 'inbox', 'profile', 'portfolio', 'faq', 'notifications', 'team', 'documents', 'quoteSettings', 'leadform', 'tdleads', 'metaads', 'quoteapprovals', 'aiquote', 'projects', 'materials', 'expenses', 'aiassistant', 'organizer', 'meetings']

// Pages that render their OWN one-step back button (list ↔ builder/detail).
// On these we hide the topbar back so there's never two back buttons.
const SELF_BACK_PAGES = ['quotations', 'aiquote', 'invoices']

// --- Refresh persistence (URL hash) ---
// activePage is mirrored in the URL hash (e.g. #leads) so a page refresh
// restores the same page instead of resetting to the Command Center. Pages with internal
// views (list/builder/detail) can also persist a sub-route, e.g. #quotations/builder,
// so a refresh keeps them on the same view instead of resetting to the list.
const VALID_PAGES = [
  'controlwall', 'dashboard', 'menu', 'revenueengine', 'inbox', 'profile', 'reviews', 'portfolio', 'analytics', 'leads', 'leadengine', 'leadform', 'tdleads', 'metaads', 'quotations', 'invoices', 'purchases', 'ledger', 'quoteSettings', 'quotelibrary', 'quoteapprovals', 'aiquote', 'projects', 'materials', 'expenses', 'aiassistant', 'organizer', 'meetings',
  'sponsored', 'staff', 'team', 'documents', 'faq', 'notifications', 'trust',
  'controlpanel', 'verification', 'verificationStatus', 'plans', 'settings',
]

// App Launcher (Menu) is the home/default page. Command Center stays one tap away.
const DEFAULT_PAGE = 'menu'
const isMobileView = () => typeof window !== 'undefined' && window.innerWidth < 768
const getDefaultPage = () => DEFAULT_PAGE

function parseHash() {
  const raw = (window.location.hash || '').replace(/^#/, '')
  const [page, ...rest] = raw.split('/')
  const validPage = VALID_PAGES.includes(page) ? page : getDefaultPage()
  return { page: validPage, sub: rest.join('/') || '' }
}
function getPageFromHash() {
  return parseHash().page
}

function Portal() {
  const { user, company, staff, role, loading, signOut, isTrial, trialDaysLeft } = useAuth()
  const [activePage,   setActivePage]   = useState(getPageFromHash)
  const [subRoute,     setSubRoute]     = useState(() => parseHash().sub)
  const [showRegister, setShowRegister] = useState(false)
  const [showProfile,  setShowProfile]  = useState(false)
  const [theme,        setTheme]        = useState(getTheme)
  const [sidebarOpen,  setSidebarOpen]  = useState(false)
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [vw,           setVw]           = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))
  const mobile = vw < 768

  useEffect(() => { initTheme() }, [])

  // Keep activePage + subRoute in sync when the URL hash changes (refresh, back/forward button)
  useEffect(() => {
    const onHash = () => {
      const { page, sub } = parseHash()
      setActivePage(page)
      setSubRoute(sub)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Track viewport so we can keep the mobile experience clean.
  useEffect(() => {
    const r = () => setVw(window.innerWidth)
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])

  // --- Bell: real unread notification count (company-wide + this staff only) ---
  // Refreshes on mount, on every page navigation (so opening Notifications clears it),
  // on window focus, and every 60s. Counts rows where is_read=false OR status='unread'.
  useEffect(() => {
    let cancelled = false
    async function fetchUnread() {
      if (!company?.id) return
      try {
        const { data } = await supabase
          .from('notifications')
          .select('id,is_read,status,recipient_staff_id')
          .or(`company_id.eq.${company.id},company_id.is.null`)
          .limit(500)
        if (cancelled) return
        let rows = data || []
        // Staff only sees company-wide + their own targeted notifications (owner sees all).
        if (staff?.id) {
          rows = rows.filter(n => !n.recipient_staff_id || n.recipient_staff_id === staff.id)
        }
        const count = rows.filter(n => n.is_read === false || n.status === 'unread').length
        setUnreadCount(count)
      } catch (e) { /* silent */ }
    }
    fetchUnread()
    const onFocus = () => fetchUnread()
    window.addEventListener('focus', onFocus)
    const t = setInterval(fetchUnread, 60000)
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); clearInterval(t) }
  }, [company, staff, activePage])

  function navigate(page) {
    setActivePage(page)
    setSubRoute('')
    setSidebarOpen(false)
    if (window.location.hash.replace(/^#/, '') !== page) {
      window.location.hash = page
    }
  }

  // Pages call this to persist their internal view in the URL (e.g. 'builder', 'detail/UID')
  // so a refresh keeps them on the same view instead of resetting to the list.
  function setPageSub(sub) {
    const target = sub ? `${activePage}/${sub}` : activePage
    if (window.location.hash.replace(/^#/, '') !== target) {
      window.location.hash = target
    }
    setSubRoute(sub || '')
  }

  if (showRegister) return <RegisterPage onBack={() => setShowRegister(false)} />

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#f8fafc', gap:16 }}>
      <div style={{ width:44, height:44, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}><img src="/quvera-icon.png" alt="Quvera" style={{ width:'100%', height:'100%', objectFit:'contain' }} /></div>
      <div style={{ width:28, height:28, border:'2px solid rgba(232,184,75,0.2)', borderTopColor:'#e8b84b', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize:12, color:'#94a3b8' }}>Loading Quvera Business...</div>
    </div>
  )

  if (!user)    return <LoginPage onRegister={() => setShowRegister(true)} />
  if (!company) return <NoCompanyPage />

  const status     = (company.status || 'pending').toLowerCase()
  const isApproved = status === 'approved'
  const isRejected = status === 'rejected'

  const allPages = {
    controlwall:        <ControlWall onNavigate={navigate} theme={theme} embedded />,
    dashboard:          <DashboardPage onNavigate={navigate} theme={theme} />,
    menu:               <MenuPage onNavigate={navigate} role={role} permissions={staff?.permissions} isApproved={isApproved} limitedPages={LIMITED_PAGES} />,
    revenueengine:      <RevenueEngine onNavigate={navigate} theme={theme} />,
    inbox:              <InboxPage />,
    profile:            <ProfilePage />,
    reviews:            <ReviewsPage />,
    portfolio:          <PortfolioPage />,
    analytics:          <AnalyticsPage onNavigate={navigate} />,
    leads:              <LeadsPage />,
    leadengine:         <LeadEngine />,
    leadform:           <ComingSoon feature="trustdubai_leads" title="Lead Form" onNavigate={navigate} />,
    tdleads:            <TrustDubaiLeads onNavigate={navigate} />,
    metaads:            <ComingSoon feature="meta_ads" onNavigate={navigate} />,
    quoteapprovals:     <ComingSoon feature="quote_approvals" onNavigate={navigate} />,
    aiquote:            <Quotations key="q-ai" subRoute={subRoute} setSubRoute={setPageSub} startAi />,
    projects:           <ProjectsPage onNavigate={navigate} />,
    materials:          <ProjectsPage onNavigate={navigate} />,
    expenses:           <ProjectsPage onNavigate={navigate} />,
    aiassistant:        <AIAssistant onNavigate={navigate} />,
    organizer:          <Organizer onNavigate={navigate} />,
    meetings:           <MeetingsPage onNavigate={navigate} />,
    quotations:         <Quotations subRoute={subRoute} setSubRoute={setPageSub} />,
    invoices:           <Invoices subRoute={subRoute} setSubRoute={setPageSub} />,
    purchases:          <Purchases />,
    ledger:             <Ledger />,
    quoteSettings:      <QuoteSettings />,
    quotelibrary:       <QuoteLibrary />,
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
    controlwall:'Command Center', dashboard:'Command Center', menu:'All Features', revenueengine:'Revenue Engine', leadform:'Lead Form', tdleads:'Quvera Leads', metaads:'Meta Ads', quoteapprovals:'Quote Approvals', aiquote:'AI Quote Builder', projects:'Projects', materials:'Material Requests', expenses:'Site Expenses', aiassistant:'AI Assistant', organizer:'My Organizer', meetings:'Planner', inbox:'Inbox', profile:'Company Profile', reviews:'Reviews', portfolio:'Portfolio',
    analytics:'Analytics', leads:'Lead Form', leadengine:'Lead Engine', quotations:'Quotations', invoices:'Invoices', purchases:'Purchases & Suppliers', ledger:'Ledger', quoteSettings:'Quote Settings', quotelibrary:'Description Library', sponsored:'Sponsored Placement', staff:'Staff & Access',
    team:'Our Team', documents:'Document Verification', faq:'FAQ Management', notifications:'Notifications', trust:'Trust Score', controlpanel:'Control Panel',
    verification:'Control Panel', verificationStatus:'Control Panel', plans:'Control Panel', settings:'Control Panel',
  }

  const neededPerm = PAGE_PERM[activePage]
  const permAllowed = !neededPerm || can(role, staff?.permissions, neededPerm)
  const limitedBlocked = !isApproved && !LIMITED_PAGES.includes(activePage)

  const planColors = { free:'#6b7280', silver:'#64748b', gold:'#d97706', platinum:'#8b5cf6' }
  const planName   = company?.plan || 'free'
  const isPlatinum = false  // Platinum ka dark shell band; dark/light theme toggle se aata hai (var(--bg))
  const pageBg     = isPlatinum ? '#0f0e1a' : 'var(--bg)'  // follow active light/dark theme (no mixup)

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
      <div style={{ background:'var(--card)', borderRadius:16, padding:32, maxWidth:440, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.06)', border:'0.5px solid var(--border)' }}>
        <div style={{ fontSize:38, marginBottom:10 }}>🔒</div>
        <h3 style={{ margin:'0 0 6px', color:'var(--text)' }}>Available after approval</h3>
        <p style={{ fontSize:13, color:'var(--text2)', margin:'0 0 18px', lineHeight:1.5 }}>
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
      <div style={{ background:'var(--card)', borderRadius:16, padding:32, maxWidth:420, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.06)', border:'0.5px solid var(--border)' }}>
        <div style={{ fontSize:34, marginBottom:8 }}>🔒</div>
        <h3 style={{ margin:'0 0 6px', color:'var(--text)' }}>Access Restricted</h3>
        <p style={{ fontSize:13, color:'var(--text2)', margin:'0 0 16px' }}>
          Restricted. Please contact {company?.name || 'your company'} admin.
        </p>
        <button onClick={() => navigate('dashboard')}
          style={{ padding:'10px 18px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontWeight:600, cursor:'pointer' }}>
          Go to Command Center
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
            {/* Hamburger — always in the DOM; CSS shows it only on drawer screens (<=1024px) */}
            <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <i className="ti ti-menu-2" />
            </button>

            {/* Back to All Features — shown on pages WITHOUT their own back button,
                so every page has exactly one back (multi-view pages use their own). */}
            {activePage !== 'menu' && !SELF_BACK_PAGES.includes(activePage) && (
              <button onClick={() => navigate('menu')} aria-label="Back to All Features" title="Back to All Features"
                style={{ display:'flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:9, border:`0.5px solid var(--border)`, background:'var(--bg2)', color:'var(--text)', cursor:'pointer', flexShrink:0 }}>
                <i className="ti ti-arrow-left" style={{ fontSize:17 }}/>
              </button>
            )}

            <div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#e8b84b,#c9952a)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14, color:'#0d1117', flexShrink:0 }}>
              {company?.name?.[0]?.toUpperCase()||'?'}
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color: isPlatinum?'#f1f5f9':'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {company?.name||'My Business'}
              </div>
              <div style={{ fontSize:9, color: isPlatinum?'rgba(167,139,250,0.7)':'var(--text3)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {pageTitles[activePage]} · business.quvera.ae
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

            <div onClick={() => navigate('menu')} title="All Features"
              style={{ cursor:'pointer', width:30, height:30, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', color: activePage==='menu' ? '#0099cc' : (isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)'), flexShrink:0 }}>
              <i className="ti ti-layout-grid" style={{ fontSize:17 }}/>
            </div>

            <div onClick={() => setTheme(toggleTheme())} title={theme==='dark'?'Switch to light':'Switch to dark'}
              style={{ cursor:'pointer', width:30, height:30, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', color: isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)', flexShrink:0 }}>
              <i className={`ti ${theme==='dark'?'ti-sun':'ti-moon'}`} style={{ fontSize:17 }}/>
            </div>

            <MeetingBell navigate={navigate} isPlatinum={isPlatinum} />

            <div onClick={() => navigate('notifications')} title={unreadCount>0 ? `${unreadCount} unread notification${unreadCount>1?'s':''}` : 'Notifications'} style={{ position:'relative', cursor:'pointer', flexShrink:0 }}>
              <i className="ti ti-bell" style={{ fontSize:18, color: unreadCount>0 ? '#0099cc' : (isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)') }}/>
              {unreadCount > 0 && (
                <div style={{ position:'absolute', top:-6, right:-7, minWidth:15, height:15, padding:'0 4px', background:'#ef4444', color:'#fff', borderRadius:8, fontSize:9, fontWeight:800, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center', border:`1.5px solid ${isPlatinum?'#161b2e':'var(--card)'}` }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
            </div>
            <i className="ti ti-message-circle topbar-msg" style={{ fontSize:18, color: isPlatinum?'rgba(255,255,255,0.5)':'var(--text3)', cursor:'pointer' }}/>
            <div className="topbar-plan" title={isTrial ? `Launch Plan · ${trialDaysLeft} ${trialDaysLeft===1?'day':'days'} of full access left` : undefined} style={{ background: isTrial?'rgba(139,92,246,0.15)': planName==='gold'?'#fffbeb': planName==='platinum'?'rgba(139,92,246,0.15)':'var(--bg2)', border:`0.5px solid ${isTrial?'rgba(139,92,246,0.35)': planName==='gold'?'#fcd34d': planName==='platinum'?'rgba(139,92,246,0.3)':'var(--border)'}`, borderRadius:8, padding:'4px 10px', fontSize:9, color: isTrial ? '#8b5cf6' : planColors[planName], fontWeight:700, display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }}>
              <i className={`ti ${isTrial?'ti-rocket': planName==='platinum'?'ti-diamond': planName==='gold'?'ti-star':'ti-building'}`} style={{ fontSize:10 }}/>
              {isTrial ? 'Launch Plan' : planName.charAt(0).toUpperCase()+planName.slice(1)+' Plan'}
            </div>

            <div style={{ position:'relative', flexShrink:0 }}>
              <div onClick={() => setShowProfile(v => !v)} title={`${displayName} · ${displayEmail}`}
                style={{ width:32, height:32, borderRadius:8, background:'#0099cc', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, color:'#fff', cursor:'pointer' }}>
                {avatarLetter}
              </div>
              {showProfile && (
                <>
                  <div onClick={() => setShowProfile(false)} style={{ position:'fixed', inset:0, zIndex:40 }}/>
                  <div style={{ position:'absolute', right:0, top:42, zIndex:50, width:240, background:'var(--card)', borderRadius:12, boxShadow:'0 10px 30px rgba(0,0,0,0.15)', border:'1px solid var(--border)', overflow:'hidden' }}>
                    <div style={{ padding:14, display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:40, height:40, borderRadius:'50%', background:'#0099cc', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>{avatarLetter}</div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayName}</div>
                        <div style={{ fontSize:11, color:'var(--text2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{displayEmail}</div>
                      </div>
                    </div>
                    <div style={{ padding:'10px 14px', fontSize:12, color:'var(--text2)', display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'var(--text3)' }}>Company</span><span style={{ fontWeight:600, color:'var(--text)' }}>{company?.name}</span></div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'var(--text3)' }}>Role</span><span style={{ fontWeight:600, color:'#0099cc' }}>{roleLabel}</span></div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'var(--text3)' }}>Status</span><span style={{ fontWeight:600, color: isApproved?'#1e9e63':(isRejected?'#dc2626':'#0077a3'), textTransform:'capitalize' }}>{isApproved?'Approved':(isRejected?'Rejected':'Under Review')}</span></div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'var(--text3)' }}>Plan</span><span style={{ fontWeight:600, color: isTrial ? '#8b5cf6' : planColors[planName], textTransform:'capitalize' }}>{isTrial ? 'Launch Plan (trial)' : planName}</span></div>
                    </div>
                    <div style={{ borderTop:'1px solid var(--border)', padding:8 }}>
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
  // Public, login-free quote approval page: #approve/<token>
  const hash = (window.location.hash || '').replace(/^#/, '')
  if (hash.startsWith('approve/')) {
    return <QuoteApproval token={decodeURIComponent(hash.slice('approve/'.length))} />
  }
  // Public, OTP-verified client project view: #project/<token>
  if (hash.startsWith('project/')) {
    return <ClientProject token={decodeURIComponent(hash.slice('project/'.length))} />
  }
  return (
    <AuthProvider>
      <ToastProvider>
        <Portal />
      </ToastProvider>
    </AuthProvider>
  )
}
