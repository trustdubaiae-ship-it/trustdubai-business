// trustdubai-business/src/pages/VerificationPage.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const BRAND = '#0099cc'
const BUCKET = 'verification-docs'

const STATUS_STYLE = {
  approved: { bg: '#e6f7ed', color: '#1a7f4b', label: 'Approved ✓' },
  rejected: { bg: '#fdecec', color: '#c0392b', label: 'Rejected ✕' },
  pending:  { bg: '#fff6e6', color: '#b8860b', label: 'Pending review' },
}

export default function VerificationPage() {
  const { company } = useAuth()
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tlNumber, setTlNumber] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const companyId = company?.id

  async function loadCompany() {
    if (!companyId) return
    const { data, error } = await supabase
      .from('companies')
      .select('id, trade_license_number, trade_license_url, trade_license_status, owner_eid_url, owner_eid_status, phone_verified, verification_percent, verification_status')
      .eq('id', companyId)
      .single()
    if (!error && data) {
      setRow(data)
      setTlNumber(data.trade_license_number || '')
    }
    setLoading(false)
  }

  useEffect(() => { loadCompany() }, [companyId])

  async function uploadDoc(file, kind) {
    // kind: 'trade_license' | 'owner_eid'
    if (!file || !companyId) return
    setBusy(kind); setMsg('')
    try {
      const ext = file.name.split('.').pop()
      const path = `${companyId}/${kind}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(BUCKET).upload(path, file, { upsert: true })
      if (upErr) throw upErr

      const urlCol = kind === 'trade_license' ? 'trade_license_url' : 'owner_eid_url'
      const statusCol = kind === 'trade_license' ? 'trade_license_status' : 'owner_eid_status'
      const patch = { [urlCol]: path, [statusCol]: 'pending' }
      if (kind === 'trade_license') patch.trade_license_number = tlNumber

      const { error: dbErr } = await supabase
        .from('companies').update(patch).eq('id', companyId)
      if (dbErr) throw dbErr

      await supabase.from('verification_log').insert({
        company_id: companyId, target: kind, action: 'submit',
      })

      setMsg('Document uploaded — admin review ke liye bhej diya.')
      await loadCompany()
    } catch (e) {
      setMsg('Error: ' + (e.message || 'upload failed'))
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>

  const pct = row?.verification_percent ?? 0
  const isVerified = row?.verification_status === 'verified'

  const items = [
    { kind: 'trade_license', title: 'Trade License', weight: 10, mandatory: true,
      status: row?.trade_license_status, url: row?.trade_license_url },
    { kind: 'owner_eid', title: 'Owner Emirates ID', weight: 7, mandatory: false,
      status: row?.owner_eid_status, url: row?.owner_eid_url },
  ]

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
        {!row?.owner_eid_url && (
          <p style={{ marginTop: 12, fontSize: 13, color: '#667', background: '#f5f9ff', padding: '10px 12px', borderRadius: 8 }}>
            💡 Add your Owner Emirates ID to boost your verification % (+7%) — higher score helps you get more leads.
          </p>
        )}
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#eef7ff', color: '#0b5d8a', fontSize: 14 }}>
          {msg}
        </div>
      )}

      {/* TRADE LICENSE NUMBER */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Trade License Number
        </label>
        <input
          value={tlNumber}
          onChange={(e) => setTlNumber(e.target.value)}
          placeholder="e.g. 1234567"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d8dde4', fontSize: 14 }}
        />
      </div>

      {/* DOC UPLOAD CARDS */}
      {items.map((it) => {
        const st = STATUS_STYLE[it.status] || STATUS_STYLE.pending
        const uploaded = !!it.url
        return (
          <div key={it.kind} style={{ background: '#fff', border: '1px solid #e6e9ee', borderRadius: 12, padding: 18, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 600 }}>{it.title}</span>
                {it.mandatory
                  ? <span style={{ color: '#c0392b', marginLeft: 6, fontSize: 12 }}>* required</span>
                  : <span style={{ color: '#999', marginLeft: 6, fontSize: 12 }}>optional</span>}
                <span style={{ color: BRAND, marginLeft: 8, fontSize: 12, fontWeight: 600 }}>+{it.weight}%</span>
              </div>
              {uploaded && (
                <span style={{ background: st.bg, color: st.color, padding: '4px 10px', borderRadius: 16, fontSize: 12, fontWeight: 600 }}>
                  {st.label}
                </span>
              )}
            </div>
            <label style={{
              display: 'inline-block', cursor: 'pointer', fontSize: 14,
              background: busy === it.kind ? '#9bd' : BRAND, color: '#fff',
              padding: '9px 16px', borderRadius: 8, fontWeight: 600,
            }}>
              {busy === it.kind ? 'Uploading…' : uploaded ? 'Re-upload' : 'Upload document'}
              <input
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                disabled={busy === it.kind}
                onChange={(e) => uploadDoc(e.target.files?.[0], it.kind)}
              />
            </label>
            {it.status === 'rejected' && (
              <p style={{ marginTop: 8, fontSize: 13, color: '#c0392b' }}>
                Rejected — please re-upload a clear, valid document.
              </p>
            )}
          </div>
        )
      })}

      {/* PHONE — method pending */}
      <div style={{ background: '#fafbfc', border: '1px dashed #cfd6df', borderRadius: 12, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600 }}>Phone Verification
            <span style={{ color: BRAND, marginLeft: 8, fontSize: 12, fontWeight: 600 }}>+5%</span>
          </span>
          <span style={{ background: '#eef1f5', color: '#667', padding: '4px 10px', borderRadius: 16, fontSize: 12 }}>
            {row?.phone_verified ? 'Verified ✓' : 'Setup pending'}
          </span>
        </div>
        <p style={{ marginTop: 8, fontSize: 13, color: '#778' }}>
          Phone OTP verification will be enabled next.
        </p>
      </div>

      <p style={{ fontSize: 12, color: '#99a', marginTop: 8 }}>
        Documents are reviewed manually by our team. You'll be notified once approved.
      </p>
    </div>
  )
}
