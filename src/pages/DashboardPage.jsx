import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Eye, Star, Image, TrendingUp, AlertCircle, CheckCircle, ArrowRight, Clock, Users, AlertTriangle } from 'lucide-react'

const PLAN_CONFIG = {
  free:     { name: 'Free',     color: '#6b7280', bg: '#f9fafb', maxMembers: 2,   badge: '🆓' },
  silver:   { name: 'Silver',   color: '#94a3b8', bg: '#f1f5f9', maxMembers: 5,   badge: '🥈' },
  gold:     { name: 'Gold',     color: '#e8b84b', bg: '#fffdf7', maxMembers: 15,  badge: '🥇' },
  platinum: { name: 'Platinum', color: '#8b5cf6', bg: '#faf5ff', maxMembers: 999, badge: '💎' },
}

function getExpiryInfo(expiresAt) {
  if (!expiresAt) return null
  const now = new Date()
  const exp = new Date(expiresAt)
  const diffMs = exp - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0)   return { label: 'Plan Expired!', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', days: diffDays, expired: true, urgent: true }
  if (diffDays <= 7)  return { label: diffDays + ' days left', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', days: diffDays, expired: false, urgent: true }
  if (diffDays <= 30) return { label: diffDays + ' days left', color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', days: diffDays, expired: false, urgent: false }
  return { label: diffDays + ' days left', color: '#10b981', bg: '#f0fdf4', border: '#a7f3d0', days: diffDays, expired: false, urgent: false }
}

export default function DashboardPage({ onNavigate }) {
  const { company } = useAuth()
  const [stats, setStats] = useState({ views: 0, reviews: 0, avgRating: 0, portfolio: 0 })
  const [recentReviews, setRecentReviews] = useState([])
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [clock, setClock] = useState('')

  useEffect(() => {
    function updateClock() {
      const now = new Date()
      const dubai = now.toLocaleString('en-AE', {
        timeZone: 'Asia/Dubai',
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      })
      setClock(dubai)
    }
    updateClock()
    const interval = setInterval(updateClock, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (company) fetchStats()
  }, [company])

  async function fetchStats() {
    try {
      const [reviewsRes, portfolioRes, membersRes] = await Promise.all([
        supabase.from('reviews').select('rating').eq('company_id', company.id),
        supabase.from('portfolio_items').select('id').eq('company_id', company.id),
        supabase.from('employees').select('id').eq('current_company_id', company.id)
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
      setMemberCount(membersRes.data?.length || 0)

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
  const currentPlan = company?.plan || 'free'
  const planConfig = PLAN_CONFIG[currentPlan] || PLAN_CONFIG.free
  const expiryInfo = getExpiryInfo(company?.plan_expires_at)

  const checklist = [
    { done: !!company?.name,        label: 'Company name added',    page: 'profile' },
    { done: !!company?.logo_url,    label: 'Logo uploaded',         page: 'profile' },
    { done: !!company?.description, label: 'Description written',   page: 'profile' },
    { done: !!company?.phone,       label: 'Phone number added',    page: 'profile' },
    { done: stats.portfolio > 0,    label: 'Portfolio photo added', page: 'portfolio' },
    { done: stats.reviews > 0,      label: 'First review received', page: 'reviews' },
  ]

  const memberPct = planConfig.maxMembers === 999
    ? 100
    : Math.min(100, Math.round((memberCount / planConfig.maxMembers) * 100))

  return (
    <div className="page-content animate-in">

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>
              Welcome back{company?.name ? `, ${company.name.split(' ')[0]}` : ''}! 👋
            </h1>
            <p className="text-secondary" style={{ fontSize: 14 }}>
              Here's how your business is performing on TrustDubai.
            </p>
          </div>
          {clock && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--bg)', border: '1px solid var(--card-border)',
              borderRadius: 8, padding: '6px 14px',
              fontSize: 13, color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums'
            }}>
              🕐 {clock} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Dubai</span>
            </div>
          )}
        </div>
      </div>

      {/* Plan Expiry Warning Banner */}
      {expiryInfo && expiryInfo.urgent && currentPlan !== 'free' && (
        <div style={{
          background: expiryInfo.bg,
          border: '1px solid ' + expiryInfo.border,
          borderRadius: 'var(--radius)',
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 14,
          marginBottom: 20
        }}>
          <AlertTriangle size={20} color={expiryInfo.color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: expiryInfo.color }}>
              {expiryInfo.expired
                ? '⚠️ Your plan has expired!'
                : '⚠️ Your ' + currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1) + ' plan expires in ' + expiryInfo.days + ' days!'}
            </div>
            <div style={{ fontSize: 12, color: expiryInfo.color, opacity: 0.8, marginTop: 2 }}>
              {expiryInfo.expired
                ? 'Your account has been downgraded to Free plan. Renew now to restore your features.'
                : 'Renew now to avoid losing your premium features and visibility.'}
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => window.open('https://wa.me/971503856786?text=Hi, I need to renew my TrustDubai ' + currentPlan + ' plan', '_blank')}
          >
            Renew Now
          </button>
        </div>
      )}

      {/* Plan + Members Card */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{
          background: planConfig.bg,
          border: `1px solid ${planConfig.color}30`,
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: `${planConfig.color}15`,
            border: `1px solid ${planConfig.color}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22
          }}>{planConfig.badge}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Current Plan</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: planConfig.color }}>{planConfig.name}</div>
            {/* Expiry info */}
            {expiryInfo && currentPlan !== 'free' ? (
              <div style={{ fontSize: 12, color: expiryInfo.color, marginTop: 2, fontWeight: 500 }}>
                🕐 {expiryInfo.label}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {currentPlan === 'free' ? 'Upgrade for more features' : 'Plan is active'}
              </div>
            )}
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('plans')} style={{ whiteSpace: 'nowrap' }}>
            {currentPlan === 'free' ? 'Upgrade' : expiryInfo?.urgent ? 'Renew' : 'Manage'}
          </button>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="#3b82f6" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Team Members</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {loading ? '—' : memberCount}
                <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                  / {planConfig.maxMembers === 999 ? '∞' : planConfig.maxMembers}
                </span>
              </div>
            </div>
          </div>
          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{
              width: `${memberPct}%`, height: '100%',
              background: memberPct >= 90 ? '#ef4444' : memberPct >= 70 ? '#f59e0b' : '#3b82f6',
              borderRadius: 99, transition: 'width 0.5s ease'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>{planConfig.name} plan limit</span>
            {memberPct >= 90 && currentPlan !== 'platinum' && (
              <span style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 500 }} onClick={() => onNavigate('plans')}>
                Upgrade for more →
              </span>
            )}
          </div>
        </div>
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
            <div style={{ fontWeight: 600, fontSize: 14, color: '#92400e' }}>Profile {profileComplete}% complete</div>
            <div style={{ fontSize: 13, color: '#b45309', marginTop: 2 }}>Complete your profile to get more visibility on TrustDubai</div>
          </div>
          <div style={{ width: 120, height: 6, background: 'rgba(0,0,0,0.1)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${profileComplete}%`, height: '100%', background: 'linear-gradient(90deg, #e8b84b, #c9952a)', borderRadius: 99 }} />
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => onNavigate('profile')}>Complete</button>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid">
        {[
          { icon: Eye,         label: 'Profile Views',   value: stats.views,                color: '#eff6ff', iconColor: '#3b82f6', change: 'This month' },
          { icon: Star,        label: 'Total Reviews',   value: stats.reviews,              color: '#fef9ed', iconColor: '#e8b84b', change: `${stats.avgRating} avg rating` },
          { icon: Image,       label: 'Portfolio Items', value: stats.portfolio,            color: '#ecfdf5', iconColor: '#10b981', change: 'Photos uploaded' },
          { icon: TrendingUp,  label: 'Leads Generated', value: company?.leads_count || 0, color: '#f5f3ff', iconColor: '#8b5cf6', change: 'Via TrustDubai' },
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
                borderRadius: 8, cursor: done ? 'default' : 'pointer',
              }} onClick={() => !done && onNavigate(page)}>
                <CheckCircle size={16} color={done ? 'var(--green)' : '#d1d5db'} fill={done ? 'var(--green)' : 'none'} />
                <span style={{ fontSize: 13.5, color: done ? '#065f46' : 'var(--text-secondary)', flex: 1 }}>{label}</span>
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
            <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('reviews')}>View All</button>
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
                <div key={review.id} style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="review-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                        {(review.reviewer_name || 'A')[0]}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{review.reviewer_name || 'Anonymous'}</span>
                    </div>
                    <div className="stars">
                      {[1,2,3,4,5].map(s => (
                        <span key={s} className={`star ${s <= review.rating ? '' : 'empty'}`}>★</span>
                      ))}
                    </div>
                  </div>
                  {(review.comment || review.review_text) && (
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {(review.comment || review.review_text).slice(0, 100)}
                      {(review.comment || review.review_text).length > 100 ? '...' : ''}
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
