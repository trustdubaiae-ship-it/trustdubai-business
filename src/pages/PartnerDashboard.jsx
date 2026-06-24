import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NoCompanyPage from './NoCompanyPage'

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
      const [refsRes, paysRes] = await Promise.all([
        supabase.rpc('partner_my_referrals'),
        supabase.from('qv_partner_payouts').select('*').eq('partner_id', p.id).order('created_at', { ascending: false }),
      ])
      setReferrals(refsRes.data || [])
      setPayouts(paysRes.data || [])
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
      const period = new Date().toISOString().slice(0, 7)
      const { error } = await supabase.from('qv_partner_payouts')
        .insert({ partner_id: partner.id, amount: Math.round(amount), status: 'requested', period })
      if (error) throw error
      await load()
    } catch (e) { alert('Could not request payout: ' + (e?.message || e)) } finally { setRequesting(false) }
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text3)' }}>
      <i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite', fontSize: 22 }} /></div>
  }
  // Not a partner and no company → normal experience.
  if (!partner) return <NoCompanyPage />

  // Pending approval — they can sign in but don't earn until activated.
  if (partner.status === 'pending') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 440, background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 16, padding: 28, textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(245,158,11,0.15)', border: '2px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>⏳</div>
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Welcome, {partner.name}!</div>
          <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 14 }}>Your partner account is <b style={{ color: '#f59e0b' }}>under review</b>. Once our team activates it, your referral link goes live and you start earning 25% recurring commission.</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 20 }}>Your referral code (active after approval): <b style={{ color: 'var(--text)' }}>{partner.code}</b></div>
          <button onClick={logout} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}><i className="ti ti-logout" /> Sign out</button>
        </div>
      </div>
    )
  }

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

  const card = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 16 }
  const stat = (label, value, color, sub) => (
    <div style={{ ...card, flex: '1 1 150px', minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4, letterSpacing: '-.5px' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
  const STC = { approved: '#22c55e', pending: '#f59e0b', rejected: '#ef4444' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: 'clamp(14px,3vw,28px)' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(135deg,#0099cc,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}><i className="ti ti-friends" style={{ fontSize: 24 }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.4px' }}>Partner Dashboard</div>
            <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Welcome, {partner.name} · {Math.round(pct * 100)}% commission for {term} months per referral</div>
          </div>
          <button onClick={logout} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer' }}><i className="ti ti-logout" /> Sign out</button>
        </div>

        {partner.status !== 'active' && (
          <div style={{ ...card, marginBottom: 14, background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.4)', color: '#b45309', fontSize: 13 }}>
            <i className="ti ti-player-pause" /> Your partner account is paused. New referrals won't earn until it's reactivated.
          </div>
        )}

        {/* earnings */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {stat('Monthly recurring', AED(monthlyRecurring), '#22c55e', `${activePaying.length} active paying`)}
          {stat('Total referred', String(referrals.length), '#0099cc', `${paying.length} on a paid plan`)}
          {stat('Earned to date', AED(lifetimeEarned), 'var(--text)', 'estimate')}
          {stat('Pending payout', AED(pending), '#f59e0b', `${AED(paidOut)} paid`)}
        </div>

        {/* referral link */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 9 }}><i className="ti ti-link" style={{ color: '#0099cc' }} /> Your referral link</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 240px', minWidth: 0, padding: '10px 12px', borderRadius: 9, background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{refLink}</div>
            <button onClick={() => copy(refLink, 'link')} style={{ padding: '10px 14px', borderRadius: 9, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{copied === 'link' ? 'Copied ✓' : 'Copy link'}</button>
            <button onClick={() => copy(partner.code, 'code')} style={{ padding: '10px 14px', borderRadius: 9, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{copied === 'code' ? 'Copied ✓' : 'Code: ' + partner.code}</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>Share this link. Any business that signs up through it is tagged to you — you earn {Math.round(pct * 100)}% of their {AED(PLAN_PRICE)}/month plan (≈ {AED(perBiz)}/month) for {term} months.</div>
        </div>

        {/* referred businesses */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 }}><i className="ti ti-building-store" style={{ color: '#8b5cf6' }} /> Your referred businesses ({referrals.length})</div>
          {referrals.length === 0
            ? <div style={{ fontSize: 12.5, color: 'var(--text3)', padding: '10px 2px' }}>No referrals yet. Share your link to get started.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {referrals.map((r, i) => {
                const st = String(r.status || 'pending').toLowerCase()
                const earning = isPaid(r) && st === 'approved'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg2)', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{r.company_name || 'Business'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Joined {r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} · plan: {r.plan || 'free'}</div>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: STC[st] || '#64748b', background: (STC[st] || '#64748b') + '1f', padding: '3px 9px', borderRadius: 99, textTransform: 'capitalize' }}>{st}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: earning ? '#22c55e' : 'var(--text3)', minWidth: 86, textAlign: 'right' }}>{earning ? AED(perBiz) + '/mo' : '—'}</span>
                  </div>
                )
              })}
            </div>}
        </div>

        {/* payout setup (Stripe Connect) */}
        <div style={{ ...card, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: partner.payouts_enabled ? 'rgba(34,197,94,0.15)' : 'rgba(0,153,204,0.12)', color: partner.payouts_enabled ? '#22c55e' : '#0099cc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={'ti ' + (partner.payouts_enabled ? 'ti-circle-check' : 'ti-building-bank')} style={{ fontSize: 20 }} /></div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{partner.payouts_enabled ? 'Payouts connected' : 'Set up payouts'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5 }}>{partner.payouts_enabled ? 'Your commission will be sent to your connected account.' : 'Add your bank details (via Stripe) so we can send your commission.'}</div>
          </div>
          {!partner.payouts_enabled && <button onClick={() => setupPayouts(false)} disabled={connecting} style={{ padding: '9px 16px', borderRadius: 9, background: '#0099cc', color: '#fff', border: 'none', cursor: connecting ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 700, flexShrink: 0, opacity: connecting ? 0.7 : 1 }}>{connecting ? 'Opening…' : 'Set up'}</button>}
        </div>

        {/* payouts */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', flex: 1 }}><i className="ti ti-cash" style={{ color: '#22c55e' }} /> Payout history</div>
            {payouts.some(p => p.status === 'requested')
              ? <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '5px 11px', borderRadius: 99 }}>Payout requested</span>
              : pending > 0 && <button onClick={() => requestPayout(pending)} disabled={requesting} style={{ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 9, background: '#22c55e', color: '#fff', border: 'none', cursor: requesting ? 'default' : 'pointer', opacity: requesting ? 0.7 : 1 }}>{requesting ? 'Requesting…' : `Request payout (${AED(pending)})`}</button>}
          </div>
          {payouts.length === 0
            ? <div style={{ fontSize: 12.5, color: 'var(--text3)', padding: '10px 2px' }}>No payouts yet. Earnings are paid monthly.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {payouts.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'var(--bg2)', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 100, fontSize: 12.5, color: 'var(--text2)' }}>{p.period || '—'}{p.reference ? ' · ' + p.reference : ''}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: p.status === 'paid' ? '#22c55e' : '#f59e0b', background: (p.status === 'paid' ? '#22c55e' : '#f59e0b') + '1f', padding: '3px 9px', borderRadius: 99, textTransform: 'capitalize' }}>{p.status}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{AED(p.amount)}</span>
                </div>
              ))}
            </div>}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 18 }}>Quvera Partner Program · figures are estimates; final commission is confirmed at payout.</div>
      </div>
    </div>
  )
}
