// tritova-business/src/pages/TrustScorePage.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const TIERS = {
  listed:    { label: 'Listed',    color: '#3b82f6', icon: 'ti-circle',         desc: 'Registered on Quvera' },
  verified:  { label: 'Verified',  color: '#10b981', icon: 'ti-rosette-discount-check', desc: 'License & phone verified' },
  trusted:   { label: 'Trusted',   color: '#d97706', icon: 'ti-trophy',         desc: 'Verified + strong reviews' },
  top_rated: { label: 'Top Rated', color: '#8b5cf6', icon: 'ti-diamond',        desc: 'Top performer in category' },
}

function scoreColor(s) {
  if (s >= 75) return '#10b981'
  if (s >= 50) return '#d97706'
  if (s >= 25) return '#f59e0b'
  return '#ef4444'
}

export default function TrustScorePage() {
  const { company } = useAuth()
  const companyId = company?.id
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!companyId) return
    const { data } = await supabase
      .from('companies')
      .select('trust_score, trust_tier, verification_percent, verification_status, avg_rating, total_reviews, description, tagline, phone, business_email, email, location, logo_url, categories, website, instagram')
      .eq('id', companyId).single()
    setRow(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [companyId])

  if (loading) return <div style={{ color: 'var(--text3)', padding: 8 }}>Loading…</div>
  if (!row) return <div style={{ color: 'var(--text3)', padding: 8 }}>No data.</div>

  const score = row.trust_score || 0
  const tier = TIERS[row.trust_tier] || TIERS.listed
  const col = scoreColor(score)

  // Gauge geometry
  const R = 70, C = 2 * Math.PI * R
  const dash = (score / 100) * C

  // Profile completion calc (UI mirror)
  const fields = [
    !!row.description, !!row.tagline, !!row.phone,
    !!(row.business_email || row.email), !!row.location, !!row.logo_url,
    (row.categories && row.categories.length > 0),
    !!(row.website || row.instagram),
  ]
  const completed = fields.filter(Boolean).length
  const completionPct = Math.round((completed / fields.length) * 100)

  // "How to improve" suggestions
  const tips = []
  if (row.verification_status !== 'verified')
    tips.push({ icon: 'ti-shield-check', text: 'Get verified (Trade License + Phone)', pts: '+ up to 22%', color: '#10b981' })
  if (row.verification_status === 'verified' && (!row.owner_eid_url))
    tips.push({ icon: 'ti-id', text: 'Add Owner Emirates ID', pts: '+7%', color: '#10b981' })
  if ((row.total_reviews || 0) < 10)
    tips.push({ icon: 'ti-star', text: `Reach 10+ reviews (now ${row.total_reviews || 0})`, pts: 'boosts tier', color: '#d97706' })
  if ((row.avg_rating || 0) < 4)
    tips.push({ icon: 'ti-mood-smile', text: 'Maintain a 4★+ rating', pts: 'unlocks Trusted', color: '#d97706' })
  if (completionPct < 100)
    tips.push({ icon: 'ti-user-circle', text: `Complete your profile (${completionPct}%)`, pts: '+ up to 10%', color: '#3b82f6' })

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 20 }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Trust Score</h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>Your credibility rating on Quvera — higher score means more leads.</p>
      </div>

      <div className="grid-2">
        {/* Score gauge card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 20px' }}>
          <svg width="170" height="170" viewBox="0 0 170 170">
            <circle cx="85" cy="85" r={R} fill="none" stroke="var(--bg2)" strokeWidth="14" />
            <circle cx="85" cy="85" r={R} fill="none" stroke={col} strokeWidth="14"
              strokeLinecap="round" strokeDasharray={`${dash} ${C}`}
              transform="rotate(-90 85 85)" style={{ transition: 'stroke-dasharray .6s' }} />
            <text x="85" y="80" textAnchor="middle" fontSize="38" fontWeight="800" fill={col} fontFamily="Sora">{score}</text>
            <text x="85" y="103" textAnchor="middle" fontSize="12" fill="var(--text3)">/ 100</text>
          </svg>

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, background: tier.color + '15', border: `1px solid ${tier.color}35`, borderRadius: 99, padding: '7px 16px' }}>
            <i className={`ti ${tier.icon}`} style={{ color: tier.color, fontSize: 17 }} />
            <span style={{ fontWeight: 700, color: tier.color, fontSize: 15 }}>{tier.label}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 6 }}>{tier.desc}</div>
        </div>

        {/* Tier ladder card */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Trust Tiers</div>
          {['listed','verified','trusted','top_rated'].map(key => {
            const t = TIERS[key]
            const active = row.trust_tier === key
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, marginBottom: 8, background: active ? t.color + '12' : 'transparent', border: active ? `1px solid ${t.color}35` : '1px solid var(--border)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: t.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className={`ti ${t.icon}`} style={{ color: t.color, fontSize: 17 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: active ? t.color : 'var(--text)' }}>
                    {t.label} {active && <span style={{ fontSize: 11, fontWeight: 600 }}>· You are here</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{t.desc}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Build your score */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Build Your Score</div>
        <p style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 16 }}>Complete these to raise your score and tier.</p>
        {tips.length === 0 ? (
          <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>🎉 You're doing great — score is maxed on available signals!</div>
        ) : tips.map((tip, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < tips.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: tip.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`ti ${tip.icon}`} style={{ color: tip.color, fontSize: 16 }} />
            </div>
            <div style={{ flex: 1, fontSize: 13.5 }}>{tip.text}</div>
            <span style={{ fontSize: 12, fontWeight: 700, color: tip.color, flexShrink: 0 }}>{tip.pts}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
