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
  <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #e8f3f9 0%, #f4f6f8 340px)', padding: '22px 12px 40px', fontFamily: "'Segoe UI', Arial, Helvetica, sans-serif", color: INK }}>
    <style>{`@keyframes cpUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    <div style={{ maxWidth: 720, margin: '0 auto', animation: 'cpUp .35s ease' }}>{children}</div>
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
const Ring = ({ pct, color, big, small }) => {
  const C = 2 * Math.PI * 30
  return (
    <div style={{ position: 'relative', width: 86, height: 86 }}>
      <svg width="86" height="86" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="43" cy="43" r="30" fill="none" stroke="#eef1f4" strokeWidth="7" />
        <circle cx="43" cy="43" r="30" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(100, pct)) / 100)} style={{ transition: 'stroke-dashoffset .5s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 19, fontWeight: 800, color, lineHeight: 1 }}>{big}</span>
        <span style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', letterSpacing: '.5px', marginTop: 2 }}>{small}</span>
      </div>
    </div>
  )
}
const inputCss = { width: '100%', padding: '11px 13px', fontSize: 14, border: '1px solid #d8dde3', borderRadius: 9, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }
const btnCss = (bg, fg) => ({ padding: '11px 16px', borderRadius: 9, border: 'none', background: bg, color: fg || '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' })

export default function ClientProject({ token }) {
  const [phase, setPhase] = useState('code')  // code | ready | notfound | error
  const [data, setData] = useState(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [comments, setComments] = useState({})    // updateId -> comment
  const [respId, setRespId] = useState(null)
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const CODE_KEY = 'qv_proj_code_' + token

  async function fetchProject(c) {
    const { data: res, error } = await supabase.rpc('fn_get_project_by_token', { p_token: token, p_code: c })
    if (error) return { ok: false, error: 'error' }
    return res || { ok: false, error: 'error' }
  }
  // remembered code on this device → open straight away without asking again
  useEffect(() => {
    let saved = ''
    try { saved = localStorage.getItem(CODE_KEY) || '' } catch { /* ignore */ }
    if (!saved) return
    setCode(saved)
    ;(async () => {
      const res = await fetchProject(saved)
      if (res.ok) { setData(res); setPhase('ready') }
      else { try { localStorage.removeItem(CODE_KEY) } catch { /* ignore */ } }
    })()
  }, [token])

  async function submit() {
    if (!code.trim()) { setErr('Enter the access code'); return }
    setBusy(true); setErr('')
    const res = await fetchProject(code.trim())
    setBusy(false)
    if (res.ok) { try { localStorage.setItem(CODE_KEY, code.trim()) } catch { /* ignore */ } setData(res); setPhase('ready'); return }
    if (res.error === 'bad_code') { setErr('Wrong code. Check the access code your contractor sent you.'); return }
    if (res.error === 'not_found') { setPhase('notfound'); return }
    setErr('Could not open the project. Please try again.')
  }
  async function reload() { const res = await fetchProject(code.trim()); if (res.ok) setData(res) }
  async function respond(updateId, response) {
    setRespId(updateId + response); setErr('')
    const { data: res } = await supabase.rpc('fn_respond_project_update', { p_token: token, p_code: code.trim(), p_update_id: updateId, p_response: response, p_comment: comments[updateId] || null })
    setRespId(null)
    if (res?.ok) { await reload() } else { setErr('Could not save your response. Please try again.') }
  }
  function lock() { try { localStorage.removeItem(CODE_KEY) } catch { /* ignore */ } setData(null); setCode(''); setErr(''); setPhase('code') }
  async function postUpdate() {
    if (!msg.trim()) return
    setSending(true); setErr('')
    const { data: res } = await supabase.rpc('fn_add_client_update', { p_token: token, p_code: code.trim(), p_body: msg.trim() })
    setSending(false)
    if (res?.ok) { setMsg(''); await reload() } else { setErr('Could not send your message. Please try again.') }
  }
  function exportPdf() {
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const pr = data.project, com = data.company || {}
    const rows = (data.updates || []).map(u => {
      const k = UPD_KIND[u.kind] || UPD_KIND.note
      const meta = `${esc(fmtDate(u.event_date))} · ${u.from_client ? 'Client' : esc(k.l)}${u.approval_status === 'approved' ? ' · approved' : u.approval_status === 'rejected' ? ' · rejected' : ''}`
      return `<div style="border-left:3px solid ${u.from_client ? '#0a6f8f' : k.c};padding:8px 12px;margin-bottom:8px;background:#fafbfc;border-radius:6px;">
        <div style="font-size:11px;color:#888;">${meta}</div>
        ${u.title ? `<div style="font-weight:700;font-size:13px;margin-top:2px;">${esc(u.title)}</div>` : ''}
        ${u.body ? `<div style="font-size:12px;color:#444;margin-top:2px;white-space:pre-wrap;">${esc(u.body)}</div>` : ''}
        ${u.kind === 'timeline' && (u.old_date || u.new_date) ? `<div style="font-size:11px;color:#c0392b;margin-top:3px;">${esc(fmtDate(u.old_date))} &rarr; ${esc(fmtDate(u.new_date))}</div>` : ''}
      </div>`
    }).join('')
    const inner = `<div style="font-family:Arial,Helvetica,sans-serif;padding:30px;color:#1a1a1a;">
      <div style="border-bottom:2px solid #0099cc;padding-bottom:10px;margin-bottom:14px;">
        <div style="font-size:18px;font-weight:800;">${esc(com.name || '')}</div>
        <div style="font-size:13px;color:#666;margin-top:2px;">Project communication — ${esc(pr.name)}</div>
        <div style="font-size:11px;color:#999;margin-top:2px;">Status: ${esc((PSTATUS[pr.status] || {}).l || pr.status)} · ${esc(fmtDate(pr.start_date))} &rarr; ${esc(fmtDate(pr.end_date))}</div>
      </div>
      ${rows || '<div style="color:#999;font-size:12px;">No updates yet.</div>'}
    </div>`
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(pr.name)} — communication</title><style>@page{size:A4;margin:14mm}.__b{position:fixed;top:0;left:0;right:0;height:46px;background:#0f1623;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 14px;font-family:sans-serif;z-index:9}@media print{.__b{display:none}.__s{box-shadow:none!important;margin:0!important}}.__b button{padding:7px 13px;border:none;border-radius:7px;font-weight:600;cursor:pointer}</style></head><body style="margin:0;background:#eef2f6;padding-top:46px;"><div class="__b"><span style="font-size:13px;">${esc(pr.name)} — communication</span><span><button onclick="window.print()" style="background:#0099cc;color:#fff;">Print / PDF</button> <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;margin-left:8px;">Close</button></span></div><div class="__s" style="max-width:760px;margin:14px auto;background:#fff;box-shadow:0 6px 28px rgba(0,0,0,.2);">${inner}</div></body></html>`)
    w.document.close()
  }

  if (phase === 'notfound') return <Center icon="ti-link-off" title="Link not found" sub="This project link is invalid or has been removed. Please ask the company for a new link." />
  if (phase === 'error') return <Center icon="ti-alert-triangle" title="Something went wrong" sub="Please refresh the page or try again later." color="#ef4444" />

  if (phase === 'code') return (
    <Center icon="ti-lock" title="View your project" sub="Enter the access code your contractor shared with you (e.g. on WhatsApp)." color={CYAN}>
      <div style={{ maxWidth: 320, margin: '18px auto 0', textAlign: 'left' }}>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6-digit code" style={{ ...inputCss, marginBottom: 10, letterSpacing: 6, textAlign: 'center', fontSize: 22 }} onKeyDown={e => e.key === 'Enter' && submit()} />
        {err && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>{err}</div>}
        <button onClick={submit} disabled={busy} style={{ ...btnCss(CYAN), width: '100%', opacity: busy ? 0.7 : 1 }}>{busy ? 'Opening…' : 'View project'}</button>
      </div>
    </Center>
  )

  // ready
  const p = data.project, co = data.company || {}, st = PSTATUS[p.status] || PSTATUS.planning
  const prog = Math.max(0, Math.min(100, p.progress || 0))
  const updates = data.updates || [], milestones = data.milestones || []
  // timeline ring — share of the schedule elapsed + days remaining
  let timePct = 0, daysLeft = null, overdue = false
  if (p.start_date && p.end_date) {
    const s = new Date(p.start_date), e = new Date(p.end_date), now = new Date(); now.setHours(0, 0, 0, 0)
    const total = Math.max(1, (e - s) / 86400000)
    timePct = Math.round(((now - s) / 86400000) / total * 100)
    daysLeft = Math.round((e - now) / 86400000)
    overdue = daysLeft < 0
  }
  const tColor = overdue ? '#ef4444' : CYAN
  return (
    <Shell>
      {/* branded hero — company + project + status */}
      <div style={{ background: 'linear-gradient(135deg, #0099cc 0%, #0a6f8f 100%)', color: '#fff', borderRadius: 20, padding: '22px 22px 24px', boxShadow: '0 14px 34px rgba(0,153,204,0.30)', marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -45, right: -35, width: 170, height: 170, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
            {co.logo_url
              ? <img src={co.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ color: CYAN, fontWeight: 800, fontSize: 20 }}>{(co.name || 'C')[0]}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{co.name || 'Your contractor'}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 0 3px rgba(74,222,128,0.3)' }} /> Live project portal
            </div>
          </div>
          <button onClick={lock} title="Lock" style={{ ...btnCss('rgba(255,255,255,0.18)', '#fff'), padding: '8px 12px', fontSize: 12, backdropFilter: 'blur(4px)' }}><i className="ti ti-lock" /></button>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.3px', lineHeight: 1.15 }}>{p.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 11px', borderRadius: 99, background: 'rgba(255,255,255,0.22)', color: '#fff', textTransform: 'uppercase', letterSpacing: '.4px' }}>{st.l}</span>
            {p.location && <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.88)' }}><i className="ti ti-map-pin" style={{ verticalAlign: '-2px' }} /> {p.location}</span>}
          </div>
        </div>
      </div>

      {/* progress + timeline */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '18px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', padding: '18px 12px', background: 'linear-gradient(180deg, #f7fbfd, #f1f6f9)', border: '1px solid #e8eef3', borderRadius: 14 }}>
          <div style={{ textAlign: 'center', minWidth: 110 }}>
            <Ring pct={prog} color={st.c} big={prog + '%'} small="DONE" />
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#334155', marginTop: 8 }}>Project status</div>
            <div style={{ fontSize: 11, color: st.c, fontWeight: 600 }}>{st.l}</div>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: '#e2e8f0' }} />
          <div style={{ textAlign: 'center', minWidth: 110 }}>
            <Ring pct={Math.max(0, Math.min(100, timePct))} color={tColor} big={daysLeft != null ? (overdue ? Math.abs(daysLeft) + 'd' : daysLeft + 'd') : '—'} small={daysLeft != null ? (overdue ? 'OVERDUE' : 'LEFT') : 'NO DATES'} />
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#334155', marginTop: 8 }}>Timeline</div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{p.start_date && p.end_date ? timePct + '% elapsed' : 'Not set'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 120, background: '#f8fafc', border: '1px solid #eef1f4', borderRadius: 10, padding: '10px 13px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>Start</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtDate(p.start_date)}</div></div>
          <div style={{ flex: 1, minWidth: 120, background: '#f8fafc', border: '1px solid #eef1f4', borderRadius: 10, padding: '10px 13px' }}><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>Target completion</div><div style={{ fontSize: 14, fontWeight: 700 }}>{fmtDate(p.end_date)}</div></div>
        </div>
      </div>

      {/* milestones */}
      {milestones.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>Project stages</div>
          {milestones.map((m, i) => {
            const done = m.status === 'done'
            const current = !done && milestones.slice(0, i).every(x => x.status === 'done')
            const last = i === milestones.length - 1
            return (
              <div key={i} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: last ? 0 : 16 }}>
                {!last && <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 2, background: done ? '#22c55e' : '#e7ecf1' }} />}
                <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? '#22c55e' : '#fff', border: done ? 'none' : `2px solid ${current ? CYAN : '#cbd5e1'}`, color: '#fff', zIndex: 1, boxShadow: current ? `0 0 0 4px ${CYAN}22` : 'none' }}>
                  {done ? <i className="ti ti-check" style={{ fontSize: 14 }} /> : <span style={{ width: 7, height: 7, borderRadius: '50%', background: current ? CYAN : '#cbd5e1' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: done ? '#64748b' : '#1a1a1a' }}>{m.title}{current && <span style={{ fontSize: 9, fontWeight: 800, color: CYAN, background: CYAN + '1a', padding: '2px 7px', borderRadius: 99, marginLeft: 8 }}>IN PROGRESS</span>}</div>
                  {m.target_date && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}><i className="ti ti-calendar" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {fmtDate(m.target_date)}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* updates timeline */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Updates &amp; history</div>
          <button onClick={exportPdf} style={{ ...btnCss('#f1f5f9', '#475569'), fontSize: 12, padding: '7px 12px' }}><i className="ti ti-file-download" /> Export PDF</button>
        </div>
        {/* client composer */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Write a message to your contractor…" style={{ ...inputCss, fontSize: 13, padding: '10px 12px' }} onKeyDown={e => e.key === 'Enter' && postUpdate()} />
          <button onClick={postUpdate} disabled={sending} style={{ ...btnCss(CYAN), padding: '10px 15px', whiteSpace: 'nowrap', opacity: sending ? 0.7 : 1 }}>{sending ? '…' : <><i className="ti ti-send" /> Send</>}</button>
        </div>
        {updates.length === 0
          ? <div style={{ fontSize: 13, color: '#94a3b8', padding: '14px 0' }}>No updates shared yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {updates.map(u => {
                const k = UPD_KIND[u.kind] || UPD_KIND.note
                const pending = u.needs_approval && u.approval_status === 'pending'
                const fc = u.from_client, ac = fc ? '#0a6f8f' : k.c
                return (
                  <div key={u.id} style={{ display: 'flex', gap: 12, padding: '13px', border: '1px solid #eef1f4', borderLeft: '3px solid ' + (pending ? '#f59e0b' : ac), borderRadius: 12, background: pending ? '#fffdf5' : (fc ? '#f3fafd' : '#fff') }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: ac + '1f', color: ac, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={`ti ${fc ? 'ti-user' : k.icon}`} style={{ fontSize: 17 }} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: ac, background: ac + '1f', padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.3px' }}>{fc ? 'You' : k.l}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDate(u.event_date)}</span>
                        {u.approval_status === 'approved' && <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', background: '#22c55e1f', padding: '2px 7px', borderRadius: 99 }}>You approved</span>}
                        {u.approval_status === 'rejected' && <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', background: '#ef44441f', padding: '2px 7px', borderRadius: 99 }}>You rejected</span>}
                      </div>
                      {u.title && <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{u.title}</div>}
                      {u.body && <div style={{ fontSize: 13, color: '#475569', marginTop: 3, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{u.body}</div>}
                      {u.kind === 'timeline' && (u.old_date || u.new_date) && <div style={{ fontSize: 12.5, color: '#475569', marginTop: 6, fontWeight: 600 }}><i className="ti ti-calendar-stats" style={{ verticalAlign: '-2px', color: '#ef4444' }} /> {fmtDate(u.old_date)} → <b>{fmtDate(u.new_date)}</b></div>}
                      {u.client_comment && <div style={{ fontSize: 12, color: '#475569', marginTop: 6, background: '#f4f7fa', borderRadius: 8, padding: '7px 10px', borderLeft: '2px solid #94a3b8' }}><i className="ti ti-message-2" style={{ verticalAlign: '-2px', color: '#94a3b8' }} /> {u.client_comment}</div>}
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
