// Public client-facing quote approval page (no login). Reached at #approve/<token>.
// Reads the quote via fn_get_quote_by_token and records Approve/Reject via fn_respond_quote.
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const fmt = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
const num = n => Math.round(Number(n) || 0).toLocaleString('en-AE')

function parsePayment(raw) {
  try {
    const a = Array.isArray(raw) ? raw : JSON.parse(raw || '[]')
    return Array.isArray(a) ? a.map(x => ({ percent: Number(x.percent) || 0, label: x.label || '', description: x.description || '' })) : []
  } catch { return [] }
}
function parseWhy(raw) {
  if (!raw) return []
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.map(x => ({ title: x.title || '', detail: x.detail || '' })) : [] } catch { return [] }
}
function groupByTrade(items) {
  const groups = {}
  ;(items || []).forEach(it => { const t = it.trade || 'Misc'; (groups[t] = groups[t] || []).push(it) })
  return Object.keys(groups).map(t => ({
    trade: t, items: groups[t],
    subtotal: groups[t].reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0),
  }))
}
function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '' }
}

const GOLD = '#c9952a', INK = '#1a1a1a'

// Defined at module scope (NOT inside the component) — otherwise every keystroke
// re-creates these component types and React remounts the whole tree (input loses
// focus + page scrolls to top).
const Shell = ({ children }) => (
  <div style={{ minHeight: '100vh', background: '#f4f5f7', padding: '24px 12px', fontFamily: 'Arial, Helvetica, sans-serif', color: INK }}>
    <div style={{ maxWidth: 720, margin: '0 auto' }}>{children}</div>
  </div>
)
const Center = ({ icon, title, sub, color }) => (
  <Shell><div style={{ background: '#fff', borderRadius: 14, padding: '48px 24px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
    <div style={{ fontSize: 40, marginBottom: 10, color: color || '#94a3b8' }}><i className={`ti ${icon}`} /></div>
    <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
    {sub && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, lineHeight: 1.6 }}>{sub}</div>}
  </div></Shell>
)

export default function QuoteApproval({ token }) {
  const [phase, setPhase] = useState('loading') // loading | ready | notfound | error | submitting | done
  const [payload, setPayload] = useState(null)
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [pendingAction, setPendingAction] = useState(null) // 'approved' | 'rejected'
  const [err, setErr] = useState('')
  const [doneStatus, setDoneStatus] = useState(null)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      if (!token) { setPhase('notfound'); return }
      try {
        const { data, error } = await supabase.rpc('fn_get_quote_by_token', { p_token: token })
        if (cancel) return
        if (error) { setPhase('error'); return }
        if (!data || !data.quote) { setPhase('notfound'); return }
        setPayload(data); setPhase('ready')
      } catch { if (!cancel) setPhase('error') }
    })()
    return () => { cancel = true }
  }, [token])

  async function submit(resp) {
    setErr('')
    if (!name.trim()) { setErr('Please enter your name.'); return }
    if (resp === 'rejected' && !comment.trim()) { setErr('Please write your comment first.'); return }
    setPhase('submitting')
    try {
      const { data, error } = await supabase.rpc('fn_respond_quote', {
        p_token: token, p_response: resp, p_name: name.trim(), p_comment: comment.trim(),
      })
      if (error || !data?.ok) {
        const e = data?.error || ''
        if (e.startsWith('already_')) { setErr('This quotation has already been responded to.'); setPhase('ready') }
        else { setErr('Could not submit. Please try again.'); setPhase('ready') }
        return
      }
      setDoneStatus(resp); setPhase('done')
    } catch { setErr('Could not submit. Please try again.'); setPhase('ready') }
  }


  if (phase === 'loading') return <Center icon="ti-loader-2" title="Loading quotation…" />
  if (phase === 'notfound') return <Center icon="ti-link-off" title="Link not found" sub="This approval link is invalid or has expired." color="#d97706" />
  if (phase === 'error') return <Center icon="ti-alert-triangle" title="Something went wrong" sub="Please reopen the link, or contact the sender." color="#dc2626" />
  if (phase === 'done') return (
    <Center
      icon={doneStatus === 'approved' ? 'ti-circle-check' : 'ti-send'}
      title={doneStatus === 'approved' ? 'Quotation Approved ✓' : 'Changes Requested ✓'}
      sub={doneStatus === 'approved' ? 'Thank you! The company has been notified of your approval.' : 'Thank you — your request has been sent to the company.'}
      color={doneStatus === 'approved' ? '#0f6e56' : '#0891b2'}
    />
  )

  // ---- ready / submitting ----
  const { quote: q, company: co, tpl } = payload
  const cName = tpl?.company_legal_name || co?.name || 'Company'
  const items = Array.isArray(q.items) ? q.items : []
  const grouped = ((q.mode === 'boq' || q.mode === 'advanced') || (q.mode === 'visual' && items.some(it => (it.trade || '').trim()))) ? groupByTrade(items) : null
  const payments = parsePayment(q.payment_terms)
  const whys = parseWhy(q.why_choose_us)
  const sub = Number(q.subtotal || 0), vat = Number(q.vat_amount || 0), tot = Number(q.total || 0)
  const disc = Math.max(0, sub - (tot - vat))
  const alreadyResponded = q.status === 'approved' || q.status === 'rejected'
  const submitting = phase === 'submitting'
  const bank = [
    ['Bank', tpl?.bank_name], ['Account Name', tpl?.bank_account_name], ['Account No', tpl?.bank_account_number],
    ['IBAN', tpl?.bank_iban], ['SWIFT', tpl?.bank_swift], ['Branch', tpl?.bank_branch],
  ].filter(([, v]) => v && String(v).trim())

  const card = { background: '#fff', borderRadius: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 14 }
  const cellL = { padding: '7px 10px', fontSize: 12.5, borderBottom: '1px solid #f0f0f0' }

  const ItemRow = (it, i) => (
    <tr key={i}>
      <td style={{ ...cellL, color: '#999', width: 26 }}>{i}</td>
      <td style={{ ...cellL, wordBreak: 'break-word' }}>{it.desc}</td>
      <td style={{ ...cellL, textAlign: 'center', color: '#777', width: 44 }}>{it.unit}</td>
      <td style={{ ...cellL, textAlign: 'center', color: '#777', width: 40 }}>{it.qty}</td>
      <td style={{ ...cellL, textAlign: 'right', color: '#777', width: 70 }}>{num(it.rate)}</td>
      <td style={{ ...cellL, textAlign: 'right', width: 84 }}>{num((Number(it.qty) || 0) * (Number(it.rate) || 0))}</td>
    </tr>
  )

  return (
    <Shell>
      {/* Header */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ height: 5, background: GOLD }} />
        <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
            {co?.logo_url
              ? <img src={co.logo_url} alt="" style={{ width: 50, height: 50, borderRadius: 11, objectFit: 'cover' }} />
              : <div style={{ width: 50, height: 50, borderRadius: 11, background: INK, color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22 }}>{cName[0] || 'C'}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{cName}</div>
              {tpl?.tagline && <div style={{ fontSize: 10, color: '#8a8a8a', letterSpacing: 1, textTransform: 'uppercase' }}>{tpl.tagline}</div>}
              <div style={{ fontSize: 11, color: '#8a8a8a', marginTop: 2 }}>{tpl?.contact_phone || co?.phone || ''}{tpl?.trn_number ? ` · TRN ${tpl.trn_number}` : ''}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: GOLD, letterSpacing: 2 }}>QUOTATION</div>
            <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{q.quote_number || ''}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Date · {fmtDate(q.created_at)}</div>
            {q.valid_until && <div style={{ fontSize: 11, color: '#6b7280' }}>Valid until · {fmtDate(q.valid_until)}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '0 20px 18px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, background: '#faf9f7', borderLeft: `2.5px solid ${GOLD}`, padding: '9px 12px' }}>
            <div style={{ fontSize: 8.5, color: '#b08f3f', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Bill To</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{q.client_name || ''}</div>
            {q.location && <div style={{ fontSize: 11, color: '#6b7280' }}>{q.location}</div>}
            {q.client_phone && <div style={{ fontSize: 11, color: '#6b7280' }}>{q.client_phone}</div>}
          </div>
          <div style={{ flex: 1, minWidth: 200, background: '#faf9f7', borderLeft: `2.5px solid ${GOLD}`, padding: '9px 12px' }}>
            <div style={{ fontSize: 8.5, color: '#b08f3f', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Project</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{q.project_title || '—'}</div>
            {q.prepared_by && <div style={{ fontSize: 11, color: '#6b7280' }}>Prepared by · {q.prepared_by}</div>}
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={card}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 460, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: 28 }} /><col /><col style={{ width: 46 }} /><col style={{ width: 40 }} /><col style={{ width: 66 }} /><col style={{ width: 80 }} /></colgroup>
          <thead><tr style={{ background: INK, color: '#fff' }}>
            <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 9, textTransform: 'uppercase' }}>#</th>
            <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 9, textTransform: 'uppercase' }}>Description</th>
            <th style={{ padding: '7px 10px', textAlign: 'center', fontSize: 9 }}>Unit</th>
            <th style={{ padding: '7px 10px', textAlign: 'center', fontSize: 9 }}>Qty</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 9 }}>Rate</th>
            <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 9 }}>Amount</th>
          </tr></thead>
          <tbody>
            {grouped
              ? grouped.map((g, gi) => [
                  <tr key={`g${gi}`}><td colSpan={6} style={{ background: GOLD, color: INK, fontSize: 10, fontWeight: 700, padding: '5px 10px', letterSpacing: 1 }}>{String.fromCharCode(65 + gi)} · {String(g.trade).toUpperCase()}</td></tr>,
                  ...g.items.map((it, i) => ItemRow(it, i + 1)),
                  <tr key={`s${gi}`}><td colSpan={5} style={{ textAlign: 'right', padding: '6px 10px', background: '#faf6ec', fontSize: 10, fontWeight: 700, color: '#6b6b6b' }}>{g.trade} Subtotal</td><td style={{ textAlign: 'right', padding: '6px 10px', background: '#faf6ec', fontSize: 10, fontWeight: 700, color: GOLD }}>AED {num(g.subtotal)}</td></tr>,
                ])
              : items.map((it, i) => ItemRow(it, i + 1))}
          </tbody>
        </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 14px' }}>
          <div style={{ width: 260, maxWidth: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#6b7280' }}><span>{disc > 0 ? 'Gross Total' : 'Subtotal'}</span><span>AED {num(sub)}</span></div>
            {disc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#0f6e56' }}><span>Discount</span><span>− {num(disc)}</span></div>}
            {vat > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#6b7280' }}><span>VAT 5%</span><span>{num(vat)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, padding: '7px 10px', marginTop: 5, background: INK, color: '#fff', borderRadius: 5 }}><span>Grand Total</span><span style={{ color: GOLD }}>AED {num(tot)}</span></div>
          </div>
        </div>
      </div>

      {/* Payment schedule */}
      {payments.length > 0 && (
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: GOLD, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 }}>— Payment Schedule</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {payments.map((p, i) => (
              <div key={i} style={{ flex: '1 1 150px', border: '0.5px solid #eee', borderTop: `2px solid ${GOLD}`, padding: '9px 10px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: GOLD }}>{p.percent}%</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 1 }}>AED {num(tot * (Number(p.percent) || 0) / 100)}</div>
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3 }}>{p.label}</div>
                {p.description && <div style={{ fontSize: 10, color: '#888', marginTop: 2, lineHeight: 1.4 }}>{p.description}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Why us */}
      {whys.length > 0 && (
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: GOLD, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 }}>— Why Choose {cName.split(' ').slice(0, 2).join(' ')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '9px 16px' }}>
            {whys.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 7 }}>
                <span style={{ color: GOLD, fontWeight: 700 }}>✓</span>
                <div><div style={{ fontSize: 11, fontWeight: 700 }}>{w.title}</div>{w.detail && <div style={{ fontSize: 10, color: '#888', lineHeight: 1.5 }}>{w.detail}</div>}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Terms */}
      {q.terms && (
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: GOLD, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 7 }}>— Terms & Conditions</div>
          <div style={{ fontSize: 11, color: '#666', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{q.terms}</div>
        </div>
      )}

      {/* Bank */}
      {bank.length > 0 && (
        <div style={{ ...card, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: GOLD, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 }}>— Bank Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px 20px' }}>
            {bank.map(([k, v]) => <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11, minWidth: 0 }}><span style={{ color: '#999', minWidth: 80 }}>{k}</span><span style={{ fontWeight: 600, wordBreak: 'break-word' }}>{v}</span></div>)}
          </div>
        </div>
      )}

      {/* Action panel */}
      <div style={{ ...card, padding: '18px 18px', position: 'sticky', bottom: 12 }}>
        {alreadyResponded ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: q.status === 'approved' ? '#0f6e56' : '#b91c1c' }}>
              <i className={`ti ${q.status === 'approved' ? 'ti-circle-check' : 'ti-circle-x'}`} style={{ marginRight: 6 }} />
              {q.status === 'approved' ? 'Approved' : 'Rejected'}
              {q.approved_by_name ? ` by ${q.approved_by_name}` : ''}
            </div>
            {q.client_response_at && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>on {fmtDate(q.client_response_at)}</div>}
            {q.client_comment && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, fontStyle: 'italic' }}>“{q.client_comment}”</div>}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Your response</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name *"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #d8dbe0', borderRadius: 9, fontSize: 14, marginBottom: 9 }} />
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Your comment…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #d8dbe0', borderRadius: 9, fontSize: 14, marginBottom: 6, resize: 'vertical', fontFamily: 'inherit' }} />
            {err && <div style={{ fontSize: 12.5, color: '#dc2626', marginBottom: 8 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => submit('approved')} disabled={submitting}
                style={{ flex: '1 1 150px', padding: '13px', borderRadius: 10, border: 'none', background: '#0f6e56', color: '#fff', fontSize: 15, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
                <i className="ti ti-check" style={{ marginRight: 6 }} />{submitting ? 'Submitting…' : 'Approve'}
              </button>
              <button onClick={() => submit('rejected')} disabled={submitting}
                style={{ flex: '1 1 150px', padding: '13px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 15, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
                Request Changes
              </button>
            </div>
            <div style={{ fontSize: 10.5, color: '#9ca3af', textAlign: 'center', marginTop: 10 }}>By approving you confirm acceptance of this quotation and its terms.</div>
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '6px 0 20px' }}>{cName} · {tpl?.contact_phone || co?.phone || ''}</div>
    </Shell>
  )
}
