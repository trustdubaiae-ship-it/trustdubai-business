// trustdubai-business/src/pages/TeamMembers.jsx
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import PolicyAgree from '../components/PolicyAgree'

const BRAND = '#0099cc'

const EID_BADGE = {
  pending:  { label: 'Verification Pending', bg: '#fef3c7', fg: '#b45309', icon: 'ti-clock' },
  verified: { label: 'EID Verified',         bg: '#dcfce7', fg: '#15803d', icon: 'ti-shield-check' },
  rejected: { label: 'Verification Rejected', bg: '#fee2e2', fg: '#b91c1c', icon: 'ti-alert-triangle' },
}

// UAE Emirates ID: 784-YYYY-NNNNNNN-N  (15 digits)
function formatEid(raw) {
  const d = (raw || '').replace(/\D/g, '').slice(0, 15)
  const p = [d.slice(0, 3), d.slice(3, 7), d.slice(7, 14), d.slice(14, 15)].filter(Boolean)
  return p.join('-')
}
function eidDigits(raw) { return (raw || '').replace(/\D/g, '') }

export default function TeamMembers() {
  const { company, getLimit } = useAuth()
  const toast = useToast()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const rawLimit = getLimit ? getLimit('team_members') : 1
  const isUnlimited = rawLimit >= 999
  const limit = isUnlimited ? Infinity : (rawLimit || 0)
  const limitLabel = isUnlimited ? '∞' : limit
  const isAtLimit = members.length >= limit

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('team_members')
      .select('*')
      .eq('company_id', company.id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
    setMembers(data || [])
    setLoading(false)
  }

  function openAdd() {
    if (isAtLimit) { toast.error(`Team limit reached (${limitLabel}). Upgrade your plan to add more.`); return }
    setEditing(null); setShowForm(true)
  }
  function openEdit(m) { setEditing(m); setShowForm(true) }

  async function deleteMember(m) {
    if (!confirm(`Remove ${m.name} from your team?`)) return
    for (const url of [m.photo_url, m.eid_url, m.eid_back_url]) {
      if (url) {
        try {
          const path = url.split('/company-assets/')[1]
          if (path) await supabase.storage.from('company-assets').remove([path])
        } catch (e) {}
      }
    }
    await supabase.from('team_members').delete().eq('id', m.id)
    setMembers(prev => prev.filter(x => x.id !== m.id))
    toast.success('Team member removed')
  }

  // days to expiry
  function expiryInfo(dateStr) {
    if (!dateStr) return null
    const today = new Date(); today.setHours(0,0,0,0)
    const exp = new Date(dateStr); exp.setHours(0,0,0,0)
    const days = Math.round((exp - today) / 86400000)
    return { days, expired: days < 0 }
  }

  return (
    <div className="page-content animate-in" style={{ maxWidth: 860 }}>
      <style>{`
        .tm-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
        @media (max-width:640px){ .tm-grid{ grid-template-columns:1fr; } }
      `}</style>

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize:24, marginBottom:4 }}>Our Team</h1>
          <p className="text-secondary" style={{ fontSize:14 }}>Add your client-facing team. EID-verified members build customer trust.</p>
        </div>
        <button onClick={openAdd} disabled={isAtLimit}
          style={{ padding:'9px 16px', borderRadius:9, border:'none', color:'#fff', fontWeight:600, fontSize:13, cursor: isAtLimit?'not-allowed':'pointer', opacity: isAtLimit?0.45:1, background:BRAND }}>
          + Add Member
        </button>
      </div>

      <div style={{ background:'var(--card-bg)', border:'1px solid var(--card-border)', borderRadius:10, padding:'10px 16px', marginBottom:18, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:12, color:'var(--gold-dark)', fontWeight:600, textTransform:'capitalize' }}>
          {company?.plan || 'free'} Plan: {limitLabel} team member{limitLabel !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize:12, color: isAtLimit ? 'var(--red)' : 'var(--text-muted)', fontWeight: isAtLimit?600:400 }}>
          {members.length} / {limitLabel} {isAtLimit && '· Limit reached'}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:50 }}><div className="spinner" style={{ margin:'0 auto' }} /></div>
      ) : members.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">👥</div>
          <h3>No team members yet</h3>
          <p>Add your designers, engineers and key people. Verified members appear on your public profile.</p>
        </div>
      ) : (
        <div className="tm-grid">
          {members.map(m => {
            const badge = EID_BADGE[m.eid_status] || EID_BADGE.pending
            const exp = expiryInfo(m.eid_expiry)
            return (
              <div key={m.id} style={{ background:'var(--card-bg)', border:'1px solid var(--card-border)', borderRadius:14, padding:14, display:'flex', gap:12 }}>
                <div style={{ width:56, height:56, borderRadius:12, background: m.photo_url ? 'transparent' : BRAND, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:20, flexShrink:0, overflow:'hidden' }}>
                  {m.photo_url ? <img src={m.photo_url} alt={m.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (m.name?.[0]?.toUpperCase() || '?')}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontWeight:700, color:'var(--text-primary)', fontSize:15, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.name}</span>
                    {m.is_verified && <i className="ti ti-rosette-discount-check-filled" style={{ color:'#15803d', fontSize:16 }} title="EID Verified" />}
                  </div>
                  <div style={{ fontSize:12.5, color:'var(--text-secondary)', marginTop:1 }}>{m.role || '—'}</div>
                  {m.avg_rating > 0 && (
                    <div style={{ fontSize:12, color:'var(--gold-dark)', marginTop:3 }}>
                      {'★'.repeat(Math.round(m.avg_rating))}<span style={{ color:'var(--text-muted)' }}> {m.avg_rating} ({m.total_ratings})</span>
                    </div>
                  )}
                  <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:4, fontSize:10.5, fontWeight:600, padding:'2px 8px', borderRadius:99, background:badge.bg, color:badge.fg }}>
                    <i className={`ti ${badge.icon}`} style={{ fontSize:12 }} /> {badge.label}
                  </div>
                  {exp && (
                    <div style={{ fontSize:10.5, marginTop:5, fontWeight:600, color: exp.expired ? 'var(--red)' : exp.days <= 30 ? '#b45309' : 'var(--text-muted)' }}>
                      {exp.expired ? '⚠ EID expired' : `EID expires in ${exp.days} day${exp.days !== 1 ? 's' : ''}`}
                    </div>
                  )}
                  <div style={{ marginTop:8, display:'flex', gap:10 }}>
                    <button onClick={() => openEdit(m)} style={{ fontSize:12, color:BRAND, fontWeight:600, background:'none', border:'none', cursor:'pointer', padding:0 }}>Edit</button>
                    <button onClick={() => deleteMember(m)} style={{ fontSize:12, color:'var(--red)', fontWeight:600, background:'none', border:'none', cursor:'pointer', padding:0 }}>Remove</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <MemberForm
          company={company}
          member={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

/* ---------- Add / Edit Member Modal ---------- */
function MemberForm({ company, member, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!member
  const [name, setName] = useState(member?.name || '')
  const [role, setRole] = useState(member?.role || '')
  const [memberType, setMemberType] = useState(member?.member_type || 'professional')
  const [bio, setBio] = useState(member?.bio || '')
  const [exp, setExp] = useState(member?.experience_years || 0)
  const [eidNumber, setEidNumber] = useState(member?.eid_number || '')
  const [eidExpiry, setEidExpiry] = useState(member?.eid_expiry || '')
  const [photoUrl, setPhotoUrl] = useState(member?.photo_url || '')
  const [eidFront, setEidFront] = useState(member?.eid_url || '')
  const [eidBack, setEidBack] = useState(member?.eid_back_url || '')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingFront, setUploadingFront] = useState(false)
  const [uploadingBack, setUploadingBack] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const photoRef = useRef()
  const frontRef = useRef()
  const backRef = useRef()

  async function uploadFile(file, kind) {
    const ext = file.name.split('.').pop()
    const path = `team/${company.id}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('company-assets').upload(path, file)
    if (upErr) throw upErr
    const { data: { publicUrl } } = supabase.storage.from('company-assets').getPublicUrl(path)
    return publicUrl
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Photo must be an image'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return }
    setUploadingPhoto(true)
    try { setPhotoUrl(await uploadFile(file, 'photo')) } catch (e) { toast.error('Photo upload failed') }
    setUploadingPhoto(false)
  }
  async function onEidFront(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return }
    setUploadingFront(true)
    try { setEidFront(await uploadFile(file, 'eid-front')) } catch (e) { toast.error('Upload failed') }
    setUploadingFront(false)
  }
  async function onEidBack(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return }
    setUploadingBack(true)
    try { setEidBack(await uploadFile(file, 'eid-back')) } catch (e) { toast.error('Upload failed') }
    setUploadingBack(false)
  }

  async function submit() {
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    if (eidDigits(eidNumber).length !== 15) { setError('Emirates ID number must be 15 digits (784-XXXX-XXXXXXX-X)'); return }
    if (!eidExpiry) { setError('EID expiry date is required'); return }
    if (!eidFront) { setError('EID front photo is required'); return }
    if (!eidBack) { setError('EID back photo is required'); return }
    if (!agreed) { setError('Please confirm and agree to the TrustDubai Policy'); return }
    setSaving(true)
    const payload = {
      company_id: company.id,
      name: name.trim(),
      role: role.trim() || null,
      member_type: memberType,
      bio: bio.trim() || null,
      experience_years: parseInt(exp) || 0,
      eid_number: formatEid(eidNumber),
      eid_expiry: eidExpiry,
      photo_url: photoUrl || null,
      eid_url: eidFront,
      eid_back_url: eidBack,
    }
    let err
    if (isEdit) {
      const frontChanged = eidFront !== member.eid_url
      const backChanged = eidBack !== member.eid_back_url
      const numChanged = formatEid(eidNumber) !== member.eid_number
      const expChanged = eidExpiry !== member.eid_expiry
      if (frontChanged || backChanged || numChanged || expChanged) {
        payload.eid_status = 'pending'; payload.is_verified = false; payload.verified_at = null; payload.verified_by = null
      }
      ;({ error: err } = await supabase.from('team_members').update(payload).eq('id', member.id))
    } else {
      payload.eid_status = 'pending'
      ;({ error: err } = await supabase.from('team_members').insert(payload))
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    toast.success(isEdit ? 'Member updated' : 'Member added — pending EID verification')
    onSaved()
  }

  const eidBoxStyle = {
    position: 'relative', width: '100%', aspectRatio: '1.586 / 1', borderRadius: 10,
    border: '1.5px dashed var(--card-border)', background: 'var(--bg2)', overflow: 'hidden',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--card-bg)', borderRadius:16, width:'100%', maxWidth:480, padding:22, maxHeight:'92vh', overflowY:'auto' }}>
        <h3 style={{ fontWeight:700, color:'var(--text-primary)', marginTop:0, marginBottom:16, fontSize:17 }}>{isEdit ? 'Edit Team Member' : 'Add Team Member'}</h3>

        {/* Photo */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
          <div onClick={() => photoRef.current?.click()} style={{ width:70, height:70, borderRadius:14, background: photoUrl ? 'transparent' : 'var(--bg2)', border:'1.5px dashed var(--card-border)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', overflow:'hidden', flexShrink:0 }}>
            {uploadingPhoto ? <div className="spinner" /> : photoUrl ? <img src={photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <i className="ti ti-camera" style={{ fontSize:22, color:'var(--text-muted)' }} />}
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>
            Member photo<br/>Click to upload (JPG/PNG, max 5MB)
          </div>
          <input ref={photoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={onPhoto} />
        </div>

        <label style={lbl}>Full Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ahmed Khan" style={inp} />

        <label style={lbl}>Role / Designation</label>
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior Interior Designer" style={inp} />

        <label style={lbl}>Type</label>
        <select value={memberType} onChange={e => setMemberType(e.target.value)} style={inp}>
          <option value="professional">Professional (Designer / Engineer / Manager)</option>
          <option value="site">Site Team (Worker / Technician)</option>
        </select>

        <label style={lbl}>Experience (years)</label>
        <input type="number" min="0" value={exp} onChange={e => setExp(e.target.value)} style={inp} />

        <label style={lbl}>Emirates ID Number *</label>
        <input value={eidNumber} onChange={e => setEidNumber(formatEid(e.target.value))} placeholder="784-XXXX-XXXXXXX-X" inputMode="numeric" style={inp} />

        <label style={lbl}>EID Expiry Date *</label>
        <input type="date" value={eidExpiry || ''} onChange={e => setEidExpiry(e.target.value)} style={inp} />

        {/* EID Front + Back */}
        <label style={lbl}>Emirates ID Photo * (Front &amp; Back)</label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:4, marginBottom:6 }}>
          <div>
            <div onClick={() => frontRef.current?.click()} style={eidBoxStyle}>
              {uploadingFront ? <div className="spinner" /> : eidFront ? (
                <>
                  {eidFront.toLowerCase().endsWith('.pdf')
                    ? <div style={{ textAlign:'center', color:'#15803d' }}><i className="ti ti-file-check" style={{ fontSize:26 }} /><div style={{ fontSize:10, marginTop:3 }}>PDF uploaded</div></div>
                    : <img src={eidFront} alt="EID Front" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
                  <span style={{ position:'absolute', top:5, right:5, background:'rgba(0,0,0,0.55)', color:'#fff', fontSize:9, padding:'2px 6px', borderRadius:6 }}>Change</span>
                </>
              ) : (
                <div style={{ textAlign:'center', color:'var(--text-muted)' }}>
                  <i className="ti ti-id" style={{ fontSize:24 }} />
                  <div style={{ fontSize:11, marginTop:4, fontWeight:600 }}>Front Side</div>
                  <div style={{ fontSize:9.5 }}>Click to upload</div>
                </div>
              )}
            </div>
            <input ref={frontRef} type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={onEidFront} />
          </div>
          <div>
            <div onClick={() => backRef.current?.click()} style={eidBoxStyle}>
              {uploadingBack ? <div className="spinner" /> : eidBack ? (
                <>
                  {eidBack.toLowerCase().endsWith('.pdf')
                    ? <div style={{ textAlign:'center', color:'#15803d' }}><i className="ti ti-file-check" style={{ fontSize:26 }} /><div style={{ fontSize:10, marginTop:3 }}>PDF uploaded</div></div>
                    : <img src={eidBack} alt="EID Back" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
                  <span style={{ position:'absolute', top:5, right:5, background:'rgba(0,0,0,0.55)', color:'#fff', fontSize:9, padding:'2px 6px', borderRadius:6 }}>Change</span>
                </>
              ) : (
                <div style={{ textAlign:'center', color:'var(--text-muted)' }}>
                  <i className="ti ti-id" style={{ fontSize:24 }} />
                  <div style={{ fontSize:11, marginTop:4, fontWeight:600 }}>Back Side</div>
                  <div style={{ fontSize:9.5 }}>Click to upload</div>
                </div>
              )}
            </div>
            <input ref={backRef} type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={onEidBack} />
          </div>
        </div>
        <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:0, marginBottom:14 }}>
          Upload both sides of the Emirates ID (image/PDF, max 5MB each). Admin will verify the ID number and expiry against the photo.
        </p>

        {/* Policy agreement */}
        <div style={{ background:'var(--bg2)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
          <PolicyAgree checked={agreed} onChange={setAgreed} />
        </div>

        {error && <p style={{ fontSize:12, color:'var(--red)', marginBottom:12 }}>{error}</p>}

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:11, borderRadius:9, border:'1px solid var(--card-border)', background:'var(--card-bg)', color:'var(--text-primary)', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={saving || uploadingPhoto || uploadingFront || uploadingBack} style={{ flex:1, padding:11, borderRadius:9, border:'none', background:BRAND, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity:(saving||uploadingPhoto||uploadingFront||uploadingBack)?0.5:1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  )
}

const lbl = { fontSize: 12, color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }
const inp = { width: '100%', marginTop: 4, marginBottom: 14, border: '1px solid var(--card-border)', borderRadius: 9, padding: '9px 12px', fontSize: 13, boxSizing: 'border-box', background: 'var(--card-bg)', color: 'var(--text-primary)', outline: 'none' }
