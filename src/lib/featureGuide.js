// ===========================================================================
// Single source of truth for the in-app "How it works" Help page AND the
// printable/PDF guide. Update the sections here → the Help page and its
// Export-PDF both update. Keep it plain (no JSX) so it can also be pasted
// into a prompt to generate an external HTML/PDF.
// ===========================================================================

export const GUIDE_META = {
  title: 'Quvera Business — How it works',
  subtitle: 'A plain-English guide to every feature and how the work flows from a lead to a finished, client-approved project.',
}

// Each section: { icon (tabler), color, title, intro, steps: [..] }
export const GUIDE_SECTIONS = [
  {
    icon: 'ti-rocket', color: '#8b5cf6', title: 'Getting started',
    intro: 'Your company registers once and is reviewed by the Quvera team. Until approved you can still set up your profile, logo, portfolio and FAQ.',
    steps: [
      'Register your business → status shows "Under review" until the Quvera team approves it.',
      'While under review, complete Business Profile, Portfolio, Verification documents and FAQ so you go live the moment you are approved.',
      'Roles & access: the owner can invite staff (Manager, Sales, Engineer, Staff) from Staff & Access and control what each can see.',
      'Use the App Launcher (All Features) or the sidebar to reach any module; the top bar has search, theme toggle, notifications and the meeting bell.',
    ],
  },
  {
    icon: 'ti-layout-dashboard', color: '#0099cc', title: 'Command Center',
    intro: 'Your home dashboard — the health of the business at a glance.',
    steps: [
      'See key numbers: leads, quotes, revenue, projects and follow-ups due.',
      'Jump straight to any module from the quick links.',
    ],
  },
  {
    icon: 'ti-forms', color: '#0891b2', title: 'Lead Hub — capture, track & close',
    intro: 'Every lead in one place across three tabs: Quvera Leads (verified leads from the platform), My Leads (your own — Meta, WhatsApp, manual, CSV) and Forms (shareable capture forms).',
    steps: [
      'Quvera Leads arrive ranked, with a response-time (SLA) ring — act fast before the lead may be reassigned.',
      'My Leads: add manually, import a CSV, or collect via a shareable Form (link + QR) — submissions land here automatically.',
      'Board view: pick a stage (New → Contacted → Quoted → Won → Lost); cards wrap onto rows; drag a card onto a stage pill to move it.',
      'Each lead card shows temperature (Hot/Warm/Cold), source, score/SLA ring, project & budget, and a Next-action band.',
      'Open a lead to log a follow-up, change stage, call, or message on WhatsApp. Set the "Next action" with a date & time.',
      'The tab you last used is remembered; stat & source filters sit on one compact row.',
    ],
  },
  {
    icon: 'ti-calendar-event', color: '#0099cc', title: 'Planner',
    intro: 'Meetings, site visits and follow-ups — synced with every lead so nothing slips.',
    steps: [
      'Schedule a meeting/call/site-visit (date + time) from a lead; set a reminder.',
      'A lead\'s "Next action" and its meeting are one and the same record — set it once, it shows once (no duplicates).',
      'The day view shows timed meetings in slots and any date-only follow-ups as all-day items.',
    ],
  },
  {
    icon: 'ti-file-invoice', color: '#185fa5', title: 'Quotations',
    intro: 'Build professional quotes and send them for client approval.',
    steps: [
      'Create a quote (or use the AI Quote Builder), group items by trade, set rates, discount and VAT.',
      'Per-quote payment terms, revision number, and a choice of themes for the printed/PDF look.',
      'Share an approval link — the client opens it (no login) and Approves or Rejects with a comment; the result reflects back in your portal.',
      'An approved quote can auto-create a Project.',
    ],
  },
  {
    icon: 'ti-receipt', color: '#185fa5', title: 'Invoices',
    intro: 'Turn work into invoices and track what is paid.',
    steps: [
      'Raise invoices (incl. milestone invoices) with VAT; record payments against them.',
      'Outstanding vs received is tracked per project and feeds the Ledger and project P&L.',
    ],
  },
  {
    icon: 'ti-shopping-cart', color: '#b45309', title: 'Purchases & Suppliers',
    intro: 'Record supplier bills and what you still owe.',
    steps: [
      'Log purchase invoices with supplier, category, VAT and amount; tag them to a client/project.',
      'Outstanding supplier balances and input VAT flow into the Ledger and project cost.',
    ],
  },
  {
    icon: 'ti-book-2', color: '#0f6e56', title: 'Ledger',
    intro: 'Your complete money ledger — record any money in/out and run a VAT return.',
    steps: [
      'Manual income & expense entries (with optional VAT) sit alongside auto sources: invoice payments and site expenses.',
      'Money-in-hand is split by method — cash vs petty cash vs bank vs card — with per-account balances.',
      'Transfers move money between accounts (e.g. Bank → Petty cash) without counting as income or expense.',
      'Set opening balances, run petty cash, and see output VAT − input VAT for the period.',
    ],
  },
  {
    icon: 'ti-briefcase', color: '#0099cc', title: 'Projects',
    intro: 'Run each job end to end — from contract to handover — with live profit/loss.',
    steps: [
      'A project is created from an approved quote or added manually (client, value, location).',
      'Status lifecycle: Planning → Designing → Production → Ready for delivery → Site installation → Snagging → Handover → Completed (plus On Hold / Cancelled).',
      'Set Start date and "Committed (days)" → Target end auto-fills; the card shows a progress ring and the start→end timeline.',
      'Timeline (stages/milestones) with weights drive overall % complete.',
      'Scope: assign each scope line to a subcontractor with an amount.',
      'Client payments, Material requests and Site expenses all roll up into the project\'s cost and Profit/Loss.',
    ],
  },
  {
    icon: 'ti-users-group', color: '#8b5cf6', title: 'Subcontractors — LPO + NDA',
    intro: 'Engage subcontractors with proper paperwork in one click.',
    steps: [
      'Add subcontractors and assign scope + amounts; track contract vs paid via a payment ledger.',
      '"Generate LPO + NDA" prints both in one document: the LPO (scope, total, project timeline, a delay/liquidated-damages clause and a coordination clause listing the other contractors) followed by a strong Non-Disclosure & Non-Circumvention Agreement.',
      'The subcontractor\'s completion is auto-set 15% of the schedule before the project end date (buffer for inspection & handover).',
    ],
  },
  {
    icon: 'ti-history', color: '#0099cc', title: 'Project history & updates',
    intro: 'A date-stamped record of everything that happens on the job.',
    steps: [
      'Log meetings, client requirements, material changes, timeline changes and decisions — each with a date.',
      'Mark an update "visible to client" and/or "needs client approval".',
      'A timeline-change update records the old → new date and (once approved) moves the project\'s target end automatically.',
      'Export the full communication history to PDF anytime.',
    ],
  },
  {
    icon: 'ti-user-share', color: '#0a6f8f', title: 'Client portal',
    intro: 'Give the client a live, private window into their project — with approvals.',
    steps: [
      'On the project, the client\'s primary WhatsApp number is locked to the client on record (no leaks); you can add extra numbers.',
      'Share the private link + a 6-digit access code over WhatsApp (one tap) or copy it.',
      'The client opens the link, enters the code (remembered on their device after the first time) and sees a branded page: status & timeline rings, stages, and the shared updates.',
      'For any change that needs approval, the client taps Approve or Reject and can add a comment — both are recorded.',
      'The client can post their own messages back; you get a notification in your Inbox/bell. Either side can export the communication to PDF.',
    ],
  },
  {
    icon: 'ti-robot', color: '#8b5cf6', title: 'AI tools',
    intro: 'Speed up the busywork.',
    steps: [
      'AI Quote Builder: draft a full quotation from a short brief, then refine.',
      'AI Assistant: ask questions and get help across your business data.',
    ],
  },
  {
    icon: 'ti-shield-check', color: '#10b981', title: 'Reputation',
    intro: 'Build trust that wins more work.',
    steps: [
      'Trust Score reflects your verification, reviews and activity.',
      'Reviews: collect and reply to customer reviews.',
    ],
  },
  {
    icon: 'ti-building-store', color: '#d97706', title: 'Your public profile',
    intro: 'Everything clients see about you.',
    steps: [
      'Business Profile, Portfolio (your work), Verification (trade licence & documents), Our Team and FAQ.',
      'Share your public profile link / QR from the sidebar.',
    ],
  },
  {
    icon: 'ti-chart-bar', color: '#3b82f6', title: 'Growth',
    intro: 'Grow beyond your existing pipeline.',
    steps: [
      'Analytics: see how your leads, quotes and conversions trend.',
      'Sponsored Placement: feature your business for more visibility.',
    ],
  },
  {
    icon: 'ti-key', color: '#64748b', title: 'Team & settings',
    intro: 'Control who can do what, and how the portal behaves.',
    steps: [
      'Staff & Access: invite team members and set role-based permissions.',
      'Control Panel: company settings, verification status and plan.',
    ],
  },
]

// Quick FAQ — common questions, shown as an accordion on the Help page.
export const GUIDE_FAQ = [
  { q: 'How does a lead become a project?', a: 'Win the lead, build a quotation and share the approval link. When the client approves the quote it can auto-create a project — or you can add a project manually with the client and contract value.' },
  { q: 'How does the client see their project — do they need a login?', a: 'No login or app. On the project, set the client and share the private link + a 6-digit access code over WhatsApp. The client opens the link, enters the code once (it is remembered on their device) and sees a live, read-only view.' },
  { q: 'How is the client view kept secure / leak-proof?', a: 'Two factors are needed: an unguessable link token plus the 6-digit access code. The primary WhatsApp number is locked to the client on record, and only updates you mark "visible to client" are ever shown — internal notes stay private.' },
  { q: 'How do I send an LPO and NDA to a subcontractor?', a: 'Open the project → Subcontractors → "Generate LPO + NDA". Both print together in one document: the LPO (with project timeline, a delay/liquidated-damages clause and a coordination clause) followed by a strong Non-Disclosure & Non-Circumvention Agreement.' },
  { q: 'How is the subcontractor’s deadline decided?', a: 'It is set automatically to 15% of the project schedule before the project end date, leaving a buffer for inspection, snagging and handover.' },
  { q: 'How do I change the project timeline with the client’s consent?', a: 'Add a "Timeline change" update with the new date and tick "needs client approval". The client approves it from their page — only then does the project’s target end date move. Everything is recorded.' },
  { q: 'Where do client messages and approvals appear?', a: 'In the project history (tagged "From client" / approved / rejected, with any comment) and as a notification in your Inbox and the bell.' },
  { q: 'Can I export the project communication?', a: 'Yes — "Export PDF" is available on the project history (company side) and on the client page. It produces a clean, branded report of all updates and decisions.' },
  { q: 'How does the Ledger know my real cash position?', a: 'It combines manual income/expense entries with invoice payments and site expenses, then splits money-in-hand by method (cash, petty cash, bank, card). Transfers move money between accounts without counting as income or expense.' },
  { q: 'Can I limit what my staff can see?', a: 'Yes. In Staff & Access invite members with roles (Manager, Sales, Engineer, Staff); each role has its own permissions controlling which modules they can open.' },
  { q: 'Can I use the portal before my business is approved?', a: 'Yes — you can set up your Business Profile, logo, Portfolio, Verification documents and FAQ while under review. The remaining features unlock automatically once approved.' },
]
