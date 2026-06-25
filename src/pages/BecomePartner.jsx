import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { TIER_LIST } from '../lib/partnerTiers'
import PartnerTerms from './PartnerTerms'

export default function BecomePartner({ onBack }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', tier: 'starter' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null) // { code }
  const [agreed, setAgreed] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErr('') }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      setErr('Name, email and a password (6+ chars) are required'); return
    }
    if (!agreed) { setErr('Please accept the Partner Terms & Conditions to continue'); return }
    setErr(''); setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('partner-signup', { body: form })
      if (error) {
        // surface the function's JSON error message
        let msg = 'Sign-up failed'
        try { msg = (await error.context?.json())?.error || msg } catch { msg = error.message || msg }
        setErr(msg); setBusy(false); return
      }
      if (data?.ok) {
        // auto sign-in → lands straight on the partner dashboard
        try {
          const { error: sErr } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password })
          if (!sErr) { onBack(); return }
        } catch { /* fall back to the confirmation screen */ }
        setDone({ code: data.code }); setBusy(false)
      }
      else { setErr(data?.error || 'Sign-up failed'); setBusy(false) }
    } catch (e2) { setErr(e2?.message || 'Sign-up failed'); setBusy(false) }
  }

  const wrap = { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)', padding: 20 }
  const inp = { width: '100%', padding: '12px 14px', marginBottom: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, boxSizing: 'border-box' }
  const lbl = { fontSize: 12, color: '#8b949e', marginBottom: 6, display: 'block', fontWeight: 600 }

  if (done) {
    return (
      <div style={wrap}>
        <div style={{ width: '100%', maxWidth: 440, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 'clamp(24px,6vw,40px)', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 30 }}>🎉</div>
          <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 22, color: '#fff', marginBottom: 10 }}>You're in!</h2>
          <p style={{ fontSize: 14, color: '#aeb9d6', lineHeight: 1.7, marginBottom: 14 }}>Your partner account is created. Your referral code is <b style={{ color: '#00FFCC' }}>{done.code}</b>.</p>
          <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.7, marginBottom: 22 }}>Now <b>sign in</b> and finish 3 steps to go live: <b>upload your documents</b> (Emirates ID + Trade License), <b>pay your plan</b>, then our team <b>verifies & activates</b> you.</p>
          <button onClick={onBack} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: 'linear-gradient(100deg,#00D4FF,#8B5CF6)', color: '#fff', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>Go to sign in</button>
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {showTerms && <PartnerTerms onClose={() => setShowTerms(false)} />}
      <div style={{ textAlign: 'center', marginBottom: 22, maxWidth: 540 }}>
        <h1 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 'clamp(26px,5vw,40px)', lineHeight: 1.05, letterSpacing: '-1px', margin: 0, background: 'linear-gradient(100deg,#00D4FF,#00FFCC 55%,#8B5CF6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Become a Quvera Partner</h1>
        <p style={{ fontSize: 'clamp(13px,2vw,15px)', color: '#aeb9d6', marginTop: 10, lineHeight: 1.6 }}>Refer businesses to Quvera and earn <b style={{ color: '#fff' }}>recurring commission</b> for 12 months. Pick a plan — your tier sets your commission.</p>
      </div>

      <form onSubmit={submit} style={{ width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 'clamp(22px,5vw,34px)' }}>
        <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 20, color: '#fff', marginBottom: 4, textAlign: 'center' }}>Choose your partner plan</h2>
        <p style={{ fontSize: 12.5, color: '#8b949e', marginBottom: 16, textAlign: 'center' }}>Higher tier = higher commission on every referral.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
          {TIER_LIST.map(t => {
            const on = form.tier === t.key
            return (
              <button type="button" key={t.key} onClick={() => set('tier', t.key)}
                style={{ textAlign: 'center', padding: '13px 8px', borderRadius: 12, cursor: 'pointer', background: on ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)', border: '1.5px solid ' + (on ? '#00D4FF' : 'rgba(255,255,255,0.12)') }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>{t.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: on ? '#00FFCC' : '#fff', margin: '4px 0 1px' }}>{t.commission}%</div>
                <div style={{ fontSize: 10, color: '#8b949e' }}>AED {t.fee}/mo</div>
              </button>
            )
          })}
        </div>

        <label style={lbl}>Full name</label>
        <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Ravi Sharma" style={inp} autoFocus />
        <label style={lbl}>Email</label>
        <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@email.com" autoComplete="username" style={inp} />
        <label style={lbl}>Phone <span style={{ color: '#6e7681', fontWeight: 400 }}>(optional)</span></label>
        <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+971 50 123 4567" style={inp} />
        <label style={lbl}>Password</label>
        <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" style={inp} />

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, margin: '4px 0 14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={e => { setAgreed(e.target.checked); setErr('') }} style={{ width: 17, height: 17, marginTop: 1, accentColor: '#00D4FF', flexShrink: 0, cursor: 'pointer' }} />
          <span style={{ fontSize: 12.5, color: '#aeb9d6', lineHeight: 1.5 }}>I have read and agree to the <button type="button" onClick={() => setShowTerms(true)} style={{ background: 'none', border: 'none', padding: 0, color: '#00D4FF', fontWeight: 700, cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline' }}>Partner Terms &amp; Conditions</button>.</span>
        </label>

        {err && <div style={{ fontSize: 13, color: '#f87171', marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}

        <button type="submit" disabled={busy || !agreed} style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: (busy || !agreed) ? 'rgba(255,255,255,0.1)' : 'linear-gradient(100deg,#00D4FF,#8B5CF6)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: (busy || !agreed) ? 'not-allowed' : 'pointer', marginTop: 4 }}>
          {busy ? 'Creating…' : 'Join as a partner'}
        </button>

        <button type="button" onClick={onBack} style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: 'transparent', color: '#8b949e', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', marginTop: 10 }}>← Back to sign in</button>
      </form>
    </div>
  )
}
