// Public client-facing project page (no portal login). Reached at #project/<token>.
// The client verifies with a one-time code (Supabase email OTP); data is then read
// via fn_get_project_by_token / fn_respond_project_update, which only return data
// when the verified email matches the project's client_email.
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const INK = '#1a1a1a', CYAN = '#0099cc'
const fmtDate = d => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '—' } }
const PSTATUS = {
  planning: { l: 'Planning', c: '#64748b' }, designing: { l: 'Designing', c: '#6366f1' },
  production: { l: 'Production', c: '#0ea5e9' }, ready_delivery: { l: 'Ready for delivery', c: '#eab308' },
  site_install: { l: 'Site installation', c: '#f97316' }, ongoing: { l: 'Ongoing', c: '#0099cc' },
  snagging: { l: 'Snagging', c: '#a855f7' }, handover: { l: 'Handover', c: '#14b8a6' },
  completed: { l: 'Completed', c: '#22c55e' }, on_hold: { l: 'On Hold', c: '#f59e0b' }, cancelled: { l: 'Cancelled', c: '#ef4444' },
}
const UPD_KIND = {
  meeting: { l: 'Meeting', c: '#0099cc', icon: 'ti-users' }, note: { l: 'Note', c: '#64748b', icon: 'ti-note' },
  requirement: { l: 'Requirement', c: '#8b5cf6', icon: 'ti-star' }, material: { l: 'Material change', c: '#f59e0b', icon: 'ti-package' },
  timeline: { l: 'Timeline change', c: '#ef4444', icon: 'ti-calendar-stats' }, decision: { l: 'Decision', c: '#14b8a6', icon: 'ti-checkbox' },
}

const Shell = ({ children }) => (
  <div style={{ minHeight: '100vh', background: '#f4f5f7', padding: '24px 12px', fontFamily: 'Arial, Helvetica, sans-serif', color: INK }}>
    <div style={{ maxWidth: 760, margin: '0 auto' }}>{children}</div>
  </div>
)
const Center = ({ icon, title, sub, color, children }) => (
  <Shell><div style={{ background: '#fff', borderRadius: 14, padding: '44px 24px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
    <div style={{ fontSize: 38, marginBottom: 10, color: color || '#94a3b8' }}><i className={`ti ${icon}`} /></div>
    <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
    {sub && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, lineHeight: 1.6 }}>{sub}</div>}
    {children}
  </div></Shell>
)
const inputCss = { width: '100%', padding: '11px 13px', fontSize: 14, border: '1px solid #d8dde3', borderRadius: 9, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }
const btnCss = (bg, fg) => ({ padding: '11px 16px', borderRadius: 9, border: 'none', background: bg, color: fg || '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' })

export default function ClientProject({ token }) {
  const [phase, setPhase] = useState('loading')  // loading | email | otp | ready | notfound | error
  const [data, setData] = useState(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [comments, setComments] = useState({})    // updateId -> comment
  const [respId, setRespId] = useState(null)

  async function load() {
    const { data: res, error } = await supabase.rpc('fn_get_project_by_token', { p_token: token })
    if (error) { setPhase('error'); return }
    if (res?.ok) { setData(res); setPhase('ready'); return }
    if (res?.error === 'need_otp') { setPhase('email'); return }
    if (res?.error === 'unauthorized') { setPhase('email'); setErr('This link belongs to a different email. Enter the email your project link was shared with.'); return }
    setPhase('notfound')
  }
  useEffect(() => { load() }, [token])

  async function sendCode() {
    if (!/.+@.+\..+/.test(email)) { setErr('Enter a valid email'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) { setErr(error.message || 'Could not send code'); return }
    setPhase('otp')
  }
  async function verify() {
    if (!code.trim()) { setErr('Enter the code from your email'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    if (error) { setBusy(false); setErr('Invalid or expired code. Try again.'); return }
    await load(); setBusy(false)
  }
  async function respond(updateId, response) {
    setRespId(updateId + response); setErr('')
    const { data: res } = await supabase.rpc('fn_respond_project_update', { p_token: token, p_update_id: updateId, p_response: response, p_comment: comments[updateId] || null })
    setRespId(null)
    if (res?.ok) { await load() } else { setErr('Could not save your response. Please try again.') }
  }
  async function signOutClient() { await supabase.auth.signOut(); setData(null); setEmail(''); setCode(''); setErr(''); setPhase('email') }

  if (phase === 'loading') return <Center icon="ti-loader-2" title="Loading your project…" />
  if (phase === 'notfound') return <Center icon="ti-link-off" title="Link not found" sub="This project link is invalid or has been removed. Please ask the company for a new link." />
  if (phase === 'error') return <Center icon="ti-alert-triangle" title="Something went wrong" sub="Please refresh the page or try again later." color="#ef4444" />

  if (phase === 'email') return (
    <Center icon="ti-mail" title="View your project" sub="Enter the email this link was shared with. We’ll send you a one-time code." color={CYAN}>
      <div style={{ maxWidth: 340, margin: '18px auto 0', textAlign: 'left' }}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" style={{ ...inputCss, marginBottom: 10 }} onKeyDown={e => e.key === 'Enter' && sendCode()} />
        {err && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>{err}</div>}
        <button onClick={sendCode} disabled={busy} style={{ ...btnCss(CYAN), width: '100%', opacity: busy ? 0.7 : 1 }}>{busy ? 'Sending…' : 'Send code'}</button>
      </div>
    </Center>
  )
  if (phase === 'otp') return (
    <Center icon="ti-shield-lock" title="Enter your code" sub={`We sent a 6-digit code to ${email}. Enter it below to continue.`} color={CYAN}>
      <div style={{ maxWidth: 340, margin: '18px auto 0', textAlign: 'left' }}>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" placeholder="123456" style={{ ...inputCss, marginBottom: 10, letterSpacing: 4, textAlign: 'center', fontSize: 20 }} onKeyDown={e => e.key === 'Enter' && verify()} />
        {err && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>{err}</div>}
        <button onClick={verify} disabled={busy} style={{ ...btnCss(CYAN), width: '100%', opacity: busy ? 0.7 : 1 }}>{busy ? 'Verifying…' : 'Verify & view project'}</button>
        <button onClick={() => { setPhase('email'); setCode(''); setErr('') }} style={{ ...btnCss('transparent', '#6b7280'), width: '100%', marginTop: 8 }}>Use a different email</button>
      </div>
    </Center>
  )

  // ready
  const p = data.project, co = data.company || {}, st = PSTATUS[p.status] || PSTATUS.planning
  const prog = Math.max(0, Math.min(100, p.progress || 0))
  const updates = data.updates || [], milestones = data.milestones || []
  return (
    <Shell>
      {/* company header */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
        {co.logo_url
          ? <img src={co.logo_url} alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'contain', background: '#f4f5f7' }} />
          : <div style={{ width: 46, height: 46, borderRadius: 10, background: CYAN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>{(co.name || 'C')[0]}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{co.name || 'Your contractor'}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Project portal{co.phone ? ' · ' + co.phone : ''}</div>
        </div>
        <button onClick={signOutClient} style={{ ...btnCss('#f4f5f7', '#6b7280'), padding: '7px 12px', fontSize: 12 }}>Sign out</button>
      </div>

      {/* project summary */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800 }}>{p.name}</div>
            {p.location && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}><i className="ti ti-map-pin" /> {p.location}</div>}
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '5px 12px', borderRadius: 99, background: st.c + '22', color: st.c, textTransform: 'uppercase', letterSpacing: '.4px' }}>{st.l}</span>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 5 }}><span>Progress</span><span style={{ fontWeight: 800, color: st.c }}>{prog}%</span></div>
          <div style={{ height: 9, background: '#eef1f4', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: prog + '%', height: '100%', background: st.c, borderRadius: 99 }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 120, background: '#f8fafc', border: '1px solid #eef1f4', borderRadius: 10, padding: '10px 13px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>Start</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtDate(p.start_date)}</div></div>
          <div style={{ flex: 1, minWidth: 120, background: '#f8fafc', border: '1px solid #eef1f4', borderRadius: 10, padding: '10px 13px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>Target completion</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtDate(p.end_date)}</div></div>
        </div>
      </div>

      {/* milestones */}
      {milestones.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Stages</div>
          {milestones.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i ? '1px solid #f0f2f5' : 'none' }}>
              <i className={`ti ${m.status === 'done' ? 'ti-circle-check-filled' : 'ti-circle'}`} style={{ fontSize: 18, color: m.status === 'done' ? '#22c55e' : '#cbd5e1' }} />
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, textDecoration: m.status === 'done' ? 'none' : 'none' }}>{m.title}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{fmtDate(m.target_date)}</div>
            </div>
          ))}
        </div>
      )}

      {/* updates timeline */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Updates &amp; history</div>
        {updates.length === 0
          ? <div style={{ fontSize: 13, color: '#94a3b8', padding: '14px 0' }}>No updates shared yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {updates.map(u => {
                const k = UPD_KIND[u.kind] || UPD_KIND.note
                const pending = u.needs_approval && u.approval_status === 'pending'
                return (
                  <div key={u.id} style={{ display: 'flex', gap: 12, padding: '13px', border: '1px solid #eef1f4', borderRadius: 12, background: pending ? '#fffdf5' : '#fff' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: k.c + '1f', color: k.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={`ti ${k.icon}`} style={{ fontSize: 17 }} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: k.c, background: k.c + '1f', padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.3px' }}>{k.l}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDate(u.event_date)}</span>
                        {u.approval_status === 'approved' && <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', background: '#22c55e1f', padding: '2px 7px', borderRadius: 99 }}>You approved</span>}
                        {u.approval_status === 'rejected' && <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', background: '#ef44441f', padding: '2px 7px', borderRadius: 99 }}>You rejected</span>}
                      </div>
                      {u.title && <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{u.title}</div>}
                      {u.body && <div style={{ fontSize: 13, color: '#475569', marginTop: 3, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{u.body}</div>}
                      {u.kind === 'timeline' && (u.old_date || u.new_date) && <div style={{ fontSize: 12.5, color: '#475569', marginTop: 6, fontWeight: 600 }}><i className="ti ti-calendar-stats" style={{ verticalAlign: '-2px', color: '#ef4444' }} /> {fmtDate(u.old_date)} → <b>{fmtDate(u.new_date)}</b></div>}
                      {pending && (
                        <div style={{ marginTop: 11, borderTop: '1px dashed #e2e8f0', paddingTop: 11 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 7 }}><i className="ti ti-alert-circle" style={{ verticalAlign: '-2px' }} /> This change needs your confirmation</div>
                          <input value={comments[u.id] || ''} onChange={e => setComments(c => ({ ...c, [u.id]: e.target.value }))} placeholder="Add a comment (optional)…" style={{ ...inputCss, fontSize: 13, padding: '8px 10px', marginBottom: 8 }} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => respond(u.id, 'approved')} disabled={!!respId} style={{ ...btnCss('#22c55e'), flex: 1, fontSize: 13, padding: '9px', opacity: respId ? 0.6 : 1 }}>{respId === u.id + 'approved' ? '…' : '✓ Approve'}</button>
                            <button onClick={() => respond(u.id, 'rejected')} disabled={!!respId} style={{ ...btnCss('#fff', '#ef4444'), border: '1px solid #ef4444', flex: 1, fontSize: 13, padding: '9px', opacity: respId ? 0.6 : 1 }}>{respId === u.id + 'rejected' ? '…' : '✕ Reject'}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>}
        {err && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 10 }}>{err}</div>}
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 16 }}>Powered by Quvera</div>
    </Shell>
  )
}
