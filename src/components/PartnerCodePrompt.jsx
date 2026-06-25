import { useState } from 'react'
import { supabase } from '../lib/supabase'

// One-time, dismissible banner: lets a logged-in business attach a partner's
// referral code (so the partner who referred them gets credited).
export default function PartnerCodePrompt({ company }) {
  const dismissKey = 'qv_partner_prompt_' + (company?.id || '')
  const [show, setShow] = useState(() => {
    try { return !!company?.id && !company?.referred_by_partner_id && localStorage.getItem(dismissKey) !== '1' } catch { return false }
  })
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (!show || !company?.id) return null
  function dismiss() { try { localStorage.setItem(dismissKey, '1') } catch {} ; setShow(false) }
  async function apply() {
    if (!code.trim()) return
    setBusy(true); setMsg('')
    try {
      const { data: pid } = await supabase.rpc('resolve_partner_code', { p_code: code.trim().toUpperCase() })
      if (!pid) { setMsg('That code is invalid or not active.'); setBusy(false); return }
      const { error } = await supabase.from('companies').update({ referred_by_partner_id: pid }).eq('id', company.id)
      if (error) throw error
      setMsg('Code applied ✓ Thank you!')
      try { localStorage.setItem(dismissKey, '1') } catch {}
      setTimeout(() => setShow(false), 1400)
    } catch (e) { setMsg('Could not apply — try again.') } finally { setBusy(false) }
  }

  return (
    <div style={{ background: 'linear-gradient(100deg, rgba(0,153,204,0.10), rgba(139,92,246,0.08))', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 20 }}>🤝</div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Got a partner referral code?</div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Someone refer you to Quvera? Add their code so they get credited.</div>
      </div>
      {open ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. RAVI25" disabled={busy}
            style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, width: 130, textTransform: 'uppercase' }} />
          <button onClick={apply} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, opacity: busy ? 0.7 : 1 }}>{busy ? '…' : 'Apply'}</button>
          {msg && <span style={{ fontSize: 11.5, color: msg.includes('✓') ? '#16a34a' : '#ef4444' }}>{msg}</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setOpen(true)} style={{ padding: '8px 14px', borderRadius: 8, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>Add code</button>
          <button onClick={dismiss} style={{ padding: '8px 12px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12.5 }}>Not now</button>
        </div>
      )}
    </div>
  )
}
