import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Eye, Star, Image, TrendingUp, AlertCircle, CheckCircle, ArrowRight, Clock } from 'lucide-react'

export default function DashboardPage({ onNavigate }) {
  const { company } = useAuth()
  const [stats, setStats] = useState({ views: 0, reviews: 0, avgRating: 0, portfolio: 0 })
  const [recentReviews, setRecentReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (company) fetchStats()
  }, [company])

  async function fetchStats() {
    try {
      const [reviewsRes, portfolioRes] = await Promise.all([
        supabase.from('reviews').select('rating').eq('company_id', company.id),
        supabase.from('portfolio_items').select('id').eq('company_id', company.id)
      ])

      const reviews = reviewsRes.data || []
      const avgRating = reviews.length > 0
        ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
        : 0

      setStats({
        views: company.profile_views || 0,
        reviews: reviews.length,
        avgRating,
        portfolio: portfolioRes.data?.length || 0
      })

      // Fetch recent reviews
      const { data: recent } = await supabase
        .from('reviews')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(3)

      setRecentReviews(recent || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const profileComplete = calcProfileComplete(company)

  // Checklist
  const checklist = [
    { done: !!company?.name, label: 'Company name added', page: 'profile' },
    { done: !!company?.logo_url, label: 'Logo uploaded', page: 'profile' },
    { done: !!company?.description, label: 'Description written', page: 'profile' },
    { done: !!company?.phone, label: 'Phone number added', page: 'profile' },
    { done: stats.portfolio > 0, label: 'Portfolio photo added', page: 'portfolio' },
    { done: stats.reviews > 0, label: 'First review received', page: 'reviews' },
  ]

  return (
    <div className="page-content animate-in">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>
          Welcome back{company?.name ? `, ${company.name.split(' ')[0]}` : ''}! 👋
        </h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>
          Here's how your business is performing on TrustDubai.
        </p>
      </div>

      {/* Profile Completion Banner */}
      {profileComplete < 100 && (
        <div style={{
          background: 'linear-gradient(135deg, #fef9ed, #fef3c7)',
          border: '1px solid rgba(232,184,75,0.3)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 14,
          marginBottom: 20
        }}>
          <AlertCircle size={20} color="var(--amber)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#92400e' }}>
              Profile {profileComplete}% complete
            </div>
            <div style={{ fontSize: 13, color: '#b45309', marginTop: 2 }}>
              Complete your profile to get more visibility on TrustDubai
            </div>
          </div>
          <div style={{
            width: 120, height: 6, background: 'rgba(0,0,0,0.1)',
            borderRadius: 99, overflow: 'hidden'
          }}>
            <div style={{
              width: `${profileComplete}%`, height: '100%',
              background: 'linear-gradient(90deg, #e8b84b, #c9952a)',
              borderRadius: 99, transition: 'width 0.5s ease'
            }} />
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => onNavigate('profile')}>
            Complete
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid">
        {[
          { icon: Eye, label: 'Profile Views', value: stats.views, color: '#eff6ff', iconColor: '#3b82f6', change: 'This month' },
          { icon: Star, label: 'Total Reviews', value: stats.reviews, color: '#fef9ed', iconColor: '#e8b84b', change: `${stats.avgRating} avg rating` },
          { icon: Image, label: 'Portfolio Items', value: stats.portfolio, color: '#ecfdf5', iconColor: '#10b981', change: 'Photos uploaded' },
          { icon: TrendingUp, label: 'Leads Generated', value: company?.leads_count || 0, color: '#f5f3ff', iconColor: '#8b5cf6', change: 'Via TrustDubai' },
        ].map(({ icon: Icon, label, value, color, iconColor, change }) => (
          <div className="stat-card" key={label}>
            <div className="stat-icon" style={{ background: color }}>
              <Icon size={20} color={iconColor} />
            </div>
            <div>
              <div className="stat-label">{label}</div>
              <div className="stat-value">{loading ? '—' : value}</div>
              <div className="stat-change text-muted">{change}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Profile Checklist */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Profile Checklist</div>
              <div className="card-subtitle">Complete these to boost visibility</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {checklist.map(({ done, label, page }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                background: done ? 'var(--green-light)' : 'var(--bg)',
                borderRadius: 8,
                cursor: done ? 'default' : 'pointer',
                transition: 'all 0.15s'
              }} onClick={() => !done && onNavigate(page)}>
                <CheckCircle size={16} color={done ? 'var(--green)' : '#d1d5db'} fill={done ? 'var(--green)' : 'none'} />
                <span style={{
                  fontSize: 13.5,
                  color: done ? '#065f46' : 'var(--text-secondary)',
                  textDecoration: done ? 'none' : 'none',
                  flex: 1
                }}>{label}</span>
                {!done && <ArrowRight size={14} color="var(--text-muted)" />}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Reviews */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recent Reviews</div>
              <div className="card-subtitle">Latest customer feedback</div>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('reviews')}>
              View All
            </button>
          </div>

          {recentReviews.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <div className="empty-state-icon">⭐</div>
              <h3>No reviews yet</h3>
              <p>Reviews from customers will appear here</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentReviews.map(review => (
                <div key={review.id} style={{
                  padding: 12, background: 'var(--bg)', borderRadius: 8,
                  display: 'flex', flexDirection: 'column', gap: 6
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="review-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                        {(review.reviewer_name || 'A')[0]}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {review.reviewer_name || 'Anonymous'}
                      </span>
                    </div>
                    <div className="stars">
                      {[1,2,3,4,5].map(s => (
                        <span key={s} className={`star ${s <= review.rating ? '' : 'empty'}`}>★</span>
                      ))}
                    </div>
                  </div>
                  {review.comment && (
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {review.comment.slice(0, 100)}{review.comment.length > 100 ? '...' : ''}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 11 }}>
                    <Clock size={10} />
                    {new Date(review.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function calcProfileComplete(company) {
  if (!company) return 0
  const fields = ['name', 'description', 'phone', 'logo_url', 'category', 'location']
  const done = fields.filter(f => !!company[f]).length
  return Math.round((done / fields.length) * 100)
}
