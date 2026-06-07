// Claim Your Company — search listed company, verify last-4 phone, upload TL, submit for review.
// Public site theme (var(--primary) teal, CSS vars, Tabler icons). Responsive + light/dark.
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { getCustomer } from '../customerAuth'

function digits(s) { return (s || '').replace(/\D/g, '') }
function last4(s) { return digits(s).slice(-4) }

export default function ClaimCompany({ navigate }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)

  const [code, setCode] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [verified, setVerified] = useState(false)
  const [locked, setLocked] = useState(false)        // 3 wrong attempts -> support fallback

  const [cName, setCName] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [tlFile, setTlFile] = useState(null)
  const [tlNumber, setTlNumber] = useState('')
  const [tlExpiry, setTlExpiry] = useState('')

  const [supportMsg, setSupportMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)         // 'claim' | 'support'

  const debounce = useRef(null)

  useEffect(() => { (async () => {
    const cust = await getCustomer()
    if (cust?.email) setCEmail(cust.email)
  })() }, [])

  useEffect(() => {
    if (selected) return
    const term = query.trim()
    if (term.length < 2) { setResults([]); return }
    setSearching(true)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const safe = term.replace(/[%_]/g, ' ')
      const { data } = await supabase
        .from('companies')
        .select('id, name, slug, location, phone')
        .eq('is_imported', true)
        .eq('claimed', false)
        .ilike('name', `%${safe}%`)
        .limit(6)
      setResults(data || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(debounce.current)
  }, [query, selected])

  function pick(c) {
    setSelected(c); setResults([]); setQuery(c.name)
    setCode(''); setAttempts(0); setVerified(false); setLocked(false); setError('')
  }
  function reset() {
    setSelected(null); setQuery(''); setResults([])
    setCode(''); setAttempts(0); setVerified(false); setLocked(false); setError('')
  }

  function verify() {
    setError('')
    if (digits(code).length !== 4) return setError('Enter the last 4 digits.')
    if (code === last4(selected.phone)) { setVerified(true); return }
    const n = attempts + 1
    setAttempts(n)
    if (n >= 3) { setLocked(true); setError('') }
    else setError(`That doesn't match our records. ${3 - n} attempt${3 - n === 1 ? '' : 's'} left.`)
  }

  async function uploadTL(claimId) {
    if (!tlFile) return null
    const ext = tlFile.name.split('.').pop()
    const path = `claims/${claimId}/trade-license.${ext}`
    const { error } = await supabase.storage.from('trade-licenses').upload(path, tlFile, { upsert: true })
    if (error) return null
    return path
  }

  async function submitClaim() {
    if (!cName.trim()) return setError('Your name is required.')
    if (!cEmail.trim()) return setError('Email is required so we can confirm your claim.')
    if (!tlFile) return setError('Please upload your trade licence to verify ownership.')
    setError(''); setLoading(true)
    const { data: row, error: e } = await supabase.from('claim_requests').insert({
      company_id: selected.id, company_name: selected.name, kind: 'claim',
      last4_verified: true, contact_name: cName, contact_email: cEmail.toLowerCase(),
      contact_phone: cPhone || null, tl_number: tlNumber || null, tl_expiry: tlExpiry || null,
      status: 'pending',
    }).select('id').single()
    if (e || !row) { setLoading(false); return setError('Could not submit. Please try again.') }
    const tlUrl = await uploadTL(row.id)
    if (tlUrl) await supabase.from('claim_requests').update({ tl_url: tlUrl }).eq('id', row.id)
    setLoading(false); setSuccess('claim')
  }

  async function submitSupport() {
    if (!cName.trim() || !cEmail.trim()) return setError('Name and email are required.')
    setError(''); setLoading(true)
    const { error: e } = await supabase.from('claim_requests').insert({
      company_id: selected?.id || null, company_name: selected?.name || query, kind: 'support',
      last4_verified: false, contact_name: cName, contact_email: cEmail.toLowerCase(),
      contact_phone: cPhone || null, message: supportMsg || null, status: 'pending',
    })
    if (e) { setLoading(false); return setError('Could not send. Please try again.') }
    setLoading(false); setSuccess('support')
  }

  const Header = ({ title }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-primary)', position: 'sticky', top: 0, zIndex: 100 }}>
      <button onClick={() => navigate('home')} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}><i className="ti ti-arrow-left" /></button>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{title}</span>
      <div style={{ width: 32 }} />
    </div>
  )

  const wrap = { background: 'var(--bg-primary)', minHeight: '100vh' }
  const inner = { maxWidth: 520, margin: '0 auto', padding: 16 }
  const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--radius)', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }
  const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }

  if (success) return (
    <div style={wrap}>
      <Header title={success === 'claim' ? 'Claim Submitted' : 'Request Sent'} />
      <div style={{ textAlign: 'center', padding: '64px 24px' }}>
        <div style={{ fontSize: 52, color: 'var(--green)', marginBottom: 16 }}><i className="ti ti-circle-check" /></div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
          {success === 'claim' ? 'Your claim is in review' : 'Request sent to our team'}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6, maxWidth: 360, margin: '0 auto 24px' }}>
          {success === 'claim'
            ? <>We'll verify your trade licence and confirm your claim within <b>48 hours</b> on {cEmail}.</>
            : <>Our support team will review and reach out on {cEmail} shortly.</>}
        </p>
        <button onClick={() => navigate('home')} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', borderRadius: 24, padding: '12px 28px', fontSize: 14, cursor: 'pointer' }}>Back to Home</button>
      </div>
    </div>
  )

  return (
    <div style={wrap}>
      <Header title="Claim Your Company" />

      <div style={{ background: 'var(--primary)', padding: '20px 16px', color: '#fff', textAlign: 'center' }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, marginBottom: 6 }}>Is your business already listed?</div>
        <p style={{ fontSize: 12, opacity: 0.85 }}>Search, verify ownership, and take control of your profile.</p>
      </div>

      <div style={inner}>
        {/* STEP 1 — search */}
        <label style={labelStyle}>Search your company name</label>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <input value={query} onChange={e => { setQuery(e.target.value); if (selected) reset() }} placeholder="Start typing your company name…" style={inputStyle} />
          {selected && (
            <button onClick={reset} style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}><i className="ti ti-x" /></button>
          )}
          {!selected && query.trim().length >= 2 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', zIndex: 30, boxShadow: '0 6px 24px rgba(0,0,0,0.10)' }}>
              {searching && <div style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>Searching…</div>}
              {!searching && results.length === 0 && (
                <div style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>No listed company found. It may not be listed yet — you can <span onClick={() => navigate('register-company')} style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>list it as new</span>.</div>
              )}
              {!searching && results.map(c => (
                <div key={c.id} onClick={() => pick(c)} style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</span>
                  {c.location && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}><i className="ti ti-map-pin" style={{ fontSize: 12 }} /> {c.location}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* STEP 2 — verify last 4 */}
        {selected && !verified && !locked && (
          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{selected.name}</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>To prove this is your business, confirm the <b>last 4 digits</b> of the phone number registered on this listing.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: 1 }}>+971&nbsp;•••&nbsp;•••</span>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0000" inputMode="numeric" maxLength={4}
                style={{ ...inputStyle, width: 90, textAlign: 'center', letterSpacing: 4, fontSize: 16, fontWeight: 600 }} />
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
            <button onClick={verify} style={{ marginTop: 14, width: '100%', padding: 11, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 24, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Verify &amp; Continue</button>
          </div>
        )}

        {/* STEP 2b — locked, support fallback */}
        {selected && locked && !verified && (
          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}><i className="ti ti-headset" style={{ color: 'var(--primary)' }} /> Number doesn't match?</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>The registered number may have changed. Send a request to our support team and we'll help you claim <b>{selected.name}</b> manually.</p>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Your name *</label><input value={cName} onChange={e => setCName(e.target.value)} style={inputStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Email *</label><input value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Phone</label><input value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="+971 50 XXX XXXX" style={inputStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Message</label><textarea value={supportMsg} onChange={e => setSupportMsg(e.target.value)} placeholder="Tell us about your business…" style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} /></div>
            {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
            <button onClick={submitSupport} disabled={loading} style={{ width: '100%', padding: 11, background: loading ? 'var(--text-muted)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 24, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Sending…' : 'Send Request to Support'}</button>
          </div>
        )}

        {/* STEP 3 — verified: TL upload + contact */}
        {selected && verified && (
          <div style={{ marginTop: 16 }}>
            <div style={{ padding: '11px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 'var(--radius-lg)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-circle-check" style={{ color: 'var(--green)', fontSize: 18 }} />
              <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>Number verified for <b>{selected.name}</b>. Now upload your trade licence.</span>
            </div>

            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Your name *</label><input value={cName} onChange={e => setCName(e.target.value)} placeholder="Full name" style={inputStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Email *</label><input value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} /></div>
            <div style={{ marginBottom: 14 }}><label style={labelStyle}>Phone</label><input value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="+971 50 XXX XXXX" style={inputStyle} /></div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Trade Licence (PDF or image) *</label>
              <label style={{ display: 'block', border: '1.5px dashed var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 14, textAlign: 'center', cursor: 'pointer', background: 'var(--bg-secondary)' }}>
                <i className="ti ti-file-text" style={{ fontSize: 22, color: 'var(--text-muted)' }} />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{tlFile ? `✓ ${tlFile.name}` : 'Tap to upload'}</p>
                <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => setTlFile(e.target.files[0])} />
              </label>
            </div>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Trade Licence Number</label><input value={tlNumber} onChange={e => setTlNumber(e.target.value)} placeholder="e.g. 1234567" style={inputStyle} /></div>
            <div style={{ marginBottom: 16 }}><label style={labelStyle}>Trade Licence Expiry</label><input type="date" value={tlExpiry} onChange={e => setTlExpiry(e.target.value)} min={new Date().toISOString().split('T')[0]} style={inputStyle} /></div>

            {error && <p style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
            <button onClick={submitClaim} disabled={loading} style={{ width: '100%', padding: 12, background: loading ? 'var(--text-muted)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 24, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Submitting…' : 'Submit Claim for Review'}</button>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 10, lineHeight: 1.6 }}>Your application will be in review. You'll get confirmation within 48 hours.</p>
          </div>
        )}

        {/* footer help */}
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Not listed yet? <span onClick={() => navigate('register-company')} style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}>List your business</span><br />
          Need help? <a href="mailto:support@trustdubai.ae" style={{ color: 'var(--primary)' }}>support@trustdubai.ae</a>
        </div>
      </div>
    </div>
  )
}
