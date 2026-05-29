import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Eye, Star, Image, TrendingUp, AlertCircle, CheckCircle, ArrowRight, Clock, Users, AlertTriangle, Zap } from 'lucide-react'

const PLAN_CONFIG = {
  free: {
    name: 'Free', color: '#6b7280', bg: '#f9fafb', maxMembers: 2, badge: '🆓',
    headerBg: 'linear-gradient(135deg, #f9fafb, #f3f4f6)',
    headerBorder: '#e5e7eb', accentColor: '#6b7280',
    statBg: '#f9fafb', welcomeEmoji: '👋',
  },
  silver: {
    name: 'Silver', color: '#64748b', bg: '#f1f5f9', maxMembers: 5, badge: '🥈',
    headerBg: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
    headerBorder: '#cbd5e1', accentColor: '#64748b',
    statBg: '#f8fafc', welcomeEmoji: '✨',
  },
  gold: {
    name: 'Gold', color: '#d97706', bg: '#fffbeb', maxMembers: 15, badge: '🥇',
    headerBg: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
    headerBorder: '#fcd34d', accentColor: '#d97706',
    statBg: '#fffdf7', welcomeEmoji: '🌟',
  },
  platinum: {
    name: 'Platinum', color: '#7c3aed', bg: '#faf5ff', maxMembers: 999, badge: '💎',
    headerBg: 'linear-gradient(135deg, #1e1b4b, #2d1b69)',
    headerBorder: '#4c1d95', accentColor: '#a78bfa',
    statBg: '#1e1b4b', welcomeEmoji: '👑',
    isDark: true,
  },
}

function getExpiryInfo(expiresAt) {
  if (!expiresAt) return null
  const now = new Date()
  const exp = new Date(expiresAt)
  const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24))
  if (diffDays < 0)   return { label: 'Plan Expired!',       color: '#ef4444', bg: '#fef2f2', border: '#fecaca', days: diffDays, expired: true,  urgent: true }
  if (diffDays <= 7)  return { label: diffDays + ' days left', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', days: diffDays, expired: false, urgent: true }
  if (diffDays <= 30) return { label: diffDays + ' days left', color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', days: diffDays, expired: false, urgent: false }
  return { label: diffDays + ' days left', color: '#10b981', bg: '#f0fdf4', border: '#a7f3d0', days: diffDays, expired: false, urgent: false }
}

function calcProfileComplete(company) {
  if (!company) return 0
  const fields = ['name', 'description', 'phone', 'logo_url', 'category', 'location']
  const done = fields.filter(f => !!company[f]).length
  return Math.round((done / fields.length) * 100)
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
      setClock(new Date().toLocaleString('en-AE', {
        timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      }))
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
        ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : 0
      setStats({ views: company.profile_views || 0, reviews: reviews.length, avgRating, portfolio: portfolioRes.data?.length || 0 })
      setMemberCount(membersRes.data?.length || 0)
      const { data: recent } = await supabase.from('reviews').select('*').eq('company_id', company.id).order('created_at', { ascending: false }).limit(3)
      setRecentReviews(recent || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const profileComplete = calcProfileComplete(company)
  const currentPlan     = company?.plan || 'free'
  const planConfig      = PLAN_CONFIG[currentPlan] || PLAN_CONFIG.free
  const expiryInfo      = getExpiryInfo(company?.plan_expires_at)
  const isPlatinum      = currentPlan === 'platinum'
  const isGold          = currentPlan === 'gold'

  const checklist = [
    { done: !!company?.name,        label: 'Company name added',    page: 'profile' },
    { done: !!company?.logo_url,    label: 'Logo uploaded',         page: 'profile' },
    { done: !!company?.description, label: 'Description written',   page: 'profile' },
    { done: !!company?.phone,       label: 'Phone number added',    page: 'profile' },
    { done: stats.portfolio > 0,    label: 'Portfolio photo added', page: 'portfolio' },
    { done: stats.reviews > 0,      label: 'First review received', page: 'reviews' },
  ]

  const memberPct = planConfig.maxMembers === 999
    ? 100 : Math.min(100, Math.round((memberCount / planConfig.maxMembers) * 100))

  // Plan-based styles
  const pageStyle = isPlatinum ? {
    background: '#0f0e1a', minHeight: '100vh', color: '#f1f5f9'
  } : {}

  const cardStyle = isPlatinum ? {
    background: '#1e1b4b', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12
  } : isGold ? {
    background: '#fffdf7', border: '1px solid #fcd34d', borderRadius: 12
  } : {}

  const textColor     = isPlatinum ? '#f1f5f9' : 'var(--text-primary)'
  const textSubColor  = isPlatinum ? '#a78bfa' : 'var(--text-secondary)'
  const textMutedColor = isPlatinum ? '#6b7280' : 'var(--text-muted)'

  return (
    <div className="page-content animate-in" style={pageStyle}>

      {/* Platinum Banner */}
      {isPlatinum && (
        <div style={{ background: 'linear-gradient(135deg, #4c1d95, #2d1b69)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 12, padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, color: '#a78bfa', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>
          <span style={{ fontSize: 20 }}>💎</span>
          PLATINUM VERIFIED BUSINESS · TRUSTDUBAI PREMIUM
          <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>Highest Priority Listing</span>
        </div>
      )}

      {/* Gold Banner */}
      {isGold && (
        <div style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, color: '#92400e', fontSize: 13, fontWeight: 600 }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          Gold Verified Business on TrustDubai
          <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>Priority Listing Active</span>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4, color: textColor }}>
              Welcome back{company?.name ? `, ${company.name.split(' ')[0]}` : ''}! {planConfig.welcomeEmoji}
            </h1>
            <p style={{ fontSize: 14, color: textSubColor }}>
              Here's how your business is performing on TrustDubai.
            </p>
          </div>
          {clock && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: isPlatinum ? 'rgba(139,92,246,0.1)' : 'var(--bg)', border: '1px solid ' + (isPlatinum ? 'rgba(139,92,246,0.2)' : 'var(--card-border)'), borderRadius: 8, padding: '6px 14px', fontSize: 13, color: isPlatinum ? '#a78bfa' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              🕐 {clock} <span style={{ color: textMutedColor, fontSize: 11 }}>Dubai</span>
            </div>
          )}
        </div>
      </div>

      {/* Plan Expiry Warning Banner */}
      {expiryInfo && expiryInfo.urgent && currentPlan !== 'free' && (
        <div style={{ background: expiryInfo.bg, border: '1px solid ' + expiryInfo.border, borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <AlertTriangle size={20} color={expiryInfo.color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: expiryInfo.color }}>
              {expiryInfo.expired ? '⚠️ Your plan has expired!' : '⚠️ Your ' + planConfig.name + ' plan expires in ' + expiryInfo.days + ' days!'}
            </div>
            <div style={{ fontSize: 12, color: expiryInfo.color, opacity: 0.8, marginTop: 2 }}>
              {expiryInfo.expired ? 'Your account has been downgraded. Renew now to restore features.' : 'Renew now to avoid losing premium features.'}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => window.open('https://wa.me/971503856786?text=Hi, I need to renew my TrustDubai ' + currentPlan + ' plan', '_blank')}>
            Renew Now
          </button>
        </div>
      )}

      {/* Plan + Members */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Plan Card */}
        <div style={{
          background: isPlatinum ? 'linear-gradient(135deg, #1e1b4b, #2d1b69)' : isGold ? 'linear-gradient(135deg, #fffbeb, #fef3c7)' : planConfig.bg,
          border: '1px solid ' + (isPlatinum ? 'rgba(139,92,246,0.3)' : isGold ? '#fcd34d' : planConfig.color + '30'),
          borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: isPlatinum ? '0 0 20px rgba(139,92,246,0.15)' : isGold ? '0 4px 16px rgba(217,119,6,0.1)' : 'none'
        }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: isPlatinum ? 'rgba(139,92,246,0.2)' : planConfig.color + '15', border: '1px solid ' + (isPlatinum ? 'rgba(139,92,246,0.3)' : planConfig.color + '30'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            {planConfig.badge}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: isPlatinum ? '#a78bfa' : 'var(--text-muted)', marginBottom: 2 }}>Current Plan</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: isPlatinum ? '#a78bfa' : planConfig.color }}>{planConfig.name}</div>
            {expiryInfo && currentPlan !== 'free' ? (
              <div style={{ fontSize: 12, color: expiryInfo.color, marginTop: 2, fontWeight: 500 }}>🕐 {expiryInfo.label}</div>
            ) : (
              <div style={{ fontSize: 12, color: isPlatinum ? 'rgba(167,139,250,0.6)' : 'var(--text-secondary)', marginTop: 2 }}>
                {currentPlan === 'free' ? 'Upgrade for more features' : '✓ Plan is active'}
              </div>
            )}
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('plans')} style={{ whiteSpace: 'nowrap', background: isPlatinum ? 'rgba(139,92,246,0.2)' : '', color: isPlatinum ? '#a78bfa' : '', border: isPlatinum ? '1px solid rgba(139,92,246,0.3)' : '' }}>
            {currentPlan === 'free' ? 'Upgrade' : expiryInfo?.urgent ? 'Renew' : 'Manage'}
          </button>
        </div>

        {/* Members Card */}
        <div style={{ background: isPlatinum ? 'rgba(139,92,246,0.08)' : 'var(--card-bg)', border: '1px solid ' + (isPlatinum ? 'rgba(139,92,246,0.2)' : 'var(--card-border)'), borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: isPlatinum ? 'rgba(139,92,246,0.15)' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color={isPlatinum ? '#a78bfa' : '#3b82f6'} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: textMutedColor }}>Team Members</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: textColor }}>
                {loading ? '—' : memberCount}
                <span style={{ fontSize: 13, fontWeight: 400, color: textMutedColor, marginLeft: 4 }}>/ {planConfig.maxMembers === 999 ? '∞' : planConfig.maxMembers}</span>
              </div>
            </div>
          </div>
          <div style={{ height: 6, background: isPlatinum ? 'rgba(255,255,255,0.1)' : 'var(--bg)', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ width: `${memberPct}%`, height: '100%', background: memberPct >= 90 ? '#ef4444' : isPlatinum ? '#a78bfa' : '#3b82f6', borderRadius: 99, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: textMutedColor }}>
            <span>{planConfig.name} plan limit</span>
            {memberPct >= 90 && currentPlan !== 'platinum' && (
              <span style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 500 }} onClick={() => onNavigate('plans')}>Upgrade →</span>
            )}
          </div>
        </div>
      </div>

      {/* Profile Completion Banner */}
      {profileComplete < 100 && (
        <div style={{ background: isPlatinum ? 'rgba(139,92,246,0.08)' : 'linear-gradient(135deg, #fef9ed, #fef3c7)', border: '1px solid ' + (isPlatinum ? 'rgba(139,92,246,0.2)' : 'rgba(232,184,75,0.3)'), borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <AlertCircle size={20} color={isPlatinum ? '#a78bfa' : 'var(--amber)'} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: isPlatinum ? '#a78bfa' : '#92400e' }}>Profile {profileComplete}% complete</div>
            <div style={{ fontSize: 13, color: isPlatinum ? 'rgba(167,139,250,0.7)' : '#b45309', marginTop: 2 }}>Complete your profile to get more visibility</div>
          </div>
          <div style={{ width: 120, height: 6, background: isPlatinum ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${profileComplete}%`, height: '100%', background: isPlatinum ? 'linear-gradient(90deg, #7c3aed, #a78bfa)' : 'linear-gradient(90deg, #e8b84b, #c9952a)', borderRadius: 99 }} />
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => onNavigate('profile')}>Complete</button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { icon: Eye,        label: 'Profile Views',   value: stats.views,              iconBg: isPlatinum ? 'rgba(139,92,246,0.15)' : '#eff6ff', iconColor: isPlatinum ? '#a78bfa' : '#3b82f6', change: 'This month' },
          { icon: Star,       label: 'Total Reviews',   value: stats.reviews,            iconBg: isPlatinum ? 'rgba(232,184,75,0.1)'  : '#fef9ed', iconColor: '#e8b84b', change: `${stats.avgRating} avg rating` },
          { icon: Image,      label: 'Portfolio Items', value: stats.portfolio,          iconBg: isPlatinum ? 'rgba(16,185,129,0.1)'  : '#ecfdf5', iconColor: '#10b981', change: 'Photos uploaded' },
          { icon: TrendingUp, label: 'Leads Generated', value: company?.leads_count || 0, iconBg: isPlatinum ? 'rgba(139,92,246,0.1)' : '#f5f3ff', iconColor: isPlatinum ? '#a78bfa' : '#8b5cf6', change: 'Via TrustDubai' },
        ].map(({ icon: Icon, label, value, iconBg, iconColor, change }) => (
          <div className="stat-card" key={label} style={isPlatinum ? { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' } : isGold ? { background: '#fffdf7', border: '1px solid #fcd34d' } : {}}>
            <div className="stat-icon" style={{ background: iconBg }}>
              <Icon size={20} color={iconColor} />
            </div>
            <div>
              <div className="stat-label" style={{ color: textMutedColor }}>{label}</div>
              <div className="stat-value" style={{ color: textColor }}>{loading ? '—' : value}</div>
              <div className="stat-change" style={{ color: textMutedColor }}>{change}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Profile Checklist */}
        <div className="card" style={isPlatinum ? { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' } : isGold ? { background: '#fffdf7', border: '1px solid #fcd34d' } : {}}>
          <div className="card-header">
            <div>
              <div className="card-title" style={{ color: textColor }}>Profile Checklist</div>
              <div className="card-subtitle" style={{ color: textSubColor }}>Complete these to boost visibility</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {checklist.map(({ done, label, page }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: done ? (isPlatinum ? 'rgba(16,185,129,0.1)' : 'var(--green-light)') : (isPlatinum ? 'rgba(255,255,255,0.03)' : 'var(--bg)'), borderRadius: 8, cursor: done ? 'default' : 'pointer' }}
                onClick={() => !done && onNavigate(page)}>
                <CheckCircle size={16} color={done ? '#10b981' : '#d1d5db'} fill={done ? '#10b981' : 'none'} />
                <span style={{ fontSize: 13.5, color: done ? '#10b981' : textSubColor, flex: 1 }}>{label}</span>
                {!done && <ArrowRight size={14} color={textMutedColor} />}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Reviews */}
        <div className="card" style={isPlatinum ? { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' } : isGold ? { background: '#fffdf7', border: '1px solid #fcd34d' } : {}}>
          <div className="card-header">
            <div>
              <div className="card-title" style={{ color: textColor }}>Recent Reviews</div>
              <div className="card-subtitle" style={{ color: textSubColor }}>Latest customer feedback</div>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('reviews')}>View All</button>
          </div>
          {recentReviews.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <div className="empty-state-icon">⭐</div>
              <h3 style={{ color: textColor }}>No reviews yet</h3>
              <p style={{ color: textSubColor }}>Reviews from customers will appear here</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentReviews.map(review => (
                <div key={review.id} style={{ padding: 12, background: isPlatinum ? 'rgba(255,255,255,0.03)' : 'var(--bg)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="review-avatar" style={{ width: 30, height: 30, fontSize: 12, background: isPlatinum ? 'rgba(139,92,246,0.2)' : '', color: isPlatinum ? '#a78bfa' : '' }}>
                        {(review.reviewer_name || 'A')[0]}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{review.reviewer_name || 'Anonymous'}</span>
                    </div>
                    <div className="stars">
                      {[1,2,3,4,5].map(s => (
                        <span key={s} className={`star ${s <= review.rating ? '' : 'empty'}`}>★</span>
                      ))}
                    </div>
                  </div>
                  {(review.comment || review.review_text) && (
                    <p style={{ fontSize: 12.5, color: textSubColor, lineHeight: 1.5 }}>
                      {(review.comment || review.review_text).slice(0, 100)}
                      {(review.comment || review.review_text).length > 100 ? '...' : ''}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: textMutedColor, fontSize: 11 }}>
                    <Clock size={10} />
                    {new Date(review.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Platinum Upgrade CTA for non-platinum */}
      {currentPlan !== 'platinum' && (
        <div style={{ marginTop: 20, background: 'linear-gradient(135deg, #1e1b4b, #2d1b69)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 32 }}>💎</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#a78bfa', marginBottom: 4 }}>Upgrade to Platinum</div>
            <div style={{ fontSize: 13, color: 'rgba(167,139,250,0.7)' }}>Get unlimited portfolio, priority listing, analytics & dedicated support</div>
          </div>
          <button onClick={() => onNavigate('plans')} style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #7c3aed, #4c1d95)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Zap size={14} /> Upgrade Now
          </button>
        </div>
      )}
    </div>
  )
}
