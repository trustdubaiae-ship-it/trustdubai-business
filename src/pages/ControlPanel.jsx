// trustdubai-business/src/pages/ControlPanel.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

import VerificationPage from './VerificationPage'
import PlansPage from './PlansPage'
import SettingsPage from './SettingsPage'

const BRAND = '#0099cc'

const TABS = [
  { key: 'general',      label: 'General',         icon: 'ti-adjustments' },
  { key: 'verification', label: 'Verification',    icon: 'ti-shield-check' },
  { key: 'plans',        label: 'Plans & Billing', icon: 'ti-credit-card' },
  { key: 'settings',     label: 'Settings',        icon: 'ti-settings' },
]

const TOGGLES = [
  { col: 'show_portfolio',  label: 'Show Portfolio',                 desc: 'Display your portfolio gallery on your public profile.' },
  { col: 'show_team',       label: 'Show Team Members',              desc: 'Display your verified site team on your public profile.' },
  { col: 'show_contact',    label: 'Show Contact (Call / WhatsApp)', desc: 'Let visitors call or WhatsApp you directly.' },
  { col: 'show_faq',        label: 'Show FAQ',                       desc: 'Display your FAQ section on your public profile.' },
  { col: 'accepting_leads', label: 'Accepting New Leads',            desc: 'Turn off to stop receiving new lead enquiries.' },
]

export default function ControlPanel({ initialTab = 'general' }) {
  const [tab, setTab] = useState(initialTab)
  useEffect(() => { setTab(initialTab) }, [initialTab])

  // Plans ko poori width chahiye, baaki tabs centered
  const wide = tab === 'plans'

  return (
    <div style={{ padding: '24px 20px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Control Panel</h1>
        <p style={{ color: '#64748b', marginBottom: 18, fontSize: 14 }}>
          Manage your company settings, verification and profile visibility.
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #e6e9ee', marginBottom: 22 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                padding: '10px 14px', fontSize: 14, fontWeight: 600,
                color: tab === t.key ? BRAND : '#64748b',
                borderBottom: tab === t.key ? `2px solid ${BRAND}` : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 15 }} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — Plans full width, baaki centered */}
      <div style={{ maxWidth: wide ? '100%' : 1000, margin: '0 auto' }}>
        {tab === 'general'      && <GeneralTab />}
        {tab === 'verification' && <VerificationPage />}
        {tab === 'plans'        && <PlansPage />}
        {tab === 'settings'     && <SettingsPage />}
      </div>
    </div>
  )
}

function GeneralTab() {
  const { company } = useAuth()
  const companyId = company?.id
  const [vals, setVals] = useState(null)
  const [saving, setSaving] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!companyId) return
    supabase.from('companies')
      .select('show_portfolio, show_team, show_contact, show_faq, accepting_leads')
      .eq('id', companyId).single()
      .then(({ data }) => {
        setVals(data || { show_portfolio:true, show_team:true, show_contact:true, show_faq:true, accepting_leads:true })
      })
  }, [companyId])

  async function toggle(col) {
    if (!vals || !companyId) return
    const next = !vals[col]
    setVals(v => ({ ...v, [col]: next }))
    setSaving(col); setMsg('')
    const { error } = await supabase.from('companies').update({ [col]: next }).eq('id', companyId)
    if (error) {
      setVals(v => ({ ...v, [col]: !next }))
      setMsg('Error saving — try again.')
    } else {
      setMsg('Saved ✓'); setTimeout(() => setMsg(''), 1500)
    }
    setSaving('')
  }

  if (!vals) return <div style={{ color: '#64748b' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <h2 style={{ fontSize:17, fontWeight:700 }}>Profile Visibility</h2>
        {msg && <span style={{ fontSize:13, color: msg.includes('Error')?'#c0392b':'#1a7f4b', fontWeight:600 }}>{msg}</span>}
      </div>
      <p style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>
        Control what appears on your public profile. Reviews are always visible to maintain trust.
      </p>

      {TOGGLES.map(t => (
        <div key={t.col} style={{ background:'#fff', border:'1px solid #e6e9ee', borderRadius:12, padding:16, marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:15 }}>{t.label}</div>
            <div style={{ fontSize:13, color:'#778', marginTop:2 }}>{t.desc}</div>
          </div>
          <Switch on={!!vals[t.col]} busy={saving === t.col} onClick={() => toggle(t.col)} />
        </div>
      ))}
    </div>
  )
}

function Switch({ on, busy, onClick }) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{ width:48, height:28, borderRadius:20, border:'none', cursor:'pointer', background: on?BRAND:'#cbd5e1', position:'relative', transition:'background .2s', flexShrink:0, opacity: busy?0.6:1 }}>
      <span style={{ position:'absolute', top:3, left: on?23:3, width:22, height:22, background:'#fff', borderRadius:'50%', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}
