// tritova-business/src/pages/MenuPage.jsx
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { can } from '../lib/permissions'
import { MENU } from '../components/Sidebar'

/* ============================================================================
   App Launcher — a tappable, grouped mirror of the sidebar.
   Reads the SAME `MENU` exported by Sidebar.jsx (single source of truth).

   Every tile shows a CROWN coloured by the plan that unlocks that feature:
     Free → grey · Silver → slate · Gold → gold · Platinum → purple
   While on the Launch Plan trial, each PAID feature also shows a small
   "X days left" chip (free features never expire, so they don't get one).

   Lock logic mirrors the sidebar exactly:
     • permission lock  → greyed + 🔒 ("No access"), not clickable
     • approval lock    → greyed + 🔒 ("After approval"), not clickable
     • add-on lock      → "ADD-ON", tap → Plans
     • plan/feature lock→ greyed + 🔒 ("Upgrade plan"), tap → Plans
     • coming soon       → "Soon", tap → Coming Soon page
   Light + dark via CSS vars · responsive (2 → 3 → 4 → 5 columns).
============================================================================ */

const GROUP_COLOR = {
  'MAIN':           '#0099cc',
  'LEAD HUB':       '#06b6d4',
  'SALES & QUOTES': '#7c3aed',
  'PROJECTS & OPS': '#f59e0b',
  'AI & CRM':       '#16a34a',
  'REPUTATION':     '#e8b84b',
  'MY PROFILE':     '#3b82f6',
  'GROWTH':         '#ec4899',
  'TEAM & ACCESS':  '#64748b',
  'SETTINGS':       '#64748b',
  'QUICK LINKS':    '#0099cc',
}

/* ---------------------------------------------------------------------------
   WHICH PLAN EACH TILE BELONGS TO  ← edit any value to recolour its crown.
   free | silver | gold | platinum
--------------------------------------------------------------------------- */
const TILE_PLAN = {
  // MAIN
  controlwall: 'free', dashboard: 'free', revenueengine: 'gold', inbox: 'free', notifications: 'free',
  // LEAD HUB
  leadengine: 'gold', leads: 'silver', metaads: 'platinum',
  // SALES & QUOTES
  quotations: 'silver', quotelibrary: 'silver', quoteSettings: 'silver', quoteapprovals: 'gold', aiquote: 'platinum',
  // PROJECTS & OPS
  projects: 'platinum', materials: 'platinum', expenses: 'platinum',
  // AI & CRM
  aiassistant: 'platinum', organizer: 'free',
  // REPUTATION
  trust: 'free', reviews: 'silver',
  // MY PROFILE
  profile: 'free', portfolio: 'free', documents: 'free', team: 'free', faq: 'free',
  // GROWTH
  analytics: 'gold', sponsored: 'platinum',
  // TEAM & ACCESS
  staff: 'silver',
  // SETTINGS
  controlpanel: 'free',
}

const CROWN_COLOR = { free: '#9ca3af', silver: '#64748b', gold: '#d97706', platinum: '#8b5cf6' }
const PLAN_LABEL  = { free: 'Free', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' }

function tilePlan(item) {
  if (item._special) return 'free'
  return TILE_PLAN[item.id] || 'free'
}

// Convert the flat sidebar MENU (section markers + items) into grouped tiles,
// injecting the same specials the sidebar shows (Share Profile, View Public Profile).
function buildGroups() {
  const groups = []
  let cur = null
  for (const it of MENU) {
    if (it.section) {
      cur = { label: it.section, color: GROUP_COLOR[it.section] || '#64748b', items: [] }
      groups.push(cur)
      continue
    }
    if (!cur) { cur = { label: '', color: '#64748b', items: [] }; groups.push(cur) }
    cur.items.push(it)
    // sidebar injects "Share Profile" right after Command Center
    if (it.id === 'dashboard') cur.items.push({ _special: 'share', icon: 'ti-qrcode', label: 'Share Profile' })
  }
  groups.push({ label: 'QUICK LINKS', color: '#0099cc', items: [{ _special: 'external', icon: 'ti-external-link', label: 'View Public Profile' }] })
  return groups
}

const ADDON_NAMES = { crm: 'CRM / Lead Engine', quotation: 'Quotation Suite', projects: 'Projects & Ops', ai: 'AI Assistant' }

export default function MenuPage({ onNavigate, isApproved = true, limitedPages = [] }) {
  const { company, staff, role, hasFeature, hasAddon, isTrial, trialDaysLeft } = useAuth()
  const perms = staff?.permissions || null
  const limitedMode = !isApproved
  const checkAddon = (k) => (typeof hasAddon === 'function' ? hasAddon(k) : false)
  const checkFeature = (k) => (typeof hasFeature === 'function' ? hasFeature(k) : true)

  const groups = buildGroups()

  // live feature search
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const visibleGroups = groups
    .map(g => ({ ...g, items: g.items.filter(it => !query || (it.label || '').toLowerCase().includes(query) || (labelHint(it) || '').toLowerCase().includes(query)) }))
    .filter(g => g.items.length)

  // Share Profile modal (mirrors the sidebar)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const slug = company?.slug || ''
  const publicLink = `https://quvera.ae/${slug}`
  const profileQrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=14&data=${encodeURIComponent(publicLink)}`

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(publicLink)
      setCopied(true); setTimeout(() => setCopied(false), 1800)
    } catch (e) {
      const ta = document.createElement('textarea')
      ta.value = publicLink; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch (e2) {}
      document.body.removeChild(ta)
    }
  }
  async function downloadProfileQR() {
    try {
      const res = await fetch(profileQrSrc)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(company?.name || 'profile').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) { window.open(profileQrSrc, '_blank') }
  }
  function shareProfileWhatsApp() {
    const text = `Check out ${company?.name || 'our'} verified profile on Quvera: ${publicLink}`
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')
  }

  // Compute lock state for a normal menu item (mirror of Sidebar logic)
  function lockState(item) {
    const permLocked = !can(role, perms, item.perm)
    const addonLocked = !permLocked && !!item.addon && !checkAddon(item.addon)
    const limitLocked = !permLocked && !addonLocked && limitedMode && !item.soon && !limitedPages.includes(item.id)
    const featureLocked = (!permLocked && !addonLocked && !limitLocked && !item.soon && item.featureKey) ? !checkFeature(item.featureKey) : false
    const showSoon = item.soon && !addonLocked
    return { permLocked, addonLocked, limitLocked, featureLocked, showSoon }
  }

  function handleTile(item, st) {
    if (item._special === 'share') { setCopied(false); setShareOpen(true); return }
    if (item._special === 'external') { window.open(publicLink, '_blank'); return }
    if (st.permLocked || st.limitLocked) return                 // hard locked → no-op
    if (st.addonLocked || st.featureLocked) { onNavigate && onNavigate('plans'); return } // upsell
    onNavigate && onNavigate(item.id)                            // normal (incl. soon → ComingSoon)
  }

  return (
    <div className="td-menu">
      <style>{CSS}</style>

      <div className="td-menu-head">
        <div className="td-menu-search">
          <i className="ti ti-search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search features…" />
          {q && <button onClick={() => setQ('')} aria-label="Clear"><i className="ti ti-x" /></button>}
        </div>
      </div>

      {/* Launch Plan banner — visible only while the trial is active */}
      {isTrial && (
        <div
          className="td-launch"
          onClick={() => onNavigate && onNavigate('plans')}
          title="You're on the free Launch Plan — full access for a limited time"
        >
          <span className="td-launch-icon"><i className="ti ti-rocket" /></span>
          <div className="td-launch-txt">
            <div className="td-launch-title">Launch Plan active</div>
            <div className="td-launch-sub">
              <span className="td-launch-days">{trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left</span> — every paid
              feature below (look for the 👑) is unlocked free
            </div>
          </div>
          <span className="td-launch-cta">Upgrade to keep →</span>
        </div>
      )}

      {visibleGroups.length === 0 && (
        <div className="td-menu-empty"><i className="ti ti-search-off" /> No features match “{q}”.</div>
      )}

      {visibleGroups.map((group, gi) => (
        <div className="td-menu-group" key={`${group.label}-${gi}`}>
          <div className="td-menu-group-head">
            <span className="td-menu-dot" style={{ background: group.color }} />
            <span className="td-menu-group-label">{group.label}</span>
          </div>

          <div className="td-menu-grid">
            {group.items.map((item, ii) => {
              const special = !!item._special
              const st = special ? {} : lockState(item)
              const hardLocked = !special && (st.permLocked || st.limitLocked)
              const softLocked = !special && (st.addonLocked || st.featureLocked)
              const greyed = (hardLocked || softLocked) && !(st && st.showSoon)

              // Status chip (top-right, next to the crown): addon → soon → lock
              const status =
                !special && st.addonLocked ? 'addon'
                  : !special && st.showSoon ? 'soon'
                    : (hardLocked || softLocked) ? 'lock' : ''

              // Plan crown — coloured by the plan that owns this feature.
              const plan = tilePlan(item)
              const crownColor = CROWN_COLOR[plan]

              // Days-left chip — shown on EVERY usable card during the trial.
              // (Skipped only on hard-locked / coming-soon tiles, which you can't use yet.)
              const showDays = isTrial && !greyed && !(st && st.showSoon)

              const lockLabel =
                special ? ''
                  : st.permLocked ? 'No access'
                    : st.limitLocked ? 'After approval'
                      : st.addonLocked ? (ADDON_NAMES[item.addon] || 'Add-on')
                        : st.featureLocked ? 'Upgrade plan'
                          : st.showSoon ? 'Coming soon' : ''

              return (
                <button
                  key={`${item.id || item._special}-${ii}`}
                  className={`td-tile${greyed ? ' is-greyed' : ''}`}
                  onClick={() => handleTile(item, st)}
                  disabled={hardLocked}
                  title={lockLabel || item.label}
                >
                  <span className="td-tile-accent" style={{ background: greyed ? 'transparent' : group.color }} />
                  {/* top-right: status chip + plan crown */}
                  <span className="td-tr">
                    {status === 'soon' && <span className="td-mini td-mini-soon">Soon</span>}
                    {status === 'addon' && <span className="td-mini td-mini-addon"><i className="ti ti-plus" /></span>}
                    {status === 'lock' && <span className="td-mini td-mini-lock"><i className="ti ti-lock" /></span>}
                    <span
                      className="td-crown"
                      style={{ color: crownColor, background: crownColor + '22' }}
                      title={`${PLAN_LABEL[plan]} plan feature`}
                    >
                      <i className="ti ti-crown" />
                    </span>
                  </span>

                  <span
                    className="td-tile-icon"
                    style={greyed
                      ? { background: 'var(--bg2)', color: 'var(--text3)' }
                      : { background: `linear-gradient(135deg, ${group.color}2e, ${group.color}10)`, color: group.color, boxShadow: `0 5px 16px ${group.color}30`, border: `0.5px solid ${group.color}40` }}
                  >
                    <i className={`ti ${item.icon}`} />
                  </span>
                  <span className="td-tile-title">{item.label}</span>
                  <span className="td-tile-desc">{lockLabel || labelHint(item)}</span>

                  {showDays && (
                    <span className="td-days" title="Free during your Launch Plan trial">
                      <i className="ti ti-rocket" /> {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Share Profile modal */}
      {shareOpen && (
        <div onClick={() => setShareOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 16, width: 'min(440px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>
            <div style={{ padding: '16px 18px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Share your profile</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company?.name || 'Your business'}</div>
              </div>
              <button onClick={() => setShareOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20, flexShrink: 0, marginLeft: 10 }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ padding: 18 }}>
              {!slug ? (
                <div style={{ textAlign: 'center', padding: '24px 8px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <i className="ti ti-link-off" style={{ fontSize: 24, color: '#d97706' }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Your public link isn't ready yet</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 18 }}>Complete your business profile to get a shareable Quvera profile URL and QR code.</div>
                  <button onClick={() => { setShareOpen(false); onNavigate && onNavigate('profile') }}
                    style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: '#0099cc', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    Complete profile →
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18 }}>
                    <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '0.5px solid var(--border)' }}>
                      <img src={profileQrSrc} alt="Profile QR code" width={200} height={200} style={{ display: 'block', width: 200, height: 200 }} />
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
                      Customers scan this to view your <b style={{ color: 'var(--text2)' }}>verified Quvera profile</b> — reviews, work, trust score &amp; contact.
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '.3px' }}>Profile link</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <input readOnly value={publicLink} onFocus={(e) => e.target.select()}
                      style={{ flex: 1, minWidth: 0, padding: '10px 12px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', borderRadius: 8, fontSize: 12.5, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    <button onClick={copyProfileLink}
                      style={{ padding: '0 16px', borderRadius: 8, background: copied ? '#10b981' : '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <i className={'ti ' + (copied ? 'ti-check' : 'ti-copy')} style={{ fontSize: 14 }} /> {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={downloadProfileQR}
                      style={{ padding: 11, borderRadius: 8, background: 'var(--bg2)', color: 'var(--text)', border: '0.5px solid var(--border)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <i className="ti ti-download" style={{ fontSize: 15 }} /> Download QR
                    </button>
                    <button onClick={shareProfileWhatsApp}
                      style={{ padding: 11, borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <i className="ti ti-brand-whatsapp" style={{ fontSize: 15 }} /> Share
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Short helper line under each tile when no lock label applies.
function labelHint(item) {
  const map = {
    controlwall: 'Full-screen board', dashboard: 'Your overview', revenueengine: 'Sales CRM', inbox: 'Messages', notifications: 'Alerts & updates',
    leadengine: 'Distribute & track', leads: 'Capture enquiries', metaads: 'Ad campaigns',
    quotations: 'Create & send', quotelibrary: 'Saved descriptions', quoteSettings: 'Footer, VAT, signature', quoteapprovals: 'Approve quotes', aiquote: 'Auto-draft quotes',
    projects: 'Manage projects', materials: 'Track materials', expenses: 'Log expenses',
    aiassistant: 'Ask anything', organizer: 'Tasks & reminders',
    trust: 'Your 3 shields', reviews: 'Customer reviews',
    profile: 'Public profile', portfolio: 'Project gallery', documents: 'Verify your business', team: 'Team members', faq: 'Edit your FAQs',
    analytics: 'Traffic & insights', sponsored: 'Boost listing',
    staff: 'Roles & permissions', controlpanel: 'Settings',
  }
  if (item._special === 'share') return 'Link + QR code'
  if (item._special === 'external') return 'Open live page'
  return map[item.id] || ''
}

const CSS = `
.td-menu{ max-width:1200px; margin:0 auto; }
.td-menu *{ box-sizing:border-box; }
.td-menu-head{ display:flex; align-items:flex-end; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:20px; }
.td-menu-title{ font-size:22px; font-weight:800; color:var(--text); margin:0; font-family:'Sora',sans-serif; letter-spacing:-0.01em; }
.td-menu-sub{ font-size:13px; color:var(--text2); margin:5px 0 0; }

/* header search */
.td-menu-search{ display:flex; align-items:center; gap:9px; background:var(--card); border:0.5px solid var(--border); border-radius:12px; padding:10px 14px; flex:0 1 340px; min-width:220px; }
.td-menu-search i{ font-size:16px; color:var(--text3); }
.td-menu-search input{ flex:1; min-width:0; border:none; outline:none; background:none; font-size:14px; color:var(--text); font-family:inherit; }
.td-menu-search button{ border:none; background:none; cursor:pointer; color:var(--text3); display:flex; padding:0; }

.td-menu-empty{ text-align:center; color:var(--text3); font-size:14px; padding:40px 16px; background:var(--card); border:0.5px solid var(--border); border-radius:16px; }
.td-menu-empty i{ display:block; font-size:28px; margin-bottom:8px; }

/* tile top accent in the group colour */
.td-tile-accent{ position:absolute; top:0; left:14px; right:14px; height:3px; border-radius:0 0 4px 4px; opacity:.5; transition:opacity .15s ease; }
.td-tile:hover:not(:disabled) .td-tile-accent{ opacity:1; }

/* Launch Plan banner */
.td-launch{
  display:flex; align-items:center; gap:13px; margin-bottom:22px; cursor:pointer;
  background:linear-gradient(135deg, rgba(139,92,246,0.16), rgba(0,153,204,0.10));
  border:0.5px solid rgba(139,92,246,0.35); border-radius:14px; padding:13px 16px;
  transition:transform .15s ease, box-shadow .15s ease;
}
.td-launch:hover{ transform:translateY(-2px); box-shadow:0 8px 22px rgba(139,92,246,0.18); }
.td-launch-icon{ width:40px; height:40px; border-radius:12px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:19px; color:#8b5cf6; background:rgba(139,92,246,0.16); }
.td-launch-txt{ flex:1; min-width:0; }
.td-launch-title{ font-size:13.5px; font-weight:800; color:#8b5cf6; }
.td-launch-sub{ font-size:11.5px; color:var(--text2); margin-top:2px; line-height:1.5; }
.td-launch-days{ font-weight:800; color:#8b5cf6; }
.td-launch-cta{ font-size:11px; font-weight:700; color:#8b5cf6; background:rgba(139,92,246,0.12); border:0.5px solid rgba(139,92,246,0.3); padding:7px 12px; border-radius:9px; white-space:nowrap; flex-shrink:0; }

.td-menu-group{ margin-bottom:22px; }
.td-menu-group-head{ display:flex; align-items:center; gap:8px; margin:0 2px 11px; }
.td-menu-dot{ width:9px; height:9px; border-radius:3px; flex-shrink:0; }
.td-menu-group-label{ font-size:11.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--text2); }

.td-menu-grid{ display:grid; gap:12px; grid-template-columns:repeat(5,1fr); }

.td-tile{
  position:relative; display:flex; flex-direction:column; align-items:flex-start; gap:9px; text-align:left;
  background:linear-gradient(165deg, var(--card) 62%, var(--bg2)); border:0.5px solid var(--border); border-radius:16px; padding:15px;
  cursor:pointer; font-family:inherit; min-width:0; width:100%; height:100%; min-height:140px; overflow:hidden;
  transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;
}
/* sheen that fades in on hover (sits behind content) */
.td-tile::after{ content:''; position:absolute; inset:0; z-index:0; pointer-events:none; opacity:0; transition:opacity .2s ease;
  background:radial-gradient(130% 90% at 100% 0%, rgba(0,153,204,0.12), transparent 55%); }
.td-tile > *{ position:relative; z-index:1; }
.td-tile:hover:not(:disabled){ transform:translateY(-4px); border-color:rgba(0,153,204,0.5); box-shadow:0 14px 32px rgba(0,0,0,0.14); }
.td-tile:hover:not(:disabled)::after{ opacity:1; }
.td-tile:active:not(:disabled){ transform:translateY(-1px); }
.td-tile.is-greyed{ opacity:0.55; }
.td-tile:disabled{ cursor:default; }

.td-tile-icon{ width:44px; height:44px; border-radius:13px; display:flex; align-items:center; justify-content:center; font-size:21px; flex-shrink:0; transition:transform .18s ease; }
.td-tile:hover:not(:disabled) .td-tile-icon{ transform:scale(1.08) rotate(-3deg); }
.td-tile-title{ font-size:13.5px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
.td-tile-desc{ font-size:11px; color:var(--text3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }

/* top-right cluster: status chip + plan crown */
.td-tr{ position:absolute; top:9px; right:9px; display:flex; align-items:center; gap:5px; }
.td-crown{ width:22px; height:22px; border-radius:7px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; flex-shrink:0; }
.td-mini{ font-size:9px; font-weight:800; line-height:1.4; border-radius:20px; display:inline-flex; align-items:center; gap:3px; padding:2px 7px; }
.td-mini-soon{ background:rgba(245,158,11,0.16); color:#c9952a; }
.td-mini-addon{ background:rgba(0,153,204,0.12); color:#0099cc; border:0.5px solid rgba(0,153,204,0.25); padding:3px 6px; }
.td-mini-addon i{ font-size:10px; }
.td-mini-lock{ background:var(--bg2); color:var(--text3); padding:3px 6px; }
.td-mini-lock i{ font-size:11px; }

/* days-left chip (premium tiles, during trial) */
.td-days{ display:inline-flex; align-items:center; gap:4px; margin-top:auto; font-size:10px; font-weight:800; color:#8b5cf6; background:rgba(139,92,246,0.12); padding:2px 8px; border-radius:7px; align-self:flex-start; max-width:100%; }
.td-days i{ font-size:11px; }

@media (max-width:1100px){ .td-menu-grid{ grid-template-columns:repeat(4,1fr); } }
@media (max-width:860px){  .td-menu-grid{ grid-template-columns:repeat(3,1fr); } }
@media (max-width:560px){  .td-menu-grid{ grid-template-columns:repeat(2,1fr); } .td-tile{ padding:13px; min-height:122px; } .td-tile-icon{ width:38px; height:38px; font-size:19px; } .td-launch-cta{ display:none; } }
`
