import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

// AI Ad Studio — Claude generates a full Meta campaign; the studio renders a
// professional, on-brand ad creative (logo + photo + AI copy) on canvas across
// several templates & sizes. Download or save as a draft campaign (meta_campaigns).
const SIZES = {
  square:    { w: 1080, h: 1080, label: 'Post 1:1' },
  story:     { w: 1080, h: 1920, label: 'Story 9:16' },
  landscape: { w: 1200, h: 628,  label: 'Feed 1.91:1' },
}
const TEMPLATES = [
  { id: 'spotlight', name: 'Spotlight' },
  { id: 'showcase',  name: 'Showcase' },
  { id: 'offer',     name: 'Offer' },
  { id: 'signature', name: 'Signature' },
]
const SWATCHES = ['#0099cc', '#0b5cff', '#8B5CF6', '#e11d48', '#059669', '#d97706', '#0f172a']
const HEAD = "'Sora','Segoe UI',system-ui,sans-serif"
const BODY = "'Inter','Segoe UI',system-ui,sans-serif"

async function loadImg(src) {
  try {
    const res = await fetch(src); const blob = await res.blob(); const url = URL.createObjectURL(blob)
    return await new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = url })
  } catch { return null }
}
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return `rgba(0,153,204,${a})`
  const n = parseInt(m[1], 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
// ---- canvas helpers ----
function cover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); ctx.restore()
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2); ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
function wrapLines(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/); const lines = []; let line = ''
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w } else line = t }
  if (line) lines.push(line); return lines
}
function fitWrap(ctx, text, maxW, maxLines, startPx, minPx, weight, family) {
  for (let s = startPx; s >= minPx; s -= 2) {
    ctx.font = `${weight} ${s}px ${family}`
    const lines = wrapLines(ctx, text, maxW)
    if (lines.length <= maxLines && lines.every(l => ctx.measureText(l).width <= maxW)) return { size: s, lines }
  }
  ctx.font = `${weight} ${minPx}px ${family}`; return { size: minPx, lines: wrapLines(ctx, text, maxW).slice(0, maxLines) }
}
function drawLines(ctx, lines, x, y, lh, color, align = 'left') {
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); ctx.textAlign = 'left'
}
function ctaPill(ctx, label, x, y, accent, align = 'left', outline = false) {
  ctx.font = `700 ${Math.round(28)}px ${BODY}`; const pad = 30, h = 62
  const w = ctx.measureText(label).width + pad * 2
  const px = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x)
  if (outline) { rr(ctx, px, y, w, h, h / 2); ctx.lineWidth = 3; ctx.strokeStyle = accent; ctx.stroke(); ctx.fillStyle = accent }
  else { rr(ctx, px, y, w, h, h / 2); ctx.fillStyle = accent; ctx.fill(); ctx.fillStyle = '#fff' }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, px + w / 2, y + h / 2 + 1)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; return h
}
function logoBox(ctx, logo, x, y, maxH) {
  if (!logo) return
  const w = logo.width * (maxH / logo.height)
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14
  ctx.drawImage(logo, x, y, w, maxH); ctx.restore()
}
function contactBar(ctx, W, H, y, phone, web, color) {
  const parts = [phone, web].filter(Boolean); if (!parts.length) return
  ctx.font = `600 ${Math.round(W * 0.021)}px ${BODY}`; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(parts.join('    •    '), W / 2, y); ctx.textAlign = 'left'
}

export default function AdStudio({ onBack }) {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [, force] = useState(0)

  const [goal, setGoal] = useState('More leads')
  const [busy, setBusy] = useState(false)
  const [campaign, setCampaign] = useState(null)
  const [variant, setVariant] = useState(0)
  const [template, setTemplate] = useState('spotlight')
  const [size, setSize] = useState('square')
  const [photo, setPhoto] = useState(null)
  const [logo, setLogo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)
  // editable copy (seeded from AI, user can tweak)
  const [headline, setHeadline] = useState('')
  const [tagline, setTagline] = useState('')
  const [cta, setCta] = useState('Get Quote')
  const [accent, setAccent] = useState('#0099cc')
  const canvasRef = useRef(null)

  useEffect(() => {
    const ob = new MutationObserver(() => force(n => n + 1))
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    if (company?.logo_url) loadImg(company.logo_url).then(setLogo)
    // ensure brand fonts are available to the canvas
    try {
      Promise.all([document.fonts.load("800 80px 'Sora'"), document.fonts.load("600 40px 'Inter'")])
        .then(() => document.fonts.ready).then(() => setFontsReady(true)).catch(() => setFontsReady(true))
    } catch { setFontsReady(true) }
    return () => ob.disconnect()
  }, [company?.id])

  // seed editable copy whenever the AI variant changes
  useEffect(() => {
    const ad = campaign?.ads?.[variant]; if (!ad) return
    const cr = ad.creative || {}
    setHeadline((cr.overlay_text || ad.headline || company?.name || '').toString())
    setTagline((cr.sub_text || ad.description || '').toString())
    setCta((ad.cta || 'Get Quote').toString())
    if (/^#([0-9a-f]{6})$/i.test(cr.accent || '')) setAccent(cr.accent)
  }, [campaign, variant])

  async function generate() {
    setBusy(true); setCampaign(null)
    const { data, error } = await supabase.functions.invoke('marketing-agent', { body: { company_id: company.id, goal } })
    setBusy(false)
    if (error || !data?.ok) { toast.error('AI failed: ' + (data?.error || error?.message || 'unknown')); return }
    setCampaign(data.campaign); setVariant(0); toast.success('Campaign generated ✨')
  }
  function onPhoto(e) { const f = e.target.files?.[0]; if (!f) return; const im = new Image(); im.onload = () => setPhoto(im); im.src = URL.createObjectURL(f) }

  useEffect(() => { draw() }, [campaign, variant, template, size, photo, logo, headline, tagline, cta, accent, fontsReady])
  function draw() {
    const cv = canvasRef.current; if (!cv) return
    const { w: W, h: H } = SIZES[size]; cv.width = W; cv.height = H
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, W, H)
    const M = Math.round(W * 0.075)
    const phone = company?.phone || ''
    const web = company?.slug ? `quvera.ae/${company.slug}` : ''
    const head = (headline || company?.name || '').toUpperCase()
    const sub = tagline || ''

    // base background
    if (!photo) { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, accent); g.addColorStop(1, '#0b1530'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H) }

    if (template === 'spotlight') {
      if (photo) cover(ctx, photo, 0, 0, W, H)
      const g = ctx.createLinearGradient(0, H * 0.28, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.92)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      logoBox(ctx, logo, M, M * 0.9, H * 0.072)
      // measure, then lay the whole block out from the bottom up (no overlap)
      const hl = fitWrap(ctx, head, W - M * 2, 3, W * 0.085, W * 0.048, '800', HEAD); const hlLh = hl.size * 1.06, hlH = hl.lines.length * hlLh
      let sl = null, slLh = 0, slH = 0
      if (sub) { sl = fitWrap(ctx, sub, W - M * 2, 2, W * 0.032, W * 0.023, '400', BODY); slLh = sl.size * 1.3; slH = sl.lines.length * slLh }
      const barH = 8, gBarHead = 22, gHeadSub = 18, gSubCta = 36, ctaH = 62, contactReserve = M * 1.05
      const block = barH + gBarHead + hlH + (sub ? gHeadSub + slH : 0) + gSubCta + ctaH
      let y = H - contactReserve - block
      ctx.fillStyle = accent; ctx.fillRect(M, y, W * 0.1, barH); y += barH + gBarHead
      ctx.font = `800 ${hl.size}px ${HEAD}`; drawLines(ctx, hl.lines, M, y + hl.size, hlLh, '#fff'); y += hlH + (sub ? gHeadSub : 0)
      if (sub) { ctx.font = `400 ${sl.size}px ${BODY}`; drawLines(ctx, sl.lines, M, y + sl.size, slLh, 'rgba(255,255,255,0.86)'); y += slH }
      ctaPill(ctx, cta, M, y + gSubCta, accent, 'left')
      contactBar(ctx, W, H, H - M * 0.5, phone, web, 'rgba(255,255,255,0.72)')
    }

    else if (template === 'showcase') {
      const ph = Math.round(H * 0.55)
      if (photo) cover(ctx, photo, 0, 0, W, ph); else { ctx.fillStyle = accent; ctx.fillRect(0, 0, W, ph) }
      ctx.fillStyle = '#0b1530'; ctx.fillRect(0, ph, W, H - ph)
      ctx.fillStyle = accent; ctx.fillRect(0, ph, W, 8)
      logoBox(ctx, logo, M, M * 0.85, H * 0.068)
      let y = ph + M * 0.9
      const hl = fitWrap(ctx, head, W - M * 2, 2, W * 0.066, W * 0.044, '800', HEAD); const hlLh = hl.size * 1.06
      drawLines(ctx, hl.lines, M, y + hl.size, hlLh, '#fff'); y += hl.lines.length * hlLh + 20
      if (sub) { const sl = fitWrap(ctx, sub, W - M * 2, 2, W * 0.03, W * 0.022, '400', BODY); const slLh = sl.size * 1.3; drawLines(ctx, sl.lines, M, y + sl.size, slLh, 'rgba(255,255,255,0.82)'); y += sl.lines.length * slLh + 34 }
      ctaPill(ctx, cta, M, y, accent, 'left')
      contactBar(ctx, W, H, H - M * 0.5, phone, web, 'rgba(255,255,255,0.6)')
    }

    else if (template === 'offer') {
      if (photo) { cover(ctx, photo, 0, 0, W, H); ctx.fillStyle = 'rgba(6,12,28,0.6)'; ctx.fillRect(0, 0, W, H) }
      logoBox(ctx, logo, W / 2 - (logo ? (logo.width * (H * 0.07 / logo.height)) / 2 : 0), M, H * 0.07)
      // badge
      ctx.font = `800 ${Math.round(W * 0.026)}px ${BODY}`; const bl = 'SPECIAL OFFER', bw = ctx.measureText(bl).width + 44
      rr(ctx, W / 2 - bw / 2, H * 0.3, bw, 52, 26); ctx.fillStyle = accent; ctx.fill()
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(bl, W / 2, H * 0.3 + 27); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      const hl = fitWrap(ctx, head, W - M * 2, 3, W * 0.088, W * 0.05, '900', HEAD)
      let y = H * 0.42 + hl.size
      drawLines(ctx, hl.lines, W / 2, y, hl.size * 1.05, '#fff', 'center'); y += hl.lines.length * hl.size * 1.05
      if (sub) { const sl = fitWrap(ctx, sub, W - M * 2, 2, W * 0.032, W * 0.024, '400', BODY); drawLines(ctx, sl.lines, W / 2, y + sl.size + 10, sl.size * 1.3, 'rgba(255,255,255,0.9)', 'center'); y += sl.size + 10 + sl.lines.length * sl.size * 1.3 }
      ctaPill(ctx, cta, W / 2, y + 24, accent, 'center')
      contactBar(ctx, W, H, H - M * 0.7, phone, web, 'rgba(255,255,255,0.75)')
    }

    else { // signature — luxury minimal
      if (photo) { cover(ctx, photo, 0, 0, W, H); ctx.fillStyle = 'rgba(8,12,24,0.66)'; ctx.fillRect(0, 0, W, H) }
      ctx.strokeStyle = hexA(accent, 0.9); ctx.lineWidth = 2; ctx.strokeRect(M * 0.6, M * 0.6, W - M * 1.2, H - M * 1.2)
      logoBox(ctx, logo, W / 2 - (logo ? (logo.width * (H * 0.06 / logo.height)) / 2 : 0), H * 0.16, H * 0.06)
      const hl = fitWrap(ctx, head, W - M * 2.4, 3, W * 0.066, W * 0.04, '300', HEAD)
      let y = H * 0.42
      drawLines(ctx, hl.lines, W / 2, y, hl.size * 1.16, '#fff', 'center'); y += hl.lines.length * hl.size * 1.16
      ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2 - 40, y + 18); ctx.lineTo(W / 2 + 40, y + 18); ctx.stroke(); y += 40
      if (sub) { const sl = fitWrap(ctx, sub, W - M * 2, 2, W * 0.028, W * 0.02, '400', BODY); drawLines(ctx, sl.lines, W / 2, y + sl.size, sl.size * 1.4, 'rgba(255,255,255,0.82)', 'center'); y += sl.lines.length * sl.size * 1.4 }
      ctaPill(ctx, cta, W / 2, y + 30, accent, 'center', true)
      contactBar(ctx, W, H, H - M, phone, web, 'rgba(255,255,255,0.7)')
    }
  }

  function download() {
    const cv = canvasRef.current; if (!cv) return
    try { const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `${(company?.name || 'ad').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${size}.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a) }
    catch { toast.error('Could not export image') }
  }
  async function saveDraft() {
    if (!campaign) return; setSaving(true)
    const ad = campaign.ads?.[variant] || {}
    const { error } = await supabase.from('meta_campaigns').insert({
      company_id: company.id, name: campaign.name || 'AI Campaign', objective: campaign.objective || 'OUTCOME_LEADS',
      status: 'draft', daily_budget: campaign.daily_budget_aed || null, audience: campaign.audience || null,
      creative: { ...ad, headline, tagline, cta, accent, template, size }, lead_form: null,
    })
    setSaving(false); if (error) { toast.error('Save failed: ' + error.message); return }
    toast.success('Saved as draft campaign')
  }
  function copyCaption() {
    const ad = campaign?.ads?.[variant] || {}; const cap = [ad.primary_text, '', tagline, `👉 ${cta}`].filter(Boolean).join('\n')
    navigator.clipboard?.writeText(cap).then(() => toast.success('Caption copied')).catch(() => {})
  }

  const text = isDark ? '#f1f5f9' : '#0f172a', textSub = isDark ? '#94a3b8' : '#64748b', textMuted = isDark ? '#475569' : '#94a3b8'
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', cardBg = isDark ? '#1e293b' : '#ffffff', subBg = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'
  const card = { background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 16, marginBottom: 14 }
  const inp = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, background: subBg, color: text, outline: 'none', fontFamily: 'inherit' }
  const lbl = { fontSize: 11.5, fontWeight: 600, color: textSub, display: 'block', marginBottom: 6 }
  const chip = (on) => ({ padding: '7px 13px', borderRadius: 8, border: `1px solid ${on ? '#8B5CF6' : border}`, background: on ? 'rgba(139,92,246,0.12)' : 'transparent', color: on ? '#8B5CF6' : textSub, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' })
  const ad = campaign?.ads?.[variant] || {}

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${border}`, background: cardBg, color: textSub, cursor: 'pointer' }}><i className="ti ti-arrow-left" /></button>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(139,92,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-sparkles" style={{ fontSize: 21, color: '#8B5CF6' }} /></div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: text, margin: 0 }}>AI Ad Studio</h1>
          <div style={{ fontSize: 12, color: textSub }}>Professional ad campaigns & designs from your business</div>
        </div>
      </div>

      <div style={card}>
        <label style={lbl}>Campaign goal</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {['More leads', 'Brand awareness', 'Promote an offer', 'Website visits'].map(g => (
            <button key={g} onClick={() => setGoal(g)} style={chip(goal === g)}>{g}</button>
          ))}
        </div>
        <button onClick={generate} disabled={busy} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: busy ? '#94a3b8' : 'linear-gradient(135deg,#8B5CF6,#00D4FF)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>{busy ? 'Generating…' : (campaign ? '✨ Regenerate' : '✨ Generate campaign with AI')}</button>
      </div>

      {campaign && (
        <>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 4 }}>{campaign.name}</div>
            <div style={{ fontSize: 12, color: textSub, marginBottom: 12 }}>{campaign.objective} · AED {campaign.daily_budget_aed}/day · {(campaign.audience?.locations || []).join(', ')} · age {campaign.audience?.age_min}-{campaign.audience?.age_max}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(campaign.ads || []).map((_, i) => <button key={i} onClick={() => setVariant(i)} style={chip(variant === i)}>Variant {i + 1}</button>)}
            </div>
          </div>

          {/* preview */}
          <div style={{ ...card, background: isDark ? '#0b1120' : '#f1f5f9', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: size === 'story' ? 300 : (size === 'landscape' ? 560 : 420) }}>
              <canvas ref={canvasRef} style={{ width: '100%', display: 'block', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }} />
            </div>
          </div>

          {/* controls */}
          <div style={card}>
            <label style={lbl}>Format</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {Object.entries(SIZES).map(([k, v]) => <button key={k} onClick={() => setSize(k)} style={chip(size === k)}>{v.label}</button>)}
            </div>
            <label style={lbl}>Template</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {TEMPLATES.map(t => <button key={t.id} onClick={() => setTemplate(t.id)} style={chip(template === t.id)}>{t.name}</button>)}
            </div>
            <label style={lbl}>Brand colour</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              {SWATCHES.map(c => <button key={c} onClick={() => setAccent(c)} style={{ width: 28, height: 28, borderRadius: 7, border: accent === c ? '2px solid #8B5CF6' : `1px solid ${border}`, background: c, cursor: 'pointer' }} />)}
              <input type="color" value={accent} onChange={e => setAccent(e.target.value)} style={{ width: 34, height: 30, border: `1px solid ${border}`, borderRadius: 7, background: 'none', cursor: 'pointer' }} />
              <label style={{ ...chip(false), marginLeft: 'auto' }}><i className="ti ti-photo" /> {photo ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} /></label>
            </div>
            <label style={lbl}>Headline</label>
            <input value={headline} onChange={e => setHeadline(e.target.value)} style={{ ...inp, marginBottom: 10 }} />
            <label style={lbl}>Tagline</label>
            <input value={tagline} onChange={e => setTagline(e.target.value)} style={{ ...inp, marginBottom: 10 }} />
            <label style={lbl}>Button</label>
            <input value={cta} onChange={e => setCta(e.target.value)} maxLength={22} style={{ ...inp, marginBottom: 4 }} />
          </div>

          {/* caption + actions */}
          <div style={card}>
            <label style={lbl}>Post caption (AI)</label>
            <div style={{ background: subBg, borderRadius: 10, padding: 12, fontSize: 13, color: text, lineHeight: 1.6, marginBottom: 10 }}>{ad.primary_text}</div>
            <button onClick={copyCaption} style={{ fontSize: 12, fontWeight: 600, color: '#8B5CF6', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 4 }}><i className="ti ti-copy" /> Copy caption</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button onClick={download} style={{ flex: 1, padding: 13, borderRadius: 10, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}><i className="ti ti-download" /> Download PNG</button>
            <button onClick={saveDraft} disabled={saving} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', background: saving ? '#94a3b8' : '#8B5CF6', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Save draft campaign'}</button>
          </div>
        </>
      )}
    </div>
  )
}
