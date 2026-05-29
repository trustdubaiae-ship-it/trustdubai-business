import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { Check, X, Zap, Crown, Building2, Star, AlertTriangle, Clock } from 'lucide-react'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    icon: Star,
    price: 0,
    period: '/month',
    color: '#6b7280',
    description: 'Get started on TrustDubai',
    features: [
      { text: 'Basic company listing', included: true },
      { text: 'Up to 3 portfolio photos', included: true },
      { text: 'Customer reviews', included: true },
      { text: 'TrustDubai badge (Free)', included: true },
      { text: 'Profile analytics', included: false },
      { text: 'Priority search ranking', included: false },
      { text: 'Verified badge', included: false },
      { text: 'Lead notifications', included: false },
      { text: 'Featured in homepage', included: false },
      { text: 'Dedicated support', included: false },
    ]
  },
  {
    id: 'silver',
    name: 'Silver',
    icon: Zap,
    price: 149,
    period: '/month',
    color: '#94a3b8',
    description: 'Grow your presence',
    features: [
      { text: 'Everything in Free', included: true },
      { text: 'Up to 10 portfolio photos', included: true },
      { text: 'Reply to reviews', included: true },
      { text: 'Verified badge', included: true },
      { text: 'Lead notifications by email', included: true },
      { text: 'Priority search ranking', included: false },
      { text: 'Featured in homepage', included: false },
      { text: 'Dedicated support', included: false },
      { text: 'WhatsApp lead alerts', included: false },
      { text: 'Profile analytics', included: false },
    ]
  },
  {
    id: 'gold',
    name: 'Gold',
    icon: Crown,
    price: 349,
    period: '/month',
    color: '#e8b84b',
    description: 'Dominate your category',
    featured: true,
    features: [
      { text: 'Everything in Silver', included: true },
      { text: 'Up to 25 portfolio photos', included: true },
      { text: 'Priority search ranking', included: true },
      { text: 'Featured on TrustDubai homepage', included: true },
      { text: 'WhatsApp lead alerts', included: true },
      { text: 'Profile analytics dashboard', included: true },
      { text: 'Gold badge', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'Monthly performance report', included: true },
      { text: 'Custom profile URL', included: true },
    ]
  },
  {
    id: 'platinum',
    name: 'Platinum',
    icon: Building2,
    price: 699,
    period: '/month',
    color: '#8b5cf6',
    description: 'For large businesses',
    features: [
      { text: 'Everything in Gold', included: true },
      { text: 'Unlimited portfolio photos', included: true },
      { text: 'Multiple branches/locations', included: true },
      { text: 'Custom integration', included: true },
      { text: 'API access', included: true },
      { text: 'White-label options', included: true },
      { text: 'SLA guarantee', included: true },
      { text: 'Dedicated team', included: true },
      { text: 'Custom analytics', included: true },
      { text: 'Priority onboarding', included: true },
    ]
  }
]

function getExpiryInfo(expiresAt) {
  if (!expiresAt) return null
  const now = new Date()
  const exp = new Date(expiresAt)
  const diffMs = exp - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { label: 'Plan Expired', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '⚠️', urgent: true, expired: true, days: diffDays }
  if (diffDays <= 7)  return { label: diffDays + ' days left', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '🔴', urgent: true, expired: false, days: diffDays }
  if (diffDays <= 30) return { label: diffDays + ' days left', color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', icon: '🟡', urgent: false, expired: false, days: diffDays }
  return { label: diffDays + ' days left', color: '#10b981', bg: '#f0fdf4', border: '#a7f3d0', icon: '🟢', urgent: false, expired: false, days: diffDays }
}

export default function PlansPage() {
  const { company } = useAuth()
  const toast = useToast()
  const [billing, setBilling] = useState('monthly')

  const currentPlan = company?.plan || 'free'
  const expiryInfo = getExpiryInfo(company?.plan_expires_at)
  const planStarted = company?.plan_started_at
    ? new Date(company.plan_started_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  function handleUpgrade(planId) {
    if (planId === currentPlan) return
    window.open('https://wa.me/971503856786?text=Hi, I would like to upgrade my TrustDubai plan to ' + planId.charAt(0).toUpperCase() + planId.slice(1), '_blank')
  }

  const discount = billing === 'annual' ? 0.8 : 1

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Plans & Billing</h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>Choose the right plan to grow your business on TrustDubai</p>
      </div>

      {/* Expiry Warning Banner */}
      {expiryInfo && expiryInfo.urgent && (
        <div style={{
          background: expiryInfo.bg,
          border: '1px solid ' + expiryInfo.border,
          borderRadius: 'var(--radius)',
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <AlertTriangle size={20} color={expiryInfo.color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: expiryInfo.color }}>
              {expiryInfo.expired ? '⚠️ Your plan has expired!' : '⚠️ Your plan is expiring soon!'}
            </div>
            <div style={{ fontSize: 12, color: expiryInfo.color, opacity: 0.8, marginTop: 2 }}>
              {expiryInfo.expired
                ? 'Your account has been downgraded to Free plan. Renew now to restore your features.'
                : 'Only ' + expiryInfo.days + ' days remaining. Renew now to avoid losing your features.'}
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

      {/* Current Plan Card */}
      <div style={{
        background: 'linear-gradient(135deg, #0d1117, #161b22)',
        border: '1px solid rgba(232,184,75,0.2)',
        borderRadius: 'var(--radius)',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
        marginBottom: 28
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: 'rgba(232,184,75,0.1)',
          border: '1px solid rgba(232,184,75,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Crown size={20} color="#e8b84b" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
            Currently on: <span style={{ color: '#e8b84b', textTransform: 'capitalize' }}>{currentPlan}</span> Plan
          </div>
          <div style={{ fontSize: 12, color: '#6e7681', marginTop: 2 }}>
            {currentPlan === 'free'
              ? 'Upgrade to unlock more visibility and features'
              : planStarted ? 'Active since ' + planStarted : 'Your plan is active'}
          </div>
        </div>

        {/* Expiry info */}
        {expiryInfo && currentPlan !== 'free' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: expiryInfo.bg,
            border: '1px solid ' + expiryInfo.border,
            borderRadius: 8, padding: '6px 12px'
          }}>
            <Clock size={13} color={expiryInfo.color} />
            <span style={{ fontSize: 12, fontWeight: 600, color: expiryInfo.color }}>
              {expiryInfo.icon} {expiryInfo.label}
            </span>
          </div>
        )}

        {currentPlan === 'free' && (
          <div style={{ fontSize: 12, color: '#6e7681' }}>No expiry</div>
        )}
      </div>

      {/* Billing toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 28 }}>
        <button
          className={`btn ${billing === 'monthly' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '8px 0 0 8px' }}
          onClick={() => setBilling('monthly')}
        >Monthly</button>
        <button
          className={`btn ${billing === 'annual' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: '0 8px 8px 0', position: 'relative' }}
          onClick={() => setBilling('annual')}
        >
          Annual
          <span style={{
            position: 'absolute', top: -10, right: -6,
            background: 'var(--green)', color: 'white',
            fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 99
          }}>-20%</span>
        </button>
      </div>

      {/* Plan Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {PLANS.map(plan => {
          const Icon = plan.icon
          const isCurrent = plan.id === currentPlan
          const displayPrice = plan.price !== null ? Math.round(plan.price * discount) : null

          return (
            <div key={plan.id} className="plan-card" style={{
              borderColor: plan.featured ? plan.color : isCurrent ? plan.color : 'var(--card-border)',
              background: plan.featured ? '#fffdf7' : isCurrent ? '#f9fffe' : 'var(--card-bg)',
              position: 'relative'
            }}>
              {plan.featured && (
                <div style={{
                  position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                  background: 'linear-gradient(90deg, #e8b84b, #c9952a)',
                  color: '#0d1117', fontSize: 10, fontWeight: 700,
                  padding: '3px 14px', borderRadius: '0 0 8px 8px',
                  letterSpacing: '0.08em', textTransform: 'uppercase'
                }}>Most Popular</div>
              )}
              {isCurrent && (
                <div className="plan-card-badge">
                  <span className="badge badge-green">Current</span>
                </div>
              )}
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: plan.color + '15',
                border: '1px solid ' + plan.color + '30',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 12
              }}>
                <Icon size={18} color={plan.color} />
              </div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                {plan.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                {plan.description}
              </div>
              <div className="plan-price" style={{ marginBottom: 16 }}>
                {displayPrice !== null ? (
                  <>AED {displayPrice}<span>{plan.period}{billing === 'annual' ? ' (billed annually)' : ''}</span></>
                ) : (
                  <>Custom<span> pricing</span></>
                )}
              </div>
              <ul className="plan-features">
                {plan.features.slice(0, 6).map(({ text, included }) => (
                  <li key={text} className={included ? 'included' : ''}>
                    {included ? <Check size={14} color="var(--green)" /> : <X size={14} color="#d1d5db" />}
                    {text}
                  </li>
                ))}
              </ul>
              <button
                className={'btn ' + (isCurrent ? 'btn-secondary' : plan.featured ? 'btn-primary' : 'btn-secondary')}
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrent && !expiryInfo?.expired}
              >
                {isCurrent && !expiryInfo?.expired
                  ? '✓ Current Plan'
                  : isCurrent && expiryInfo?.expired
                  ? '🔄 Renew Plan'
                  : 'Upgrade to ' + plan.name}
              </button>
            </div>
          )
        })}
      </div>

      {/* Help */}
      <div style={{
        marginTop: 28, padding: '16px 20px',
        background: 'var(--bg)', border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        display: 'flex', alignItems: 'center', gap: 14
      }}>
        <span style={{ fontSize: 20 }}>💬</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Need help choosing?</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Contact our team on WhatsApp for guidance and payment support
          </div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => window.open('https://wa.me/971503856786?text=Hi, I would like to upgrade my TrustDubai plan', '_blank')}
        >
          WhatsApp Us
        </button>
      </div>
    </div>
  )
}
