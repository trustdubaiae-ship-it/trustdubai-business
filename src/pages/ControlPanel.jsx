// trustdubai-business/src/pages/ControlPanel.jsx
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

import VerificationPage from './VerificationPage'
import PlansPage from './PlansPage'
import SettingsPage from './SettingsPage'

const BRAND = '#0099cc'
const LOGO_BUCKET = 'company-logos'
const MAX_LOGO_MB = 1

const TABS = [
  { key: 'general',      label: 'General',           icon: 'ti-adjustments' },
  { key: 'finance',      label: 'Finance',           icon: 'ti-cash' },
  { key: 'templates',    label: 'Message Templates', icon: 'ti-message-2' },
  { key: 'verification', label: 'Verification',      icon: 'ti-shield-check' },
  { key: 'plans',        label: 'Plans & Billing',   icon: 'ti-credit-card' },
  { key: 'settings',     label: 'Settings',          icon: 'ti-settings' },
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
    <div className="cp-wrap" style={{ color: 'var(--text)' }}>
      <style>{`
        .cp-wrap{ padding:24px 20px; }
        .cp-tabs{ display:flex; gap:6; flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch; border-bottom:1px solid var(--border); margin-bottom:22px; }
        .cp-tabs::-webkit-scrollbar{ height:0; }
        .cp-tab-btn{ border:none; background:none; cursor:pointer; padding:10px 14px; font-size:14px; font-weight:600; display:flex; align-items:center; gap:6px; white-space:nowrap; flex-shrink:0; font-family:inherit; }
        @media (max-width:768px){ .cp-wrap{ padding:16px 14px; } }
      `}</style>

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, color: 'var(--text)' }}>Control Panel</h1>
        <p style={{ color: 'var(--text2)', marginBottom: 18, fontSize: 14 }}>
          Manage your company settings, verification, finance and profile visibility.
        </p>

        <div className="cp-tabs">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="cp-tab-btn"
              style={{
                color: tab === t.key ? BRAND : 'var(--text2)',
                borderBottom: tab === t.key ? `2px solid ${BRAND}` : '2px solid transparent',
              }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 15 }} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: wide ? '100%' : 1000, margin: '0 auto' }}>
        {tab === 'general'      && <GeneralTab />}
        {tab === 'finance'      && <FinanceTab />}
        {tab === 'templates'    && <TemplatesTab />}
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

/* ============== MESSAGE TEMPLATES TAB ============== */
const DEFAULT_TEMPLATES = [
  { name: 'Gentle check-in', body: 'Hi {name}, just following up on your {req} inquiry. Would you like to schedule a quick call this week?' },
  { name: 'Share quote',     body: 'Hi {name}, thank you for your interest. I have prepared a quote for your {req} — when is a good time to discuss?' },
  { name: 'Site visit invite', body: 'Hi {name}, we would love to visit your site for an accurate assessment. What day works best for you?' },
  { name: 'Thank you',       body: 'Hi {name}, thank you for choosing us. We look forward to working on your {req}.' },
]

function TemplatesTab() {
  const { company } = useAuth()
  const companyId = company?.id
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { if (companyId) load() }, [companyId])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('message_templates').select('*').eq('company_id', companyId).order('sort_order', { ascending: true })
    setTemplates(data || [])
    setLoading(false)
  }

  function startNew() { setEditing('new'); setName(''); setBody(''); setMsg('') }
  function startEdit(t) { setEditing(t.id); setName(t.name); setBody(t.body); setMsg('') }
  function cancel() { setEditing(null); setName(''); setBody('') }

  async function save() {
    if (!name.trim() || !body.trim()) { setMsg('Error: Enter name and message.'); return }
    setSaving(true); setMsg('')
    if (editing === 'new') {
      const { data, error } = await supabase.from('message_templates')
        .insert({ company_id: companyId, name: name.trim(), body: body.trim(), sort_order: templates.length })
        .select().single()
      if (error) { setMsg('Error saving — try again.'); setSaving(false); return }
      setTemplates(prev => [...prev, data])
    } else {
      const { error } = await supabase.from('message_templates')
        .update({ name: name.trim(), body: body.trim() }).eq('id', editing)
      if (error) { setMsg('Error saving — try again.'); setSaving(false); return }
      setTemplates(prev => prev.map(t => t.id === editing ? { ...t, name: name.trim(), body: body.trim() } : t))
    }
    setSaving(false); setEditing(null); setName(''); setBody('')
    setMsg('Saved ✓'); setTimeout(() => setMsg(''), 1500)
  }

  async function remove(id) {
    if (!window.confirm('Delete this template?')) return
    await supabase.from('message_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const cardStyle = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:16, marginBottom:12 }
  const inputStyle = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', borderRadius:8, fontSize:14, fontFamily:'inherit', boxSizing:'border-box' }
  const hint = { fontSize:12, color:'var(--text3)', marginTop:4 }

  if (loading) return <div style={{ color:'var(--text2)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:10, flexWrap:'wrap' }}>
        <div>
          <h2 style={{ fontSize:17, fontWeight:700, color:'var(--text)' }}>Message Templates</h2>
          <p style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>Ready WhatsApp messages for lead follow-ups. Use them in Lead Hub.</p>
        </div>
        {msg && <span style={{ fontSize:13, color: msg.includes('Error')?'#ef4444':'#10b981', fontWeight:600 }}>{msg}</span>}
      </div>

      <div style={{ ...cardStyle, background:'var(--bg2)' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.03em', marginBottom:10 }}>Built-in templates</div>
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>These are always available in Lead Hub — you can't edit or delete them.</div>
        {DEFAULT_TEMPLATES.map(t => (
          <div key={t.name} style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'8px 0', borderTop:'1px dashed var(--border)', flexWrap:'wrap' }}>
            <span style={{ fontSize:12, fontWeight:700, color:BRAND, minWidth:120 }}>{t.name}</span>
            <span style={{ fontSize:12, color:'var(--text2)', lineHeight:1.4, flex:1, minWidth:180 }}>{t.body}</span>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'18px 0 12px', gap:10, flexWrap:'wrap' }}>
        <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>My templates ({templates.length})</div>
        {editing === null && (
          <button onClick={startNew} style={{ padding:'8px 16px', background:BRAND, color:'#fff', border:'none', borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            <i className="ti ti-plus" style={{ fontSize:14 }} /> New template
          </button>
        )}
      </div>

      {editing !== null && (
        <div style={{ ...cardStyle, borderColor:BRAND }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:10 }}>{editing === 'new' ? 'New template' : 'Edit template'}</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder='Template name — e.g. "Ramadan greeting"' style={{ ...inputStyle, marginBottom:10 }} />
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="Message text… use {name} for customer name, {req} for requirement"
            style={{ ...inputStyle, resize:'vertical', lineHeight:1.5 }} />
          <div style={hint}>Placeholders: <b style={{ color:'var(--text)' }}>{'{name}'}</b> = customer name, <b style={{ color:'var(--text)' }}>{'{req}'}</b> = requirement (auto-filled when sending)</div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={save} disabled={saving} style={{ padding:'9px 18px', background:BRAND, color:'#fff', border:'none', borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer', opacity:saving?0.6:1 }}>{saving ? 'Saving...' : 'Save template'}</button>
            <button onClick={cancel} style={{ padding:'9px 16px', background:'var(--bg2)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {templates.length === 0 && editing === null ? (
        <div style={{ ...cardStyle, textAlign:'center', padding:'40px 20px' }}>
          <i className="ti ti-message-plus" style={{ fontSize:36, color:'var(--text3)', display:'block', marginBottom:10 }} />
          <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:4 }}>No custom templates yet</div>
          <div style={{ fontSize:13, color:'var(--text2)' }}>Create reusable messages for offers, greetings, negotiations and more.</div>
        </div>
      ) : (
        templates.map(t => (
          <div key={t.id} style={{ ...cardStyle, display:'flex', gap:12, alignItems:'flex-start' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>{t.name}</div>
              <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.5 }}>{t.body}</div>
            </div>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              <button onClick={() => startEdit(t)} style={{ padding:'6px 10px', background:'var(--bg2)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:7, cursor:'pointer', fontSize:12 }}><i className="ti ti-edit" style={{ fontSize:13 }} /></button>
              <button onClick={() => remove(t.id)} style={{ padding:'6px 10px', background:'rgba(239,68,68,0.12)', color:'#ef4444', border:'none', borderRadius:7, cursor:'pointer', fontSize:12 }}><i className="ti ti-trash" style={{ fontSize:13 }} /></button>
            </div>
          </div>
        ))
      )}
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
  const [original, setOriginal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [newPay, setNewPay] = useState('')
  const [uploading, setUploading] = useState(false)
  const logoFileRef = useRef(null)

  const isGoldPlus = ['gold','platinum'].includes(company?.plan)

  useEffect(() => {
    if (!companyId) return
    supabase.from('companies')
      .select('trn, vat_registered, finance_logo_url, finance_logo_width, project_prefix, project_next_num, why_choose_us, payment_terms, signature_style')
      .eq('id', companyId).single()
      .then(({ data }) => {
        const obj = {
          trn: data?.trn || '',
          vat_registered: data?.vat_registered ?? false,
          finance_logo_url: data?.finance_logo_url || '',
          finance_logo_width: data?.finance_logo_width || 140,
          project_prefix: data?.project_prefix || 'PRJ-',
          project_next_num: data?.project_next_num || 1,
          why_choose_us: data?.why_choose_us || '',
          payment_terms: Array.isArray(data?.payment_terms) ? data.payment_terms : [],
          signature_style: data?.signature_style || 'style1',
        }
        setF(obj)
        setOriginal(JSON.stringify(obj))
      })
  }, [companyId])

  function set(k, v) { setF(p => ({ ...p, [k]: v })) }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setMsg('Error: Please choose an image file (PNG, JPG, SVG).'); return }
    if (file.size > MAX_LOGO_MB * 1024 * 1024) { setMsg(`Error: Logo must be under ${MAX_LOGO_MB}MB.`); return }
    setUploading(true); setMsg('')
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${companyId}/logo_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
      set('finance_logo_url', pub.publicUrl)
      setMsg('Logo uploaded ✓ — click Save Settings to keep it.')
    } catch (err) {
      console.error(err); setMsg('Error: Upload failed — try again.')
    }
    setUploading(false)
    if (logoFileRef.current) logoFileRef.current.value = ''
  }

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
    else { setMsg('Saved ✓'); setOriginal(JSON.stringify(f)); setTimeout(() => setMsg(''), 1800) }
  }

  if (!f) return <div style={{ color: 'var(--text2)' }}>Loading…</div>

  const isDirty = original !== null && JSON.stringify(f) !== original

  const cardStyle = { background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:18, marginBottom:14 }
  const labelStyle = { fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:6, display:'block' }
  const inputStyle = { width:'100%', padding:'9px 12px', border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', borderRadius:8, fontSize:14, fontFamily:'inherit', boxSizing:'border-box' }
  const hint = { fontSize:12, color:'var(--text3)', marginTop:4 }
  const sectionTitle = { fontSize:13, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.03em', marginBottom:12 }
  const saveBtn = (extra={}) => ({ padding:'9px 20px', background: isDirty?BRAND:'var(--bg2)', color: isDirty?'#fff':'var(--text3)', border:'none', borderRadius:8, fontWeight:600, fontSize:14, cursor: (saving||!isDirty)?'default':'pointer', opacity:(saving||!isDirty)?0.6:1, ...extra })
  const saveLabel = saving ? 'Saving...' : isDirty ? 'Save Settings' : 'Saved ✓'

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:10, flexWrap:'wrap' }}>
        <div>
          <h2 style={{ fontSize:17, fontWeight:700, color:'var(--text)' }}>Finance Settings</h2>
          <p style={{ fontSize:13, color:'var(--text2)', marginTop:2 }}>Set once — quotations & projects will use these automatically.</p>
        </div>
        <button onClick={save} disabled={saving || !isDirty} style={saveBtn({ flexShrink:0 })}>{saveLabel}</button>
      </div>
      {msg && <div style={{ fontSize:13, color: msg.includes('Error')?'#ef4444':'#10b981', fontWeight:600, marginBottom:12 }}>{msg}</div>}

      {/* TAX INFO */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Tax Information</div>
        <label style={labelStyle}>TRN (Tax Registration Number)</label>
        <input value={f.trn} onChange={e => set('trn', e.target.value)} placeholder="100xxxxxxxxxxxx" style={inputStyle} />
        <div style={hint}>This will appear automatically on your quotations & invoices.</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16, gap:12 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:14, color:'var(--text)' }}>VAT Registered</div>
            <div style={hint}>When on, 5% VAT is auto-added to your quotes.</div>
          </div>
          <Switch on={f.vat_registered} busy={false} onClick={() => set('vat_registered', !f.vat_registered)} />
        </div>
      </div>

      {/* BRANDING + LOGO UPLOAD + SIZE */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Branding</div>
        <label style={labelStyle}>Company Logo</label>

        <input ref={logoFileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display:'none' }} />
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <button onClick={() => logoFileRef.current?.click()} disabled={uploading}
            style={{ padding:'9px 16px', background:BRAND, color:'#fff', border:'none', borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer', opacity:uploading?0.6:1, display:'flex', alignItems:'center', gap:6 }}>
            <i className="ti ti-upload" style={{ fontSize:14 }} /> {uploading ? 'Uploading...' : 'Choose Logo'}
          </button>
          {f.finance_logo_url && (
            <button onClick={() => set('finance_logo_url', '')}
              style={{ padding:'9px 14px', background:'var(--bg2)', color:'#ef4444', border:'1px solid var(--border)', borderRadius:8, fontWeight:600, fontSize:13, cursor:'pointer' }}>
              Remove
            </button>
          )}
        </div>
        <div style={hint}>PNG, JPG or SVG · max {MAX_LOGO_MB}MB. Appears at the top of your quotation/invoice.</div>

        <label style={{ ...labelStyle, marginTop:14 }}>or paste logo URL</label>
        <input value={f.finance_logo_url} onChange={e => set('finance_logo_url', e.target.value)} placeholder="https://...your-logo.png" style={inputStyle} />

        {f.finance_logo_url ? (
          <>
            <div style={{ marginTop:14, marginBottom:6, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <label style={{ ...labelStyle, marginBottom:0 }}>Logo Size on Quotation</label>
              <span style={{ fontSize:13, fontWeight:700, color:BRAND }}>{f.finance_logo_width}px</span>
            </div>
            <input type="range" min="50" max="260" step="5"
              value={f.finance_logo_width}
              onChange={e => set('finance_logo_width', parseInt(e.target.value))}
              style={{ width:'100%', accentColor:BRAND, cursor:'pointer' }} />
            <div style={hint}>Adjust the logo size with the slider — live preview below.</div>

            <div style={{ marginTop:14, padding:18, background:'var(--bg2)', borderRadius:10, border:'1px dashed var(--border2)' }}>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Preview (quotation header)</div>
              <img src={f.finance_logo_url} alt="logo"
                style={{ width:f.finance_logo_width, maxWidth:'100%', height:'auto', objectFit:'contain', display:'block' }}
                onError={e => { e.target.style.display='none' }} />
            </div>
          </>
        ) : (
          <div style={{ marginTop:12, padding:'12px 14px', background:'var(--bg2)', borderRadius:8, fontSize:12, color:'var(--text3)' }}>
            Upload a logo (or paste a URL) to see the preview & size slider here.
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
        <div style={hint}>Next project code: <b style={{ color:'var(--text)' }}>{f.project_prefix}{String(f.project_next_num).padStart(3,'0')}</b> — auto-sequence will increment.</div>
      </div>

      {/* WHY CHOOSE US */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Why Choose Us</div>
        <label style={labelStyle}>Default text</label>
        <textarea value={f.why_choose_us} onChange={e => set('why_choose_us', e.target.value)} rows={4}
          placeholder={"e.g.\n• 7+ years luxury fit-out experience\n• In-house MEP, civil & joinery teams\n• On-time delivery guarantee"}
          style={{ ...inputStyle, resize:'vertical', lineHeight:1.5 }} />
        <div style={hint}>You can tick to add/remove this when creating a quotation.</div>
      </div>

      {/* PAYMENT TERMS */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Payment Terms {!isGoldPlus && <span style={{ fontSize:10, color:'#d97706', fontWeight:600 }}>(Gold+ feature)</span>}</div>
        <div style={hint}>Save your payment options — choose from these (or custom) when creating a quotation.</div>

        <div style={{ marginTop:12, marginBottom:10 }}>
          {f.payment_terms.length === 0 && <div style={{ fontSize:13, color:'var(--text3)', fontStyle:'italic' }}>No payment options yet — add one below.</div>}
          {f.payment_terms.map((p, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, background:'var(--bg2)', borderRadius:8, padding:'8px 12px', marginBottom:8 }}>
              <i className="ti ti-cash" style={{ fontSize:14, color:BRAND }} />
              <span style={{ flex:1, fontSize:13, color:'var(--text)' }}>{p}</span>
              <button onClick={() => removePayment(i)} style={{ border:'none', background:'none', color:'#ef4444', cursor:'pointer', fontSize:16 }}>✕</button>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <input value={newPay} onChange={e => setNewPay(e.target.value)} placeholder="Write a custom payment term..."
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
        <div style={hint}>Choose which signature design appears at the bottom of your quotation.</div>
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
        <button onClick={save} disabled={saving || !isDirty} style={saveBtn({ padding:'10px 24px' })}>{saveLabel}</button>
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
