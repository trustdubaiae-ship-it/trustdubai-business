import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { Upload, AlertTriangle } from 'lucide-react'

export default function SettingsPage() {
  const { company, refreshCompany, signOut } = useAuth()
  const toast = useToast()
  const [notifs, setNotifs] = useState({
    newReview: company?.notif_new_review ?? true,
    newLead: company?.notif_new_lead ?? true,
    weeklyReport: company?.notif_weekly_report ?? false,
    planExpiry: company?.notif_plan_expiry ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [uploadingLicense, setUploadingLicense] = useState(false)

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

  const Toggle = ({ on, onChange }) => (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
  )

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Settings</h1>
        <p className="text-secondary" style={{ fontSize: 14 }}>Manage your account preferences</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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

        {/* Verification */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 6 }}>Trade License Verification</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              Submit your UAE trade license to get the <strong>Verified Business</strong> badge on your profile — builds trust and improves ranking.
            </div>

            {company?.trade_license_verified ? (
              <div style={{
                background: 'var(--green-light)', border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 8, padding: '12px 14px',
                display: 'flex', gap: 10, alignItems: 'center'
              }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: '#065f46' }}>Trade License Verified</div>
                  <div style={{ fontSize: 12, color: '#047857' }}>Your business is verified on TrustDubai</div>
                </div>
              </div>
            ) : company?.trade_license_pending ? (
              <div style={{
                background: 'var(--amber-light)', border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 8, padding: '12px 14px',
                display: 'flex', gap: 10, alignItems: 'center'
              }}>
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

          {/* Account info */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>Account Info</div>
            {[
              { label: 'Company ID', value: company?.id?.slice(0, 8).toUpperCase() || '—' },
              { label: 'Registered On', value: company?.created_at ? new Date(company.created_at).toLocaleDateString('en-AE') : '—' },
              { label: 'Current Plan', value: (company?.plan || 'free').charAt(0).toUpperCase() + (company?.plan || 'free').slice(1) },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid var(--card-border)',
                fontSize: 13.5
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Danger zone */}
          <div className="card" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <AlertTriangle size={16} color="var(--red)" />
              <div className="card-title" style={{ color: 'var(--red)' }}>Danger Zone</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Signing out will end your session. Contact TrustDubai support to deactivate or delete your account.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-danger btn-sm" onClick={signOut}>Sign Out</button>
              <a
                href="mailto:hello@trustdubai.ae?subject=Account deletion request"
                className="btn btn-ghost btn-sm"
                style={{ textDecoration: 'none', color: 'var(--red)' }}
              >
                Request Deletion
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
