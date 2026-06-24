import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function LoginPage({ onRegister, onPartnerSignup }) {
  const { signInWithGoogle, signInWithEmail } = useAuth()
  const [loading, setLoading] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [err, setErr] = useState('')

  async function handleGoogle() {
    setLoading(true)
    try { await signInWithGoogle() }
    catch (e) { setLoading(false) }
  }

  async function handleEmail(e) {
    e.preventDefault()
    if (!email.trim() || !password) { setErr('Enter your email and password'); return }
    setErr(''); setEmailLoading(true)
    try { await signInWithEmail(email, password) }
    catch (e2) { setErr(e2?.message || 'Sign in failed'); setEmailLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><img src="/quvera-icon.png?v=4" alt="Quvera" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
        <div>
          <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 18, color: '#fff' }}>Quvera</div>
          <div style={{ fontSize: 11, color: '#6e7681', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Business Portal</div>
          <div style={{ fontSize: 10, color: '#a8893f', letterSpacing: '0.04em', marginTop: 2 }}>Find. Verify. Trust.</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 28, maxWidth: 580 }}>
        <h1 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 'clamp(30px, 6vw, 48px)', lineHeight: 1.04, letterSpacing: '-1.2px', margin: 0, background: 'linear-gradient(100deg,#00D4FF,#00FFCC 55%,#8B5CF6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          Quvera Business OS
        </h1>
        <p style={{ fontSize: 'clamp(13px, 2vw, 15.5px)', color: '#aeb9d6', marginTop: 12, lineHeight: 1.5 }}>
          The AI Operating System for Construction, Interior Fit-Out &amp; Service Companies.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 'clamp(24px, 6vw, 40px)', backdropFilter: 'blur(20px)' }}>
        <h2 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 24, color: '#fff', marginBottom: 8, textAlign: 'center' }}>Welcome back</h2>
        <p style={{ fontSize: 14, color: '#8b949e', marginBottom: 32, textAlign: 'center' }}>Sign in to manage your business profile</p>

        <button onClick={handleGoogle} disabled={loading} style={{ width: '100%', padding: '14px 20px', background: loading ? 'rgba(255,255,255,0.05)' : '#ffffff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: loading ? '#6e7681' : '#111827', marginBottom: 20 }}>
          {loading ? <div className="spinner" style={{ borderTopColor: '#e8b84b' }} /> : (
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        {/* email & password — for partners and team accounts */}
        {!showEmail ? (
          <button onClick={() => setShowEmail(true)} style={{ width: '100%', padding: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontSize: 13.5, fontWeight: 600, color: '#aeb9d6', marginBottom: 20 }}>
            Sign in with email &amp; password
          </button>
        ) : (
          <form onSubmit={handleEmail} style={{ marginBottom: 20 }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" autoFocus autoComplete="username"
              style={{ width: '100%', padding: '12px 14px', marginBottom: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, boxSizing: 'border-box' }} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password"
              style={{ width: '100%', padding: '12px 14px', marginBottom: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, boxSizing: 'border-box' }} />
            {err && <div style={{ fontSize: 12.5, color: '#f87171', marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={emailLoading} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: 'linear-gradient(100deg,#00D4FF,#8B5CF6)', color: '#fff', fontWeight: 700, fontSize: 14.5, cursor: emailLoading ? 'not-allowed' : 'pointer' }}>
              {emailLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        <div style={{ background: 'rgba(232,184,75,0.08)', border: '1px solid rgba(232,184,75,0.2)', borderRadius: 8, padding: '12px 14px', fontSize: 12.5, color: '#9b8a5a', lineHeight: 1.6, marginBottom: 20 }}>
          🔐 Only approved company accounts can access this portal. Contact Quvera if you need access.
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#6e7681', marginBottom: 12 }}>New to Quvera?</p>
          <button onClick={onRegister} style={{ width: '100%', padding: '12px 20px', background: 'transparent', border: '1px solid rgba(232,184,75,0.3)', borderRadius: 10, cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: '#e8b84b' }}>
            🏢 Register Your Business
          </button>
          <p style={{ fontSize: 12.5, color: '#6e7681', marginTop: 14, lineHeight: 1.6 }}>
            Already listed on Quvera?{' '}
            <span onClick={() => window.open('https://quvera.ae/claim-company', '_blank')} style={{ color: '#e8b84b', cursor: 'pointer', fontWeight: 600 }}>Claim your company</span>
          </p>
          <p style={{ fontSize: 12.5, color: '#6e7681', marginTop: 10, lineHeight: 1.6 }}>
            Want to earn by referring businesses?{' '}
            <span onClick={onPartnerSignup} style={{ color: '#00D4FF', cursor: 'pointer', fontWeight: 600 }}>Become a Partner</span>
          </p>
        </div>
      </div>
    </div>
  )
}