// "How it works" — futuristic in-app feature guide with search + FAQ.
// Content lives in src/lib/featureGuide.js (single source). Export PDF prints
// the same content.
import { useState } from 'react'
import { GUIDE_META, GUIDE_SECTIONS, GUIDE_FAQ } from '../lib/featureGuide'

function exportPdf(company) {
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const sections = GUIDE_SECTIONS.map(s => `
    <div style="margin-bottom:16px;page-break-inside:avoid;">
      <div style="border-left:4px solid ${s.color};padding-left:10px;margin-bottom:6px;"><span style="font-size:15px;font-weight:800;color:#1a1a1a;">${esc(s.title)}</span></div>
      <div style="font-size:12px;color:#555;margin:0 0 6px 14px;">${esc(s.intro)}</div>
      <ul style="margin:0 0 0 28px;padding:0;color:#333;font-size:12px;line-height:1.65;">${s.steps.map(t => `<li style="margin-bottom:3px;">${esc(t)}</li>`).join('')}</ul>
    </div>`).join('')
  const faq = `<div style="page-break-before:always;"><div style="font-size:17px;font-weight:800;color:#0099cc;margin:6px 0 12px;">Frequently asked questions</div>${GUIDE_FAQ.map(f => `
    <div style="margin-bottom:11px;page-break-inside:avoid;"><div style="font-size:13px;font-weight:700;color:#1a1a1a;">${esc(f.q)}</div><div style="font-size:12px;color:#555;line-height:1.6;margin-top:2px;">${esc(f.a)}</div></div>`).join('')}</div>`
  const inner = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:30px;">
    <div style="border-bottom:2px solid #0099cc;padding-bottom:12px;margin-bottom:16px;">
      <div style="font-size:20px;font-weight:800;">${esc(company?.name || 'Quvera Business')}</div>
      <div style="font-size:14px;color:#0099cc;font-weight:700;margin-top:2px;">${esc(GUIDE_META.title)}</div>
      <div style="font-size:12px;color:#777;margin-top:3px;">${esc(GUIDE_META.subtitle)}</div>
    </div>${sections}${faq}
    <div style="text-align:center;font-size:10px;color:#aaa;margin-top:18px;">Powered by Quvera</div>
  </div>`
  const w = window.open('', '_blank'); if (!w) return
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(GUIDE_META.title)}</title><style>@page{size:A4;margin:14mm}.__b{position:fixed;top:0;left:0;right:0;height:46px;background:#0f1623;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-family:sans-serif;z-index:9}@media print{.__b{display:none}.__s{box-shadow:none!important;margin:0!important}}.__b button{padding:7px 13px;border:none;border-radius:7px;font-weight:600;cursor:pointer}</style></head><body style="margin:0;background:#eef2f6;padding-top:46px;"><div class="__b"><span style="font-size:13px;">${esc(GUIDE_META.title)}</span><span><button onclick="window.print()" style="background:#0099cc;color:#fff;">Print / PDF</button> <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;margin-left:8px;">Close</button></span></div><div class="__s" style="max-width:820px;margin:14px auto;background:#fff;box-shadow:0 6px 28px rgba(0,0,0,.2);">${inner}</div></body></html>`)
  w.document.close()
}

export default function HelpPage({ company }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(null)
  const [openFaq, setOpenFaq] = useState(null)
  const query = q.trim().toLowerCase()

  const matchSec = s => !query || (s.title + ' ' + s.intro + ' ' + s.steps.join(' ')).toLowerCase().includes(query)
  const sections = GUIDE_SECTIONS.filter(s => (!cat || s.title === cat) && matchSec(s))
  const faqs = GUIDE_FAQ.filter(f => !query || (f.q + ' ' + f.a).toLowerCase().includes(query))

  return (
    <div className="animate-in" style={{ color: 'var(--text)' }}>
      <style>{`
        @keyframes hpUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .hp-card{transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease}
        .hp-card:hover{transform:translateY(-3px);box-shadow:0 16px 38px rgba(0,0,0,0.16)}
        .hp-chip{transition:all .14s ease}
      `}</style>

      {/* futuristic hero */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: '28px 24px', marginBottom: 18, color: '#fff', background: 'linear-gradient(135deg, #0a1f2e 0%, #0a6f8f 55%, #0099cc 100%)', boxShadow: '0 18px 44px rgba(0,153,204,0.30)' }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 230, height: 230, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.14), transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: -70, left: -30, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(74,222,128,0.18), transparent 70%)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', background: 'rgba(255,255,255,0.16)', padding: '5px 11px', borderRadius: 99, backdropFilter: 'blur(4px)' }}><i className="ti ti-sparkles" /> Guided tour</div>
          <h1 className="font-syne fw-700" style={{ fontSize: 30, lineHeight: 1.1, margin: '12px 0 6px', letterSpacing: '-.5px' }}>How Quvera Business works</h1>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.85)', maxWidth: 620, lineHeight: 1.55, margin: 0 }}>{GUIDE_META.subtitle}</p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18, alignItems: 'center' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: '11px 14px', boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
              <i className="ti ti-search" style={{ fontSize: 17, color: '#0a6f8f' }} />
              <input value={q} onChange={e => { setQ(e.target.value); setCat(null) }} placeholder="Search features & FAQs… (e.g. client, LPO, VAT, approval)" style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 14, color: '#1a1a1a', fontFamily: 'inherit' }} />
              {q && <button onClick={() => setQ('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}><i className="ti ti-x" /></button>}
            </div>
            <button onClick={() => exportPdf(company)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 16px', borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}><i className="ti ti-file-download" /> Export PDF</button>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>{GUIDE_SECTIONS.length} feature areas · {GUIDE_FAQ.length} FAQs</div>
        </div>
      </div>

      {/* category chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button className="hp-chip" onClick={() => { setCat(null); setQ('') }} style={{ fontSize: 12, fontWeight: 600, padding: '7px 13px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${!cat ? 'var(--primary)' : 'var(--border)'}`, background: !cat ? 'var(--primary-bg)' : 'var(--card)', color: !cat ? 'var(--primary-dark)' : 'var(--text2)' }}>All</button>
        {GUIDE_SECTIONS.map(s => {
          const on = cat === s.title
          return <button key={s.title} className="hp-chip" onClick={() => { setCat(on ? null : s.title); setQ('') }} style={{ fontSize: 12, fontWeight: 600, padding: '7px 13px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? s.color : 'var(--border)'}`, background: on ? s.color + '1a' : 'var(--card)', color: on ? s.color : 'var(--text2)' }}><i className={'ti ' + s.icon} style={{ fontSize: 14 }} /> {s.title}</button>
        })}
      </div>

      {/* feature cards */}
      {sections.length === 0 && faqs.length === 0
        ? <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: '40px 20px', textAlign: 'center', color: 'var(--text3)' }}><i className="ti ti-search-off" style={{ fontSize: 30, display: 'block', marginBottom: 8 }} />No matches for “{q}”.</div>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14, marginBottom: 22 }}>
            {sections.map((s, i) => (
              <div key={s.title} className="hp-card" style={{ position: 'relative', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, overflow: 'hidden', animation: 'hpUp .3s ease both', animationDelay: (i * 0.02) + 's' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: `linear-gradient(90deg, ${s.color}, ${s.color}55)` }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 9 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: s.color + '1f', color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 12px ${s.color}26` }}><i className={'ti ' + s.icon} style={{ fontSize: 19 }} /></div>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.2px' }}>{s.title}</div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 11 }}>{s.intro}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {s.steps.map((t, j) => (
                    <div key={j} style={{ display: 'flex', gap: 9, fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
                      <i className="ti ti-circle-check-filled" style={{ fontSize: 15, color: s.color, flexShrink: 0, marginTop: 1 }} />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      {/* FAQ accordion */}
      {faqs.length > 0 && (
        <div style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><i className="ti ti-help-circle" style={{ color: '#0099cc', fontSize: 18 }} /> Frequently asked questions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {faqs.map((f, i) => {
              const open = openFaq === i
              return (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden', background: open ? 'var(--bg2)' : 'var(--card)' }}>
                  <button onClick={() => setOpenFaq(open ? null : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{f.q}</span>
                    <i className={'ti ' + (open ? 'ti-minus' : 'ti-plus')} style={{ fontSize: 16, color: '#0099cc', flexShrink: 0 }} />
                  </button>
                  {open && <div style={{ padding: '0 14px 13px', fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6 }}>{f.a}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
