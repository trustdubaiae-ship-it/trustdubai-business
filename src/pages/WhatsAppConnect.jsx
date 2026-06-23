import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { WA, waReady } from '../lib/whatsappConfig'

// Deployed endpoints
const WEBHOOK_URL = 'https://ribdorraxxhfbfkjhpie.supabase.co/functions/v1/whatsapp-webhook'
const ONBOARD_URL = 'https://ribdorraxxhfbfkjhpie.supabase.co/functions/v1/whatsapp-onboard'

export default function WhatsAppConnect({ onBack, onConnected }) {
  const { company } = useAuth()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [existing, setExisting] = useState(null)            // current whatsapp_accounts row
  const [f, setF] = useState({ phone_number_id: '', display_number: '', waba_id: '', access_token: '' })
  const sessionRef = useRef({})                              // waba_id / phone_number_id from Embedded Signup

  const text = 'var(--text)', textSub = 'var(--text2)', textMuted = 'var(--text3)'
  const card = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 18 }
  const input = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: text, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
  const lbl = { fontSize: 11, fontWeight: 600, color: textMuted, display: 'block', marginBottom: 5 }
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  useEffect(() => { if (company?.id) load() }, [company?.id])

  // Load the Facebook JS SDK + listen for Embedded Signup session info
  useEffect(() => {
    if (!waReady()) return
    const onMsg = (event) => {
      if (typeof event.data !== 'string') return
      if (!/facebook\.com$/.test(new URL(event.origin).hostname)) return
      try {
        const d = JSON.parse(event.data)
        if (d.type === 'WA_EMBEDDED_SIGNUP' && d.data) {
          if (d.data.waba_id) sessionRef.current.waba_id = d.data.waba_id
          if (d.data.phone_number_id) sessionRef.current.phone_number_id = d.data.phone_number_id
        }
      } catch { /* not our message */ }
    }
    window.addEventListener('message', onMsg)
    if (!document.getElementById('fb-sdk')) {
      window.fbAsyncInit = function () {
        window.FB.init({ appId: WA.FB_APP_ID, autoLogAppEvents: true, xfbml: false, version: WA.GRAPH_VERSION })
      }
      const s = document.createElement('script')
      s.id = 'fb-sdk'; s.async = true; s.defer = true; s.crossOrigin = 'anonymous'
      s.src = 'https://connect.facebook.net/en_US/sdk.js'
      document.body.appendChild(s)
    }
    return () => window.removeEventListener('message', onMsg)
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('whatsapp_accounts').select('*').eq('company_id', company.id).maybeSingle()
    if (data) {
      setExisting(data)
      setF({ phone_number_id: data.phone_number_id || '', display_number: data.display_number || '', waba_id: data.waba_id || '', access_token: data.access_token || '' })
    }
    setLoading(false)
  }

  // One-click: Meta Embedded Signup → onboard function → store
  function connectOneClick() {
    if (!window.FB) { toast.error('Still loading — try again in a second'); return }
    sessionRef.current = {}
    window.FB.login(async (response) => {
      const code = response?.authResponse?.code
      if (!code) { toast.info('Connection cancelled'); return }
      const { waba_id, phone_number_id } = sessionRef.current
      if (!waba_id || !phone_number_id) { toast.error('Could not read the WhatsApp account — please try again'); return }
      setConnecting(true)
      try {
        const res = await fetch(ONBOARD_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, waba_id, phone_number_id }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || 'Onboarding failed')
        await storeAccount({ phone_number_id, waba_id, display_number: data.display_number || null, access_token: data.access_token || null })
        toast.success('WhatsApp connected ✓')
        onConnected?.()
      } catch (e) {
        toast.error('Connect failed: ' + (e?.message || e))
      } finally { setConnecting(false) }
    }, {
      config_id: WA.ES_CONFIG_ID,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '2' },
    })
  }

  async function storeAccount(vals) {
    const payload = { company_id: company.id, ...vals }
    if (existing) {
      const { error } = await supabase.from('whatsapp_accounts').update(payload).eq('id', existing.id).eq('company_id', company.id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('whatsapp_accounts').insert(payload).select('*').single()
      if (error) throw error
      setExisting(data)
    }
    load()
  }

  async function saveManual() {
    if (!f.phone_number_id.trim()) { toast.error('Phone Number ID is required'); return }
    setSaving(true)
    try {
      await storeAccount({
        phone_number_id: f.phone_number_id.trim(),
        display_number: f.display_number.trim() || null,
        waba_id: f.waba_id.trim() || null,
        access_token: f.access_token.trim() || null,
      })
      toast.success('WhatsApp connected ✓')
      onConnected?.()
    } catch (e) { toast.error('Could not save: ' + (e?.message || e)) } finally { setSaving(false) }
  }

  async function disconnect() {
    if (!existing) return
    if (!window.confirm('Disconnect this WhatsApp number? Incoming messages will stop becoming leads.')) return
    await supabase.from('whatsapp_accounts').delete().eq('id', existing.id).eq('company_id', company.id)
    setExisting(null); setF({ phone_number_id: '', display_number: '', waba_id: '', access_token: '' })
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
          <div style={{ fontSize: 12.5, color: textMuted }}>Leads from your WhatsApp Business number {existing && <span style={{ color: '#16a34a', fontWeight: 700 }}>· Connected{f.display_number ? ' · ' + f.display_number : ''}</span>}</div>
        </div>
      </div>

      {/* Connected state */}
      {existing && (
        <div style={{ ...card, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <i className="ti ti-circle-check-filled" style={{ fontSize: 22, color: '#16a34a' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: text }}>WhatsApp is connected</div>
            <div style={{ fontSize: 12, color: textMuted }}>{f.display_number || f.phone_number_id} — incoming messages become leads automatically.</div>
          </div>
          <button onClick={disconnect} style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Disconnect</button>
        </div>
      )}

      {/* One-click (Embedded Signup) */}
      {waReady() ? (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 6 }}>{existing ? 'Reconnect / change number' : 'Connect in one click'}</div>
          <div style={{ fontSize: 12, color: textSub, marginBottom: 14 }}>Log in with Facebook and pick your WhatsApp Business number — that’s it. No technical setup.</div>
          <button onClick={connectOneClick} disabled={connecting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 10, background: '#1877F2', color: '#fff', border: 'none', cursor: connecting ? 'default' : 'pointer', fontSize: 14, fontWeight: 700, opacity: connecting ? 0.7 : 1 }}>
            <i className="ti ti-brand-meta" style={{ fontSize: 18 }} /> {connecting ? 'Connecting…' : 'Connect with Facebook'}
          </button>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setShowManual(v => !v)} style={{ background: 'none', border: 'none', color: textSub, cursor: 'pointer', fontSize: 12, padding: 0, textDecoration: 'underline' }}>
              {showManual ? 'Hide manual setup' : 'Advanced: enter details manually'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ ...card, marginBottom: 14, background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.3)' }}>
          <div style={{ fontSize: 12.5, color: textSub, lineHeight: 1.6 }}>
            <i className="ti ti-clock-bolt" style={{ color: '#d97706' }} /> <b>One-click connect</b> turns on once Quvera’s Meta app is verified (App Review). Until then, you can connect manually below if you already have your number on the WhatsApp Cloud API.
          </div>
        </div>
      )}

      {/* Manual setup (fallback / advanced) */}
      {(!waReady() || showManual) && (
        <>
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 10 }}>Webhook (for Meta app)</div>
            <div style={lbl}>Callback URL</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input readOnly value={WEBHOOK_URL} style={{ ...input, fontFamily: 'monospace', fontSize: 11.5 }} />
              <button onClick={() => copy(WEBHOOK_URL)} style={{ padding: '0 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: text, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}><i className="ti ti-copy" /> Copy</button>
            </div>
            <div style={{ fontSize: 11.5, color: textMuted }}>Verify token: the same string set as <code>WHATSAPP_VERIFY_TOKEN</code> in the Edge Function secrets. Subscribe to the <b>messages</b> field.</div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 14 }}>Your number details</div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Phone Number ID <span style={{ color: '#ef4444' }}>*</span></label>
              <input value={f.phone_number_id} onChange={e => set('phone_number_id', e.target.value)} style={input} placeholder="e.g. 123456789012345" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>Display number</label><input value={f.display_number} onChange={e => set('display_number', e.target.value)} style={input} placeholder="+9715xxxxxxxx" /></div>
              <div><label style={lbl}>WABA ID</label><input value={f.waba_id} onChange={e => set('waba_id', e.target.value)} style={input} placeholder="optional" /></div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Access token <span style={{ color: textMuted, fontWeight: 400 }}>· optional</span></label>
              <input value={f.access_token} onChange={e => set('access_token', e.target.value)} style={{ ...input, fontFamily: 'monospace', fontSize: 11.5 }} placeholder="EAAG…" />
            </div>
            <button onClick={saveManual} disabled={saving} style={{ padding: '10px 20px', borderRadius: 9, background: '#22c55e', color: '#fff', border: 'none', cursor: saving ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : existing ? 'Update connection' : 'Connect WhatsApp'}
            </button>
          </div>
        </>
      )}

      <div style={{ fontSize: 11.5, color: textMuted, marginTop: 14, lineHeight: 1.6 }}>
        <i className="ti ti-info-circle" style={{ color: '#22c55e' }} /> Once connected, any message to this number becomes a lead (Source: WhatsApp) in your Lead Hub — automatically.
      </div>
    </div>
  )
}
