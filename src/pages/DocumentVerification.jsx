// tritova-business/src/pages/DocumentVerification.jsx
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import PolicyAgree from '../components/PolicyAgree'

const BRAND = '#0099cc'
const GREEN = '#15803d'

const STATUS_BADGE = {
  pending:  { label: 'Pending Review', bg: '#fef3c7', fg: '#b45309', icon: 'ti-clock' },
  verified: { label: 'Verified',       bg: '#dcfce7', fg: '#15803d', icon: 'ti-circle-check' },
  rejected: { label: 'Rejected',       bg: '#fee2e2', fg: '#b91c1c', icon: 'ti-alert-triangle' },
}

export default function DocumentVerification() {
  const { company } = useAuth()
  const toast = useToast()
  const [docs, setDocs] = useState([])
  const [companyDocs, setCompanyDocs] = useState({})
  const [loading, setLoading] = useState(true)
  const [formDoc, setFormDoc] = useState(null)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    const { data: master } = await supabase
      .from('verification_documents').select('*').eq('is_active', true).order('display_order', { ascending: true })
    setDocs(master || [])
    const { data: cd } = await supabase
      .from('company_documents').select('*').eq('company_id', company.id)
    const map = {}
    ;(cd || []).forEach(d => { map[d.doc_key] = d })
    setCompanyDocs(map)
    setLoading(false)
  }

  function expiryInfo(dateStr) {
    if (!dateStr) return null
    const today = new Date(); today.setHours(0,0,0,0)
    const exp = new Date(dateStr); exp.setHours(0,0,0,0)
    const days = Math.round((exp - today) / 86400000)
    return { days, expired: days < 0 }
  }

  // auto-link check (companies columns)
  function autoVerified(doc) {
    if (doc.source_field === 'owner_eid_status') return company.owner_eid_status === 'verified'
    if (doc.source_field === 'phone_verified_at') return !!company.phone_verified_at
    if (doc.source_field === 'email_auto') return !!company.owner_email
    return false
  }

  // status of each doc (auto or uploaded)
  function docStatus(doc) {
    if (doc.source === 'company_column') {
      return autoVerified(doc) ? 'verified' : 'pending'
    }
    return companyDocs[doc.doc_key]?.status || 'not_uploaded'
  }

  const verifiedCount = docs.filter(d => docStatus(d) === 'verified').length
  const totalCount = docs.length
  const percent = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0

  if (loading) return <div className="page-content" style={{ textAlign:'center', padding:50 }}><div className="spinner" style={{ margin:'0 auto' }} /></div>

  return (
    <div className="page-content animate-in" style={{ maxWidth: 760 }}>
      {/* Score bar */}
      <div style={{ background:'var(--card-bg)', border:'1px solid var(--card-border)', borderRadius:14, padding:'16px 18px', marginBottom:18 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>Verification Score</span>
          <span style={{ fontSize:18, fontWeight:800, color: percent >= 75 ? GREEN : percent >= 40 ? '#d97706' : 'var(--text-muted)' }}>{percent}%</span>
        </div>
        <div style={{ height:10, borderRadius:99, background:'var(--bg2)', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${percent}%`, borderRadius:99, background: percent >= 75 ? 'linear-gradient(90deg,#1e9e63,#22c55e)' : 'linear-gradient(90deg,#0099cc,#22c55e)', transition:'width .5s' }} />
        </div>
        <div style={{ fontSize:11.5, color:'var(--text-muted)', marginTop:8 }}>{verifiedCount} of {totalCount} documents verified</div>
      </div>

      {/* Documents list */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {docs.map(doc => {
          const st = docStatus(doc)
          const cd = companyDocs[doc.doc_key]
          const isAuto = doc.source === 'company_column'
          const exp = cd?.doc_expiry ? expiryInfo(cd.doc_expiry) : null
          const badge = STATUS_BADGE[st] || null

          return (
            <div key={doc.doc_key} style={{ background:'var(--card-bg)', border:'1px solid var(--card-border)', borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
              <div style={{ width:42, height:42, borderRadius:11, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:19, background: st==='verified' ? 'rgba(34,197,94,0.12)' : 'var(--bg2)', color: st==='verified' ? GREEN : 'var(--text-muted)' }}>
                <i className={`ti ${st==='verified' ? 'ti-circle-check' : 'ti-file-text'}`} />
              </div>
              <div style={{ flex:1, minWidth:120 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)' }}>{doc.label}</div>
                <div style={{ fontSize:11.5, color:'var(--text-muted)', marginTop:2 }}>
                  {isAuto
                    ? (st === 'verified' ? '✓ Auto-verified from your profile' : 'Pending — complete in your profile/registration')
                    : (cd?.doc_number ? `No. ${cd.doc_number}` : 'Not uploaded yet')}
                  {exp && <span style={{ marginLeft:6, color: exp.expired ? 'var(--red)' : exp.days <= 30 ? '#d97706' : 'var(--text-muted)', fontWeight:600 }}>
                    {exp.expired ? '· Expired' : `· Expires in ${exp.days}d`}
                  </span>}
                </div>
              </div>
              {badge && (
                <span style={{ flexShrink:0, display:'inline-flex', alignItems:'center', gap:4, fontSize:10.5, fontWeight:600, padding:'3px 9px', borderRadius:99, background:badge.bg, color:badge.fg }}>
                  <i className={`ti ${badge.icon}`} style={{ fontSize:12 }} /> {badge.label}
                </span>
              )}
              {!isAuto && (
                <button onClick={() => setFormDoc(doc)} style={{ flexShrink:0, padding:'7px 14px', borderRadius:8, border:'none', background: cd ? 'var(--bg2)' : BRAND, color: cd ? 'var(--text-primary)' : '#fff', fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                  {cd ? 'Update' : 'Upload'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {formDoc && (
        <DocForm
          company={company}
          doc={formDoc}
          existing={companyDocs[formDoc.doc_key]}
          onClose={() => setFormDoc(null)}
          onSaved={() => { setFormDoc(null); load() }}
        />
      )}
    </div>
  )
}

/* ---------- Upload / Update Document Modal ---------- */
function DocForm({ company, doc, existing, onClose, onSaved }) {
  const toast = useToast()
  const [docNumber, setDocNumber] = useState(existing?.doc_number || '')
  const [docExpiry, setDocExpiry] = useState(existing?.doc_expiry || '')
  const [fileUrl, setFileUrl] = useState(existing?.file_url || '')
  const [uploading, setUploading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef()

  async function onFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `documents/${company.id}/${doc.doc_key}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('company-assets').upload(path, file)
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('company-assets').getPublicUrl(path)
      setFileUrl(publicUrl)
    } catch (e) { toast.error('Upload failed') }
    setUploading(false)
  }

  async function submit() {
    setError('')
    if (!docNumber.trim()) { setError('Document number is required'); return }
    if (!docExpiry) { setError('Expiry date is required'); return }
    if (!fileUrl) { setError('Please upload the document file'); return }
    if (!agreed) { setError('Please confirm and agree to the Quvera Policy'); return }
    setSaving(true)
    const payload = {
      company_id: company.id,
      doc_key: doc.doc_key,
      file_url: fileUrl,
      doc_number: docNumber.trim(),
      doc_expiry: docExpiry,
      status: 'pending',
      verified_at: null,
      verified_by: null,
    }
    const { error: err } = await supabase.from('company_documents').upsert(payload, { onConflict: 'company_id,doc_key' })
    setSaving(false)
    if (err) { setError(err.message); return }
    toast.success('Document submitted — pending verification')
    onSaved()
  }

  const isPdf = fileUrl && fileUrl.toLowerCase().endsWith('.pdf')

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--card-bg)', borderRadius:16, width:'100%', maxWidth:440, padding:22, maxHeight:'92vh', overflowY:'auto' }}>
        <h3 style={{ fontWeight:700, color:'var(--text-primary)', marginTop:0, marginBottom:16, fontSize:17 }}>{doc.label}</h3>

        <label style={lbl}>Document Number *</label>
        <input value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="Enter document number" style={inp} />

        <label style={lbl}>Expiry Date *</label>
        <input type="date" value={docExpiry || ''} onChange={e => setDocExpiry(e.target.value)} style={inp} />

        <label style={lbl}>Document File * (image / PDF)</label>
        <div onClick={() => fileRef.current?.click()} style={{ border:'1.5px dashed var(--card-border)', borderRadius:10, padding:'14px', textAlign:'center', cursor:'pointer', marginTop:4, marginBottom:14, background:'var(--bg2)' }}>
          {uploading ? <div className="spinner" style={{ margin:'0 auto' }} /> : fileUrl ? (
            isPdf
              ? <span style={{ fontSize:12.5, color:GREEN, fontWeight:600 }}><i className="ti ti-file-check" /> PDF uploaded — click to change</span>
              : <img src={fileUrl} alt="" style={{ maxHeight:120, maxWidth:'100%', borderRadius:8 }} />
          ) : (
            <span style={{ fontSize:12.5, color:'var(--text-muted)' }}><i className="ti ti-upload" /> Click to upload (max 5MB)</span>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={onFile} />

        <div style={{ background:'var(--bg2)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
          <PolicyAgree checked={agreed} onChange={setAgreed} />
        </div>

        {error && <p style={{ fontSize:12, color:'var(--red)', marginBottom:12 }}>{error}</p>}

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:11, borderRadius:9, border:'1px solid var(--card-border)', background:'var(--card-bg)', color:'var(--text-primary)', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={saving || uploading} style={{ flex:1, padding:11, borderRadius:9, border:'none', background:BRAND, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity:(saving||uploading)?0.5:1 }}>
            {saving ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

const lbl = { fontSize: 12, color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }
const inp = { width: '100%', marginTop: 4, marginBottom: 14, border: '1px solid var(--card-border)', borderRadius: 9, padding: '9px 12px', fontSize: 13, boxSizing: 'border-box', background: 'var(--card-bg)', color: 'var(--text-primary)', outline: 'none' }
