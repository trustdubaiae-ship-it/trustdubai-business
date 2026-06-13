import { useAuth } from '../lib/auth'

export default function NoCompanyPage() {
  const { user, signOut } = useAuth()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: '48px 40px', textAlign: 'center', maxWidth: 440, boxShadow: '0 8px 40px rgba(0,0,0,0.08)', border: '1px solid var(--card-border)' }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: '#fef9ed', border: '1px solid #fcd34d', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}>🏢</div>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 10 }}>No Business Found</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>
          We couldn't find a business linked to <strong>{user?.email}</strong>.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
          If you haven't listed your business yet, register it first using the same email. Already applied? Make sure you signed in with the same email you used on the application.
        </p>
        <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 8, padding: '10px 14px', marginBottom: 24, fontSize: 13, color: '#065f46' }}>
          Looking to review a business? Visit trustdubai.ae instead.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => window.location.href = 'https://trustdubai.ae'} className="btn btn-primary" style={{ justifyContent: 'center' }}>
            🏢 List Your Business
          </button>
          <button onClick={() => window.open('https://wa.me/971503856786?text=Hi, I want access to Tritova Business Portal', '_blank')} className="btn btn-secondary" style={{ justifyContent: 'center' }}>
            📱 Request Business Access
          </button>
          <button className="btn btn-ghost" onClick={signOut} style={{ justifyContent: 'center' }}>
            Sign Out
          </button>
        </div>
        <div style={{ marginTop: 20, fontSize: 11, color: '#9ca3af' }}>Tritova Business Portal</div>
      </div>
    </div>
  )
}
