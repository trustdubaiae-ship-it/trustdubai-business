// tritova-business/src/pages/VerificationPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const BRAND = '#0099cc'
const BUCKET = 'verification-docs'

const STATUS_STYLE = {
  approved: { bg: '#e6f7ed', color: '#1a7f4b', label: 'Approved ✓' },
  verified: { bg: '#e6f7ed', color: '#1a7f4b', label: 'Approved ✓' },
  rejected: { bg: '#fdecec', color: '#c0392b', label: 'Rejected ✕' },
  pending:  { bg: '#fff6e6', color: '#b8860b', label: 'Pending review' },
}

function isImagePath(p) {
  if (!p) return false
  const ext = (p.split('.').pop() || '').toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
}

export default function VerificationPage() {
  const { company } = useAuth()
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tlNumber, setTlNumber] = useState('')
  const [busy, setBusy] = useState('')
  const [savingNum, setSavingNum] = useState(false)
  const [msg, setMsg] = useState({ text: '', type: 'info' })

  // Owner EID local fields
  const [eidNumber, setEidNumber] = useState('')
  const [eidExpiry, setEidExpiry] = useState('')
  const [savingEid, setSavingEid] = useState(false)

  // signed-url previews { tl, eidFront, eidBack }
  const [previews, setPreviews] = useState({})

  const companyId = company?.id

  async function loadCompany() {
    if (!companyId) return
    const { data, error } = await supabase
      .from('companies')
      .select('id, trade_license_number, trade_license_url, trade_license_status, owner_eid_url, owner_eid_status, owner_eid_number, owner_eid_expiry, owner_eid_front_url, owner_eid_back_url, phone_verified, verification_percent, verification_status')
      .eq('id', companyId)
      .single()
    if (!error && data) {
      setRow(data)
      setTlNumber(data.trade_license_number || '')
      setEidNumber(data.owner_eid_number || '')
      setEidExpiry(data.owner_eid_expiry || '')
      loadPreviews(data)
    }
    setLoading(false)
  }

  // fetch signed URLs for any image documents (private bucket)
  async function loadPreviews(data) {
    const front = data.owner_eid_front_url || data.owner_eid_url
    const back = data.owner_eid_back_url
    const tl = data.trade_license_url
    const next = {}
    async function signed(path) {
      if (!path || !isImagePath(path)) return null
      const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600)
      return s?.signedUrl || null
    }
    next.tl = await signed(tl)
    next.eidFront = await signed(front)
    next.eidBack = await signed(back)
    setPreviews(next)
  }

  useEffect(() => { loadCompany() }, [companyId])

  function flash(text, type = 'info') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: 'info' }), 3000)
  }

  async function saveTlNumber() {
    if (!companyId) return
    setSavingNum(true)
    const { error } = await supabase
      .from('companies').update({ trade_license_number: tlNumber }).eq('id', companyId)
    if (error) flash('Could not save. Please try again.', 'error')
    else { flash('Trade License number saved.', 'success'); await loadCompany() }
    setSavingNum(false)
  }

  async function uploadTradeLicense(file) {
    if (!file || !companyId) return
    setBusy('trade_license')
    try {
      const ext = file.name.split('.').pop()
      const path = `${companyId}/trade_license_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('companies').update({
        trade_license_url: path, trade_license_status: 'pending', trade_license_number: tlNumber,
      }).eq('id', companyId)
      if (dbErr) throw dbErr
      await supabase.from('verification_log').insert({ company_id: companyId, target: 'trade_license', action: 'submit' })
      flash('Document uploaded and sent for review.', 'success')
      await loadCompany()
    } catch (e) {
      flash('Upload failed: ' + (e.message || 'please try again'), 'error')
    } finally { setBusy('') }
  }

  async function uploadEidSide(file, side) {
    if (!file || !companyId) return
    const kind = side === 'front' ? 'eid_front' : 'eid_back'
    setBusy(kind)
    try {
      const ext = file.name.split('.').pop()
      const path = `${companyId}/owner_eid_${side}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const col = side === 'front' ? 'owner_eid_front_url' : 'owner_eid_back_url'
      const { error: dbErr } = await supabase.from('companies').update({
        [col]: path, owner_eid_status: 'pending',
      }).eq('id', companyId)
      if (dbErr) throw dbErr
      await supabase.from('verification_log').insert({ company_id: companyId, target: 'owner_eid', action: 'submit' })
      flash(`Emirates ID ${side} uploaded.`, 'success')
      await loadCompany()
    } catch (e) {
      flash('Upload failed: ' + (e.message || 'please try again'), 'error')
    } finally { setBusy('') }
  }

  async function saveEidDetails() {
    if (!companyId) return
    if (!eidNumber.trim()) { flash('Please enter the Emirates ID number.', 'error'); return }
    if (!eidExpiry) { flash('Please select the EID expiry date.', 'error'); return }
    setSavingEid(true)
    const { error } = await supabase.from('companies').update({
      owner_eid_number: eidNumber.trim(),
      owner_eid_expiry: eidExpiry,
      owner_eid_status: 'pending',
    }).eq('id', companyId)
    if (error) flash('Could not save EID details. Please try again.', 'error')
    else { flash('Emirates ID details saved and sent for review.', 'success'); await loadCompany() }
    setSavingEid(false)
  }

  async function viewMyDoc(path) {
    if (!path) return
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
    else flash('Could not open document.', 'error')
  }

  function fileName(path) {
    if (!path) return ''
    const base = path.split('/').pop() || path
    return base.length > 28 ? base.slice(0, 25) + '…' : base
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>

  const pct = row?.verification_percent ?? 0
  const isVerified = row?.verification_status === 'verified'

  const msgStyle = {
    info:    { bg: '#eef7ff', color: '#0b5d8a' },
    success: { bg: '#e6f7ed', color: '#1a7f4b' },
    error:   { bg: '#fdecec', color: '#c0392b' },
  }[msg.type]

  // Trade License
  const tlStatus = row?.trade_license_status
  const tlSt = STATUS_STYLE[tlStatus] || STATUS_STYLE.pending
  const tlUploaded = !!row?.trade_license_url

  // Owner EID
  const eidStatus = row?.owner_eid_status
  const eidSt = STATUS_STYLE[eidStatus] || STATUS_STYLE.pending
  const eidFrontPath = row?.owner_eid_front_url || row?.owner_eid_url
  const eidBackPath = row?.owner_eid_back_url
  const eidUploaded = !!eidFrontPath

  // EID expiry countdown
  let eidExpiryNote = null
  if (row?.owner_eid_expiry) {
    const today = new Date(); today.setHours(0,0,0,0)
    const exp = new Date(row.owner_eid_expiry)
    const days = Math.round((exp - today) / 86400000)
    if (days < 0) eidExpiryNote = { text: 'Expired', color: '#c0392b' }
    else if (days <= 30) eidExpiryNote = { text: `Expires in ${days} day${days !== 1 ? 's' : ''}`, color: '#d97706' }
    else eidExpiryNote = { text: `Valid until ${row.owner_eid_expiry}`, color: '#1a7f4b' }
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d8dde4', fontSize: 14, boxSizing: 'border-box' }

  // ATM-card style box (aspect ratio ~1.586:1, like a real ID card)
  const cardBox = {
    width: '100%', aspectRatio: '1.586 / 1', borderRadius: 12, overflow: 'hidden',
    border: '1px solid #d8dde4', background: '#f1f4f8', position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  function EidSide({ side }) {
    const isFront = side === 'front'
    const path = isFront ? eidFrontPath : eidBackPath
    const preview = isFront ? previews.eidFront : previews.eidBack
    const kind = isFront ? 'eid_front' : 'eid_back'
    const isPdf = path && !isImagePath(path)
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#445', marginBottom: 6, textAlign: 'center' }}>
          {isFront ? 'Front Side' : 'Back Side'}
        </div>
        <div style={cardBox} onClick={() => path && viewMyDoc(path)}>
          {preview ? (
            <img src={preview} alt={`EID ${side}`} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} />
          ) : isPdf ? (
            <div style={{ textAlign: 'center', cursor: 'pointer' }}>
              <i className="ti ti-file-text" style={{ fontSize: 30, color: BRAND }} />
              <div style={{ fontSize: 11, color: '#667', marginTop: 4 }}>PDF uploaded — tap to view</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>
              <i className="ti ti-id" style={{ fontSize: 30 }} />
              <div style={{ fontSize: 11, marginTop: 4 }}>No {isFront ? 'front' : 'back'} uploaded</div>
            </div>
          )}
        </div>
        <label style={{ display: 'block', cursor: 'pointer', textAlign: 'center', marginTop: 8, fontSize: 12.5, background: busy === kind ? '#9bd' : BRAND, color: '#fff', padding: '7px 10px', borderRadius: 7, fontWeight: 600 }}>
          {busy === kind ? 'Uploading…' : path ? 'Re-upload' : `Upload ${isFront ? 'front' : 'back'}`}
          <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={busy === kind}
            onChange={(e) => uploadEidSide(e.target.files?.[0], side)} />
        </label>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Verification</h1>
      <p style={{ color: '#667', marginBottom: 20 }}>
        Verify your company to earn the <b>✓ Verified</b> badge and start receiving leads.
      </p>

      {/* LIVE METER */}
      <div style={{ background: '#fff', border: '1px solid #e6e9ee', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontWeight: 600 }}>Verification Score</span>
          <span style={{ fontWeight: 700, color: BRAND }}>{pct}% / 22%</span>
        </div>
        <div style={{ height: 12, background: '#eef1f5', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ width: `${(pct / 22) * 100}%`, height: '100%', background: BRAND, transition: 'width .4s' }} />
        </div>
        <div style={{ marginTop: 12 }}>
          {isVerified ? (
            <span style={{ background: '#e6f7ed', color: '#1a7f4b', padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
              ✓ You are Verified
            </span>
          ) : (
            <span style={{ background: '#fff6e6', color: '#b8860b', padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
              Verified badge needs: Trade License + Phone verified
            </span>
          )}
        </div>
        {!eidUploaded && (
          <p style={{ marginTop: 12, fontSize: 13, color: '#667', background: '#f5f9ff', padding: '10px 12px', borderRadius: 8 }}>
            💡 Add your Owner Emirates ID to boost your verification % (+7%) — higher score helps you get more leads.
          </p>
        )}
      </div>

      {msg.text && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: msgStyle.bg, color: msgStyle.color, fontSize: 14 }}>
          {msg.text}
        </div>
      )}

      {/* TRADE LICENSE NUMBER + SAVE */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Trade License Number
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={tlNumber} onChange={(e) => setTlNumber(e.target.value)} placeholder="e.g. 1234567"
            style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 8, border: '1px solid #d8dde4', fontSize: 14, boxSizing: 'border-box' }} />
          <button onClick={saveTlNumber} disabled={savingNum || tlNumber === (row?.trade_license_number || '')}
            style={{ background: (savingNum || tlNumber === (row?.trade_license_number || '')) ? '#cbd5e1' : BRAND, color: '#fff', border: 'none', borderRadius: 8, padding: '0 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {savingNum ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* TRADE LICENSE CARD (with small thumbnail) */}
      <div style={{ background: '#fff', border: '1px solid #e6e9ee', borderRadius: 12, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div>
            <span style={{ fontWeight: 600 }}>Trade License</span>
            <span style={{ color: '#c0392b', marginLeft: 6, fontSize: 12 }}>* required</span>
            <span style={{ color: BRAND, marginLeft: 8, fontSize: 12, fontWeight: 600 }}>+10%</span>
          </div>
          {tlUploaded && (
            <span style={{ background: tlSt.bg, color: tlSt.color, padding: '4px 10px', borderRadius: 16, fontSize: 12, fontWeight: 600 }}>
              {tlSt.label}
            </span>
          )}
        </div>
        {tlUploaded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f5f9ff', border: '1px solid #dbeafe', borderRadius: 8, padding: '9px 12px', marginBottom: 10 }}>
            {/* small thumbnail */}
            {previews.tl ? (
              <img src={previews.tl} alt="TL" onClick={() => viewMyDoc(row.trade_license_url)}
                style={{ width: 46, height: 46, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', flexShrink: 0, border: '1px solid #dbeafe' }} />
            ) : (
              <i className="ti ti-file-check" style={{ fontSize: 18, color: BRAND }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0b5d8a' }}>File uploaded</div>
              <div style={{ fontSize: 11, color: '#667', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName(row.trade_license_url)}</div>
            </div>
            <button onClick={() => viewMyDoc(row.trade_license_url)}
              style={{ background: 'transparent', border: `1px solid ${BRAND}`, color: BRAND, padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              View
            </button>
          </div>
        )}
        <label style={{ display: 'inline-block', cursor: 'pointer', fontSize: 14, background: busy === 'trade_license' ? '#9bd' : BRAND, color: '#fff', padding: '9px 16px', borderRadius: 8, fontWeight: 600 }}>
          {busy === 'trade_license' ? 'Uploading…' : tlUploaded ? 'Re-upload' : 'Upload document'}
          <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={busy === 'trade_license'}
            onChange={(e) => uploadTradeLicense(e.target.files?.[0])} />
        </label>
        {tlStatus === 'rejected' && (
          <p style={{ marginTop: 8, fontSize: 13, color: '#c0392b' }}>Rejected — please re-upload a clear, valid document.</p>
        )}
      </div>

      {/* OWNER EMIRATES ID CARD */}
      <div style={{ background: '#fff', border: '1px solid #e6e9ee', borderRadius: 12, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <span style={{ fontWeight: 600 }}>Owner Emirates ID</span>
            <span style={{ color: '#999', marginLeft: 6, fontSize: 12 }}>optional</span>
            <span style={{ color: BRAND, marginLeft: 8, fontSize: 12, fontWeight: 600 }}>+7%</span>
          </div>
          {eidUploaded && (
            <span style={{ background: eidSt.bg, color: eidSt.color, padding: '4px 10px', borderRadius: 16, fontSize: 12, fontWeight: 600 }}>
              {eidSt.label}
            </span>
          )}
        </div>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Emirates ID Number</label>
        <input value={eidNumber} onChange={(e) => setEidNumber(e.target.value)} placeholder="784-XXXX-XXXXXXX-X" style={{ ...inputStyle, marginBottom: 12 }} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>EID Expiry Date</label>
        <input type="date" value={eidExpiry || ''} onChange={(e) => setEidExpiry(e.target.value)} style={{ ...inputStyle, marginBottom: eidExpiryNote ? 6 : 12 }} />
        {eidExpiryNote && (
          <div style={{ fontSize: 12, fontWeight: 600, color: eidExpiryNote.color, marginBottom: 12 }}>
            <i className="ti ti-clock" style={{ fontSize: 13, verticalAlign: '-2px', marginRight: 4 }} />{eidExpiryNote.text}
          </div>
        )}

        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Emirates ID Photo (Front &amp; Back)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <EidSide side="front" />
          <EidSide side="back" />
        </div>

        <button onClick={saveEidDetails} disabled={savingEid}
          style={{ width: '100%', padding: '10px', background: savingEid ? '#9bd' : BRAND, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          {savingEid ? 'Saving…' : 'Save Emirates ID Details'}
        </button>

        <p style={{ marginTop: 8, fontSize: 12, color: '#778' }}>
          Upload both sides of the Emirates ID. Admin will verify the ID number and expiry against the photo.
        </p>
        {eidStatus === 'rejected' && (
          <p style={{ marginTop: 6, fontSize: 13, color: '#c0392b' }}>Rejected — please re-upload a clear, valid Emirates ID.</p>
        )}
      </div>

      {/* PHONE */}
      <div style={{ background: '#fafbfc', border: '1px dashed #cfd6df', borderRadius: 12, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>Phone Verification
            <span style={{ color: BRAND, marginLeft: 8, fontSize: 12, fontWeight: 600 }}>+5%</span>
          </span>
          <span style={{ background: '#eef1f5', color: '#667', padding: '4px 10px', borderRadius: 16, fontSize: 12 }}>
            {row?.phone_verified ? 'Verified ✓' : 'Setup pending'}
          </span>
        </div>
        <p style={{ marginTop: 8, fontSize: 13, color: '#778' }}>
          Phone verification will be enabled soon by our team.
        </p>
      </div>

      <p style={{ fontSize: 12, color: '#99a', marginTop: 8 }}>
        Documents are reviewed manually by our team. You'll be notified once approved.
      </p>
    </div>
  )
}
