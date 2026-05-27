import { useAuth } from '../lib/auth'

export default function NoCompanyPage() {
  const { user, signOut } = useAuth()

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 20
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: '48px 40px',
        textAlign: 'center', maxWidth: 440,
        boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
        border: '1px solid var(--card-border)'
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: 'var(--gold-light)',
          border: '1px solid var(--gold-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 32
        }}>🏢</div>

        <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 10 }}>
          No Company Found
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>
          Your Google account <strong>{user?.email}</strong> is not linked to any company on TrustDubai.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
          If your company is already listed, contact us and we'll link your account. New to TrustDubai? Submit your company for approval.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a
            href="https://wa.me/971503856786?text=Hi, I'd like to get access to TrustDubai Business Portal for my company"
            target="_blank" rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ justifyContent: 'center', textDecoration: 'none' }}
          >
            📱 Request Access via WhatsApp
          </a>
          <a
            href="mailto:hello@trustdubai.ae?subject=Business Portal Access Request"
            className="btn btn-secondary"
            style={{ justifyContent: 'center', textDecoration: 'none' }}
          >
            ✉️ Email Us
          </a>
          <button className="btn btn-ghost" onClick={signOut} style={{ justifyContent: 'center' }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
