import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

// The deployed webhook endpoint (set this same URL + verify token in the Meta app).
const WEBHOOK_URL = 'https://ribdorraxxhfbfkjhpie.supabase.co/functions/v1/whatsapp-webhook'

export default function WhatsAppConnect({ onBack, onConnected }) {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [existingId, setExistingId] = useState(null)
  const [f, setF] = useState({ phone_number_id: '', display_number: '', waba_id: '', access_token: '' })

  const text = 'var(--text)', textSub = 'var(--text2)', textMuted = 'var(--text3)'
  const card = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 18 }
  const input = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: text, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl = { fontSize: 11, fontWeight: 600, color: textMuted, display: 'block', marginBottom: 5 }
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  useEffect(() => { if (company?.id) load() }, [company?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('whatsapp_accounts').select('*').eq('company_id', company.id).maybeSingle()
    if (data) {
      setExistingId(data.id)
      setF({ phone_number_id: data.phone_number_id || '', display_number: data.display_number || '', waba_id: data.waba_id || '', access_token: data.access_token || '' })
    }
    setLoading(false)
  }

  async function save() {
    if (!f.phone_number_id.trim()) { toast.error('Phone Number ID is required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id: company.id,
        phone_number_id: f.phone_number_id.trim(),
        display_number: f.display_number.trim() || null,
        waba_id: f.waba_id.trim() || null,
        access_token: f.access_token.trim() || null,
      }
      if (existingId) {
        const { error } = await supabase.from('whatsapp_accounts').update(payload).eq('id', existingId).eq('company_id', company.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('whatsapp_accounts').insert(payload).select('id').single()
        if (error) throw error
        setExistingId(data.id)
      }
      toast.success('WhatsApp connected ✓')
      onConnected?.()
    } catch (e) {
      toast.error('Could not save: ' + (e?.message || e))
    } finally { setSaving(false) }
  }

  async function disconnect() {
    if (!existingId) return
    if (!window.confirm('Disconnect this WhatsApp number? Incoming messages will stop becoming leads.')) return
    await supabase.from('whatsapp_accounts').delete().eq('id', existingId).eq('company_id', company.id)
    setExistingId(null); setF({ phone_number_id: '', display_number: '', waba_id: '', access_token: '' })
    toast.success('Disconnected')
  }

  const copy = (t) => { try { navigator.clipboard?.writeText(t); toast.success('Copied ✓') } catch {} }

  if (loading) return <div style={{ padding: 24, color: textMuted }}>Loading…</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: textSub, cursor: 'pointer', fontSize: 13, marginBottom: 14, padding: 0 }}>
        <i className="ti ti-arrow-left" /> Back to Lead Engine
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(34,197,94,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-brand-whatsapp" style={{ fontSize: 24, color: '#22c55e' }} /></div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: text }}>Connect WhatsApp</div>
          <div style={{ fontSize: 12.5, color: textMuted }}>Capture leads from your WhatsApp Business number {existingId && <span style={{ color: '#16a34a', fontWeight: 700 }}>· Connected</span>}</div>
        </div>
      </div>

      {/* Step 1 — webhook details for Meta */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 10 }}>1 · Add this webhook in your Meta app</div>
        <div style={{ fontSize: 12, color: textSub, marginBottom: 8 }}>Meta app → WhatsApp → Configuration → Webhook. Subscribe to the <b>messages</b> field.</div>
        <div style={lbl}>Callback URL</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input readOnly value={WEBHOOK_URL} style={{ ...input, fontFamily: 'monospace', fontSize: 11.5 }} />
          <button onClick={() => copy(WEBHOOK_URL)} style={{ padding: '0 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: text, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}><i className="ti ti-copy" /> Copy</button>
        </div>
        <div style={{ fontSize: 11.5, color: textMuted }}>Verify token: use the same random string you set as <code>WHATSAPP_VERIFY_TOKEN</code> in the Edge Function secrets.</div>
      </div>

      {/* Step 2 — number credentials */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 4 }}>2 · Your number details</div>
        <div style={{ fontSize: 12, color: textMuted, marginBottom: 14 }}>From Meta app → WhatsApp → API Setup.</div>

        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Phone Number ID <span style={{ color: '#ef4444' }}>*</span></label>
          <input value={f.phone_number_id} onChange={e => set('phone_number_id', e.target.value)} style={input} placeholder="e.g. 123456789012345" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>Display number</label><input value={f.display_number} onChange={e => set('display_number', e.target.value)} style={input} placeholder="+9715xxxxxxxx" /></div>
          <div><label style={lbl}>WABA ID</label><input value={f.waba_id} onChange={e => set('waba_id', e.target.value)} style={input} placeholder="optional" /></div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Access token <span style={{ color: textMuted, fontWeight: 400 }}>· optional, for sending replies later</span></label>
          <input value={f.access_token} onChange={e => set('access_token', e.target.value)} style={{ ...input, fontFamily: 'monospace', fontSize: 11.5 }} placeholder="EAAG…" />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={save} disabled={saving} style={{ padding: '10px 20px', borderRadius: 9, background: '#22c55e', color: '#fff', border: 'none', cursor: saving ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : existingId ? 'Update connection' : 'Connect WhatsApp'}
          </button>
          {existingId && <button onClick={disconnect} style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Disconnect</button>}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: textMuted, marginTop: 14, lineHeight: 1.6 }}>
        <i className="ti ti-info-circle" style={{ color: '#22c55e' }} /> Once connected, any message sent to this number becomes a lead (Source: WhatsApp) in your Lead Hub — automatically.
      </div>
    </div>
  )
}
