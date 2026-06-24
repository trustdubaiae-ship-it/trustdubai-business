import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function BecomePartner({ onBack }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null) // { code }

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErr('') }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      setErr('Name, email and a password (6+ chars) are required'); return
    }
    setErr(''); setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('partner-signup', { body: form })
      if (error) {
        // surface the function's JSON error message
        let msg = 'Sign-up failed'
        try { msg = (await error.context?.json())?.error || msg } catch { msg = error.message || msg }
        setErr(msg); setBusy(false); return
      }
      if (data?.ok) setDone({ code: data.code })
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
          <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.7, marginBottom: 22 }}>Sign in with your email &amp; password. Your account is <b>pending approval</b> — once our team activates it, your referral link starts earning.</p>
          <button onClick={onBack} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: 'linear-gradient(100deg,#00D4FF,#8B5CF6)', color: '#fff', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>Go to sign in</button>
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={{ textAlign: 'center', marginBottom: 22, maxWidth: 540 }}>
        <h1 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: 'clamp(26px,5vw,40px)', lineHeight: 1.05, letterSpacing: '-1px', margin: 0, background: 'linear-gradient(100deg,#00D4FF,#00FFCC 55%,#8B5CF6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Become a Quvera Partner</h1>
        <p style={{ fontSize: 'clamp(13px,2vw,15px)', color: '#aeb9d6', marginTop: 10, lineHeight: 1.6 }}>Refer businesses to Quvera and earn <b style={{ color: '#fff' }}>25% recurring</b> commission for 12 months on every paying business you bring.</p>
      </div>

      <form onSubmit={submit} style={{ width: '100%', maxWidth: 440, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 'clamp(24px,6vw,40px)' }}>
        <h2 style={{ fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: 20, color: '#fff', marginBottom: 4, textAlign: 'center' }}>Create your partner account</h2>
        <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 22, textAlign: 'center' }}>Free to join. No fees.</p>

        <label style={lbl}>Full name</label>
        <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Ravi Sharma" style={inp} autoFocus />
        <label style={lbl}>Email</label>
        <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@email.com" autoComplete="username" style={inp} />
        <label style={lbl}>Phone <span style={{ color: '#6e7681', fontWeight: 400 }}>(optional)</span></label>
        <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+971 50 123 4567" style={inp} />
        <label style={lbl}>Password</label>
        <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" style={inp} />

        {err && <div style={{ fontSize: 13, color: '#f87171', marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}

        <button type="submit" disabled={busy} style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: busy ? 'rgba(255,255,255,0.1)' : 'linear-gradient(100deg,#00D4FF,#8B5CF6)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: busy ? 'not-allowed' : 'pointer', marginTop: 4 }}>
          {busy ? 'Creating…' : 'Join as a partner'}
        </button>

        <button type="button" onClick={onBack} style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: 'transparent', color: '#8b949e', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', marginTop: 10 }}>← Back to sign in</button>
      </form>
    </div>
  )
}
