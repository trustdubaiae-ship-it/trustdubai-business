import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Check, X, Zap, Crown, Building2, Star, AlertTriangle, Clock } from 'lucide-react'

const PLAN_ORDER = ['free', 'silver', 'gold', 'platinum']
const PLAN_META = {
  free:     { icon: Star,      color: '#6b7280', description: 'Get started on Quvera' },
  silver:   { icon: Zap,       color: '#94a3b8', description: 'Grow your presence' },
  gold:     { icon: Crown,     color: '#e8b84b', description: 'Dominate your category', featured: true },
  platinum: { icon: Building2, color: '#8b5cf6', description: 'For large businesses' },
}

function getExpiryInfo(expiresAt) {
  if (!expiresAt) return null
  const now = new Date()
  const exp = new Date(expiresAt)
  const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: 'Plan Expired', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '⚠️', urgent: true, expired: true, days: diffDays }
  if (diffDays <= 7)  return { label: diffDays + ' days left', color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '🔴', urgent: true, expired: false, days: diffDays }
  if (diffDays <= 30) return { label: diffDays + ' days left', color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', icon: '🟡', urgent: false, expired: false, days: diffDays }
  return { label: diffDays + ' days left', color: '#10b981', bg: '#f0fdf4', border: '#a7f3d0', icon: '🟢', urgent: false, expired: false, days: diffDays }
}

export default function PlansPage() {
  const { company } = useAuth()
  const [billing, setBilling]   = useState('monthly')
  const [plans, setPlans]       = useState([])
  const [features, setFeatures] = useState([])
  const [planFeat, setPlanFeat] = useState({})
  const [loading, setLoading]   = useState(true)

  const currentPlan  = company?.plan || 'free'
  const expiryInfo   = getExpiryInfo(company?.plan_expires_at)
  const planStarted  = company?.plan_started_at
    ? new Date(company.plan_started_at).toLocaleDateString('en-AE', { day:'numeric', month:'long', year:'numeric' }) : null

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: mp }, { data: feats }, { data: pf }] = await Promise.all([
      supabase.from('membership_plans').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('features').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('plan_features').select('*'),
    ])
    const map = {}
    ;(pf || []).forEach(r => {
      if (!map[r.plan_name]) map[r.plan_name] = {}
      map[r.plan_name][r.feature_key] = { enabled: r.enabled, limit_value: r.limit_value }
    })
    setPlans(mp || [])
    setFeatures(feats || [])
    setPlanFeat(map)
    setLoading(false)
  }

  function handleUpgrade(planId) {
    if (planId === currentPlan && !expiryInfo?.expired) return
    const label = planId.charAt(0).toUpperCase() + planId.slice(1)
    window.open('https://wa.me/971503856786?text=Hi, I would like to upgrade my Quvera plan to ' + label, '_blank')
  }

  function buildFeatureList(planName) {
    const pf = planFeat[planName] || {}
    return features.map(f => {
      const cell = pf[f.feature_key] || { enabled:false, limit_value:0 }
      if (f.type === 'limit') {
        const v = cell.limit_value || 0
        const txt = v >= 999 ? 'Unlimited ' + f.name.toLowerCase()
                  : v > 0    ? 'Up to ' + v + ' ' + f.name.toLowerCase()
                  : f.name
        return { text: txt, included: v > 0 }
      }
      return { text: f.name, included: cell.enabled === true }
    })
  }

  const discount = billing === 'annual' ? 0.8 : 1
  const sortedPlans = [...plans].sort((a,b) => PLAN_ORDER.indexOf(a.name?.toLowerCase()) - PLAN_ORDER.indexOf(b.name?.toLowerCase()))

  if (loading) return (
    <div className="page-content" style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
      <div style={{ width:32, height:32, border:'3px solid rgba(232,184,75,0.2)', borderTopColor:'#e8b84b', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 12px' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      Loading plans...
    </div>
  )

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Plans & Billing</h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>Choose the right plan to grow your business on Quvera</p>
      </div>

      {expiryInfo && expiryInfo.urgent && (
        <div style={{ background: expiryInfo.bg, border: '1px solid ' + expiryInfo.border, borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <AlertTriangle size={20} color={expiryInfo.color} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: expiryInfo.color }}>
              {expiryInfo.expired ? 'Your plan has expired!' : 'Your plan is expiring soon!'}
            </div>
            <div style={{ fontSize: 12, color: expiryInfo.color, opacity: 0.8, marginTop: 2 }}>
              {expiryInfo.expired
                ? 'Your account has been downgraded to Free plan. Renew now to restore your features.'
                : 'Only ' + expiryInfo.days + ' days remaining. Renew now to avoid losing your features.'}
            </div>
          </div>
          <button className="btn btn-primary btn-sm"
            onClick={() => window.open('https://wa.me/971503856786?text=Hi, I need to renew my Quvera ' + currentPlan + ' plan', '_blank')}>
            Renew Now
          </button>
        </div>
      )}

      <div style={{ background: 'linear-gradient(135deg, #0d1117, #161b22)', border: '1px solid rgba(232,184,75,0.2)', borderRadius: 'var(--radius)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(232,184,75,0.1)', border: '1px solid rgba(232,184,75,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Crown size={20} color="#e8b84b" />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
            Currently on: <span style={{ color: '#e8b84b', textTransform: 'capitalize' }}>{currentPlan}</span> Plan
          </div>
          <div style={{ fontSize: 12, color: '#6e7681', marginTop: 2 }}>
            {currentPlan === 'free' ? 'Upgrade to unlock more visibility and features'
              : planStarted ? 'Active since ' + planStarted : 'Your plan is active'}
          </div>
        </div>
        {expiryInfo && currentPlan !== 'free' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: expiryInfo.bg, border: '1px solid ' + expiryInfo.border, borderRadius: 8, padding: '6px 12px' }}>
            <Clock size={13} color={expiryInfo.color} />
            <span style={{ fontSize: 12, fontWeight: 600, color: expiryInfo.color }}>{expiryInfo.icon} {expiryInfo.label}</span>
          </div>
        )}
        {currentPlan === 'free' && <div style={{ fontSize: 12, color: '#6e7681' }}>No expiry</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 28 }}>
        <button className={`btn ${billing === 'monthly' ? 'btn-primary' : 'btn-secondary'}`} style={{ borderRadius: '8px 0 0 8px' }} onClick={() => setBilling('monthly')}>Monthly</button>
        <button className={`btn ${billing === 'annual' ? 'btn-primary' : 'btn-secondary'}`} style={{ borderRadius: '0 8px 8px 0', position: 'relative' }} onClick={() => setBilling('annual')}>
          Annual
          <span style={{ position: 'absolute', top: -10, right: -6, background: 'var(--green)', color: 'white', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 99 }}>-20%</span>
        </button>
      </div>

      <div className="plans-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {sortedPlans.map(plan => {
          const key   = plan.name?.toLowerCase()
          const meta  = PLAN_META[key] || PLAN_META.free
          const Icon  = meta.icon
          const isCurrent = key === currentPlan
          const price = Math.round((plan.price_monthly || 0) * discount)
          const featList = buildFeatureList(key)

          return (
            <div key={plan.id || key} className="plan-card" style={{
              borderColor: meta.featured ? meta.color : isCurrent ? meta.color : 'var(--card-border)',
              background: meta.featured ? '#fffdf7' : isCurrent ? '#f9fffe' : 'var(--card-bg)',
              position: 'relative'
            }}>
              {meta.featured && (
                <div style={{ position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(90deg, #e8b84b, #c9952a)', color: '#0d1117', fontSize: 10, fontWeight: 700, padding: '3px 14px', borderRadius: '0 0 8px 8px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Most Popular</div>
              )}
              {isCurrent && (
                <div className="plan-card-badge"><span className="badge badge-green">Current</span></div>
              )}
              <div style={{ width: 40, height: 40, borderRadius: 10, background: meta.color + '15', border: '1px solid ' + meta.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon size={18} color={meta.color} />
              </div>
              <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{meta.description}</div>
              <div className="plan-price" style={{ marginBottom: 16 }}>
                AED {price}<span>/month{billing === 'annual' ? ' (billed annually)' : ''}</span>
              </div>
              <ul className="plan-features">
                {featList.filter(f => f.included).slice(0, 7).map(({ text }) => (
                  <li key={text} className="included">
                    <Check size={14} color="var(--green)" /> {text}
                  </li>
                ))}
                {featList.filter(f => !f.included).slice(0, 2).map(({ text }) => (
                  <li key={text}>
                    <X size={14} color="#d1d5db" /> {text}
                  </li>
                ))}
              </ul>
              <button
                className={'btn ' + (isCurrent && !expiryInfo?.expired ? 'btn-secondary' : meta.featured ? 'btn-primary' : 'btn-secondary')}
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={() => handleUpgrade(key)}
                disabled={isCurrent && !expiryInfo?.expired}>
                {isCurrent && !expiryInfo?.expired ? '✓ Current Plan'
                  : isCurrent && expiryInfo?.expired ? '🔄 Renew Plan'
                  : 'Upgrade to ' + plan.name}
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 28, padding: '16px 20px', background: 'var(--bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20 }}>💬</span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Need help choosing?</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Contact our team on WhatsApp for guidance and payment support</div>
        </div>
        <button className="btn btn-primary btn-sm"
          onClick={() => window.open('https://wa.me/971503856786?text=Hi, I would like to upgrade my Quvera plan', '_blank')}>
          WhatsApp Us
        </button>
      </div>

      <style>{`
        @media (max-width: 900px) { .plans-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 540px) { .plans-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}
