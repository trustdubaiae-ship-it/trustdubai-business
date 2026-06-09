// trustdubai-business/src/pages/MenuPage.jsx
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { can } from '../lib/permissions'
import { MENU } from '../components/Sidebar'

/* ============================================================================
   App Launcher — a tappable, grouped mirror of the sidebar.
   Reads the SAME `MENU` exported by Sidebar.jsx (single source of truth), so
   adding / renaming / reordering an item there updates this launcher too.

   Lock logic mirrors the sidebar exactly:
     • permission lock  → greyed + 🔒 ("No access"), not clickable
     • approval lock    → greyed + 🔒 ("After approval"), not clickable (until approved)
     • add-on lock      → "ADD-ON" badge, tap → Plans
     • plan/feature lock→ greyed + 🔒 ("Upgrade plan"), tap → Plans
     • coming soon       → "Soon" badge, tap → Coming Soon page
   Plus the two sidebar specials: "Share Profile" (link + QR modal) and
   "View Public Profile" (opens the live public page).
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
  const { company, staff, role, hasFeature, hasAddon } = useAuth()
  const perms = staff?.permissions || null
  const limitedMode = !isApproved
  const checkAddon = (k) => (typeof hasAddon === 'function' ? hasAddon(k) : false)
  const checkFeature = (k) => (typeof hasFeature === 'function' ? hasFeature(k) : true)

  const groups = buildGroups()

  // Share Profile modal (mirrors the sidebar)
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const slug = company?.slug || ''
  const publicLink = `https://trustdubai.ae/${slug}`
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
    const text = `Check out ${company?.name || 'our'} verified profile on TrustDubai: ${publicLink}`
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
        <h1 className="td-menu-title">All Features</h1>
        <p className="td-menu-sub">Everything in one place — tap a tile to open it.</p>
      </div>

      {groups.map((group, gi) => (
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
              const badge =
                !special && st.addonLocked ? 'addon'
                  : !special && st.showSoon ? 'soon'
                    : (hardLocked || softLocked) ? 'lock' : ''
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
                  {badge === 'soon' && <span className="td-badge td-badge-soon">Soon</span>}
                  {badge === 'addon' && <span className="td-badge td-badge-addon"><i className="ti ti-plus" /> Add-on</span>}
                  {badge === 'lock' && <span className="td-badge td-badge-lock"><i className="ti ti-lock" /></span>}

                  <span
                    className="td-tile-icon"
                    style={{ background: greyed ? 'var(--bg2)' : group.color + '1f', color: greyed ? 'var(--text3)' : group.color }}
                  >
                    <i className={`ti ${item.icon}`} />
                  </span>
                  <span className="td-tile-title">{item.label}</span>
                  <span className="td-tile-desc">{lockLabel || labelHint(item)}</span>
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
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 18 }}>Complete your business profile to get a shareable TrustDubai profile URL and QR code.</div>
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
                      Customers scan this to view your <b style={{ color: 'var(--text2)' }}>verified TrustDubai profile</b> — reviews, work, trust score &amp; contact.
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
.td-menu-head{ margin-bottom:18px; }
.td-menu-title{ font-size:22px; font-weight:800; color:var(--text); margin:0; font-family:'Syne',sans-serif; }
.td-menu-sub{ font-size:13px; color:var(--text2); margin:5px 0 0; }

.td-menu-group{ margin-bottom:22px; }
.td-menu-group-head{ display:flex; align-items:center; gap:8px; margin:0 2px 11px; }
.td-menu-dot{ width:9px; height:9px; border-radius:3px; flex-shrink:0; }
.td-menu-group-label{ font-size:11.5px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:var(--text2); }

.td-menu-grid{ display:grid; gap:12px; grid-template-columns:repeat(5,1fr); }

.td-tile{
  position:relative; display:flex; flex-direction:column; align-items:flex-start; gap:9px; text-align:left;
  background:var(--card); border:0.5px solid var(--border); border-radius:16px; padding:15px;
  cursor:pointer; font-family:inherit; min-width:0; width:100%;
  transition:transform .15s ease, border-color .15s ease, box-shadow .15s ease;
}
.td-tile:hover:not(:disabled){ transform:translateY(-3px); border-color:rgba(0,153,204,0.45); box-shadow:0 8px 22px rgba(0,0,0,0.10); }
.td-tile:active:not(:disabled){ transform:translateY(-1px); }
.td-tile.is-greyed{ opacity:0.55; }
.td-tile:disabled{ cursor:default; }

.td-tile-icon{ width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:21px; flex-shrink:0; }
.td-tile-title{ font-size:13.5px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
.td-tile-desc{ font-size:11px; color:var(--text3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }

.td-badge{ position:absolute; top:10px; right:10px; font-size:9px; font-weight:800; line-height:1.4; border-radius:20px; display:flex; align-items:center; gap:3px; }
.td-badge-soon{ padding:2px 8px; background:rgba(245,158,11,0.16); color:#c9952a; }
.td-badge-addon{ padding:2px 7px; background:rgba(0,153,204,0.12); color:#0099cc; border:0.5px solid rgba(0,153,204,0.25); }
.td-badge-addon i{ font-size:9px; }
.td-badge-lock{ padding:3px 6px; background:var(--bg2); color:var(--text3); }
.td-badge-lock i{ font-size:11px; }

@media (max-width:1100px){ .td-menu-grid{ grid-template-columns:repeat(4,1fr); } }
@media (max-width:860px){  .td-menu-grid{ grid-template-columns:repeat(3,1fr); } }
@media (max-width:560px){  .td-menu-grid{ grid-template-columns:repeat(2,1fr); } .td-tile{ padding:13px; } .td-tile-icon{ width:38px; height:38px; font-size:19px; } }
`
