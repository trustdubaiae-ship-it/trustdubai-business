import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import PartnerTerms from './PartnerTerms'

export default function BecomePartner({ onBack }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', tier: 'starter' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null) // { code }
  const [agreed, setAgreed] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [plan, setPlan] = useState({ orig: 799, disc: 0 })

  useEffect(() => {
    supabase.from('qv_settings').select('key, value').in('key', ['plan_price', 'plan_discount_pct']).then(({ data }) => {
      if (!data) return
      const m = {}; data.forEach(r => { m[r.key] = Number(r.value) })
      setPlan({ orig: Number.isFinite(m.plan_price) ? m.plan_price : 799, disc: Number.isFinite(m.plan_discount_pct) ? m.plan_discount_pct : 0 })
    }, () => {})
  }, [])
  const planEff = Math.max(0, Math.round(plan.orig * (1 - plan.disc / 100) * 100) / 100)

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
        <p style={{ fontSize: 'clamp(13px,2vw,15px)', color: '#aeb9d6', marginTop: 10, lineHeight: 1.6 }}>Refer businesses to Quvera and earn <b style={{ color: '#fff' }}>recurring commission</b> for 12 months. Your commission rate grows with how many businesses you refer.</p>
      </div>

      <form onSubmit={submit} style={{ width: '100%', maxWidth: 460, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 'clamp(22px,5vw,34px)' }}>
        <div style={{ textAlign: 'center', padding: '18px 14px', borderRadius: 14, marginBottom: 18, background: 'rgba(0,212,255,0.08)', border: '1.5px solid rgba(0,212,255,0.35)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: '#8b949e' }}>Partner Plan</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'center', margin: '7px 0 2px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: '#00FFCC' }}>AED {planEff.toLocaleString('en-AE')}<span style={{ fontSize: 13, fontWeight: 600, color: '#8b949e' }}>/mo</span></span>
            {plan.disc > 0 && <span style={{ fontSize: 15, color: '#8b949e', textDecoration: 'line-through' }}>AED {plan.orig.toLocaleString('en-AE')}</span>}
            {plan.disc > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, color: '#0d1117', background: '#00FFCC', padding: '2px 9px', borderRadius: 99 }}>{plan.disc}% OFF</span>}
          </div>
          <div style={{ fontSize: 11.5, color: '#8b949e', marginTop: 5 }}>+ 5% VAT · Commission grows with how many businesses you refer.</div>
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
