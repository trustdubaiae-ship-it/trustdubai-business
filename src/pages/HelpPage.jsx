// "How it works" — in-app feature guide. Content lives in src/lib/featureGuide.js
// (single source). The Export PDF button prints the same content.
import { GUIDE_META, GUIDE_SECTIONS } from '../lib/featureGuide'

function exportPdf(company) {
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const sections = GUIDE_SECTIONS.map((s, i) => `
    <div style="margin-bottom:16px;${i ? '' : ''}page-break-inside:avoid;">
      <div style="display:flex;align-items:center;gap:8px;border-left:4px solid ${s.color};padding-left:10px;margin-bottom:6px;">
        <span style="font-size:15px;font-weight:800;color:#1a1a1a;">${esc(s.title)}</span>
      </div>
      <div style="font-size:12px;color:#555;margin:0 0 6px 14px;">${esc(s.intro)}</div>
      <ul style="margin:0 0 0 28px;padding:0;color:#333;font-size:12px;line-height:1.65;">
        ${s.steps.map(t => `<li style="margin-bottom:3px;">${esc(t)}</li>`).join('')}
      </ul>
    </div>`).join('')
  const inner = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:30px;">
    <div style="border-bottom:2px solid #0099cc;padding-bottom:12px;margin-bottom:16px;">
      <div style="font-size:20px;font-weight:800;">${esc(company?.name || 'Quvera Business')}</div>
      <div style="font-size:14px;color:#0099cc;font-weight:700;margin-top:2px;">${esc(GUIDE_META.title)}</div>
      <div style="font-size:12px;color:#777;margin-top:3px;">${esc(GUIDE_META.subtitle)}</div>
    </div>
    ${sections}
    <div style="text-align:center;font-size:10px;color:#aaa;margin-top:18px;">Powered by Quvera</div>
  </div>`
  const w = window.open('', '_blank'); if (!w) return
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(GUIDE_META.title)}</title><style>@page{size:A4;margin:14mm}.__b{position:fixed;top:0;left:0;right:0;height:46px;background:#0f1623;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-family:sans-serif;z-index:9}@media print{.__b{display:none}.__s{box-shadow:none!important;margin:0!important}}.__b button{padding:7px 13px;border:none;border-radius:7px;font-weight:600;cursor:pointer}</style></head><body style="margin:0;background:#eef2f6;padding-top:46px;"><div class="__b"><span style="font-size:13px;">${esc(GUIDE_META.title)}</span><span><button onclick="window.print()" style="background:#0099cc;color:#fff;">Print / PDF</button> <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;margin-left:8px;">Close</button></span></div><div class="__s" style="max-width:820px;margin:14px auto;background:#fff;box-shadow:0 6px 28px rgba(0,0,0,.2);">${inner}</div></body></html>`)
  w.document.close()
}

export default function HelpPage({ company }) {
  const card = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 16 }
  return (
    <div className="animate-in" style={{ color: 'var(--text)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-bg)', border: '0.5px solid var(--primary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-help-hexagon" style={{ fontSize: 22, color: 'var(--primary-dark)' }} />
          </div>
          <div>
            <h1 className="font-syne fw-700" style={{ fontSize: 23, marginBottom: 2, color: 'var(--text)' }}>How it works</h1>
            <p style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 560 }}>{GUIDE_META.subtitle}</p>
          </div>
        </div>
        <button onClick={() => exportPdf(company)} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}><i className="ti ti-file-download" /> Export PDF</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {GUIDE_SECTIONS.map((s, i) => (
          <div key={i} style={{ ...card, borderLeft: `3px solid ${s.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: s.color + '1f', color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={'ti ' + s.icon} style={{ fontSize: 18 }} /></div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{s.title}</div>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 10 }}>{s.intro}</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {s.steps.map((t, j) => (
                <li key={j} style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
