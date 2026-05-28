import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { Check, X, Zap, Crown, Building2, Star } from 'lucide-react'

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
      { text: 'Up to 5 portfolio photos', included: true },
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
    price: 299,
    period: '/month',
    color: '#94a3b8',
    description: 'Grow your presence',
    features: [
      { text: 'Everything in Free', included: true },
      { text: 'Up to 30 portfolio photos', included: true },
      { text: 'Profile analytics dashboard', included: true },
      { text: 'Verified badge', included: true },
      { text: 'Lead notifications by email', included: true },
      { text: 'Priority search ranking', included: false },
      { text: 'Featured in homepage', included: false },
      { text: 'Dedicated support', included: false },
      { text: 'WhatsApp lead alerts', included: false },
      { text: 'Competitor insights', included: false },
    ]
  },
  {
    id: 'gold',
    name: 'Gold',
    icon: Crown,
    price: 699,
    period: '/month',
    color: '#e8b84b',
    description: 'Dominate your category',
    featured: true,
    features: [
      { text: 'Everything in Silver', included: true },
      { text: 'Unlimited portfolio photos', included: true },
      { text: 'Priority search ranking', included: true },
      { text: 'Featured on TrustDubai homepage', included: true },
      { text: 'WhatsApp lead alerts', included: true },
      { text: 'Competitor insights', included: true },
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
    price: null,
    period: '',
    color: '#8b5cf6',
    description: 'For large businesses',
    features: [
      { text: 'Everything in Gold', included: true },
      { text: 'Multiple branches/locations', included: true },
      { text: 'Custom integration', included: true },
      { text: 'API access', included: true },
      { text: 'White-label options', included: true },
      { text: 'SLA guarantee', included: true },
      { text: 'Dedicated team', included: true },
      { text: 'Custom analytics', included: true },
      { text: 'Priority onboarding', included: true },
      { text: 'Custom contract', included: true },
    ]
  }
]

export default function PlansPage() {
  const { company } = useAuth()
  const toast = useToast()
  const [billing, setBilling] = useState('monthly')
  const currentPlan = company?.plan || 'free'

  function handleUpgrade(planId) {
    if (planId === currentPlan) return
    if (planId === 'platinum') {
      toast.info('Our team will contact you shortly!')
      return
    }
    toast.info('Payment gateway coming soon! Contact us via WhatsApp to upgrade.')
  }

  const discount = billing === 'annual' ? 0.8 : 1

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Plans & Billing</h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>Choose the right plan to grow your business on TrustDubai</p>
      </div>

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
            {currentPlan === 'free' ? 'Upgrade to unlock more visibility and features' : 'Your plan is active'}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#6e7681' }}>Next renewal: —</div>
      </div>

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
                disabled={isCurrent}
              >
                {isCurrent ? '✓ Current Plan' : plan.id === 'platinum' ? 'Contact Sales' : 'Upgrade to ' + plan.name}
              </button>
            </div>
          )
        })}
      </div>

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
        
          href="https://wa.me/971503856786?text=Hi, I'd like to upgrade my TrustDubai plan"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm"
        >
          WhatsApp Us
        </a>
      </div>
    </div>
  )
}
