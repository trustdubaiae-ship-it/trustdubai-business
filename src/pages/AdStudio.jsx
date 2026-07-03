import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

// AI Ad Studio — generate a full Meta campaign with Claude, then render a branded
// ad creative (company logo + a photo + AI copy) on canvas. Download or save as a
// draft campaign (meta_campaigns). Publishing to Meta = Layer B (meta-ads-publish).
const TEMPLATES = [
  { id: 'bold',  name: 'Bold' },
  { id: 'clean', name: 'Clean' },
]

async function loadImg(src) {
  // fetch → object URL so storage images don't taint the canvas
  try {
    const res = await fetch(src)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    return await new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = url })
  } catch { return null }
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
  const [template, setTemplate] = useState('bold')
  const [photo, setPhoto] = useState(null)          // HTMLImageElement (uploaded/company)
  const [logo, setLogo] = useState(null)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef(null)

  useEffect(() => {
    const ob = new MutationObserver(() => force(n => n + 1))
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    if (company?.logo_url) loadImg(company.logo_url).then(setLogo)
    return () => ob.disconnect()
  }, [company?.id])

  const text = isDark ? '#f1f5f9' : '#0f172a', textSub = isDark ? '#94a3b8' : '#64748b', textMuted = isDark ? '#475569' : '#94a3b8'
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', cardBg = isDark ? '#1e293b' : '#ffffff', subBg = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'
  const card = { background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 16, marginBottom: 14 }

  async function generate() {
    setBusy(true); setCampaign(null)
    const { data, error } = await supabase.functions.invoke('marketing-agent', { body: { company_id: company.id, goal } })
    setBusy(false)
    if (error || !data?.ok) { toast.error('AI failed: ' + (data?.error || error?.message || 'unknown')); return }
    setCampaign(data.campaign); setVariant(0)
    toast.success('Campaign generated ✨')
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    const url = URL.createObjectURL(file)
    const im = new Image(); im.onload = () => setPhoto(im); im.src = url
  }

  // draw the current variant onto the canvas
  useEffect(() => { draw() }, [campaign, variant, template, photo, logo])
  function draw() {
    const cv = canvasRef.current; if (!cv || !campaign) return
    const S = 1080; cv.width = S; cv.height = S
    const ctx = cv.getContext('2d')
    const ad = campaign.ads?.[variant] || {}
    const cr = ad.creative || {}
    const accent = /^#([0-9a-f]{6})$/i.test(cr.accent || '') ? cr.accent : '#0099cc'
    const over = (cr.overlay_text || ad.headline || company?.name || '').toString()
    const sub = (cr.sub_text || '').toString()
    const cta = (ad.cta || 'Get Quote').toString()

    ctx.clearRect(0, 0, S, S)
    // background
    if (photo) {
      const r = Math.max(S / photo.width, S / photo.height)
      const w = photo.width * r, h = photo.height * r
      ctx.drawImage(photo, (S - w) / 2, (S - h) / 2, w, h)
    } else {
      const g = ctx.createLinearGradient(0, 0, S, S); g.addColorStop(0, accent); g.addColorStop(1, '#0b1530')
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
    }

    if (template === 'bold') {
      // dark gradient bottom + big headline
      const g = ctx.createLinearGradient(0, S * 0.35, 0, S); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.82)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
      ctx.fillStyle = accent; ctx.fillRect(70, S - 300, 90, 10)
      wrap(ctx, over.toUpperCase(), 70, S - 250, S - 140, 74, 'bold', '#fff', 84)
      if (sub) wrap(ctx, sub, 70, S - 120, S - 300, 34, 'normal', 'rgba(255,255,255,0.85)', 40)
      pill(ctx, cta, S - 70, S - 110, accent)
    } else {
      // clean: photo top, solid panel bottom
      const panelY = S * 0.62
      ctx.fillStyle = isDark ? '#0b1530' : '#ffffff'; ctx.fillRect(0, panelY, S, S - panelY)
      ctx.fillStyle = accent; ctx.fillRect(0, panelY, S, 10)
      wrap(ctx, over, 70, panelY + 90, S - 140, 64, 'bold', isDark ? '#fff' : '#0b1530', 72)
      if (sub) wrap(ctx, sub, 70, panelY + 200, S - 140, 34, 'normal', textSub, 40)
      pill(ctx, cta, S - 70, S - 90, accent)
    }
    // logo top-left
    if (logo) {
      const lw = 150, lh = logo.height * (lw / logo.width)
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 12
      ctx.drawImage(logo, 60, 56, lw, Math.min(lh, 110)); ctx.restore()
    }
  }
  function wrap(ctx, str, x, y, maxW, lh, weight, color, size) {
    ctx.fillStyle = color; ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`; ctx.textBaseline = 'top'
    const words = String(str).split(' '); let line = '', yy = y
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh } else line = test
    }
    if (line) ctx.fillText(line, x, yy)
  }
  function pill(ctx, label, rightX, cy, accent) {
    ctx.font = 'bold 34px Inter, Arial, sans-serif'
    const w = ctx.measureText(label).width + 60, h = 68, x = rightX - w
    ctx.fillStyle = accent; roundRect(ctx, x, cy - h / 2, w, h, 34); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
    ctx.fillText(label, x + w / 2, cy); ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }

  function download() {
    const cv = canvasRef.current; if (!cv) return
    try {
      const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `${(company?.name || 'ad').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-ad.png`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch { toast.error('Could not export image') }
  }

  async function saveDraft() {
    if (!campaign) return
    setSaving(true)
    const ad = campaign.ads?.[variant] || {}
    const { error } = await supabase.from('meta_campaigns').insert({
      company_id: company.id, name: campaign.name || 'AI Campaign', objective: campaign.objective || 'OUTCOME_LEADS',
      status: 'draft', daily_budget: campaign.daily_budget_aed || null,
      audience: campaign.audience || null, creative: { ...ad, template }, lead_form: null,
    })
    setSaving(false)
    if (error) { toast.error('Save failed: ' + error.message); return }
    toast.success('Saved as draft campaign')
  }

  const inp = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, background: subBg, color: text, outline: 'none', fontFamily: 'inherit' }
  const ad = campaign?.ads?.[variant] || {}

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${border}`, background: cardBg, color: textSub, cursor: 'pointer' }}><i className="ti ti-arrow-left" /></button>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(139,92,246,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-sparkles" style={{ fontSize: 21, color: '#8B5CF6' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: text, margin: 0 }}>AI Ad Studio</h1>
          <div style={{ fontSize: 12, color: textSub }}>Generate a campaign + branded ad design from your business</div>
        </div>
      </div>

      {/* generate */}
      <div style={card}>
        <label style={{ fontSize: 12, fontWeight: 600, color: textSub, display: 'block', marginBottom: 6 }}>Campaign goal</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {['More leads', 'Brand awareness', 'Promote an offer', 'Website visits'].map(g => (
            <button key={g} onClick={() => setGoal(g)} style={{ padding: '7px 12px', borderRadius: 99, border: `1px solid ${goal === g ? '#8B5CF6' : border}`, background: goal === g ? 'rgba(139,92,246,0.12)' : 'transparent', color: goal === g ? '#8B5CF6' : textSub, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{g}</button>
          ))}
        </div>
        <button onClick={generate} disabled={busy} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: busy ? '#94a3b8' : 'linear-gradient(135deg,#8B5CF6,#00D4FF)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Generating…' : '✨ Generate campaign with AI'}
        </button>
      </div>

      {campaign && (
        <>
          {/* variants */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 4 }}>{campaign.name}</div>
            <div style={{ fontSize: 12, color: textSub, marginBottom: 12 }}>
              {campaign.objective} · AED {campaign.daily_budget_aed}/day · {(campaign.audience?.locations || []).join(', ')} · age {campaign.audience?.age_min}-{campaign.audience?.age_max}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {(campaign.ads || []).map((_, i) => (
                <button key={i} onClick={() => setVariant(i)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${variant === i ? '#8B5CF6' : border}`, background: variant === i ? 'rgba(139,92,246,0.12)' : 'transparent', color: variant === i ? '#8B5CF6' : textSub, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Variant {i + 1}</button>
              ))}
            </div>
            <div style={{ background: subBg, borderRadius: 10, padding: 12, fontSize: 13, color: text, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700 }}>{ad.headline}</div>
              <div style={{ color: textSub, margin: '4px 0' }}>{ad.primary_text}</div>
              <div style={{ fontSize: 11.5, color: textMuted }}>CTA: {ad.cta} · Photo idea: {ad.creative?.photo_hint || '—'}</div>
            </div>
          </div>

          {/* creative studio */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 10 }}>Ad design</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setTemplate(t.id)} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${template === t.id ? '#8B5CF6' : border}`, background: template === t.id ? 'rgba(139,92,246,0.12)' : 'transparent', color: template === t.id ? '#8B5CF6' : textSub, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{t.name}</button>
              ))}
              <label style={{ padding: '7px 14px', borderRadius: 8, border: `1px dashed ${border}`, color: textSub, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                <i className="ti ti-photo" /> {photo ? 'Change photo' : 'Add photo'}
                <input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
              </label>
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${border}`, marginBottom: 12, background: '#000' }}>
              <canvas ref={canvasRef} style={{ width: '100%', display: 'block', aspectRatio: '1/1' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={download} style={{ flex: 1, padding: 11, borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><i className="ti ti-download" /> Download PNG</button>
              <button onClick={saveDraft} disabled={saving} style={{ flex: 1, padding: 11, borderRadius: 9, border: 'none', background: saving ? '#94a3b8' : '#8B5CF6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Save as draft campaign'}</button>
            </div>
            {Array.isArray(campaign.tips) && campaign.tips.length > 0 && (
              <div style={{ marginTop: 14, fontSize: 12, color: textSub, lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700, color: text, marginBottom: 4 }}>💡 Tips</div>
                {campaign.tips.map((t, i) => <div key={i}>• {t}</div>)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
