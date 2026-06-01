// trustdubai-business/src/pages/TeamMembers.jsx
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'

const BRAND = '#0099cc'

const EID_BADGE = {
  pending:  { label: 'Verification Pending', bg: '#fef3c7', fg: '#b45309', icon: 'ti-clock' },
  verified: { label: 'EID Verified',         bg: '#dcfce7', fg: '#15803d', icon: 'ti-shield-check' },
  rejected: { label: 'Verification Rejected', bg: '#fee2e2', fg: '#b91c1c', icon: 'ti-alert-triangle' },
}

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
    if (m.photo_url) {
      try {
        const path = m.photo_url.split('/company-assets/')[1]
        if (path) await supabase.storage.from('company-assets').remove([path])
      } catch (e) {}
    }
    await supabase.from('team_members').delete().eq('id', m.id)
    setMembers(prev => prev.filter(x => x.id !== m.id))
    toast.success('Team member removed')
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
  const [photoUrl, setPhotoUrl] = useState(member?.photo_url || '')
  const [eidUrl, setEidUrl] = useState(member?.eid_url || '')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingEid, setUploadingEid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const photoRef = useRef()
  const eidRef = useRef()

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
  async function onEid(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return }
    setUploadingEid(true)
    try { setEidUrl(await uploadFile(file, 'eid')) } catch (e) { toast.error('EID upload failed') }
    setUploadingEid(false)
  }

  async function submit() {
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    const payload = {
      company_id: company.id,
      name: name.trim(),
      role: role.trim() || null,
      member_type: memberType,
      bio: bio.trim() || null,
      experience_years: parseInt(exp) || 0,
      photo_url: photoUrl || null,
      eid_url: eidUrl || null,
    }
    let err
    if (isEdit) {
      // EID dobara upload hua to status wapas pending (admin re-verify kare)
      if (eidUrl && eidUrl !== member.eid_url) {
        payload.eid_status = 'pending'; payload.is_verified = false; payload.verified_at = null; payload.verified_by = null
      }
      ;({ error: err } = await supabase.from('team_members').update(payload).eq('id', member.id))
    } else {
      payload.eid_status = eidUrl ? 'pending' : 'pending'
      ;({ error: err } = await supabase.from('team_members').insert(payload))
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    toast.success(isEdit ? 'Member updated' : 'Member added — pending EID verification')
    onSaved()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--card-bg)', borderRadius:16, width:'100%', maxWidth:460, padding:22, maxHeight:'92vh', overflowY:'auto' }}>
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

        <label style={lbl}>Short Bio</label>
        <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Brief background, expertise..." style={{ ...inp, minHeight:60, resize:'vertical' }} />

        {/* EID upload */}
        <label style={lbl}>Emirates ID (for verification)</label>
        <div onClick={() => eidRef.current?.click()} style={{ border:'1.5px dashed var(--card-border)', borderRadius:9, padding:'12px', textAlign:'center', cursor:'pointer', marginTop:4, marginBottom:6, background:'var(--bg2)' }}>
          {uploadingEid ? <div className="spinner" style={{ margin:'0 auto' }} /> : eidUrl ? (
            <span style={{ fontSize:12.5, color:'#15803d', fontWeight:600 }}><i className="ti ti-file-check" /> EID uploaded — pending admin verification</span>
          ) : (
            <span style={{ fontSize:12.5, color:'var(--text-muted)' }}><i className="ti ti-upload" /> Upload Emirates ID (image/PDF, max 5MB)</span>
          )}
        </div>
        <input ref={eidRef} type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={onEid} />
        <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:0, marginBottom:14 }}>
          Admin will review the EID. Once verified, this member shows a verified badge on your public profile.
        </p>

        {error && <p style={{ fontSize:12, color:'var(--red)', marginBottom:12 }}>{error}</p>}

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:11, borderRadius:9, border:'1px solid var(--card-border)', background:'var(--card-bg)', color:'var(--text-primary)', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={saving || uploadingPhoto || uploadingEid} style={{ flex:1, padding:11, borderRadius:9, border:'none', background:BRAND, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity:(saving||uploadingPhoto||uploadingEid)?0.5:1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  )
}

const lbl = { fontSize: 12, color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }
const inp = { width: '100%', marginTop: 4, marginBottom: 14, border: '1px solid var(--card-border)', borderRadius: 9, padding: '9px 12px', fontSize: 13, boxSizing: 'border-box', background: 'var(--card-bg)', color: 'var(--text-primary)', outline: 'none' }
