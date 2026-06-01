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
  { key: 'finance',      label: 'Finance',         icon: 'ti-cash' },
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

  const wide = tab === 'plans'

  return (
    <div style={{ padding: '24px 20px', color: 'var(--text)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, color: 'var(--text)' }}>Control Panel</h1>
        <p style={{ color: 'var(--text2)', marginBottom: 18, fontSize: 14 }}>
          Manage your company settings, verification, finance and profile visibility.
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', marginBottom: 22 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                padding: '10px 14px', fontSize: 14, fontWeight: 600,
                color: tab === t.key ? BRAND : 'var(--text2)',
                borderBottom: tab === t.key ? `2px solid ${BRAND}` : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 15 }} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: wide ? '100%' : 1000, margin: '0 auto' }}>
        {tab === 'general'      && <GeneralTab />}
        {tab === 'finance'      && <FinanceTab />}
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

  if (!vals) return <div style={{ color: 'var(--text2)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <h2 style={{ fontSize:17, fontWeight:700, color:'var(--text)' }}>Profile Visibility</h2>
        {msg && <span style={{ fontSize:13, color: msg.includes('Error')?'#ef4444':'#10b981', fontWeight:600 }}>{msg}</span>}
      </div>
      <p style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>
        Control what appears on your public profile. Reviews are always visible to maintain trust.
      </p>

      {TOGGLES.map(t => (
        <div key={t.col} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:16, marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:15, color:'var(--text)' }}>{t.label}</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>{t.desc}</div>
          </div>
          <Switch on={!!vals[t.col]} busy={saving === t.col} onClick={() => toggle(t.col)} />
        </div>
      ))}
    </div>
  )
}

/* ============== FINANCE SETTINGS TAB ============== */
const PAY_PRESETS = [
  '50% advance, 50% on completion',
  '40% advance, 30% mid-stage, 30% on handover',
  '30% advance, 40% mid-stage, 30% on completion',
  '25% advance, 25% material, 25% mid, 25% final',
  '100% on completion',
]

const SIGN_STYLES = [
  { key:'style1', label:'Classic Line',   desc:'Name + line above' },
  { key:'style2', label:'Boxed',          desc:'Bordered signature box' },
  { key:'style3', label:'Stamp + Sign',   desc:'Company stamp area + sign' },
  { key:'style4', label:'Dual',           desc:'Prepared by + Client accept' },
  { key:'style5', label:'Minimal',        desc:'Just name & designation' },
]

function FinanceTab() {
  const { company } = useAuth()
  const companyId = company?.id
  const [f, setF] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [newPay, setNewPay] = useState('')

  const isGoldPlus = ['gold','platinum'].includes(company?.plan)

  useEffect(() => {
    if (!companyId) return
    supabase.from('companies')
      .select('trn, vat_registered, finance_logo_url, finance_logo_width, project_prefix, project_next_num, why_choose_us, payment_terms, signature_style')
      .eq('id', companyId).single()
      .then(({ data }) => {
        setF({
          trn: data?.trn || '',
          vat_registered: data?.vat_registered ?? false,
          finance_logo_url: data?.finance_logo_url || '',
          finance_logo_width: data?.finance_logo_width || 140,
          project_prefix: data?.project_prefix || 'PRJ-',
          project_next_num: data?.project_next_num || 1,
          why_choose_us: data?.why_choose_us || '',
          payment_terms: Array.isArray(data?.payment_terms) ? data.payment_terms : [],
          signature_style: data?.signature_style || 'style1',
        })
      })
  }, [companyId])

  function set(k, v) { setF(p => ({ ...p, [k]: v })) }

  function addPayment() {
    const t = newPay.trim()
    if (!t) return
    set('payment_terms', [...f.payment_terms, t])
    setNewPay('')
  }
  function removePayment(i) {
    set('payment_terms', f.payment_terms.filter((_, idx) => idx !== i))
  }
  function addPreset(p) {
    if (f.payment_terms.includes(p)) return
    set('payment_terms', [...f.payment_terms, p])
  }

  async function save() {
    if (!companyId) return
    setSaving(true); setMsg('')
    const { error } = await supabase.from('companies').update({
      trn: f.trn,
      vat_registered: f.vat_registered,
      finance_logo_url: f.finance_logo_url,
      finance_logo_width: parseInt(f.finance_logo_width) || 140,
      project_prefix: f.project_prefix,
      project_next_num: parseInt(f.project_next_num) || 1,
      why_choose_us: f.why_choose_us,
      payment_terms: f.payment_terms,
      signature_style: f.signature_style,
    }).eq('id', companyId)
    setSaving(false)
    if (error) { setMsg('Error saving — try again.'); console.error(error) }
    else { setMsg('Saved ✓'); setTimeout(() => setMsg(''), 1800) }
  }

  if (!f) return <div style={{ color: 'var(--text2)' }}>Loading…</div>

  const cardStyle = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:18, marginBottom:14 }
  const labelStyle = { fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:6, display:'block' }
  const inputStyle = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', borderRadius:8, fontSize:14, fontFamily:'inherit', boxSizing:'border-box' }
  const hint = { fontSize:12, color:'var(--text3)', marginTop:4 }
  const sectionTitle = { fontSize:13, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.03em', marginBottom:12 }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          <h2 style={{ fontSize:17, fontWeight:700, color:'var(--text)' }}>Finance Settings</h2>
          <p style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>Ek baar set karo — quotations & projects automatically use karenge.</p>
        </div>
        <button onClick={save} disabled={saving}
          style={{ padding:'9px 20px', background:BRAND, color:'#fff', border:'none', borderRadius:8, fontWeight:600, fontSize:14, cursor:'pointer', opacity:saving?0.6:1, flexShrink:0 }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
      {msg && <div style={{ fontSize:13, color: msg.includes('Error')?'#ef4444':'#10b981', fontWeight:600, marginBottom:12 }}>{msg}</div>}

      {/* TAX INFO */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Tax Information</div>
        <label style={labelStyle}>TRN (Tax Registration Number)</label>
        <input value={f.trn} onChange={e => set('trn', e.target.value)} placeholder="100xxxxxxxxxxxx" style={inputStyle} />
        <div style={hint}>Ye quotation & invoice pe automatically aayega.</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:14, color:'var(--text)' }}>VAT Registered</div>
            <div style={hint}>On karoge to quotes pe 5% VAT auto-add hoga.</div>
          </div>
          <Switch on={f.vat_registered} busy={false} onClick={() => set('vat_registered', !f.vat_registered)} />
        </div>
      </div>

      {/* BRANDING + LOGO PREVIEW + SIZE */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Branding</div>
        <label style={labelStyle}>Company Logo URL</label>
        <input value={f.finance_logo_url} onChange={e => set('finance_logo_url', e.target.value)} placeholder="https://...your-logo.png" style={inputStyle} />
        <div style={hint}>Logo quotation/invoice ke top pe dikhega. (Abhi URL — baad mein direct upload add karenge.)</div>

        {f.finance_logo_url ? (
          <>
            <div style={{ marginTop:14, marginBottom:6, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <label style={{ ...labelStyle, marginBottom:0 }}>Logo Size on Quotation</label>
              <span style={{ fontSize:13, fontWeight:700, color:BRAND }}>{f.finance_logo_width}px</span>
            </div>
            <input type="range" min="60" max="320" step="10"
              value={f.finance_logo_width}
              onChange={e => set('finance_logo_width', parseInt(e.target.value))}
              style={{ width:'100%', accentColor:BRAND, cursor:'pointer' }} />
            <div style={hint}>Slider se logo ka size adjust karo — neeche preview live dikhega.</div>

            {/* LIVE PREVIEW — quotation header jaisा */}
            <div style={{ marginTop:14, padding:18, background:'var(--bg2)', borderRadius:10, border:'1px dashed var(--border2)' }}>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Preview (quotation header)</div>
              <img src={f.finance_logo_url} alt="logo"
                style={{ width:f.finance_logo_width, maxWidth:'100%', height:'auto', objectFit:'contain', display:'block' }}
                onError={e => { e.target.style.display='none' }} />
            </div>
          </>
        ) : (
          <div style={{ marginTop:12, padding:'12px 14px', background:'var(--bg2)', borderRadius:8, fontSize:12, color:'var(--text3)' }}>
            Logo URL daalo — yahan preview + size slider dikhega.
          </div>
        )}
      </div>

      {/* PROJECT REFERENCE */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Project Reference</div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 200px' }}>
            <label style={labelStyle}>Prefix</label>
            <input value={f.project_prefix} onChange={e => set('project_prefix', e.target.value)} placeholder="PRJ-" style={inputStyle} />
          </div>
          <div style={{ flex:'1 1 200px' }}>
            <label style={labelStyle}>Next Number</label>
            <input type="number" value={f.project_next_num} onChange={e => set('project_next_num', e.target.value)} placeholder="1" style={inputStyle} />
          </div>
        </div>
        <div style={hint}>Next project code: <b style={{ color:'var(--text)' }}>{f.project_prefix}{String(f.project_next_num).padStart(3,'0')}</b> — auto-sequence aage badhega.</div>
      </div>

      {/* WHY CHOOSE US */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Why Choose Us</div>
        <label style={labelStyle}>Default text</label>
        <textarea value={f.why_choose_us} onChange={e => set('why_choose_us', e.target.value)} rows={4}
          placeholder={"e.g.\n• 7+ years luxury fit-out experience\n• In-house MEP, civil & joinery teams\n• On-time delivery guarantee"}
          style={{ ...inputStyle, resize:'vertical', lineHeight:1.5 }} />
        <div style={hint}>Quotation banate waqt tick karke add/remove kar sakoge.</div>
      </div>

      {/* PAYMENT TERMS */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Payment Terms {!isGoldPlus && <span style={{ fontSize:10, color:'#d97706', fontWeight:600 }}>(Gold+ feature)</span>}</div>
        <div style={hint}>Apne payment options save karo — quotation banate waqt inme se choose karoge (ya custom).</div>

        <div style={{ marginTop:12, marginBottom:10 }}>
          {f.payment_terms.length === 0 && <div style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic' }}>Koi payment option nahi — neeche se add karo.</div>}
          {f.payment_terms.map((p, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg2)', borderRadius:8, padding:'8px 12px', marginBottom:8 }}>
              <i className="ti ti-cash" style={{ fontSize:14, color:BRAND }} />
              <span style={{ flex:1, fontSize:13, color:'var(--text)' }}>{p}</span>
              <button onClick={() => removePayment(i)} style={{ border:'none', background:'none', color:'#ef4444', cursor:'pointer', fontSize:16 }}>✕</button>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <input value={newPay} onChange={e => setNewPay(e.target.value)} placeholder="Custom payment term likho..."
            style={{ ...inputStyle, flex:1 }} onKeyDown={e => e.key === 'Enter' && addPayment()} />
          <button onClick={addPayment} style={{ padding:'9px 16px', background:BRAND, color:'#fff', border:'none', borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer', whiteSpace:'nowrap' }}>+ Add</button>
        </div>

        <div style={{ marginTop:12 }}>
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:6 }}>Quick presets (click to add):</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {PAY_PRESETS.map(p => (
              <button key={p} onClick={() => addPreset(p)}
                style={{ padding:'5px 10px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:99, fontSize:11.5, color:'var(--text2)', cursor:'pointer' }}>
                + {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SIGNATURE */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Signature Style</div>
        <div style={hint}>Quotation ke neeche kaunsa signature design lagega — choose karo.</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10, marginTop:12 }}>
          {SIGN_STYLES.map(s => (
            <div key={s.key} onClick={() => set('signature_style', s.key)}
              style={{
                border: f.signature_style === s.key ? `2px solid ${BRAND}` : '1px solid var(--border)',
                borderRadius:10, padding:12, cursor:'pointer',
                background: f.signature_style === s.key ? 'rgba(0,153,204,0.06)' : 'var(--card)',
              }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:3 }}>{s.label}</div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8 }}>{s.desc}</div>
              <div style={{ borderTop:'1px dashed var(--border2)', paddingTop:8, fontSize:10, color:'var(--text3)' }}>
                {s.key==='style2' ? <div style={{ border:'1px solid var(--border2)', borderRadius:4, height:24 }} />
                  : s.key==='style3' ? <div>🔵 Stamp ___</div>
                  : s.key==='style4' ? <div>Prepared ___ / Accept ___</div>
                  : s.key==='style5' ? <div>Name · Designation</div>
                  : <div>_____________<br/>Authorized Sign</div>}
              </div>
              {f.signature_style === s.key && <div style={{ fontSize:10, color:BRAND, fontWeight:700, marginTop:6 }}>✓ Selected</div>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:4 }}>
        <button onClick={save} disabled={saving}
          style={{ padding:'10px 24px', background:BRAND, color:'#fff', border:'none', borderRadius:8, fontWeight:600, fontSize:14, cursor:'pointer', opacity:saving?0.6:1 }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

function Switch({ on, busy, onClick }) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{ width:48, height:28, borderRadius:20, border:'none', cursor:'pointer', background: on?BRAND:'var(--border2)', position:'relative', transition:'background .2s', flexShrink:0, opacity: busy?0.6:1 }}>
      <span style={{ position:'absolute', top:3, left: on?23:3, width:22, height:22, background:'#fff', borderRadius:'50%', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}
