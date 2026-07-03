import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

// Per-company WhatsApp bot setup — greeting, catalogue/menu, AI, handover.
// Writes public.whatsapp_bot_config (RLS company-scoped). The whatsapp-webhook
// edge function reads this and auto-replies to incoming messages.
const BLANK = {
  enabled: false,
  greeting: 'Hi {name}! 👋 Welcome to {company}. How can we help you today?',
  menu: [],
  ai_enabled: true,
  ai_instructions: '',
  handover_note: 'Thanks! A team member will contact you shortly. 🙌',
  handover_keywords: 'agent,human,call me,representative',
  collect_lead: true,
}
const slug = (s, i) => (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || ('opt-' + i))

export default function WhatsAppBot({ onBack }) {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [, force] = useState(0)
  const [cfg, setCfg] = useState(BLANK)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (company?.id) load()
    const ob = new MutationObserver(() => force(n => n + 1))
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => ob.disconnect()
  }, [company?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('whatsapp_bot_config').select('*').eq('company_id', company.id).maybeSingle()
    if (data) setCfg({ ...BLANK, ...data, menu: Array.isArray(data.menu) ? data.menu : [] })
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    // ensure every menu row has a stable id
    const menu = (cfg.menu || []).map((m, i) => ({ id: m.id || slug(m.title, i), title: m.title || '', description: m.description || '', reply: m.reply || '' }))
    const { error } = await supabase.from('whatsapp_bot_config').upsert({
      company_id: company.id,
      enabled: cfg.enabled, greeting: cfg.greeting, menu,
      ai_enabled: cfg.ai_enabled, ai_instructions: cfg.ai_instructions,
      handover_note: cfg.handover_note, handover_keywords: cfg.handover_keywords,
      collect_lead: cfg.collect_lead, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    setSaving(false)
    if (error) { toast.error('Save failed: ' + error.message); return }
    toast.success('Bot saved ✓')
  }

  // pull the company's quote work-type presets in as catalogue rows
  async function prefillFromServices() {
    const { data: tpl } = await supabase.from('quotation_templates').select('work_type_presets').eq('company_id', company.id).maybeSingle()
    const presets = tpl?.work_type_presets
    if (!Array.isArray(presets) || !presets.length) { toast.error('No saved services found (set them in Quote Settings first)'); return }
    const rows = presets.slice(0, 10).map((p, i) => ({
      id: slug(p.name, i), title: p.name || ('Service ' + (i + 1)),
      description: Array.isArray(p.whyUs) && p.whyUs[0] ? p.whyUs[0] : '', reply: '',
    }))
    setCfg(c => ({ ...c, menu: rows }))
    toast.success(`Loaded ${rows.length} service(s)`)
  }

  const setMenu = (i, k, v) => setCfg(c => { const menu = [...c.menu]; menu[i] = { ...menu[i], [k]: v }; return { ...c, menu } })
  const addRow = () => setCfg(c => (c.menu.length >= 10 ? c : { ...c, menu: [...c.menu, { title: '', description: '', reply: '' }] }))
  const delRow = (i) => setCfg(c => ({ ...c, menu: c.menu.filter((_, x) => x !== i) }))

  const text = isDark ? '#f1f5f9' : '#0f172a', textSub = isDark ? '#94a3b8' : '#64748b', textMuted = isDark ? '#475569' : '#94a3b8'
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', cardBg = isDark ? '#1e293b' : '#ffffff', subBg = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc'
  const inp = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, background: subBg, color: text, outline: 'none', fontFamily: 'inherit' }
  const lbl = { fontSize: 12, fontWeight: 600, color: textSub, display: 'block', marginBottom: 6 }
  const card = { background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 16, marginBottom: 14 }

  const Toggle = ({ on, onClick }) => (
    <button onClick={onClick} style={{ width: 44, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer', background: on ? '#22c55e' : (isDark ? '#334155' : '#cbd5e1'), position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  )

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 50 }}>
      <div style={{ width: 34, height: 34, border: '3px solid #22c55e', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${border}`, background: cardBg, color: textSub, cursor: 'pointer' }}><i className="ti ti-arrow-left" /></button>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: isDark ? 'rgba(34,197,94,0.15)' : '#e1f5ee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-robot" style={{ fontSize: 21, color: '#16a34a' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: text, margin: 0 }}>WhatsApp Bot</h1>
          <div style={{ fontSize: 12, color: textSub }}>Auto-reply with a menu + AI on your WhatsApp number</div>
        </div>
      </div>

      {/* enable */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Bot enabled</div>
          <div style={{ fontSize: 12, color: textSub, marginTop: 2 }}>When ON, incoming WhatsApp messages get an automatic reply.</div>
        </div>
        <Toggle on={cfg.enabled} onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))} />
      </div>

      {/* greeting */}
      <div style={card}>
        <label style={lbl}>Welcome message</label>
        <textarea value={cfg.greeting} onChange={e => setCfg(c => ({ ...c, greeting: e.target.value }))} style={{ ...inp, minHeight: 60, resize: 'vertical' }} />
        <div style={{ fontSize: 11, color: textMuted, marginTop: 6 }}>Use <b>{'{name}'}</b> for the customer's name and <b>{'{company}'}</b> for your business name.</div>
      </div>

      {/* catalogue / menu */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Catalogue / menu options <span style={{ color: textMuted, fontWeight: 400 }}>({cfg.menu.length}/10)</span></label>
          <button onClick={prefillFromServices} style={{ fontSize: 11.5, fontWeight: 600, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer' }}><i className="ti ti-download" /> Load from my services</button>
        </div>
        <div style={{ fontSize: 11, color: textMuted, marginBottom: 12 }}>Shown as a tappable list. When a customer picks one, the bot sends its reply.</div>
        {cfg.menu.map((m, i) => (
          <div key={i} style={{ background: subBg, border: `1px solid ${border}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input value={m.title} onChange={e => setMenu(i, 'title', e.target.value)} placeholder="Option title (e.g. Kitchen Fit-Out)" maxLength={24} style={{ ...inp, flex: 1 }} />
              <button onClick={() => delRow(i)} style={{ width: 36, borderRadius: 8, border: `1px solid ${border}`, background: cardBg, color: '#dc2626', cursor: 'pointer', flexShrink: 0 }}><i className="ti ti-trash" /></button>
            </div>
            <input value={m.description} onChange={e => setMenu(i, 'description', e.target.value)} placeholder="Short description (optional)" maxLength={72} style={{ ...inp, marginBottom: 6 }} />
            <textarea value={m.reply} onChange={e => setMenu(i, 'reply', e.target.value)} placeholder="Bot's reply when this is selected…" style={{ ...inp, minHeight: 44, resize: 'vertical' }} />
          </div>
        ))}
        {cfg.menu.length < 10 && (
          <button onClick={addRow} style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px dashed ${border}`, background: 'none', color: textSub, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}><i className="ti ti-plus" /> Add option</button>
        )}
      </div>

      {/* AI */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: cfg.ai_enabled ? 12 : 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: text }}>AI replies for free text</div>
            <div style={{ fontSize: 12, color: textSub, marginTop: 2 }}>When a customer types their own question, Quvera AI answers using your business info.</div>
          </div>
          <Toggle on={cfg.ai_enabled} onClick={() => setCfg(c => ({ ...c, ai_enabled: !c.ai_enabled }))} />
        </div>
        {cfg.ai_enabled && (
          <>
            <label style={lbl}>Brand notes for the AI (optional)</label>
            <textarea value={cfg.ai_instructions} onChange={e => setCfg(c => ({ ...c, ai_instructions: e.target.value }))} placeholder="e.g. We serve Dubai only, free site visit, typical project 3-6 weeks…" style={{ ...inp, minHeight: 54, resize: 'vertical' }} />
          </>
        )}
      </div>

      {/* handover + lead */}
      <div style={card}>
        <label style={lbl}>Human handover message</label>
        <input value={cfg.handover_note} onChange={e => setCfg(c => ({ ...c, handover_note: e.target.value }))} style={{ ...inp, marginBottom: 12 }} />
        <label style={lbl}>Handover keywords (comma-separated)</label>
        <input value={cfg.handover_keywords} onChange={e => setCfg(c => ({ ...c, handover_keywords: e.target.value }))} style={{ ...inp, marginBottom: 12 }} />
        <div style={{ fontSize: 11, color: textMuted, marginBottom: 14 }}>If a customer's message contains one of these, the bot stops and hands over to your team.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: text }}>Save every chat as a lead</div>
            <div style={{ fontSize: 12, color: textSub, marginTop: 2 }}>Keeps Lead Hub in sync with WhatsApp enquiries.</div>
          </div>
          <Toggle on={cfg.collect_lead} onClick={() => setCfg(c => ({ ...c, collect_lead: !c.collect_lead }))} />
        </div>
      </div>

      {/* save */}
      <button onClick={save} disabled={saving} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: saving ? '#94a3b8' : '#16a34a', color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
        {saving ? 'Saving…' : 'Save bot settings'}
      </button>
      <div style={{ height: 20 }} />
    </div>
  )
}
