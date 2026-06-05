// trustdubai-business/src/pages/ComingSoon.jsx
import { useState, useEffect } from 'react'

/* =========================================================================
   Reusable "Coming Soon" placeholder for not-yet-built features.
   Fully responsive (phone → big desktop) + light/dark via app CSS vars.
   Usage: <ComingSoon feature="ai_assistant" onNavigate={navigate} />
   ========================================================================= */

const FEATURES = {
  trustdubai_leads: {
    icon: 'ti-brand-trustpilot',
    title: 'TrustDubai Leads',
    tag: 'Lead Hub',
    desc: 'A dedicated tab for leads delivered directly from the TrustDubai platform — separate from your own captured leads.',
    points: [
      'Platform leads in one focused view (All · TrustDubai · Own)',
      'Auto-delivered from your public profile enquiries',
      'Quick accept / contact / convert actions',
    ],
  },
  meta_ads: {
    icon: 'ti-ad-2',
    title: 'Meta Ads',
    tag: 'Lead Hub',
    desc: 'Connect your Facebook & Instagram ad account to run, track and auto-import leads — all inside your portal.',
    points: [
      'Live ad performance with real cost-per-lead',
      'Pause / resume / adjust budget from here',
      'Auto-import lead form submissions',
    ],
  },
  quote_approvals: {
    icon: 'ti-checkup-list',
    title: 'Quote Approvals',
    tag: 'Sales & Quotes',
    desc: 'A manager approval step before quotations are sent to clients — keeps pricing consistent and professional.',
    points: [
      'Estimator prepares → Manager approves → Send',
      'Status flow: Draft → Pending → Approved → Sent',
      'Role-based: only managers can approve',
    ],
  },
  ai_quote_builder: {
    icon: 'ti-sparkles',
    title: 'AI Quote Builder',
    tag: 'Sales & Quotes',
    desc: 'AI reads the lead details and drafts a ready-to-edit quotation (BOQ) in seconds — you just review and send.',
    points: [
      'Auto-draft BOQ from lead scope & budget',
      'Smart item & rate suggestions',
      'Edit, approve and send in one flow',
    ],
  },
  projects: {
    icon: 'ti-briefcase',
    title: 'Projects',
    tag: 'Projects & Ops',
    desc: 'Track every project end-to-end — assign engineers, log progress, and see income vs expense profit per site.',
    points: [
      'Assign projects to site engineers',
      'Per-project income / expense / profit',
      'Status, timeline and document tracking',
    ],
  },
  material_requests: {
    icon: 'ti-package',
    title: 'Material Requests',
    tag: 'Projects & Ops',
    desc: 'Site engineers request materials and the relevant manager approves before purchase — fully tracked.',
    points: [
      'Engineer requests → Manager approves',
      'Flow: Requested → Approval → Approved → Purchased',
      'Approved materials auto-log as site expense',
    ],
  },
  site_expenses: {
    icon: 'ti-coin',
    title: 'Site Expenses',
    tag: 'Projects & Ops',
    desc: 'Record every site cost — material, labour and misc — and see real profit for each project automatically.',
    points: [
      'Expense entry per project / site',
      'Material + labour + misc breakdown',
      'Auto profit calculation vs quotation',
    ],
  },
  ai_assistant: {
    icon: 'ti-robot',
    title: 'AI Assistant',
    tag: 'AI & CRM',
    desc: 'An AI helper that auto-replies to new leads on WhatsApp, qualifies them and answers FAQs — 24/7.',
    points: [
      'Instant auto-reply to new leads',
      'Qualify by budget, timeline & scope',
      'Answer FAQs and book appointments',
    ],
  },
  my_organizer: {
    icon: 'ti-calendar-event',
    title: 'My Organizer',
    tag: 'AI & CRM',
    desc: 'Your private diary — meetings, tasks and notes with reminders. Visible only to you, never on your public profile.',
    points: [
      'Meetings, tasks & notes in one place',
      'Reminders before meeting time',
      'Private — owner only',
    ],
  },
}

const FALLBACK = {
  icon: 'ti-tools',
  title: 'Coming Soon',
  tag: 'New Feature',
  desc: 'This feature is on the way and will be available here soon.',
  points: [],
}

export default function ComingSoon({ feature, title, onNavigate }) {
  const f = FEATURES[feature] || { ...FALLBACK, title: title || FALLBACK.title }

  // subtle entrance
  const [show, setShow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShow(true), 30); return () => clearTimeout(t) }, [])

  return (
    <div style={{
      minHeight: 'calc(100dvh - 160px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'clamp(16px, 4vw, 40px)',
    }}>
      <div style={{
        width: '100%', maxWidth: 560,
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 20, padding: 'clamp(22px, 5vw, 44px)',
        textAlign: 'center',
        opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity .4s ease, transform .4s ease',
        boxSizing: 'border-box',
      }}>
        {/* badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
          color: '#d97706', background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.25)',
          padding: '5px 12px', borderRadius: 20, marginBottom: 20,
        }}>
          <i className="ti ti-clock" style={{ fontSize: 13 }} /> COMING SOON
        </div>

        {/* icon */}
        <div style={{
          width: 'clamp(64px, 16vw, 84px)', height: 'clamp(64px, 16vw, 84px)',
          borderRadius: 22, margin: '0 auto 22px',
          background: 'linear-gradient(135deg, rgba(34,197,94,0.16), rgba(21,128,61,0.10))',
          border: '1px solid rgba(34,197,94,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className={`ti ${f.icon}`} style={{ fontSize: 'clamp(30px, 7vw, 40px)', color: '#22c55e' }} />
        </div>

        {/* tag + title */}
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{f.tag}</div>
        <h1 style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 800, color: 'var(--text)', margin: '0 0 12px', lineHeight: 1.15 }}>{f.title}</h1>
        <p style={{ fontSize: 'clamp(13px, 3.4vw, 15px)', color: 'var(--text2)', lineHeight: 1.6, margin: '0 auto 24px', maxWidth: 440 }}>{f.desc}</p>

        {/* feature points */}
        {f.points.length > 0 && (
          <div style={{
            textAlign: 'left', background: 'var(--bg2, rgba(127,127,127,0.06))',
            border: '1px solid var(--border)', borderRadius: 14,
            padding: 'clamp(14px, 3.5vw, 20px)', margin: '0 auto 26px', maxWidth: 440,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>What you'll get</div>
            {f.points.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: i < f.points.length - 1 ? 11 : 0 }}>
                <i className="ti ti-circle-check" style={{ fontSize: 17, color: '#22c55e', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 'clamp(12.5px, 3.2vw, 14px)', color: 'var(--text2)', lineHeight: 1.5 }}>{p}</span>
              </div>
            ))}
          </div>
        )}

        {/* actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => onNavigate && onNavigate('controlwall')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 15 }} /> Back to Control Wall
          </button>
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 20, lineHeight: 1.5 }}>
          We're building this right now — it'll show up here automatically once it's ready.
        </div>
      </div>
    </div>
  )
}
