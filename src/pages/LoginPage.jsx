import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function LoginPage({ onRegister }) {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleGoogle() {
    setLoading(true)
    try { await signInWithGoogle() }
    catch (e) { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background pattern */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(circle at 20% 50%, rgba(232,184,75,0.07) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(232,184,75,0.05) 0%, transparent 40%)`,
        pointerEvents: 'none'
      }} />

      {/* Grid lines */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        pointerEvents: 'none'
      }} />

      {/* Left — branding */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '60px',
        position: 'relative'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{
            width: 44, height: 44,
            background: 'linear-gradient(135deg, #e8b84b, #c9952a)',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, color: '#0d1117'
          }}>TD</div>
          <div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#fff' }}>TrustDubai</div>
            <div style={{ fontSize: 11, color: '#6e7681', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Business Portal</div>
          </div>
        </div>

        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800,
          fontSize: 48, color: '#ffffff', lineHeight: 1.15, marginBottom: 16,
          maxWidth: 480
        }}>
          Grow your business<br />
          <span style={{ color: '#e8b84b' }}>with trust.</span>
        </h1>

        <p style={{ fontSize: 16, color: '#8b949e', maxWidth: 400, lineHeight: 1.7, marginBottom: 48 }}>
          Manage your company profile, showcase your portfolio, respond to reviews, and grow your reputation across Dubai.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            ['🏆', 'Verified Company Badges', 'Build credibility with trust badges'],
            ['⭐', 'Review Management', 'Respond to customer reviews'],
            ['📸', 'Portfolio Showcase', 'Display your best work'],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(232,184,75,0.1)',
                border: '1px solid rgba(232,184,75,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18
              }}>{icon}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{title}</div>
                <div style={{ fontSize: 12, color: '#6e7681' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — login card */}
      <div style={{
        width: 440, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40,
        padding: 40, paddingTop: 60, position: 'relative', overflowY: 'auto'
              }}>
        <div style={{
          width: '100%', maxWidth: 380,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: 40,
          backdropFilter: 'blur(20px)'
        }}>
          <h2 style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 700,
            fontSize: 24, color: '#fff', marginBottom: 8
          }}>Welcome back</h2>
          <p style={{ fontSize: 14, color: '#8b949e', marginBottom: 32 }}>
            Sign in to manage your business profile
          </p>

          <button
            onClick={handleGoogle}
            disabled={loading}
            style={{
              width: '100%', padding: '14px 20px',
              background: loading ? 'rgba(255,255,255,0.05)' : '#ffffff',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600,
              color: loading ? '#6e7681' : '#111827',
              transition: 'all 0.2s ease',
              marginBottom: 24
            }}
          >
            {loading ? (
              <div className="spinner" style={{ borderTopColor: '#e8b84b' }} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {loading ? 'Signing in...' : 'Continue with Google'}
          </button>

          <div style={{
            background: 'rgba(232,184,75,0.08)',
            border: '1px solid rgba(232,184,75,0.2)',
            borderRadius: 8, padding: '12px 14px',
            fontSize: 12.5, color: '#9b8a5a', lineHeight: 1.6
          }}>
            🔐 Only approved company accounts can access this portal. Contact TrustDubai if you need access.
          </div>

          <p style={{ fontSize: 11.5, color: '#4a4f55', textAlign: 'center', marginTop: 24, lineHeight: 1.7 }}>
            By signing in, you agree to TrustDubai's Terms of Service and Privacy Policy.
          </p><div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 24, paddingTop: 20, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#6e7681', marginBottom: 12 }}>New to TrustDubai?</p>
            <button
              onClick={onRegister}
              style={{
                width: '100%', padding: '12px 20px',
                background: 'transparent',
                border: '1px solid rgba(232,184,75,0.3)',
                borderRadius: 10, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
                color: '#e8b84b'
              }}
            >
              🏢 Register Your Business
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
