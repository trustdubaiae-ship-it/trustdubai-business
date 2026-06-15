import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Eye, TrendingUp, Users, Star, Lock } from 'lucide-react'

export default function AnalyticsPage() {
  const { company } = useAuth()
  const [loading, setLoading] = useState(true)
  const [viewsLog, setViewsLog] = useState([])
  const [totalViews, setTotalViews] = useState(0)
  const [todayViews, setTodayViews] = useState(0)
  const [weekViews, setWeekViews] = useState(0)
  const [period, setPeriod] = useState('7days')

  const plan = company?.plan || 'free'
  const canAccess = plan === 'gold' || plan === 'platinum'

  useEffect(() => {
    if (company && canAccess) fetchAnalytics()
    else setLoading(false)
  }, [company])

  async function fetchAnalytics() {
    setLoading(true)
    try {
      // Total views
      setTotalViews(company.profile_views || 0)

      // Views log — last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: logs } = await supabase
        .from('profile_views_log')
        .select('visited_at')
        .eq('company_id', company.id)
        .gte('visited_at', thirtyDaysAgo.toISOString())
        .order('visited_at', { ascending: true })

      setViewsLog(logs || [])

      // Today views
      const today = new Date().toISOString().split('T')[0]
      const todayCount = (logs || []).filter(l => l.visited_at.startsWith(today)).length
      setTodayViews(todayCount)

      // This week views
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const weekCount = (logs || []).filter(l => new Date(l.visited_at) >= weekAgo).length
      setWeekViews(weekCount)

    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Build chart data
  function buildChartData() {
    const days = period === '7days' ? 7 : 30
    const result = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const count = viewsLog.filter(l => l.visited_at.startsWith(dateStr)).length
      result.push({
        date: dateStr,
        label: d.toLocaleDateString('en-AE', { day: 'numeric', month: 'short' }),
        count,
      })
    }
    return result
  }

  const chartData = buildChartData()
  const maxCount = Math.max(...chartData.map(d => d.count), 1)

  if (!canAccess) {
    return (
      <div className="page-content animate-in">
        <div style={{ marginBottom: 24 }}>
          <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Analytics</h1>
          <p className="text-secondary" style={{ fontSize: 14 }}>Profile visitor analytics and insights</p>
        </div>
        <div style={{
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius)', padding: 'clamp(32px, 6vw, 60px) clamp(20px, 5vw, 40px)', textAlign: 'center'
        }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#fef9ed', border: '1px solid #fcd34d', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Lock size={28} color="#e8b84b" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Analytics — Gold Plan Feature</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.6 }}>
            Upgrade to Gold or Platinum to see who's visiting your profile, when they visit, and track your growth over time.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12, maxWidth: 400, margin: '0 auto 24px' }}>
            {[
              { icon: '👁️', label: 'Profile Views' },
              { icon: '📈', label: 'View Trends' },
              { icon: '📅', label: 'Daily Stats' },
            ].map(f => (
              <div key={f.label} style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{f.icon}</div>
                {f.label}
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => window.open('https://wa.me/971503856786?text=Hi, I would like to upgrade my Quvera plan to Gold', '_blank')}
          >
            Upgrade to Gold — AED 349/mo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Analytics</h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>Track your profile visitors and performance</p>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { icon: Eye, label: 'Total Views', value: totalViews, color: '#3b82f6', bg: '#eff6ff' },
          { icon: TrendingUp, label: 'This Week', value: weekViews, color: '#10b981', bg: '#ecfdf5' },
          { icon: Users, label: 'Today', value: todayViews, color: '#8b5cf6', bg: '#f5f3ff' },
          { icon: Star, label: 'Avg Rating', value: company?.avg_rating || '0.0', color: '#e8b84b', bg: '#fffbef' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={20} color={color} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{loading ? '—' : value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div className="card-title">Profile Views</div>
            <div className="card-subtitle">Daily visitor trend</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: '7days', label: '7 Days' },
              { id: '30days', label: '30 Days' },
            ].map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                background: period === p.id ? 'var(--primary)' : 'var(--bg)',
                color: period === p.id ? '#fff' : 'var(--text-secondary)',
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : (
          <div>
            {/* Bar chart */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, marginBottom: 8 }}>
              {chartData.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 500 }}>
                    {d.count > 0 ? d.count : ''}
                  </div>
                  <div style={{
                    width: '100%',
                    height: d.count > 0 ? Math.max((d.count / maxCount) * 130, 4) : 4,
                    background: d.count > 0
                      ? 'linear-gradient(180deg, #03C1F5, #0299c4)'
                      : 'var(--card-border)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease',
                    cursor: 'default',
                  }} title={d.label + ': ' + d.count + ' views'} />
                </div>
              ))}
            </div>
            {/* X axis labels */}
            <div style={{ display: 'flex', gap: 4 }}>
              {chartData.map((d, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden' }}>
                  {period === '7days' ? d.label : (i % 5 === 0 ? d.label : '')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent views table */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>Recent Visitors</div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : viewsLog.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👁️</div>
            <div style={{ fontSize: 14 }}>No visitors yet — share your profile link!</div>
            <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)' }}>
              trustdubai.ae/{company?.slug}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...viewsLog].reverse().slice(0, 10).map((log, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Eye size={14} color="#3b82f6" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Profile Visitor</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {log.user_agent?.includes('Mobile') ? '📱 Mobile' : '💻 Desktop'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                  {new Date(log.visited_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
            {viewsLog.length > 10 && (
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                Showing last 10 of {viewsLog.length} visits
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
