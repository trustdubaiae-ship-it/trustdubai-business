// v4 - company_applications + companies pending row + duplicate check
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { signInWithGoogle, getCustomer } from '../customerAuth'

export default function RegisterCompany({ navigate }) {
  const [form, setForm] = useState({ name: '', category: '', area: '', phone: '', email: '', description: '', whatsapp: '' })
  const [tlFile, setTlFile] = useState(null)
  const [tlNumber, setTlNumber] = useState('')
  const [tlExpiry, setTlExpiry] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const [customer, setCustomer] = useState(null)
  const [existing, setExisting] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { init() }, [])

  async function init() {
    setChecking(true)
    const cust = await getCustomer()
    setCustomer(cust)
    const email = cust?.email || ''
    if (email) { set('email', email); await checkExisting(email) }
    setChecking(false)
  }

  async function checkExisting(email) {
    if (!email) return
    const lower = email.toLowerCase().trim()
    const { data: comp } = await supabase
      .from('companies')
      .select('id, name, slug, status')
      .ilike('owner_email', lower)
      .limit(1)
      .maybeSingle()
    if (comp) {
      const st = (comp.status || 'pending').toLowerCase()
      if (st === 'approved') { setExisting({ type: 'company', ...comp }); return }
      setExisting({ type: 'application', company_name: comp.name, status: st, rejection_reason: comp.rejection_reason }); return
    }
    const { data: app } = await supabase
      .from('company_applications')
      .select('id, company_name, status, rejection_reason')
      .ilike('email', lower)
      .order('applied_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (app) setExisting({ type: 'application', ...app })
  }

  async function uploadTradeLicense(applicationId) {
    if (!tlFile) return null
    const ext = tlFile.name.split('.').pop()
    const path = `${applicationId}/trade-license.${ext}`
    const { error } = await supabase.storage.from('trade-licenses').upload(path, tlFile, { upsert: true })
    if (error) return null
    return path
  }

  async function handleSubmit() {
    if (!form.name || !form.category || !form.area || !form.phone) return setError('Please fill required fields')
    if (!form.email) return setError('Email is required so we can update you on your application.')
    setError(''); setLoading(true)

    const lower = form.email.toLowerCase().trim()
    // duplicate safety check
    const { data: dupComp } = await supabase.from('companies').select('id').ilike('owner_email', lower).limit(1).maybeSingle()
    const { data: dupApp } = await supabase.from('company_applications').select('id').ilike('email', lower).limit(1).maybeSingle()
    if (dupComp || dupApp) { setLoading(false); await checkExisting(lower); return }

    const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

    // 1) application record (admin queue)
    const { data: app, error: e } = await supabase.from('company_applications').insert({
      company_name: form.name, category: form.category, location: form.area,
      phone: form.phone, whatsapp: form.whatsapp || form.phone, email: form.email,
      description: form.description, owner_name: '', slug, status: 'pending',
      applied_at: new Date().toISOString()
    }).select('id').single()
    if (e || !app) { setLoading(false); return setError('Failed to submit. Please try again.') }

    const tlPdfUrl = await uploadTradeLicense(app.id)
    await supabase.from('company_applications').update({
      tl_pdf_url: tlPdfUrl, tl_number: tlNumber || null, tl_expiry_date: tlExpiry || null,
    }).eq('id', app.id)

    // 2) companies PENDING row → so business portal opens limited dashboard
    const { error: ce } = await supabase.from('companies').insert({
      name: form.name,
      category: form.category,
      location: form.area,
      phone: form.phone,
      whatsapp: form.whatsapp || form.phone,
      email: form.email,
      owner_email: lower,
      description: form.description,
      slug,
      status: 'pending',
      plan: 'free',
      application_id: app.id,
    })
    // agar companies insert fail ho (column mismatch), application toh ho hi gayi — user ko success dikhao, error sirf log
    if (ce) console.error('companies pending insert error:', ce)

    setLoading(false); setSuccess(true)
  }

  const Header = ({ title }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-primary)', position: 'sticky', top: 0, zIndex: 100 }}>
      <button onClick={() => navigate('home')} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}><i className="ti ti-arrow-left" /></button>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{title}</span>
      <div style={{ width: 32 }} />
    </div>
  )

  if (checking) return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 30, height: 30, border: '3px solid var(--border-default)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (existing?.type === 'company') return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <Header title="Your Business" />
      <div style={{ textAlign: 'center', padding: '60px 24px' }}>
        <div style={{ fontSize: 52, color: 'var(--green)', marginBottom: 14 }}><i className="ti ti-circle-check" /></div>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{existing.name} is already listed!</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>Your business is live on TrustDubai. Manage everything from the business portal.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 300, margin: '0 auto' }}>
          <button onClick={() => window.open('https://business.trustdubai.ae', '_blank')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 24, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Open Business Portal →</button>
          {existing.slug && <button onClick={() => window.location.href = '/' + existing.slug} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 24, padding: '12px', fontSize: 14, cursor: 'pointer' }}>View Public Profile</button>}
        </div>
      </div>
    </div>
  )

  if (existing?.type === 'application') {
    const isRejected = (existing.status || '').toLowerCase() === 'rejected'
    return (
      <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
        <Header title="Application Status" />
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 52, color: isRejected ? 'var(--red)' : 'var(--primary)', marginBottom: 14 }}><i className={`ti ${isRejected ? 'ti-alert-triangle' : 'ti-clock-hour-4'}`} /></div>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{isRejected ? 'Application Needs Attention' : 'Application Under Review'}</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>{existing.company_name ? <b>{existing.company_name}</b> : 'Your application'} {isRejected ? 'was not approved.' : 'is being reviewed by our team.'}</p>
          {isRejected && existing.rejection_reason && <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: 'var(--red)', maxWidth: 340, margin: '0 auto 18px' }}>Reason: {existing.rejection_reason}</div>}
          {!isRejected && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>You can set up your profile in the portal now. You'll be notified by email once approved.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 300, margin: '0 auto' }}>
            <button onClick={() => window.open('https://business.trustdubai.ae', '_blank')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 24, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Go to Business Portal →</button>
            <button onClick={() => navigate('home')} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 24, padding: '12px', fontSize: 14, cursor: 'pointer' }}>Back to Home</button>
          </div>
        </div>
      </div>
    )
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '70px 20px', background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ fontSize: 52, color: 'var(--green)', marginBottom: 16 }}><i className="ti ti-circle-check" /></div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>Listing submitted!</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>We'll review your application and notify you on {form.email || form.phone}. Set up your profile in the portal now — it goes live once approved.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 300, margin: '0 auto' }}>
        <button onClick={() => window.open('https://business.trustdubai.ae', '_blank')} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 24, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Open Business Portal →</button>
        <button onClick={() => navigate('home')} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 24, padding: '12px', fontSize: 14, cursor: 'pointer' }}>Back to Home</button>
      </div>
    </div>
  )

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <Header title="List Your Business" />

      <div style={{ background: 'var(--primary)', padding: '20px 16px', color: '#fff', textAlign: 'center' }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, marginBottom: 6 }}>Get Found on TrustDubai</div>
        <p style={{ fontSize: 12, opacity: 0.85 }}>100% free — no credit card required</p>
      </div>

      {!customer && (
        <div style={{ margin: '14px 16px 0', padding: '12px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-info-circle" style={{ fontSize: 18, color: 'var(--primary)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>Sign in for faster tracking</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>Use the same email to manage your business later.</div>
          </div>
          <button onClick={() => signInWithGoogle()} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 20, padding: '7px 13px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Sign in</button>
        </div>
      )}

      <div style={{ padding: '16px 16px 0' }}>
        {[
          { icon: 'ti-star', title: 'Collect verified reviews', desc: 'Share your unique link with clients' },
          { icon: 'ti-photo', title: 'Showcase your portfolio', desc: 'Upload project photos to win more clients' },
          { icon: 'ti-users', title: 'Team profiles', desc: 'Your staff gets individual ratings too' },
        ].map(b => (
          <div key={b.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <i className={`ti ${b.icon}`} style={{ fontSize: 18, color: 'var(--primary)', marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{b.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{b.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {[
          { key: 'name', label: 'Company name *', placeholder: 'Your company name' },
          { key: 'area', label: 'Area / Location *', placeholder: 'e.g. Business Bay, JVC, Marina' },
          { key: 'phone', label: 'WhatsApp number *', placeholder: '+971 50 XXX XXXX' },
          { key: 'email', label: 'Email address *', placeholder: 'your@email.com' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>{f.label}</label>
            <input value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
              readOnly={f.key === 'email' && !!customer}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius)', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: (f.key === 'email' && customer) ? 'var(--bg-tertiary)' : 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          </div>
        ))}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>About your company</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description of your services..."
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius)', fontSize: 13, outline: 'none', minHeight: 70, resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Service category *</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius)', fontSize: 13, outline: 'none', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            <option value="">Select category</option>
            {['Interior Design','Renovation','AC Service','Plumbing','Cleaning','Painting','Electrical','Handyman'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 20, marginBottom: 8, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--primary)' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Trade License</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Optional but helps faster approval</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Trade License PDF</label>
          <label style={{ display: 'block', border: '1.5px dashed var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 14, textAlign: 'center', cursor: 'pointer', background: 'var(--bg-secondary)' }}>
            <i className="ti ti-file-text" style={{ fontSize: 22, color: 'var(--text-muted)' }} />
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{tlFile ? `✓ ${tlFile.name}` : 'Tap to upload PDF'}</p>
            <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => setTlFile(e.target.files[0])} />
          </label>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Trade License Number</label>
          <input value={tlNumber} onChange={e => setTlNumber(e.target.value)} placeholder="e.g. 1234567"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius)', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Trade License Expiry Date</label>
          <input type="date" value={tlExpiry} onChange={e => setTlExpiry(e.target.value)} min={new Date().toISOString().split('T')[0]}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius)', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
        </div>

        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{error}</p>}

        <button onClick={handleSubmit} disabled={loading}
          style={{ width: '100%', padding: 12, background: loading ? 'var(--text-muted)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 24, fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Submitting...' : 'Submit for Free Listing'}
        </button>
      </div>
    </div>
  )
}
