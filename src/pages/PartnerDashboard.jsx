import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NoCompanyPage from './NoCompanyPage'
import { tierOf, TIER_LIST } from '../lib/partnerTiers'
import PartnerTerms from './PartnerTerms'

// v1: a single paid-plan price. Commission % + term come from the partner row.
const PLAN_PRICE = 399
const AED = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
const isPaid = (r) => r.plan && String(r.plan).toLowerCase() !== 'free'
const monthsSince = (d) => {
  if (!d) return 0
  const t = new Date(d); const now = new Date()
  return (now.getFullYear() - t.getFullYear()) * 12 + (now.getMonth() - t.getMonth())
}

export default function PartnerDashboard({ user }) {
  const [loading, setLoading] = useState(true)
  const [partner, setPartner] = useState(null)
  const [referrals, setReferrals] = useState([])
  const [payouts, setPayouts] = useState([])
  const [copied, setCopied] = useState('')
  const [bank, setBank] = useState({ account_holder: '', bank_name: '', iban: '', swift: '' })
  const [savingBank, setSavingBank] = useState(false)
  const [profile, setProfile] = useState({ name: '', phone: '', company_name: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [settings, setSettings] = useState({ min_payout: 100, claims_per_month: 2 })
  const [tab, setTab] = useState('overview')
  const [savingDoc, setSavingDoc] = useState('')
  const [payingPlan, setPayingPlan] = useState(false)
  const [changingTier, setChangingTier] = useState('')
  const [showTerms, setShowTerms] = useState(false)

  async function changePlan(newKey) {
    if (!partner || changingTier) return
    if (newKey === partner.tier) return
    const t = tierOf(newKey)
    const paidNow = partner.payment_status === 'active'
    const msg = paidNow
      ? `Switch to the ${t.label} plan (AED ${t.fee}/mo, ${t.commission}% commission)? Your Stripe subscription will be updated and the price is prorated from today.`
      : `Switch to the ${t.label} plan (AED ${t.fee}/mo, ${t.commission}% commission)?`
    if (!window.confirm(msg)) return
    setChangingTier(newKey)
    try {
      if (paidNow) {
        // active subscription → update the price in Stripe (with proration) via the edge function
        const { data, error } = await supabase.functions.invoke('partner-change-plan', { body: { tier: newKey } })
        if (error) { let m = 'Could not change plan.'; try { m = (await error.context.json())?.error || m } catch { m = error.message || m }; alert(m); return }
        if (data?.error) { alert(data.error); return }
      } else {
        // not paying yet → just set the tier; the price applies when they pay
        const { error } = await supabase.from('qv_partners').update({ tier: newKey, fee_monthly: t.fee, commission_pct: t.commission }).eq('id', partner.id)
        if (error) throw error
      }
      await load()
    } catch (e) { alert('Could not change plan: ' + (e?.message || e)) } finally { setChangingTier('') }
  }

  async function uploadDoc(field, file) {
    if (!file || !partner) return
    if (!/(image\/|application\/pdf)/.test(file.type)) { alert('Upload an image or PDF'); return }
    if (file.size > 5 * 1024 * 1024) { alert('File too large (max 5 MB)'); return }
    setSavingDoc(field)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const nextDocs = { ...(partner.documents || {}), [field]: String(reader.result) }
        const { error } = await supabase.from('qv_partners').update({ documents: nextDocs }).eq('id', partner.id)
        if (error) throw error
        await load()
      } catch (e) { alert('Upload failed: ' + (e?.message || e)) } finally { setSavingDoc('') }
    }
    reader.readAsDataURL(file)
  }
  async function payPlan() {
    if (payingPlan) return
    setPayingPlan(true)
    try {
      const { data, error } = await supabase.functions.invoke('partner-checkout', { body: { origin: window.location.origin } })
      if (data?.url) { window.location.href = data.url; return }
      let m = 'Could not start payment.'; if (error) { try { m = (await error.context.json())?.error || m } catch { m = error.message || m } } else if (data?.error) m = data.error
      alert(m)
    } catch (e) { alert('Payment failed: ' + (e?.message || e)) } finally { setPayingPlan(false) }
  }

  useEffect(() => { if (user?.id) load() }, [user?.id]) // eslint-disable-line
  // returning from Stripe Connect onboarding → refresh the payout-enabled status
  useEffect(() => {
    if (partner && !partner.payouts_enabled && typeof window !== 'undefined' && /[?&]connect_done=1/.test(window.location.search)) setupPayouts(true)
  }, [partner?.id]) // eslint-disable-line

  async function load() {
    setLoading(true)
    try {
      const { data: p } = await supabase.from('qv_partners').select('*').eq('auth_user_id', user.id).maybeSingle()
      if (!p) { setPartner(null); setLoading(false); return }
      setPartner(p)
      setBank({ account_holder: '', bank_name: '', iban: '', swift: '', ...(p.payout_info || {}) })
      setProfile({ name: p.name || '', phone: p.phone || '', company_name: p.company_name || '' })
      const [refsRes, paysRes, setRes] = await Promise.all([
        supabase.rpc('partner_my_referrals'),
        supabase.from('qv_partner_payouts').select('*').eq('partner_id', p.id).order('created_at', { ascending: false }),
        supabase.from('qv_settings').select('*'),
      ])
      setReferrals(refsRes.data || [])
      setPayouts(paysRes.data || [])
      if (setRes.data) { const m = {}; setRes.data.forEach(r => { m[r.key] = Number(r.value) }); setSettings(s => ({ ...s, ...m })) }
    } catch (e) { /* ignore */ } finally { setLoading(false) }
  }

  const [requesting, setRequesting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  function logout() { supabase.auth.signOut() }
  async function setupPayouts(silent = false) {
    if (connecting) return
    setConnecting(true)
    try {
      const { data, error } = await supabase.functions.invoke('partner-connect', { body: { origin: window.location.origin } })
      if (error) {
        let m = 'Could not start payout setup.'
        try { m = (await error.context.json())?.error || error.message || m } catch { m = error.message || m }
        if (!silent) alert(m); return
      }
      if (data?.payouts_enabled) { await load() }
      else if (!silent && data?.url) { window.location.href = data.url }
      else if (silent) { await load() }
    } catch (e) { if (!silent) alert('Payout setup failed: ' + (e?.message || e)) } finally { setConnecting(false) }
  }
  function copy(txt, key) {
    try { navigator.clipboard.writeText(txt); setCopied(key); setTimeout(() => setCopied(''), 1600) } catch {}
  }
  async function requestPayout(amount) {
    if (!(amount > 0) || requesting || !partner) return
    setRequesting(true)
    try {
      // RPC enforces: bank details set, >= minimum, <= claims/month
      const { data, error } = await supabase.rpc('partner_request_payout', { p_amount: Math.round(amount) })
      if (error) { alert(error.message); return }
      if (data?.error) { alert(data.error); return }
      await load()
    } catch (e) { alert('Could not request payout: ' + (e?.message || e)) } finally { setRequesting(false) }
  }
  async function saveBank() {
    if (savingBank || !partner) return
    if (partner.bank_locked) { alert('Bank details are locked. To change them, contact Quvera.'); return }
    if ((bank.iban || '').trim().length < 5) { alert('Enter a valid IBAN'); return }
    if (!window.confirm('Save these bank details? You can only set them once — to change later you must request Quvera.')) return
    setSavingBank(true)
    try {
      const { error } = await supabase.from('qv_partners').update({ payout_info: bank, bank_locked: true }).eq('id', partner.id)
      if (error) throw error
      await load()
    } catch (e) { alert('Could not save: ' + (e?.message || e)) } finally { setSavingBank(false) }
  }
  async function saveProfile() {
    if (savingProfile || !partner) return
    setSavingProfile(true)
    try {
      const { error } = await supabase.from('qv_partners').update({ name: profile.name.trim() || partner.name, phone: profile.phone || null, company_name: profile.company_name || null }).eq('id', partner.id)
      if (error) throw error
      await load()
    } catch (e) { alert('Could not save: ' + (e?.message || e)) } finally { setSavingProfile(false) }
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text3)' }}>
      <i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite', fontSize: 22 }} /></div>
  }
  // Not a partner and no company → normal experience.
  if (!partner) return <NoCompanyPage />


  const pct = Number(partner.commission_pct || 25) / 100
  const term = Number(partner.term_months || 12)
  const perBiz = PLAN_PRICE * pct
  const paying = referrals.filter(r => isPaid(r) && String(r.status || '').toLowerCase() === 'approved')
  const activePaying = paying.filter(r => monthsSince(r.created_at) < term)
  const monthlyRecurring = activePaying.length * perBiz
  // lifetime estimate: each paying referral earns perBiz for up to `term` months
  const lifetimeEarned = paying.reduce((s, r) => s + perBiz * Math.min(Math.max(monthsSince(r.created_at), 1), term), 0)
  const paidOut = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const pending = Math.max(0, lifetimeEarned - paidOut)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const refLink = `${origin}/?ref=${partner.code}`

  const T = { text: '#eaf0fb', text2: '#a6b6d4', text3: '#7286a8' }
  const STC = { approved: '#22c55e', pending: '#f59e0b', rejected: '#ef4444' }
  const hasBank = (bank.iban || '').trim().length >= 5
  const isActive = partner.status === 'active'
  const tr = tierOf(partner.tier)
  const docs = partner.documents || {}
  const hasDocs = !!(docs.emirates_id && docs.trade_license)
  const paid = partner.payment_status === 'active'
  const bankLocked = !!partner.bank_locked
  const bankVerified = !!partner.bank_verified
  const setupDone = hasDocs && paid && isActive
  const metric = (label, value, color, sub) => (
    <div className="qpp-metric" style={{ '--qc': color }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: T.text3 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, marginTop: 7, letterSpacing: '-.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: T.text3, marginTop: 7 }}>{sub}</div>}
    </div>
  )
  const inpD = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: T.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
  const bLbl = { fontSize: 10.5, color: T.text3, fontWeight: 600, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '.4px' }

  return (
    <div className="qpp" style={{ minHeight: '100vh', color: T.text, padding: 'clamp(14px,3vw,30px)' }}>
      <style>{QPP_CSS}</style>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* header / wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', marginBottom: 18 }}>
          <div className="qpp-logo"><i className="ti ti-bolt" style={{ fontSize: 22 }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '.5px' }}>QUVERA <span className="qpp-grad">PARTNER</span></div>
            <div style={{ fontSize: 12, color: T.text3 }}>{partner.name} · {Math.round(pct * 100)}% for {term} months / referral</div>
          </div>
          <button onClick={logout} className="qpp-ghost"><i className="ti ti-logout" /> Sign out</button>
        </div>

        {!isActive && (
          <div onClick={() => setTab('setup')} className="qpp-card" style={{ marginBottom: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: partner.status === 'paused' ? 'rgba(148,163,184,0.1)' : 'rgba(245,158,11,0.10)', borderColor: partner.status === 'paused' ? 'rgba(255,255,255,0.12)' : 'rgba(245,158,11,0.4)' }}>
            <i className={'ti ' + (partner.status === 'paused' ? 'ti-player-pause' : 'ti-rosette')} style={{ fontSize: 22, color: partner.status === 'paused' ? '#94a3b8' : '#f59e0b' }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{partner.status === 'paused' ? 'Your account is paused' : 'Finish setup to activate your partner account'}</div>
              <div style={{ fontSize: 12, color: T.text3 }}>{partner.status === 'paused' ? 'Contact Quvera to reactivate.' : 'Upload documents, pay your plan & get verified — tap to continue.'}</div>
            </div>
            {partner.status !== 'paused' && <span className="qpp-btn" style={{ pointerEvents: 'none' }}>Finish setup →</span>}
          </div>
        )}

        {/* tabs */}
        <div className="qpp-tabs">
          <button className={'qpp-tab' + (tab === 'overview' ? ' on' : '')} onClick={() => setTab('overview')}><i className="ti ti-layout-dashboard" /> Overview</button>
          <button className={'qpp-tab' + (tab === 'payouts' ? ' on' : '')} onClick={() => setTab('payouts')}><i className="ti ti-wallet" /> Payouts{(isActive && !hasBank) ? <span className="qpp-dot" /> : null}</button>
          <button className={'qpp-tab' + (tab === 'setup' ? ' on' : '')} onClick={() => setTab('setup')}><i className="ti ti-user-cog" /> Account{!setupDone ? <span className="qpp-dot" /> : null}</button>
        </div>

        {tab === 'overview' && <>
          {/* hero metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
            {metric('Monthly recurring', AED(monthlyRecurring), '#00FFCC', `${activePaying.length} active paying`)}
            {metric('Total referred', String(referrals.length), '#00D4FF', `${paying.length} on a paid plan`)}
            {metric('Earned to date', AED(lifetimeEarned), '#8B5CF6', 'estimate')}
            {metric('Pending payout', AED(pending), '#f59e0b', `${AED(paidOut)} paid`)}
          </div>

          {/* referral link */}
          <div className="qpp-card" style={{ marginBottom: 16 }}>
            <div className="qpp-h"><i className="ti ti-link" style={{ color: '#00D4FF' }} /> Your referral link</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0, padding: '11px 13px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 12.5, color: T.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{refLink}</div>
              <button onClick={() => copy(refLink, 'link')} className="qpp-btn" style={{ flexShrink: 0 }}>{copied === 'link' ? 'Copied ✓' : 'Copy link'}</button>
              <button onClick={() => copy(partner.code, 'code')} className="qpp-ghost" style={{ flexShrink: 0 }}>{copied === 'code' ? 'Copied ✓' : partner.code}</button>
            </div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 9, lineHeight: 1.5 }}>Share this link. Every business that signs up through it earns you {Math.round(pct * 100)}% of their {AED(PLAN_PRICE)}/mo plan (≈ {AED(perBiz)}/mo) for {term} months.</div>
          </div>

          {/* referred businesses */}
          <div className="qpp-card">
            <div className="qpp-h"><i className="ti ti-building-store" style={{ color: '#8B5CF6' }} /> Referred businesses ({referrals.length})</div>
            {referrals.length === 0
              ? <div style={{ fontSize: 12.5, color: T.text3, padding: '10px 2px' }}>No referrals yet. Share your link to get started.</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {referrals.map((r, i) => {
                  const st = String(r.status || 'pending').toLowerCase()
                  const earning = isPaid(r) && st === 'approved'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.company_name || 'Business'}</div>
                        <div style={{ fontSize: 11, color: T.text3 }}>Joined {r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} · plan: {r.plan || 'free'}</div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: STC[st] || T.text3, background: (STC[st] || '#64748b') + '22', padding: '3px 9px', borderRadius: 99, textTransform: 'capitalize' }}>{st}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: earning ? '#00FFCC' : T.text3, minWidth: 86, textAlign: 'right' }}>{earning ? AED(perBiz) + '/mo' : '—'}</span>
                    </div>
                  )
                })}
              </div>}
          </div>
        </>}

        {tab === 'payouts' && <>
          {/* request + history */}
          <div className="qpp-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="qpp-h" style={{ margin: 0, flex: 1 }}><i className="ti ti-cash" style={{ color: '#00FFCC' }} /> Payouts</div>
              {payouts.some(p => p.status === 'requested')
                ? <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '6px 12px', borderRadius: 99 }}>Payout requested</span>
                : pending > 0 && <button onClick={() => requestPayout(pending)} disabled={requesting} className="qpp-btn" style={{ background: 'linear-gradient(100deg,#16a34a,#22c55e)' }}>{requesting ? 'Requesting…' : `Request payout (${AED(pending)})`}</button>}
            </div>
            {payouts.length === 0
              ? <div style={{ fontSize: 12.5, color: T.text3, padding: '10px 2px' }}>No payouts yet. Add your bank details and claim once you have pending commission.</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {payouts.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 100, fontSize: 12.5, color: T.text2 }}>{p.period || '—'}{p.reference ? ' · ' + p.reference : ''}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: p.status === 'paid' ? '#00FFCC' : '#f59e0b', background: (p.status === 'paid' ? 'rgba(0,255,204,0.12)' : 'rgba(245,158,11,0.12)'), padding: '3px 9px', borderRadius: 99, textTransform: 'capitalize' }}>{p.status}</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{AED(p.amount)}</span>
                  </div>
                ))}
              </div>}
          </div>
        </>}

        {tab === 'setup' && <>
          {!isActive && (
            <div className="qpp-card" style={{ marginBottom: 16 }}>
              <div className="qpp-h"><i className="ti ti-list-check" style={{ color: '#f59e0b' }} /> Activation checklist</div>
              {[{ ok: hasDocs, label: 'Upload Emirates ID & Trade License' }, { ok: paid, label: `Pay your ${tr.label} plan (AED ${tr.fee}/mo)` }, { ok: partner.docs_verified, label: 'Documents verified by Quvera' }, { ok: isActive, label: 'Account activated' }].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: s.ok ? '#22c55e' : 'rgba(255,255,255,0.06)', color: s.ok ? '#fff' : T.text3 }}>{s.ok ? '✓' : i + 1}</span>
                  <span style={{ fontSize: 12.5, color: s.ok ? T.text2 : T.text }}>{s.label}</span>
                </div>
              ))}
              {hasDocs && paid && !partner.docs_verified && <div style={{ fontSize: 11.5, color: '#f59e0b', marginTop: 8 }}>All submitted — our team is reviewing your documents. You'll be activated shortly.</div>}
            </div>
          )}

          <div className="qpp-card" style={{ marginBottom: 16 }}>
            <div className="qpp-h"><i className="ti ti-user" style={{ color: '#00D4FF' }} /> Your profile</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 11, marginBottom: 12 }}>
              <div><label style={bLbl}>Full name</label><input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} style={inpD} /></div>
              <div><label style={bLbl}>Email</label><input value={partner.email || ''} disabled style={{ ...inpD, opacity: 0.6 }} /></div>
              <div><label style={bLbl}>Mobile number</label><input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} style={inpD} placeholder="+971 50 ..." /></div>
              <div><label style={bLbl}>Company name</label><input value={profile.company_name} onChange={e => setProfile(p => ({ ...p, company_name: e.target.value }))} style={inpD} placeholder="Your company" /></div>
              <div><label style={bLbl}>Referral code</label><input value={partner.code} disabled style={{ ...inpD, opacity: 0.7, fontWeight: 700, color: '#00FFCC' }} /></div>
              <div><label style={bLbl}>Plan</label><input value={`${tr.label} · ${tr.commission}%`} disabled style={{ ...inpD, opacity: 0.6 }} /></div>
            </div>
            <button onClick={saveProfile} disabled={savingProfile} className="qpp-btn">{savingProfile ? 'Saving…' : 'Save profile'}</button>
          </div>

          <div className="qpp-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className="qpp-h" style={{ margin: 0, flex: 1 }}><i className="ti ti-id" style={{ color: '#8B5CF6' }} /> Documents (KYC)</div>
              {partner.docs_verified && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#00FFCC', background: 'rgba(0,255,204,0.12)', padding: '3px 10px', borderRadius: 99 }}>Verified ✓</span>}
            </div>
            <div style={{ fontSize: 11.5, color: T.text3, margin: '6px 0 12px' }}>Upload clear photos or PDFs — verified by the Quvera team.</div>
            {[['emirates_id', 'Emirates ID'], ['trade_license', 'Trade License']].map(([field, label]) => (
              <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: T.text2, flex: 1, minWidth: 120 }}>{label}{docs[field] ? <span style={{ color: '#00FFCC', fontWeight: 700 }}> · uploaded ✓</span> : ''}</span>
                <label className="qpp-ghost" style={{ cursor: 'pointer' }}>{savingDoc === field ? 'Uploading…' : docs[field] ? 'Replace' : 'Upload'}<input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => uploadDoc(field, e.target.files?.[0])} /></label>
              </div>
            ))}
          </div>

          <div className="qpp-card" style={{ marginBottom: 16 }}>
            <div className="qpp-h"><i className="ti ti-arrows-up-down" style={{ color: '#8B5CF6' }} /> Your plan &amp; commission</div>
            <div style={{ fontSize: 11.5, color: T.text3, margin: '-4px 0 12px', lineHeight: 1.5 }}>{paid ? 'Upgrade or downgrade anytime — your subscription is updated and prorated.' : 'Pick the plan you want, then pay below to activate. Higher tier = higher commission.'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {TIER_LIST.map(t => {
                const on = partner.tier === t.key
                const busyT = changingTier === t.key
                return (
                  <button type="button" key={t.key} onClick={() => changePlan(t.key)} disabled={!!changingTier || on}
                    style={{ textAlign: 'center', padding: '13px 6px', borderRadius: 12, cursor: on ? 'default' : 'pointer', position: 'relative', background: on ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)', border: '1.5px solid ' + (on ? '#00D4FF' : 'rgba(255,255,255,0.12)'), opacity: changingTier && !busyT ? 0.5 : 1 }}>
                    {on && <span style={{ position: 'absolute', top: 6, right: 7, fontSize: 9, fontWeight: 800, color: '#00D4FF' }}>CURRENT</span>}
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: T.text }}>{t.label}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: on ? '#00FFCC' : T.text, margin: '4px 0 1px' }}>{t.commission}%</div>
                    <div style={{ fontSize: 10, color: T.text3 }}>{busyT ? 'Updating…' : `AED ${t.fee}/mo`}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="qpp-card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div className="qpp-h" style={{ margin: 0 }}><i className="ti ti-credit-card" style={{ color: '#00FFCC' }} /> Plan payment</div>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>{tr.label} · AED {tr.fee}/month · {tr.commission}% commission</div>
            </div>
            {paid ? <span style={{ fontSize: 12, fontWeight: 700, color: '#00FFCC', background: 'rgba(0,255,204,0.12)', padding: '7px 14px', borderRadius: 99 }}>Active ✓</span>
              : <button onClick={payPlan} disabled={payingPlan} className="qpp-btn">{payingPlan ? 'Opening…' : `Pay AED ${tr.fee}/mo`}</button>}
          </div>

          <div className="qpp-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <div className="qpp-h" style={{ margin: 0, flex: 1 }}><i className="ti ti-building-bank" style={{ color: '#00D4FF' }} /> Payout bank account</div>
              {hasBank && (bankVerified
                ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#00FFCC', background: 'rgba(0,255,204,0.12)', padding: '3px 10px', borderRadius: 99 }}>Verified ✓</span>
                : <span style={{ fontSize: 10.5, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '3px 10px', borderRadius: 99 }}>Verification pending</span>)}
            </div>
            <div style={{ fontSize: 11.5, color: bankLocked ? '#f59e0b' : T.text3, marginBottom: 12, lineHeight: 1.5 }}>{bankLocked ? '🔒 Bank details are locked. To change them, contact Quvera.' : 'You can set your bank details only once — double-check before saving.'}</div>
            {hasBank && !bankVerified && <div style={{ fontSize: 11.5, color: T.text3, marginBottom: 12, lineHeight: 1.5, padding: '8px 11px', borderRadius: 9, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>Quvera verifies your account (name + IBAN) before your first payout. This is usually done within 1–2 business days.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 11, marginBottom: 12 }}>
              <div><label style={bLbl}>Account holder</label><input value={bank.account_holder} onChange={e => setBank(b => ({ ...b, account_holder: e.target.value }))} disabled={bankLocked} style={{ ...inpD, opacity: bankLocked ? 0.6 : 1 }} /></div>
              <div><label style={bLbl}>Bank name</label><input value={bank.bank_name} onChange={e => setBank(b => ({ ...b, bank_name: e.target.value }))} disabled={bankLocked} style={{ ...inpD, opacity: bankLocked ? 0.6 : 1 }} placeholder="e.g. Emirates NBD" /></div>
              <div><label style={bLbl}>IBAN</label><input value={bank.iban} onChange={e => setBank(b => ({ ...b, iban: e.target.value.toUpperCase() }))} disabled={bankLocked} style={{ ...inpD, opacity: bankLocked ? 0.6 : 1 }} placeholder="AE07 0331 ..." /></div>
              <div><label style={bLbl}>SWIFT / BIC <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label><input value={bank.swift} onChange={e => setBank(b => ({ ...b, swift: e.target.value.toUpperCase() }))} disabled={bankLocked} style={{ ...inpD, opacity: bankLocked ? 0.6 : 1 }} /></div>
            </div>
            {!bankLocked && <button onClick={saveBank} disabled={savingBank} className="qpp-btn">{savingBank ? 'Saving…' : 'Save bank details (one-time)'}</button>}
          </div>
        </>}

        <div style={{ fontSize: 11, color: T.text3, textAlign: 'center', marginTop: 20 }}>
          Quvera Partner Program · figures are estimates; final commission confirmed at payout.
          <br />
          <button onClick={() => setShowTerms(true)} style={{ background: 'none', border: 'none', padding: '6px 0 0', color: T.text2, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Partner Terms &amp; Conditions</button>
        </div>
      </div>
      {showTerms && <PartnerTerms onClose={() => setShowTerms(false)} />}
    </div>
  )
}

const QPP_CSS = `
.qpp{ background:
  radial-gradient(900px 480px at 50% -8%, rgba(0,212,255,0.13), transparent 60%),
  radial-gradient(760px 520px at 96% 72%, rgba(139,92,246,0.12), transparent 55%),
  radial-gradient(600px 400px at 4% 90%, rgba(0,255,204,0.07), transparent 55%),
  #0b1020; }
.qpp-grad{ background:linear-gradient(100deg,#00D4FF,#00FFCC 55%,#8B5CF6); -webkit-background-clip:text; background-clip:text; color:transparent; }
.qpp-logo{ width:46px; height:46px; border-radius:13px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:#fff;
  background:radial-gradient(circle at 50% 35%, rgba(0,212,255,0.9), rgba(139,92,246,0.7)); box-shadow:0 0 22px -4px rgba(0,212,255,0.6); }
.qpp-card{ background:rgba(255,255,255,0.045); border:1px solid rgba(255,255,255,0.09); border-radius:16px; padding:18px; backdrop-filter:blur(8px); }
.qpp-h{ font-size:12px; font-weight:700; color:#a6b6d4; margin-bottom:12px; letter-spacing:.3px; }
.qpp-metric{ position:relative; overflow:hidden; background:rgba(255,255,255,0.045); border:1px solid rgba(255,255,255,0.09); border-radius:16px; padding:16px 18px; transition:transform .15s, border-color .2s; }
.qpp-metric:hover{ transform:translateY(-2px); border-color:var(--qc); }
.qpp-metric::before{ content:''; position:absolute; inset:0; opacity:0; transition:opacity .2s; pointer-events:none; background:radial-gradient(120% 90% at 100% 0%, var(--qc), transparent 55%); }
.qpp-metric:hover::before{ opacity:.13; }
.qpp-tabs{ display:flex; gap:6px; margin-bottom:18px; border-bottom:1px solid rgba(255,255,255,0.08); }
.qpp-tab{ position:relative; display:inline-flex; align-items:center; gap:7px; padding:10px 16px; background:none; border:none; color:#7286a8; font-size:13.5px; font-weight:700; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
.qpp-tab.on{ color:#eaf0fb; border-bottom-color:#00D4FF; }
.qpp-dot{ width:7px; height:7px; border-radius:99px; background:#f59e0b; display:inline-block; }
.qpp-btn{ padding:10px 18px; border-radius:10px; border:none; cursor:pointer; font-size:12.5px; font-weight:700; color:#fff; background:linear-gradient(100deg,#00D4FF,#8B5CF6); box-shadow:0 6px 18px -6px rgba(0,212,255,0.5); }
.qpp-btn:disabled{ opacity:.7; cursor:default; }
.qpp-ghost{ display:inline-flex; align-items:center; gap:6px; padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.04); color:#a6b6d4; cursor:pointer; font-size:12.5px; font-weight:700; }
.qpp ::placeholder{ color:#5a6b8c; }
`
