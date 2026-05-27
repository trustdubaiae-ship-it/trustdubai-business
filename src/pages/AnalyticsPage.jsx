import { useAuth } from '../lib/auth'
import { Eye, Users, TrendingUp, MousePointer, Lock } from 'lucide-react'

export default function AnalyticsPage({ onNavigate }) {
  const { company } = useAuth()
  const plan = company?.plan || 'free'
  const hasAnalytics = plan !== 'free'

  if (!hasAnalytics) {
    return (
      <div className="page-content animate-in">
        <div style={{ marginBottom: 24 }}>
          <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Analytics</h1>
          <p className="text-secondary" style={{ fontSize: 14 }}>Track your profile performance</p>
        </div>

        {/* Blur preview with lock */}
        <div style={{ position: 'relative' }}>
          {/* Fake blurred stats */}
          <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>
            <div className="stat-grid" style={{ marginBottom: 20 }}>
              {[
                { label: 'Profile Views', value: '1,248', icon: Eye, color: '#eff6ff', iconColor: '#3b82f6' },
                { label: 'Unique Visitors', value: '892', icon: Users, color: '#ecfdf5', iconColor: '#10b981' },
                { label: 'Click Rate', value: '12.4%', icon: MousePointer, color: '#fef9ed', iconColor: '#e8b84b' },
                { label: 'Leads Generated', value: '34', icon: TrendingUp, color: '#f5f3ff', iconColor: '#8b5cf6' },
              ].map(({ label, value, icon: Icon, color, iconColor }) => (
                <div className="stat-card" key={label}>
                  <div className="stat-icon" style={{ background: color }}><Icon size={20} color={iconColor} /></div>
                  <div>
                    <div className="stat-label">{label}</div>
                    <div className="stat-value">{value}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 20 }}>Profile Views — Last 30 Days</div>
              <div style={{ height: 180, background: 'var(--bg)', borderRadius: 8 }} />
            </div>
          </div>

          {/* Lock overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16
          }}>
            <div style={{
              background: 'white', borderRadius: 20, padding: '32px 40px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              textAlign: 'center', maxWidth: 360
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: 14,
                background: 'var(--gold-light)',
                border: '1px solid var(--gold-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Lock size={26} color="var(--gold-dark)" />
              </div>
              <h2 className="font-syne" style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                Analytics Locked
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
                Upgrade to <strong>Basic or Premium</strong> to see detailed analytics — profile views, visitor data, click rates, and lead tracking.
              </p>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => onNavigate('plans')}>
                View Plans
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Basic analytics view (for paid plans)
  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Analytics</h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>Track your profile performance on TrustDubai</p>
      </div>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Profile Views', value: company?.profile_views || 0, icon: Eye, color: '#eff6ff', iconColor: '#3b82f6', change: 'All time' },
          { label: 'Unique Visitors', value: '—', icon: Users, color: '#ecfdf5', iconColor: '#10b981', change: 'Coming soon' },
          { label: 'Click Rate', value: '—', icon: MousePointer, color: '#fef9ed', iconColor: '#e8b84b', change: 'Coming soon' },
          { label: 'Leads Generated', value: company?.leads_count || 0, icon: TrendingUp, color: '#f5f3ff', iconColor: '#8b5cf6', change: 'All time' },
        ].map(({ label, value, icon: Icon, color, iconColor, change }) => (
          <div className="stat-card" key={label}>
            <div className="stat-icon" style={{ background: color }}><Icon size={20} color={iconColor} /></div>
            <div>
              <div className="stat-label">{label}</div>
              <div className="stat-value">{value}</div>
              <div className="stat-change text-muted">{change}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>Detailed Analytics</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', padding: '40px 0', textAlign: 'center' }}>
          📊 Detailed charts and reports coming soon. Data is being collected.
        </div>
      </div>
    </div>
  )
}
