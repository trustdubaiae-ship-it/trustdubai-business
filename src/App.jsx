import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './lib/toast'
import { can } from './lib/permissions'
import { initTheme, toggleTheme, getTheme } from './lib/theme'
import { supabase } from './lib/supabase'
import Sidebar, { MENU } from './components/Sidebar'
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
import HelpPage from './pages/HelpPage'

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
  help:               'view_dashboard',
  verification:       'view_profile',
  verificationStatus: 'view_profile',
  plans:              'view_profile',
  settings:           'view_profile',
}

const LIMITED_PAGES = ['controlwall', 'dashboard', 'menu', 'inbox', 'profile', 'portfolio', 'faq', 'notifications', 'team', 'documents', 'quoteSettings', 'leadform', 'tdleads', 'metaads', 'quoteapprovals', 'aiquote', 'projects', 'materials', 'expenses', 'aiassistant', 'organizer', 'meetings', 'help']

// Pages that render their OWN one-step back button (list ↔ builder/detail).
// On these we hide the topbar back so there's never two back buttons.
const SELF_BACK_PAGES = ['quotations', 'aiquote', 'invoices', 'projects', 'materials', 'expenses']

// --- 555 OS hero: pages whose title now lives IN the hero (internal <h1> removed).
const OS_TITLE_PAGES = new Set([
  'leadengine', 'ledger', 'reviews', 'analytics', 'inbox', 'portfolio', 'trust',
  'notifications', 'organizer', 'meetings', 'purchases', 'profile', 'documents',
  'team', 'staff', 'faq', 'quotelibrary', 'quoteSettings', 'sponsored',
  'aiassistant', 'revenueengine', 'quotations', 'invoices', 'projects',
  'materials', 'expenses', 'leads', 'tdleads', 'menu', 'controlpanel',
  'verification', 'verificationStatus', 'plans', 'settings',
])

// pageId -> sidebar section (used as the hero eyebrow / breadcrumb), built from MENU.
const SECTION_OF = (() => {
  const map = {}; let cur = ''
  for (const it of MENU) { if (it.section) cur = it.section; else if (it.id) map[it.id] = cur }
  return map
})()

// Short one-line description shown under the hero title (per converted page).
const PAGE_DESC = {
  leadengine:   'Connect & run all your lead sources from one place',
  ledger:       'Income, expenses & VAT — your full money picture',
  reviews:      'Manage your customer reviews and responses',
  analytics:    'Track your profile visitors and performance',
  inbox:        'Messages between your company and Quvera',
  portfolio:    'Showcase your best work to attract more clients',
  trust:        'Your credibility rating on Quvera — higher score, more leads',
  notifications:'Internal team reminders & tasks',
  organizer:    'Your private diary — meetings, tasks & notes',
  meetings:     'Meetings, site visits & follow-ups — synced with every lead',
  purchases:    'Record supplier bills with VAT — flows into your Ledger',
  profile:      'Manage how your business appears on Quvera',
  documents:    'Upload & verify your business documents',
  team:         'Add your client-facing, EID-verified team members',
  staff:        'Manage team members, roles & access',
  faq:          'Add common questions & answers shown on your profile',
  quotelibrary: 'Reusable line items & descriptions for quotes',
  quoteSettings:'Branding & defaults for your quotations',
  sponsored:    'Boost your visibility & get more leads on Quvera',
  aiassistant:  'Ask anything about your business',
  revenueengine:'Your sales pipeline & revenue at a glance',
  quotations:   'Create, send & track your quotes',
  invoices:     'Invoice approved quotes & track payments',
  projects:     'Track jobs, scope, subcontractors & site spend',
  materials:    'Material requests across your projects',
  expenses:     'Site expenses across your projects',
  leads:        'Capture, track and close — every lead in one place',
  tdleads:      'Verified leads from your Quvera profile',
  menu:         'Your whole business in one place',
  controlpanel: 'Manage your company settings & verification',
  verification: 'Your verification & documents',
  verificationStatus: 'Your verification & documents',
  plans:        'Your plan & billing',
  settings:     'Account & app settings',
}

// --- Refresh persistence (URL hash) ---
// activePage is mirrored in the URL hash (e.g. #leads) so a page refresh
// restores the same page instead of resetting to the Command Center. Pages with internal
// views (list/builder/detail) can also persist a sub-route, e.g. #quotations/builder,
// so a refresh keeps them on the same view instead of resetting to the list.
const VALID_PAGES = [
  'controlwall', 'dashboard', 'menu', 'revenueengine', 'inbox', 'profile', 'reviews', 'portfolio', 'analytics', 'leads', 'leadengine', 'leadform', 'tdleads', 'metaads', 'quotations', 'invoices', 'purchases', 'ledger', 'quoteSettings', 'quotelibrary', 'quoteapprovals', 'aiquote', 'projects', 'materials', 'expenses', 'aiassistant', 'organizer', 'meetings',
  'sponsored', 'staff', 'team', 'documents', 'faq', 'notifications', 'trust',
  'controlpanel', 'verification', 'verificationStatus', 'plans', 'settings', 'help',
]

// App Launcher (Menu) is the home/default page. Command Center stays one tap away.
const DEFAULT_PAGE = 'dashboard'
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
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:20, gap:18,
      background:'radial-gradient(800px 420px at 50% 28%, rgba(0,212,255,0.13), transparent 60%), linear-gradient(135deg,#050816 0%,#0a1024 100%)' }}>
      <div style={{ position:'relative', width:110, height:110, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:2 }}>
        {/* neon glow behind the logo (also gives the navy mark contrast on the dark splash) */}
        <div style={{ position:'absolute', inset:'-26%', borderRadius:'50%',
          background:'radial-gradient(circle, rgba(125,232,255,0.55), rgba(0,212,255,0.40) 42%, rgba(139,92,246,0.28) 62%, transparent 74%)',
          filter:'blur(10px)', animation:'qglow 3s ease-in-out infinite' }} />
        <img src="/quvera-icon.png?v=4" alt="Quvera" style={{ position:'relative', zIndex:1, width:'100%', height:'100%', objectFit:'contain',
          filter:'drop-shadow(0 0 22px rgba(0,212,255,0.6)) drop-shadow(0 3px 8px rgba(0,0,0,0.45))' }} />
      </div>
      <div>
        <div style={{ fontFamily:"'Sora',sans-serif", fontWeight:800, fontSize:'clamp(26px,6vw,40px)', letterSpacing:'-.6px', lineHeight:1.05,
          background:'linear-gradient(100deg,#00D4FF,#00FFCC 55%,#8B5CF6)', WebkitBackgroundClip:'text', backgroundClip:'text', color:'transparent' }}>Quvera Business OS</div>
        <div style={{ fontSize:13.5, color:'#9fb0d4', marginTop:9, maxWidth:480, lineHeight:1.5 }}>The AI Operating System for Construction, Interior Fit-Out &amp; Service Companies.</div>
      </div>
      <div style={{ width:170, height:3, borderRadius:99, overflow:'hidden', background:'rgba(255,255,255,0.08)', marginTop:6 }}>
        <div style={{ width:'42%', height:'100%', borderRadius:99, background:'linear-gradient(90deg,#00D4FF,#8B5CF6)', animation:'qload 1.1s ease-in-out infinite' }}/>
      </div>
      <style>{`@keyframes qload{0%{margin-left:-42%}100%{margin-left:100%}} @keyframes qglow{0%,100%{opacity:.82;transform:scale(1)}50%{opacity:1;transform:scale(1.09)}}`}</style>
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
    projects:           <ProjectsPage onNavigate={navigate} subRoute={subRoute} setSubRoute={setPageSub} />,
    materials:          <ProjectsPage onNavigate={navigate} subRoute={subRoute} setSubRoute={setPageSub} />,
    expenses:           <ProjectsPage onNavigate={navigate} subRoute={subRoute} setSubRoute={setPageSub} />,
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
    help:               <HelpPage company={company} />,
  }

  const pageTitles = {
    controlwall:'Command Center', dashboard:'Command Center', menu:'All Features', revenueengine:'Revenue Engine', leadform:'Lead Form', tdleads:'Quvera Leads', metaads:'Meta Ads', quoteapprovals:'Quote Approvals', aiquote:'AI Quote Builder', projects:'Projects', materials:'Material Requests', expenses:'Site Expenses', aiassistant:'AI Assistant', organizer:'My Organizer', meetings:'Planner', inbox:'Inbox', profile:'Company Profile', reviews:'Reviews', portfolio:'Portfolio',
    analytics:'Analytics', leads:'Lead Form', leadengine:'Lead Engine', quotations:'Quotations', invoices:'Invoices', purchases:'Purchases & Suppliers', ledger:'Ledger', quoteSettings:'Quote Settings', quotelibrary:'Description Library', sponsored:'Sponsored Placement', staff:'Staff & Access',
    team:'Our Team', documents:'Document Verification', faq:'FAQ Management', notifications:'Notifications', trust:'Trust Score', controlpanel:'Control Panel',
    verification:'Control Panel', verificationStatus:'Control Panel', plans:'Control Panel', settings:'Control Panel', help:'How it works',
  }

  const neededPerm = PAGE_PERM[activePage]
  const permAllowed = !neededPerm || can(role, staff?.permissions, neededPerm)
  const limitedBlocked = !isApproved && !LIMITED_PAGES.includes(activePage)

  const planColors = { free:'#6b7280', silver:'#64748b', gold:'#d97706', platinum:'#8b5cf6' }
  const planName   = company?.plan || 'free'
  const isPlatinum = false  // Platinum ka dark shell band; dark/light theme toggle se aata hai (var(--bg))

  // 555 OS hero header.
  // Pages listed in OS_TITLE_PAGES carry their title INSIDE the hero (their own
  // internal <h1> is removed). Every other page still shows the brand hero until
  // it's converted — so nothing duplicates during the gradual rollout.
  const greeting   = (() => { const h = new Date().getHours(); return h<12?'Good Morning':h<17?'Good Afternoon':'Good Evening' })()
  const isConverted = OS_TITLE_PAGES.has(activePage)
  const heroEyebrow = activePage==='dashboard' ? greeting : (isConverted ? (SECTION_OF[activePage] || 'Quvera') : greeting)
  const heroTitle   = (activePage!=='dashboard' && isConverted) ? (pageTitles[activePage] || 'Quvera') : (company?.name || 'My Business')
  const heroSub     = (activePage!=='dashboard' && isConverted)
    ? (PAGE_DESC[activePage] || '')
    : 'Your AI Business Operating System is running perfectly'
  const showBack    = activePage !== 'menu' && activePage !== 'dashboard' && !SELF_BACK_PAGES.includes(activePage)
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
    <div className="layout os555" style={{ background: pageBg }}>
      <div className={`sidebar-overlay${sidebarOpen ? ' show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <Sidebar
        activePage={activePage}
        onNavigate={navigate}
        limitedMode={!isApproved}
        limitedPages={LIMITED_PAGES}
        open={sidebarOpen}
      />

      <main className={`main${activePage==='dashboard' && !mobile ? ' os-fixed' : ''}`} style={{ background: pageBg }}>

        <header className="os-hero">
          <div className="os-hero-skyline" aria-hidden="true"/>
          <div className="os-hero-glow" aria-hidden="true"/>

          {/* controls row */}
          <div className="os-hero-controls">
            <div className="os-hero-left">
              <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                <i className="ti ti-menu-2" />
              </button>
            </div>

            <div className="os-hero-right">
              {!isApproved && (
                <div className="os-statuspill" style={{ background: isRejected?'rgba(220,38,38,0.12)':'var(--primary-bg)', borderColor: isRejected?'rgba(220,38,38,0.3)':'var(--primary-border)', color: isRejected?'var(--red)':'var(--primary)' }}>
                  <i className={`ti ${isRejected?'ti-alert-triangle':'ti-clock'}`} style={{ fontSize:10 }}/>
                  {isRejected ? 'Rejected' : 'Under Review'}
                </div>
              )}
              <div className="os-search">
                <i className="ti ti-search"/>
                <input placeholder="Global search..."/>
              </div>

              <div className="os-ic" onClick={() => navigate('menu')} title="All Features" style={activePage==='menu'?{color:'var(--primary)'}:undefined}>
                <i className="ti ti-layout-grid"/>
              </div>
              <div className="os-ic" onClick={() => setTheme(toggleTheme())} title={theme==='dark'?'Switch to light':'Switch to dark'}>
                <i className={`ti ${theme==='dark'?'ti-sun':'ti-moon'}`}/>
              </div>

              <MeetingBell navigate={navigate} isPlatinum={isPlatinum} />

              <div className="os-ic os-bell" onClick={() => navigate('notifications')} title={unreadCount>0 ? `${unreadCount} unread notification${unreadCount>1?'s':''}` : 'Notifications'}>
                <i className="ti ti-bell" style={{ color: unreadCount>0 ? 'var(--primary)' : undefined }}/>
                {unreadCount > 0 && <span className="os-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </div>

              <div style={{ position:'relative', flexShrink:0 }}>
                <div className="os-avatar" onClick={() => setShowProfile(v => !v)} title={`${displayName} · ${displayEmail}`}>
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

          {/* hero text — page title lives here on converted pages */}
          <div className="os-hero-text">
            {showBack && (
              <button onClick={() => navigate('menu')} className="os-hero-back" title="Back to All Features" aria-label="Back to All Features">
                <i className="ti ti-arrow-left"/>
              </button>
            )}
            <div style={{ minWidth:0 }}>
              <div className="os-eyebrow">{heroEyebrow}</div>
              <div className="os-title-row">
                <h1 className="os-title">{heroTitle}</h1>
                {activePage==='dashboard' && (
                  <span className="os-hero-plan" onClick={() => navigate('plans')} title="Your plan" style={{ '--pc': isTrial ? '#8b5cf6' : planColors[planName] }}>
                    <i className={`ti ${isTrial?'ti-rocket': planName==='platinum'?'ti-diamond': planName==='gold'?'ti-star':'ti-building'}`}/>
                    {isTrial ? `Launch Plan · ${trialDaysLeft}d left` : planName.charAt(0).toUpperCase()+planName.slice(1)+' Plan'}
                  </span>
                )}
              </div>
              {heroSub && <div className="os-sub">{!isConverted && <span className="os-live-dot"/>} {heroSub}</div>}
            </div>
            {/* pages teleport their primary action buttons here via <HeroActions> */}
            <div className="os-hero-actions" id="os-hero-actions"/>
          </div>
        </header>

        <div className={`page-content${activePage==='dashboard' && !mobile ? ' page-content--flush' : ''}`}>
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
