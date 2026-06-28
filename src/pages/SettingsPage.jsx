import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { Upload } from 'lucide-react'
import { LANGS, LANG_KEY } from '../components/VoiceAssistant'

export default function SettingsPage() {
  const { company, refreshCompany, signOut } = useAuth()
  const toast = useToast()
  const [voiceLang, setVoiceLang] = useState(() => { try { return localStorage.getItem(LANG_KEY) || 'en-US' } catch { return 'en-US' } })
  const [notifs, setNotifs] = useState({
    newReview: company?.notif_new_review ?? true,
    newLead: company?.notif_new_lead ?? true,
    weeklyReport: company?.notif_weekly_report ?? false,
    planExpiry: company?.notif_plan_expiry ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [uploadingLicense, setUploadingLicense] = useState(false)
  const [slug, setSlug] = useState(company?.slug || '')
  const [slugStatus, setSlugStatus] = useState(null)
  const [savingSlug, setSavingSlug] = useState(false)

  // Check if within 30 days of registration
  const registeredAt = company?.created_at ? new Date(company.created_at) : null
  const daysSinceRegistration = registeredAt
    ? Math.floor((new Date() - registeredAt) / (1000 * 60 * 60 * 24))
    : 999
  const canChangeSlug = daysSinceRegistration <= 30
  const daysLeft = Math.max(0, 30 - daysSinceRegistration)
  const slugLocked = company?.slug && !canChangeSlug

  async function saveNotifications() {
    setSaving(true)
    try {
      await supabase.from('companies').update({
        notif_new_review: notifs.newReview,
        notif_new_lead: notifs.newLead,
        notif_weekly_report: notifs.weeklyReport,
        notif_plan_expiry: notifs.planExpiry,
      }).eq('id', company.id)
      await refreshCompany()
      toast.success('Settings saved!')
    } catch (e) {
      toast.error('Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  async function uploadLicense(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLicense(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `licenses/${company.id}.${ext}`
      const { error } = await supabase.storage.from('company-assets').upload(path, file, { upsert: true })
      if (error) throw error
      await supabase.from('companies').update({
        trade_license_pending: true,
        trade_license_uploaded_at: new Date().toISOString()
      }).eq('id', company.id)
      await refreshCompany()
      toast.success('Trade license submitted for review!')
    } catch (e) {
      toast.error('Upload failed: ' + e.message)
    } finally {
      setUploadingLicense(false)
    }
  }

  function formatSlug(val) {
    return val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '')
  }

  async function checkSlug(val) {
    if (slugLocked) return
    const formatted = formatSlug(val)
    setSlug(formatted)
    if (!formatted || formatted === company?.slug) { setSlugStatus(null); return }
    if (formatted.length < 3) { setSlugStatus('short'); return }
    setSlugStatus('checking')
    const { data } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', formatted)
      .neq('id', company.id)
      .single()
    setSlugStatus(data ? 'taken' : 'available')
  }

  async function saveSlug() {
    if (slugStatus !== 'available' || slugLocked) return
    setSavingSlug(true)
    try {
      await supabase.from('companies').update({ slug }).eq('id', company.id)
      await refreshCompany()
      setSlugStatus('saved')
      toast.success('Username saved!')
    } catch (e) {
      toast.error('Could not save username')
    } finally {
      setSavingSlug(false)
    }
  }

  const Toggle = ({ on, onChange }) => (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
  )

  const slugStatusColor = {
    checking: '#f59e0b',
    available: '#10b981',
    taken: '#ef4444',
    saved: '#10b981',
    short: '#f59e0b',
  }

  const slugStatusText = {
    checking: 'Checking availability...',
    available: '✓ Available — click Save to confirm',
    taken: '✗ Already taken — try another',
    saved: '✓ Saved successfully',
    short: 'Minimum 3 characters required',
  }

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Settings</h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>Manage your account preferences</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* Voice Assistant language */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>Voice Assistant</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
            The language you speak to the AI Core in. It listens and speaks back in this language; replies always follow the language you actually use.
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Assistant language</label>
          <select value={voiceLang} onChange={e => { setVoiceLang(e.target.value); try { localStorage.setItem(LANG_KEY, e.target.value) } catch {} ; toast.success('Assistant language saved ✓') }}
            style={{ width: '100%', maxWidth: 320, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--card-border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none' }}>
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>

        {/* Notifications */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 18 }}>Notifications</div>
          {[
            { key: 'newReview', label: 'New review received', desc: 'Get notified when a customer leaves a review' },
            { key: 'newLead', label: 'New lead generated', desc: 'Get notified when someone contacts via your profile' },
            { key: 'weeklyReport', label: 'Weekly performance report', desc: 'Summary of your profile activity every Monday' },
            { key: 'planExpiry', label: 'Plan expiry reminders', desc: 'Reminders before your plan expires' },
          ].map(({ key, label, desc }) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 0', borderBottom: '1px solid var(--card-border)'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
              </div>
              <Toggle on={notifs[key]} onChange={val => setNotifs(prev => ({ ...prev, [key]: val }))} />
            </div>
          ))}
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={saveNotifications} disabled={saving}>
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Username / Profile URL */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div className="card-title">Profile Username</div>
              {slugLocked ? (
                <span style={{ fontSize: 11, background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>🔒 Locked</span>
              ) : (
                <span style={{ fontSize: 11, background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>
                  {daysLeft} days left to change
                </span>
              )}
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
              Your public profile URL:<br />
              <strong style={{ color: '#03C1F5' }}>quvera.ae/company/{slug || 'your-username'}</strong>
            </div>

            {slugLocked ? (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', border: '1px solid var(--card-border)',
                  borderRadius: 8, overflow: 'hidden', opacity: 0.7
                }}>
                  <span style={{ padding: '9px 10px', background: 'var(--bg-secondary)', fontSize: 12, color: 'var(--text-muted)', borderRight: '1px solid var(--card-border)', whiteSpace: 'nowrap' }}>
                    quvera.ae/company/
                  </span>
                  <span style={{ flex: 1, minWidth: 0, padding: '9px 10px', fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {company?.slug}
                  </span>
                  <span style={{ padding: '9px 10px', fontSize: 16 }}>🔒</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  Username is permanently locked. To request a change, contact{' '}
                  <a href="mailto:hello@quvera.ae?subject=Username change request" style={{ color: '#03C1F5' }}>
                    hello@quvera.ae
                  </a>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--card-border)', borderRadius: 8, overflow: 'hidden' }}>
                      <span style={{ padding: '9px 10px', background: 'var(--bg-secondary)', fontSize: 12, color: 'var(--text-muted)', borderRight: '1px solid var(--card-border)', whiteSpace: 'nowrap' }}>
                        quvera.ae/company/
                      </span>
                      <input
                        value={slug}
                        onChange={e => checkSlug(e.target.value)}
                        placeholder="your-company"
                        style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', padding: '9px 10px', fontSize: 13, background: 'transparent' }}
                      />
                    </div>
                    {slugStatus && (
                      <div style={{ fontSize: 12, color: slugStatusColor[slugStatus], marginTop: 5 }}>
                        {slugStatusText[slugStatus]}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={saveSlug}
                    disabled={slugStatus !== 'available' || savingSlug}
                    style={{ whiteSpace: 'nowrap', marginTop: 1 }}
                  >
                    {savingSlug ? 'Saving...' : 'Save'}
                  </button>
                </div>
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(245,158,11,0.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)' }}>
                  <div style={{ fontSize: 12, color: '#92400e' }}>
                    ⚠️ You have <strong>{daysLeft} days</strong> to set or change your username. After that it will be permanently locked.
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(3,193,245,0.06)', borderRadius: 8, border: '1px solid rgba(3,193,245,0.15)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                🔒 <strong>Public profile page</strong> activation coming soon with paid plans. Reserve your username now for free.
              </div>
            </div>
          </div>

          {/* Verification */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 6 }}>Trade License Verification</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              Submit your UAE trade license to get the <strong>Verified Business</strong> badge on your profile.
            </div>
            {company?.trade_license_verified ? (
              <div style={{ background: 'var(--green-light)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: '#065f46' }}>Trade License Verified</div>
                  <div style={{ fontSize: 12, color: '#047857' }}>Your business is verified on Quvera</div>
                </div>
              </div>
            ) : company?.trade_license_pending ? (
              <div style={{ background: 'var(--amber-light)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>⏳</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: '#92400e' }}>Under Review</div>
                  <div style={{ fontSize: 12, color: '#b45309' }}>We'll verify within 1-2 business days</div>
                </div>
              </div>
            ) : (
              <label style={{ cursor: 'pointer' }}>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={uploadLicense} style={{ display: 'none' }} />
                <div className="upload-zone" style={{ padding: 24 }}>
                  {uploadingLicense ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div className="spinner" />
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Uploading...</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <Upload size={24} color="var(--text-muted)" />
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Upload Trade License</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PDF, JPG, PNG · Max 10MB</div>
                    </div>
                  )}
                </div>
              </label>
            )}
          </div>

          {/* Account Info */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Account Info</div>
            {[
              { label: 'Company ID', value: company?.id?.slice(0, 8).toUpperCase() || '—' },
              { label: 'Registered On', value: company?.created_at ? new Date(company.created_at).toLocaleDateString('en-AE') : '—' },
              { label: 'Current Plan', value: (company?.plan || 'free').charAt(0).toUpperCase() + (company?.plan || 'free').slice(1) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--card-border)', fontSize: 13.5 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontWeight: 500 }}>{value}</span>
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
            </div>
          </div>

          {/* Policy Note */}
          <div className="card" style={{ border: '1px solid rgba(3,193,245,0.2)', background: 'rgba(3,193,245,0.04)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Our Platform Policy</strong><br />
              Quvera is built on trust and transparency. Once registered, your company profile remains permanent — your reputation is built through customer reviews.<br /><br />
              Contact us at <a href="mailto:hello@quvera.ae" style={{ color: '#03C1F5' }}>hello@quvera.ae</a>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
