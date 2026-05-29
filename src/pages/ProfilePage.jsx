import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { Camera, Save, Globe, Phone, Mail, MapPin, Tag, AlertTriangle, X } from 'lucide-react'

const CATEGORIES = [
  'Construction & Renovation', 'Interior Design', 'Electrical', 'Plumbing',
  'HVAC & AC', 'Painting', 'Flooring', 'Kitchen & Bath', 'Landscaping',
  'Security Systems', 'IT & Technology', 'Cleaning Services', 'Movers & Storage',
  'Legal Services', 'Real Estate', 'Healthcare', 'Education', 'Automotive',
  'Food & Restaurant', 'Retail', 'Finance & Accounting', 'Other'
]

const PLAN_CAT_LIMITS = {
  free:     2,
  silver:   10,
  gold:     Infinity,
  platinum: Infinity,
}

export default function ProfilePage() {
  const { company, refreshCompany } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', phone: '', email: '', website: '',
    location: '', categories: [], tagline: '',
    whatsapp: '', instagram: '', facebook: '', linkedin: ''
  })

  const plan = company?.plan || 'free'
  const catLimit = PLAN_CAT_LIMITS[plan] || 2

  useEffect(() => {
    if (company) {
      // Support both old single 'category' and new 'categories' array
      let cats = []
      if (Array.isArray(company.categories) && company.categories.length > 0) {
        cats = company.categories
      } else if (company.category) {
        cats = [company.category]
      }
      setForm({
        name: company.name || '',
        description: company.description || '',
        phone: company.phone || '',
        email: company.email || '',
        website: company.website || '',
        location: company.location || '',
        categories: cats,
        tagline: company.tagline || '',
        whatsapp: company.whatsapp || '',
        instagram: company.instagram || '',
        facebook: company.facebook || '',
        linkedin: company.linkedin || '',
      })
    }
  }, [company])

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function addCategory(cat) {
    if (!cat) return
    if (form.categories.includes(cat)) return
    if (form.categories.length >= catLimit) {
      toast.error(`Your ${plan} plan allows max ${catLimit === Infinity ? 'unlimited' : catLimit} categories`)
      return
    }
    setForm(prev => ({ ...prev, categories: [...prev.categories, cat] }))
  }

  function removeCategory(cat) {
    setForm(prev => ({ ...prev, categories: prev.categories.filter(c => c !== cat) }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Company name is required'); return }
    if (form.categories.length === 0) { toast.error('Select at least one category'); return }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: form.name,
          description: form.description,
          phone: form.phone,
          email: form.email,
          website: form.website,
          location: form.location,
          category: form.categories[0] || '',       // Keep for backward compat
          categories: form.categories,              // New array field
          tagline: form.tagline,
          whatsapp: form.whatsapp,
          instagram: form.instagram,
          facebook: form.facebook,
          linkedin: form.linkedin,
          updated_at: new Date().toISOString()
        })
        .eq('id', company.id)

      if (error) throw error
      await refreshCompany()
      toast.success('Profile saved successfully!')
    } catch (e) {
      toast.error('Failed to save: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return }
    setUploadingLogo(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `logos/${company.id}.${ext}`
      const { error: uploadError } = await supabase.storage.from('company-assets').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('company-assets').getPublicUrl(path)
      await supabase.from('companies').update({ logo_url: publicUrl }).eq('id', company.id)
      await refreshCompany()
      toast.success('Logo uploaded!')
    } catch (e) {
      toast.error('Upload failed: ' + e.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  const planLimitLabel = catLimit === Infinity ? 'Unlimited' : catLimit

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Company Profile</h1>
          <p className="text-secondary" style={{ fontSize: 14 }}>Manage how your business appears on TrustDubai</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} />Saving...</> : <><Save size={15} />Save Changes</>}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Logo & Basic Info */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 18 }}>Brand Identity</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
              <label style={{ cursor: 'pointer', position: 'relative' }}>
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                <div className="avatar-upload">
                  {uploadingLogo ? <div className="spinner" /> : company?.logo_url ? <img src={company.logo_url} alt="Logo" /> : (
                    <div style={{ textAlign: 'center' }}>
                      <Camera size={22} color="var(--text-muted)" />
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Logo</div>
                    </div>
                  )}
                </div>
                <div style={{ position: 'absolute', bottom: -6, right: -6, width: 22, height: 22, background: 'var(--gold)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>
                  <Camera size={11} color="#0d1117" />
                </div>
              </label>
              <div style={{ flex: 1 }}>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Company Name *</label>
                  <input className="form-input" value={form.name} onChange={e => handleChange('name', e.target.value)} placeholder="Your Company Name LLC" style={{ borderColor: !form.name.trim() ? '#fcd34d' : undefined }} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6, padding: '7px 10px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, fontSize: 11.5, color: '#92400e', lineHeight: 1.5 }}>
                    <AlertTriangle size={12} color="#d97706" style={{ marginTop: 1, flexShrink: 0 }} />
                    <span>Enter your company name <strong>exactly as it appears on your Trade License</strong>. This is required for verification.</span>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tagline</label>
                  <input className="form-input" value={form.tagline} onChange={e => handleChange('tagline', e.target.value)} placeholder="e.g. Dubai's most trusted contractor" />
                </div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Business Description</label>
              <textarea className="form-input" value={form.description} onChange={e => handleChange('description', e.target.value)} placeholder="Describe your business, services, experience..." style={{ minHeight: 110 }} />
            </div>

            {/* CATEGORIES — Multi-select with plan limit */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  <Tag size={11} style={{ marginRight: 4 }} />Business Categories
                </label>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                  background: form.categories.length >= catLimit && catLimit !== Infinity ? 'rgba(239,68,68,0.1)' : 'rgba(3,193,245,0.1)',
                  color: form.categories.length >= catLimit && catLimit !== Infinity ? '#ef4444' : '#03C1F5'
                }}>
                  {form.categories.length}/{planLimitLabel}
                </span>
              </div>

              {/* Selected categories */}
              {form.categories.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {form.categories.map(cat => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(3,193,245,0.1)', border: '1px solid rgba(3,193,245,0.3)', borderRadius: 99, padding: '3px 10px 3px 10px', fontSize: 12, color: '#03C1F5', fontWeight: 500 }}>
                      {cat}
                      <button onClick={() => removeCategory(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#03C1F5', opacity: 0.7 }}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add category dropdown */}
              {(form.categories.length < catLimit || catLimit === Infinity) && (
                <select
                  className="form-input"
                  value=""
                  onChange={e => { addCategory(e.target.value); e.target.value = '' }}
                >
                  <option value="">+ Add a category...</option>
                  {CATEGORIES.filter(c => !form.categories.includes(c)).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}

              {/* Plan limit message */}
              {form.categories.length >= catLimit && catLimit !== Infinity && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(232,184,75,0.1)', border: '1px solid rgba(232,184,75,0.3)', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                  ⚡ Upgrade your plan to add more categories.
                  <span style={{ color: '#e8b84b', fontWeight: 600, marginLeft: 4 }}>
                    Silver: 10 · Gold: Unlimited · Platinum: Unlimited
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 18 }}>Location</div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label"><MapPin size={11} style={{ marginRight: 4 }} />Business Location / Area</label>
              <input className="form-input" value={form.location} onChange={e => handleChange('location', e.target.value)} placeholder="e.g. Business Bay, Dubai" />
            </div>
          </div>

          {/* Social */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 18 }}>Social Media</div>
            {[
              { field: 'instagram', label: 'Instagram', placeholder: '@yourcompany' },
              { field: 'facebook', label: 'Facebook', placeholder: 'facebook.com/yourpage' },
              { field: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/company/...' },
            ].map(({ field, label, placeholder }) => (
              <div key={field} className="form-group">
                <label className="form-label">{label}</label>
                <input className="form-input" value={form[field]} onChange={e => handleChange(field, e.target.value)} placeholder={placeholder} />
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Contact */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 18 }}>Contact Information</div>
            {[
              { field: 'phone', label: 'Phone Number', icon: Phone, placeholder: '+971 50 000 0000' },
              { field: 'whatsapp', label: 'WhatsApp Number', icon: Phone, placeholder: '+971 50 000 0000' },
              { field: 'email', label: 'Business Email', icon: Mail, placeholder: 'info@yourcompany.ae' },
              { field: 'website', label: 'Website', icon: Globe, placeholder: 'https://yourcompany.ae' },
            ].map(({ field, label, icon: Icon, placeholder }) => (
              <div key={field} className="form-group">
                <label className="form-label"><Icon size={11} style={{ marginRight: 4 }} />{label}</label>
                <input className="form-input" value={form[field]} onChange={e => handleChange(field, e.target.value)} placeholder={placeholder} />
              </div>
            ))}
          </div>

          {/* Preview Card */}
          <div className="card" style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--sidebar-border)' }}>
            <div className="card-title" style={{ color: 'white', marginBottom: 16, fontSize: 13 }}>
              📱 Public Profile Preview
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: company?.logo_url ? 'none' : 'rgba(232,184,75,0.15)', border: '1px solid rgba(232,184,75,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontFamily: "'Syne', sans-serif", fontWeight: 700, color: '#e8b84b', fontSize: 16 }}>
                  {company?.logo_url ? <img src={company.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (form.name?.[0] || '?')}
                </div>
                <div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, color: 'white', fontSize: 15 }}>{form.name || 'Company Name'}</div>
                  <div style={{ fontSize: 12, color: '#6e7681' }}>{form.tagline || 'Your tagline here'}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#8b949e', lineHeight: 1.6, marginBottom: 10 }}>
                {(form.description || 'Your description will appear here...').slice(0, 100)}...
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {form.categories.map(cat => (
                  <span key={cat} style={{ background: 'rgba(232,184,75,0.1)', color: '#e8b84b', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, border: '1px solid rgba(232,184,75,0.2)' }}>{cat}</span>
                ))}
                {form.location && <span style={{ background: 'rgba(255,255,255,0.05)', color: '#8b949e', fontSize: 10, padding: '2px 8px', borderRadius: 99 }}>📍 {form.location}</span>}
              </div>
            </div>
          </div>

          {/* Verification status */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Verification Status</div>
            {[
              { label: 'Trade License', done: company?.trade_license_verified, tip: 'Upload via Settings' },
              { label: 'Email Verified', done: true, tip: 'Verified via Google' },
              { label: 'Phone Verified', done: company?.phone_verified, tip: 'Contact support' },
            ].map(({ label, done, tip }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--card-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: done ? 'var(--green)' : '#d1d5db' }} />
                  <span style={{ fontSize: 13.5 }}>{label}</span>
                </div>
                <span className={`badge ${done ? 'badge-green' : 'badge-gray'}`}>{done ? 'Verified' : tip}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
