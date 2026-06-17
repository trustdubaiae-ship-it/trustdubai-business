import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Building2, Phone, Mail, MapPin, Tag, User, FileText, ChevronRight, Check, AlertTriangle } from 'lucide-react'

const CATEGORIES = [
  'Construction & Renovation', 'Interior Design', 'Electrical', 'Plumbing',
  'HVAC & AC', 'Painting', 'Flooring', 'Kitchen & Bath', 'Landscaping',
  'Security Systems', 'IT & Technology', 'Cleaning Services', 'Movers & Storage',
  'Legal Services', 'Real Estate', 'Healthcare', 'Education', 'Automotive',
  'Food & Restaurant', 'Retail', 'Finance & Accounting', 'Other'
]

const STEPS = ['Business Info', 'Contact Details', 'About You', 'Review & Submit']

// Normalize a phone to just digits (last 9) for loose matching (+971 50 123 4567 -> 501234567)
function phoneKey(p) {
  const d = (p || '').replace(/\D/g, '')
  return d.slice(-9)
}

export default function RegisterPage({ onBack }) {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [checking, setChecking] = useState(false)
  const [dupMatch, setDupMatch] = useState(null) // { name, slug, kind: 'name'|'phone' }
  const [form, setForm] = useState({
    company_name: '', category: '', location: '', website: '',
    phone: '', whatsapp: '', email: '', owner_name: '', description: '', how_heard: '',
  })
  const [errors, setErrors] = useState({})

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
    // typing again clears a previous duplicate warning for that step
    if (field === 'company_name' || field === 'phone') setDupMatch(null)
  }

  function validate() {
    const e = {}
    if (step === 0) {
      if (!form.company_name.trim()) e.company_name = 'Company name required'
      if (!form.category) e.category = 'Please select a category'
      if (!form.location.trim()) e.location = 'Location required'
    }
    if (step === 1) {
      if (!form.phone.trim()) e.phone = 'Phone number required'
      if (!form.email.trim()) e.email = 'Email required'
      else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email'
    }
    if (step === 2) {
      if (!form.owner_name.trim()) e.owner_name = 'Your name is required'
      if (!form.description.trim()) e.description = 'Please describe your business'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Look for an existing company by name (step 0) or phone (step 1).
  // Returns a match object or null. Never blocks on error (fails open).
  async function findDuplicate() {
    try {
      if (step === 0 && form.company_name.trim().length >= 3) {
        const term = form.company_name.trim().replace(/[%_]/g, ' ')
        const { data } = await supabase
          .from('companies')
          .select('name, slug')
          .ilike('name', `%${term}%`)
          .limit(1)
        if (data && data.length) return { name: data[0].name, slug: data[0].slug, kind: 'name' }
      }
      if (step === 1) {
        const key = phoneKey(form.phone)
        if (key.length >= 7) {
          const { data } = await supabase
            .from('companies')
            .select('name, slug, phone')
            .ilike('phone', `%${key}%`)
            .limit(1)
          if (data && data.length) return { name: data[0].name, slug: data[0].slug, kind: 'phone' }
        }
      }
    } catch (_) { /* fail open - never block registration on a check error */ }
    return null
  }

  async function next() {
    if (!validate()) return
    // Run duplicate check on step 0 (name) and step 1 (phone)
    if (step === 0 || step === 1) {
      // if we already showed a match for this step and user chose to continue, let them through
      if (dupMatch) { setDupMatch(null); setStep(s => s + 1); return }
      setChecking(true)
      const match = await findDuplicate()
      setChecking(false)
      if (match) { setDupMatch(match); return } // show warning, don't advance yet
    }
    setStep(s => s + 1)
  }

  function back() { setDupMatch(null); if (step === 0) onBack(); else setStep(s => s - 1) }

  async function submit() {
    setSubmitting(true)
    try {
      const slug = form.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const { error } = await supabase.from('company_applications').insert({
        company_name: form.company_name, category: form.category, location: form.location,
        website: form.website || null, phone: form.phone, whatsapp: form.whatsapp || form.phone,
        email: form.email.toLowerCase(), owner_name: form.owner_name, description: form.description,
        how_heard: form.how_heard || null, slug, status: 'pending', applied_at: new Date().toISOString()
      })
      if (error) throw error
      setSubmitted(true)
    } catch (e) {
      alert('Submission failed: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)', padding: 20 }}>
        <div style={{ background: 'white', borderRadius: 20, padding: '48px 40px', textAlign: 'center', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#ecfdf5', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Check size={32} color="#10b981" />
          </div>
          <h2 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 22, marginBottom: 10 }}>Application Submitted! 🎉</h2>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.8, marginBottom: 8 }}>Thank you, <strong>{form.owner_name}</strong>! We received your application for <strong>{form.company_name}</strong>.</p>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.8, marginBottom: 28 }}>Our team will review within <strong>1-2 business days</strong> and email you at <strong>{form.email}</strong>.</p>
          <div style={{ background: '#fef9ed', border: '1px solid rgba(232,184,75,0.3)', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#92400e', lineHeight: 1.7 }}>
            📧 Questions? WhatsApp us at <strong>+971 50 385 6786</strong>
          </div>
        </div>
      </div>
    )
  }

  const fields = {
    0: [
      { field: 'company_name', label: 'Company Name', icon: Building2, placeholder: 'Your Company Name LLC' },
      { field: 'category', label: 'Category', icon: Tag, type: 'select' },
      { field: 'location', label: 'Location', icon: MapPin, placeholder: 'e.g. Business Bay, Dubai' },
      { field: 'website', label: 'Website (optional)', icon: null, placeholder: 'https://yourcompany.ae', optional: true },
    ],
    1: [
      { field: 'phone', label: 'Phone Number', icon: Phone, placeholder: '+971 50 000 0000' },
      { field: 'whatsapp', label: 'WhatsApp (if different)', icon: Phone, placeholder: '+971 50 000 0000', optional: true },
      { field: 'email', label: 'Business Email', icon: Mail, placeholder: 'info@yourcompany.ae', type: 'email' },
    ],
    2: [
      { field: 'owner_name', label: 'Your Name', icon: User, placeholder: 'Mohammed Al Rashidi' },
      { field: 'description', label: 'Business Description', icon: FileText, placeholder: 'Tell us about your services...', type: 'textarea' },
      { field: 'how_heard', label: 'How did you hear about us?', icon: null, type: 'heard', optional: true },
    ]
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexWrap: 'wrap', background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(232,184,75,0.07) 0%, transparent 50%)', pointerEvents: 'none' }} />

      <div style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(28px, 6vw, 60px)', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><img src="/quvera-icon.png" alt="Quvera" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
          <div>
            <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 16, color: '#fff' }}>Quvera</div>
            <div style={{ fontSize: 11, color: '#6e7681', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Business Registration</div>
            <div style={{ fontSize: 10, color: '#a8893f', letterSpacing: '0.04em', marginTop: 2 }}>Find. Verify. Trust.</div>
          </div>
        </div>
        <h1 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 'clamp(28px, 6vw, 42px)', color: '#ffffff', lineHeight: 1.2, marginBottom: 16, maxWidth: 440 }}>
          List your business.<br /><span style={{ color: '#e8b84b' }}>Build trust.</span>
        </h1>
        <p style={{ fontSize: 15, color: '#8b949e', maxWidth: 380, lineHeight: 1.8, marginBottom: 40 }}>Join hundreds of Dubai businesses. Get verified, showcase your work, attract more clients.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: i < step ? '#10b981' : i === step ? '#e8b84b' : 'rgba(255,255,255,0.08)', border: `2px solid ${i < step ? '#10b981' : i === step ? '#e8b84b' : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i <= step ? '#0d1117' : '#6e7681' }}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: 13.5, color: i === step ? '#ffffff' : i < step ? '#10b981' : '#6e7681', fontWeight: i === step ? 600 : 400 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: '1 1 360px', width: '100%', maxWidth: 480, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'clamp(20px, 4vw, 40px)' }}>
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 'clamp(20px, 4vw, 36px)', backdropFilter: 'blur(20px)', marginTop: 40, marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: '#6e7681', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Step {step + 1} of {STEPS.length}</div>
          <h2 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 20, color: '#fff', marginBottom: 6 }}>{STEPS[step]}</h2>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ width: `${((step + 1) / STEPS.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #e8b84b, #c9952a)', borderRadius: 99 }} />
          </div>

          <style>{`.rf input,.rf select,.rf textarea{width:100%;padding:10px 14px;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.12);border-radius:8px;font-size:14px;color:#fff;font-family:'Inter',sans-serif;outline:none;box-sizing:border-box;margin-bottom:16px}.rf input:focus,.rf select:focus,.rf textarea:focus{border-color:#e8b84b}.rf input::placeholder,.rf textarea::placeholder{color:#4a5568}.rf select option{background:#1a1f2e}.rf textarea{min-height:100px;resize:vertical}.rf label{display:block;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px}.rf .err{color:#ef4444;font-size:12px;margin-top:-12px;margin-bottom:8px}.rf-legal a{color:#e8b84b;text-decoration:none}.rf-legal a:hover{text-decoration:underline}`}</style>

          <div className="rf">
            {step === 0 && <>
              <label>Company Name *</label>
              <input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Your Company Name LLC" />
              {errors.company_name && <div className="err">{errors.company_name}</div>}
              <label>Business Category *</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">Select category...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {errors.category && <div className="err">{errors.category}</div>}
              <label>Location *</label>
              <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Business Bay, Dubai" />
              {errors.location && <div className="err">{errors.location}</div>}
              <label>Website (optional)</label>
              <input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://yourcompany.ae" />
            </>}
            {step === 1 && <>
              <label>Phone Number *</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+971 50 000 0000" />
              {errors.phone && <div className="err">{errors.phone}</div>}
              <label>WhatsApp (if different)</label>
              <input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="+971 50 000 0000" />
              <label>Business Email *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="info@yourcompany.ae" />
              {errors.email && <div className="err">{errors.email}</div>}
            </>}
            {step === 2 && <>
              <label>Your Name *</label>
              <input value={form.owner_name} onChange={e => set('owner_name', e.target.value)} placeholder="Mohammed Al Rashidi" />
              {errors.owner_name && <div className="err">{errors.owner_name}</div>}
              <label>Business Description *</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Tell us about your services, experience..." />
              {errors.description && <div className="err">{errors.description}</div>}
              <label>How did you hear about us?</label>
              <select value={form.how_heard} onChange={e => set('how_heard', e.target.value)}>
                <option value="">Select...</option>
                {['Google Search','Instagram','Facebook','Friend / Colleague','WhatsApp','Other'].map(o => <option key={o}>{o}</option>)}
              </select>
            </>}
            {step === 3 && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['Company', form.company_name], ['Category', form.category], ['Location', form.location], ['Phone', form.phone], ['Email', form.email], ['Owner', form.owner_name]].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, fontSize: 13.5 }}>
                  <span style={{ color: '#6e7681' }}>{l}</span>
                  <span style={{ color: '#fff', fontWeight: 500 }}>{v || '—'}</span>
                </div>
              ))}
              <div style={{ background: 'rgba(232,184,75,0.08)', border: '1px solid rgba(232,184,75,0.2)', borderRadius: 8, padding: '12px 14px', fontSize: 12.5, color: '#9b8a5a', lineHeight: 1.7, marginTop: 4 }}>
                By submitting, you confirm all information is accurate and agree to Quvera's Terms of Service.
              </div>
            </div>}
          </div>

          {dupMatch && (
            <div style={{ background: 'rgba(232,184,75,0.1)', border: '1px solid rgba(232,184,75,0.4)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <AlertTriangle size={18} color="#e8b84b" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: '#e8d9b0', lineHeight: 1.7 }}>
                {dupMatch.kind === 'name'
                  ? <>A business named <strong style={{ color: '#fff' }}>&ldquo;{dupMatch.name}&rdquo;</strong> already appears on Quvera.</>
                  : <>This phone number is already linked to <strong style={{ color: '#fff' }}>&ldquo;{dupMatch.name}&rdquo;</strong> on Quvera.</>}
                <div style={{ marginTop: 6 }}>
                  If this is <strong>your</strong> business, it may already be listed &mdash; please contact us at{' '}
                  <a href="mailto:support@quvera.ae" style={{ color: '#e8b84b', textDecoration: 'none' }}>support@quvera.ae</a>{' '}
                  to claim it instead of creating a duplicate. If it's a <strong>different</strong> business, you can continue below.
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={back} style={{ padding: '10px 18px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600 }}>Back</button>
            <button onClick={step === STEPS.length - 1 ? submit : next} disabled={submitting || checking} style={{ flex: 1, padding: '10px 18px', background: 'linear-gradient(135deg, #e8b84b, #c9952a)', border: 'none', borderRadius: 8, color: '#0d1117', cursor: (submitting || checking) ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (submitting || checking) ? 0.7 : 1 }}>
              {checking ? 'Checking...' : submitting ? 'Submitting...' : step === STEPS.length - 1 ? 'Submit Application ✓' : dupMatch ? <>Continue anyway <ChevronRight size={15} /></> : <>Next <ChevronRight size={15} /></>}
            </button>
          </div>

          <div className="rf-legal" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11.5, color: '#6e7681', lineHeight: 1.7, textAlign: 'center' }}>
            By continuing, you agree to Quvera's{' '}
            <a href="https://quvera.ae/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>,{' '}
            <a href="https://quvera.ae/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>{' & '}
            <a href="https://quvera.ae/refund" target="_blank" rel="noopener noreferrer">Refund Policy</a>.
          </div>
        </div>
      </div>
    </div>
  )
}
