// trustdubai-business/src/lib/features.js
// ============================================================================
// Single source of truth for the App Launcher (Menu) page.
// Each item: { key, title, icon (Tabler), desc, perm, comingSoon }
//   - `key`  must match a page key in App.jsx (allPages / VALID_PAGES)
//   - `perm` must match the value in App.jsx PAGE_PERM (used by can())
//   - approval-locking is derived in MenuPage from App's LIMITED_PAGES list,
//     so it is NOT duplicated here.
// To add / rename / reorder a launcher tile, edit ONLY this file.
// ============================================================================

export const FEATURE_GROUPS = [
  {
    key: 'leads',
    label: 'Leads & Sales',
    color: '#0099cc',
    items: [
      { key: 'leads',          title: 'Lead Form',        icon: 'ti-forms',       desc: 'Capture enquiries',     perm: 'view_leads' },
      { key: 'leadengine',     title: 'Lead Engine',      icon: 'ti-rocket',      desc: 'Distribute & track',    perm: 'view_leads' },
      { key: 'tdleads',        title: 'TrustDubai Leads', icon: 'ti-bolt',        desc: 'Marketplace leads',     perm: 'view_leads' },
      { key: 'revenueengine',  title: 'Revenue Engine',   icon: 'ti-chart-line',  desc: 'Sales CRM dashboard',   perm: 'view_leads' },
      { key: 'metaads',        title: 'Meta Ads',         icon: 'ti-brand-meta',  desc: 'Run ad campaigns',      perm: 'view_leads', comingSoon: true },
      { key: 'quoteapprovals', title: 'Quote Approvals',  icon: 'ti-checkbox',    desc: 'Approve quotes',        perm: 'view_leads', comingSoon: true },
    ],
  },
  {
    key: 'quotes',
    label: 'Quotations',
    color: '#7c3aed',
    items: [
      { key: 'quotations',   title: 'Quotations',         icon: 'ti-file-invoice', desc: 'Create & send quotes',  perm: 'view_leads' },
      { key: 'quotelibrary', title: 'Description Library', icon: 'ti-books',       desc: 'Saved descriptions',    perm: 'view_leads' },
      { key: 'quoteSettings',title: 'Quote Settings',     icon: 'ti-adjustments',  desc: 'Footer, signature, VAT',perm: 'view_profile' },
      { key: 'aiquote',      title: 'AI Quote Builder',   icon: 'ti-sparkles',     desc: 'Auto-draft quotes',     perm: 'view_leads', comingSoon: true },
    ],
  },
  {
    key: 'profile',
    label: 'Profile & Trust',
    color: '#e8b84b',
    items: [
      { key: 'profile',   title: 'Company Profile', icon: 'ti-building-store',   desc: 'Your public profile',  perm: 'view_profile' },
      { key: 'portfolio', title: 'Portfolio',       icon: 'ti-photo',            desc: 'Project gallery',      perm: 'view_portfolio' },
      { key: 'reviews',   title: 'Reviews',         icon: 'ti-star',             desc: 'Customer reviews',     perm: 'view_reviews' },
      { key: 'trust',     title: 'Trust Score',     icon: 'ti-shield-check',     desc: 'Your 3 shields',       perm: 'view_dashboard' },
      { key: 'documents', title: 'Documents',       icon: 'ti-file-certificate', desc: 'Verification docs',    perm: 'view_profile' },
      { key: 'analytics', title: 'Analytics',       icon: 'ti-chart-bar',        desc: 'Traffic & insights',   perm: 'view_analytics' },
      { key: 'sponsored', title: 'Sponsored',       icon: 'ti-flame',            desc: 'Boost your listing',   perm: 'view_sponsored' },
      { key: 'faq',       title: 'FAQ Management',  icon: 'ti-help-circle',      desc: 'Edit your FAQs',       perm: 'view_profile' },
    ],
  },
  {
    key: 'team',
    label: 'Team & Inbox',
    color: '#16a34a',
    items: [
      { key: 'team',          title: 'Our Team',       icon: 'ti-users-group', desc: 'Team members',        perm: 'view_profile' },
      { key: 'staff',         title: 'Staff & Access', icon: 'ti-user-shield', desc: 'Roles & permissions', perm: 'manage_staff' },
      { key: 'inbox',         title: 'Inbox',          icon: 'ti-mail',        desc: 'Messages',            perm: 'view_dashboard' },
      { key: 'notifications', title: 'Notifications',  icon: 'ti-bell',        desc: 'Alerts & updates',    perm: 'view_dashboard' },
    ],
  },
  {
    key: 'tools',
    label: 'Tools & Projects',
    color: '#06b6d4',
    items: [
      { key: 'aiassistant', title: 'AI Assistant',      icon: 'ti-robot',          desc: 'Ask anything',     perm: 'view_dashboard' },
      { key: 'organizer',   title: 'My Organizer',      icon: 'ti-calendar-event', desc: 'Tasks & reminders',perm: 'view_dashboard' },
      { key: 'projects',    title: 'Projects',          icon: 'ti-clipboard-list', desc: 'Manage projects',  perm: 'view_profile', comingSoon: true },
      { key: 'materials',   title: 'Material Requests', icon: 'ti-package',        desc: 'Track materials',  perm: 'view_profile', comingSoon: true },
      { key: 'expenses',    title: 'Site Expenses',     icon: 'ti-receipt',        desc: 'Log expenses',     perm: 'view_profile', comingSoon: true },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    color: '#64748b',
    items: [
      { key: 'controlpanel', title: 'Control Panel',   icon: 'ti-settings',              desc: 'General settings',     perm: 'view_profile' },
      { key: 'verification', title: 'Verification',    icon: 'ti-rosette-discount-check',desc: 'Verify your business', perm: 'view_profile' },
      { key: 'plans',        title: 'Plans & Billing', icon: 'ti-diamond',               desc: 'Upgrade your plan',    perm: 'view_profile' },
    ],
  },
]
