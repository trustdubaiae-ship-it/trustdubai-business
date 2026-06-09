// trustdubai-business/src/pages/MenuPage.jsx
import { FEATURE_GROUPS } from '../lib/features'
import { can } from '../lib/permissions'

/* ============================================================================
   App Launcher — shows every feature as a tappable tile, grouped by section.
   • Permission-aware: tiles the user can't access are greyed + 🔒 ("No access")
   • Approval-aware:  tiles locked until the business is approved show 🔒 ("After approval")
   • Coming-soon tiles show a "Soon" badge (still tappable → ComingSoon page)
   • Light + dark via CSS vars · fully responsive (2→3→4→5 columns)
   Tiles & groups are defined in src/lib/features.js (single source of truth).
============================================================================ */
export default function MenuPage({ onNavigate, role, permissions, isApproved = true, limitedPages = [] }) {
  // A page is locked until approval if it is NOT in the always-allowed limited list.
  const lockedUntilApproval = (key) => !isApproved && !limitedPages.includes(key)

  return (
    <div className="td-menu">
      <style>{CSS}</style>

      <div className="td-menu-head">
        <h1 className="td-menu-title">All Features</h1>
        <p className="td-menu-sub">Everything in one place — tap a tile to open it.</p>
      </div>

      {FEATURE_GROUPS.map((group) => (
        <div className="td-menu-group" key={group.key}>
          <div className="td-menu-group-head">
            <span className="td-menu-dot" style={{ background: group.color }} />
            <span className="td-menu-group-label">{group.label}</span>
          </div>

          <div className="td-menu-grid">
            {group.items.map((it) => {
              const noPerm  = it.perm && !can(role, permissions, it.perm)
              const appLock = lockedUntilApproval(it.key)
              const locked  = noPerm || appLock
              const lockLabel = noPerm ? 'No access' : appLock ? 'After approval' : ''
              const soon = !!it.comingSoon
              const clickable = !locked

              return (
                <button
                  key={it.key}
                  className={`td-tile${locked ? ' is-locked' : ''}`}
                  onClick={() => clickable && onNavigate && onNavigate(it.key)}
                  disabled={!clickable}
                  title={locked ? lockLabel : it.title}
                >
                  {soon && !locked && <span className="td-badge td-badge-soon">Soon</span>}
                  {locked && <span className="td-badge td-badge-lock"><i className="ti ti-lock" /></span>}

                  <span
                    className="td-tile-icon"
                    style={{
                      background: locked ? 'var(--bg2)' : group.color + '1f',
                      color: locked ? 'var(--text3)' : group.color,
                    }}
                  >
                    <i className={`ti ${it.icon}`} />
                  </span>

                  <span className="td-tile-title">{it.title}</span>
                  <span className="td-tile-desc">{locked ? lockLabel : it.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
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
.td-tile.is-locked, .td-tile:disabled{ cursor:default; opacity:0.55; }

.td-tile-icon{ width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:21px; flex-shrink:0; }
.td-tile-title{ font-size:13.5px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
.td-tile-desc{ font-size:11px; color:var(--text3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }

.td-badge{ position:absolute; top:10px; right:10px; font-size:9px; font-weight:800; line-height:1.4; border-radius:20px; }
.td-badge-soon{ padding:2px 8px; background:rgba(232,184,75,0.20); color:#c9952a; }
.td-badge-lock{ padding:3px 6px; background:var(--bg2); color:var(--text3); display:flex; align-items:center; }
.td-badge-lock i{ font-size:11px; }

@media (max-width:1100px){ .td-menu-grid{ grid-template-columns:repeat(4,1fr); } }
@media (max-width:860px){  .td-menu-grid{ grid-template-columns:repeat(3,1fr); } }
@media (max-width:560px){  .td-menu-grid{ grid-template-columns:repeat(2,1fr); } .td-tile{ padding:13px; } .td-tile-icon{ width:38px; height:38px; font-size:19px; } }
`
