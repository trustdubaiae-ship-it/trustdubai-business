// My Subcontracts — work OTHER companies (contractors) have awarded to us.
// Read-only: we see only our own scope, contract, payments & balance for each
// project (never the contractor's client, project value or margin). Data comes
// through SECURITY DEFINER RPCs (fn_my_subcontracts / fn_my_subcontract_payments).
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import HeroActions from '../components/HeroActions'

const AED = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
// contract_amount is stored pre-VAT; add 5% when the contractor ticked "Add VAT".
const gross = s => { const c = Number(s?.contract_amount) || 0; return c + (s?.apply_vat ? Math.round(c * 0.05) : 0) }
const fmtD = d => d ? new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const escDoc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

const SSTATUS = {
  ongoing: { l: 'Ongoing', c: '#0099cc' }, completed: { l: 'Completed', c: '#16a34a' },
  on_hold: { l: 'On hold', c: '#f59e0b' }, cancelled: { l: 'Cancelled', c: '#ef4444' },
}

const DOCVIEW_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
#qv-docview{position:fixed;inset:0;z-index:4000;background:#e9eef3;display:flex;flex-direction:column}
#qv-docview *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
#qv-docview .qv-doc-bar{flex-shrink:0;height:52px;background:#0f1d3a;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 12px;gap:10px}
#qv-docview .qv-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Inter','Segoe UI',sans-serif}
#qv-docview .qv-doc-bar button{padding:9px 15px;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:'Inter','Segoe UI',sans-serif;font-size:13px;white-space:nowrap}
#qv-docview .qv-doc-scroll{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:16px 8px 48px}
#qv-docview .__sheet{width:794px;min-height:1123px;margin:16px auto;background:#fff;box-shadow:0 12px 44px rgba(15,30,50,.22);border-radius:2px;font-family:'Inter','Segoe UI',sans-serif}
#qv-docview .__page{padding:28px 30px}
@media print{
  body>*:not(#qv-docview){display:none!important}
  #qv-docview{position:static!important;background:#fff!important;display:block!important}
  #qv-docview .qv-doc-bar{display:none!important}
  #qv-docview .qv-doc-scroll{overflow:visible!important;padding:0!important}
  #qv-docview .__sheet{width:auto!important;min-height:0!important;margin:0!important;box-shadow:none!important;border-radius:0!important}
  #qv-docview .__page{padding:0!important}
  @page{size:A4;margin:11mm}
}`

// Statement of what the contractor has paid / still owes us for this project.
function statementHtml(row, myName, payments = []) {
  const esc = escDoc
  const n = v => Math.round(Number(v) || 0).toLocaleString('en-AE')
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  const NAVY = '#0f2741', ACCENT = '#0099cc', MUT = '#6b7a8d', LINE = '#e7eef4', SOFT = '#f6fafc'
  const serif = "'Playfair Display',Georgia,serif"
  const subtotal = Number(row.contract_amount) || 0
  const extraItems = Array.isArray(row.extra_work) ? row.extra_work : []
  const extraTotal = extraItems.reduce((a, e) => a + (Number(e.amount) || 0), 0)
  const baseSubtotal = subtotal - extraTotal
  const vat = row.apply_vat ? Math.round(subtotal * 0.05) : 0
  const grand = subtotal + vat
  const pays = (payments || []).slice().sort((a, b) => new Date(a.paid_on || 0) - new Date(b.paid_on || 0))
  const totalPaid = pays.reduce((a, p) => a + (Number(p.amount) || 0), 0)
  const balance = grand - totalPaid
  let running = grand
  const prows = pays.map((p, i) => {
    running -= (Number(p.amount) || 0)
    const meta = [p.method, p.reference].filter(Boolean).map(esc).join(' · ')
    return `<tr style="${i % 2 ? 'background:' + SOFT + ';' : ''}">
      <td style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;color:${MUT};">${i + 1}</td>
      <td style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;color:${NAVY};white-space:nowrap;">${fmtDate(p.paid_on)}</td>
      <td style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;color:${MUT};">${meta || '—'}${p.note ? `<div style="font-size:9px;color:#8a97a5;">${esc(p.note)}</div>` : ''}</td>
      <td style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;text-align:right;font-weight:600;color:#1e8e4a;">AED ${n(p.amount)}</td>
      <td style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;text-align:right;font-weight:600;color:${NAVY};">AED ${n(running)}</td></tr>`
  }).join('')
  const logo = row.contractor_logo ? `<img src="${esc(row.contractor_logo)}" style="height:48px;width:48px;object-fit:cover;border-radius:9px;flex-shrink:0;" />` : ''
  const tile = (label, value, color) => `<div style="flex:1;border:1px solid ${LINE};border-radius:9px;padding:12px 15px;background:${SOFT};"><div style="font-size:8px;color:${ACCENT};text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">${label}</div><div style="font-family:${serif};font-size:17px;font-weight:700;margin-top:4px;color:${color};">AED ${n(value)}</div></div>`
  const inner = `<div class="__page" style="font-family:'Inter','Segoe UI',sans-serif;color:${NAVY};background:#fff;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="display:flex;gap:13px;align-items:center;">${logo}<div>
        <div style="font-family:${serif};font-size:22px;font-weight:700;color:${NAVY};letter-spacing:.2px;line-height:1.1;">${esc(row.contractor_name || 'Contractor')}</div>
        <div style="font-size:10px;color:${MUT};margin-top:3px;">${esc(row.contractor_phone || '')}</div>
      </div></div>
      <div style="text-align:right;">
        <div style="font-family:${serif};font-size:20px;font-weight:700;color:${ACCENT};letter-spacing:.3px;line-height:1;">Statement of Account</div>
        <div style="font-size:9px;color:${MUT};letter-spacing:1px;text-transform:uppercase;margin-top:2px;">As subcontractor</div>
        <div style="font-size:10.5px;color:${MUT};margin-top:5px;">As of&nbsp; <b style="color:${NAVY};">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</b></div>
      </div>
    </div>
    <div style="height:2.5px;background:linear-gradient(90deg,${ACCENT} 0%,${ACCENT} 28%,${ACCENT}1f 100%);margin:12px 0 16px;border-radius:2px;"></div>
    <div style="display:flex;gap:14px;margin-bottom:14px;">
      <div style="flex:1;border:1px solid ${LINE};border-radius:9px;padding:12px 15px;"><div style="font-size:8px;color:${ACCENT};text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">Subcontractor (you)</div><div style="font-size:13.5px;font-weight:700;margin-top:4px;color:${NAVY};">${esc(myName)}</div><div style="font-size:10.5px;color:${MUT};margin-top:1px;">${esc(row.trade || '')}</div></div>
      <div style="flex:1;border:1px solid ${LINE};border-radius:9px;padding:12px 15px;"><div style="font-size:8px;color:${ACCENT};text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">Project</div><div style="font-size:13.5px;font-weight:700;margin-top:4px;color:${NAVY};">${esc(row.project_name || 'Project')}</div><div style="font-size:10.5px;color:${MUT};margin-top:1px;">${esc(row.project_location || '')}</div></div>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:16px;">
      ${tile('Contract Value' + (vat > 0 ? ' (incl. VAT)' : ''), grand, NAVY)}
      ${tile('Total Received', totalPaid, '#1e8e4a')}
      ${tile('Balance Due', balance, balance > 0 ? '#c0392b' : '#1e8e4a')}
    </div>
    ${extraItems.length ? `<div style="border:1px solid ${LINE};border-radius:9px;overflow:hidden;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 13px;background:#fff7ec;border-bottom:1px solid ${LINE};"><span style="font-size:9px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:#b9770e;">Additional / Variation work</span><span style="font-size:11px;font-weight:700;color:#b9770e;">AED ${n(extraTotal)}</span></div>
      ${extraItems.map(e => `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 13px;font-size:10.5px;color:${MUT};border-top:1px solid ${LINE};"><span style="color:${NAVY};">${esc(e.label)}${e.date ? ` <span style="color:${MUT};">· ${fmtDate(e.date)}</span>` : ''}</span><span style="color:${NAVY};font-weight:600;white-space:nowrap;">AED ${n(e.amount)}</span></div>`).join('')}
    </div>` : ''}
    <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:14px;border:1px solid ${LINE};border-radius:9px;overflow:hidden;">
      <thead><tr style="background:${NAVY};color:#fff;">
        <th style="padding:10px 11px;text-align:left;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;width:34px;">#</th>
        <th style="padding:10px 11px;text-align:left;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;">Date</th>
        <th style="padding:10px 11px;text-align:left;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;">Method / Reference</th>
        <th style="padding:10px 11px;text-align:right;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;">Received</th>
        <th style="padding:10px 11px;text-align:right;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;">Balance</th>
      </tr></thead>
      <tbody>
        <tr><td colspan="4" style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;color:${MUT};font-weight:600;">Opening — Contract value${extraTotal > 0 ? ' (incl. additional work)' : ''}${vat > 0 ? ' (incl. 5% VAT)' : ''}</td><td style="padding:9px 11px;border-bottom:1px solid ${LINE};font-size:10.5px;text-align:right;font-weight:700;color:${NAVY};">AED ${n(grand)}</td></tr>
        ${prows || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#999;font-size:11px;">No payments received yet.</td></tr>`}
      </tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px;page-break-inside:avoid;">
      <div style="min-width:290px;border:1px solid ${LINE};border-radius:9px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;padding:8px 16px;font-size:11px;color:${MUT};"><span>Contract subtotal${extraTotal > 0 ? ' (base scope)' : ''}</span><span style="color:${NAVY};font-weight:600;">AED ${n(baseSubtotal)}</span></div>
        ${extraTotal > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 16px;font-size:11px;color:${MUT};border-top:1px solid ${LINE};"><span>Additional / variation work</span><span style="color:${NAVY};font-weight:600;">AED ${n(extraTotal)}</span></div>` : ''}
        ${vat > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 16px;font-size:11px;color:${MUT};border-top:1px solid ${LINE};"><span>VAT (5%)</span><span style="color:${NAVY};font-weight:600;">AED ${n(vat)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:8px 16px;font-size:11px;color:${MUT};border-top:1px solid ${LINE};"><span>Total received to date</span><span style="color:#1e8e4a;font-weight:600;">− AED ${n(totalPaid)}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 16px;background:${NAVY};color:#fff;"><span style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;opacity:.85;">Balance Due</span><span style="font-family:${serif};font-size:17px;font-weight:700;color:${balance > 0 ? '#ff8a80' : '#4fd0f5'};">AED ${n(balance)}</span></div>
      </div>
    </div>
    <div style="font-size:9px;color:${MUT};line-height:1.6;border-top:1px solid ${LINE};padding-top:10px;">This statement reflects amounts recorded by ${esc(row.contractor_name || 'the contractor')} for work you carried out as subcontractor, as of the date above. Please review and report any discrepancy within 7 days.</div>
  </div>`
  return `<div class="__sheet">${inner}</div>`
}

export default function MySubcontracts() {
  const { company } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [doc, setDoc] = useState(null)   // { title, html }

  useEffect(() => { if (company?.id) load() }, [company?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('fn_my_subcontracts')
      if (error) throw error
      setRows(data || [])
    } catch (e) { console.error(e); toast.error('Could not load subcontracts') } finally { setLoading(false) }
  }
  async function openStatement(row) {
    try {
      const { data } = await supabase.rpc('fn_my_subcontract_payments', { p_sub_id: row.sub_id })
      setDoc({ title: `Statement · ${row.project_name || 'Project'}`, html: statementHtml(row, company?.name || 'Our company', data || []) })
    } catch (e) { console.error(e); toast.error('Could not open statement') }
  }

  const totals = rows.reduce((a, r) => {
    const g = gross(r), paid = Number(r.paid_amount) || 0
    a.contract += g; a.paid += paid; a.balance += (g - paid); return a
  }, { contract: 0, paid: 0, balance: 0 })

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-md)' }

  return (
    <div style={{ color: 'var(--text)' }}>
      <HeroActions>
        <button onClick={load} className="btn btn-secondary"><i className="ti ti-refresh" style={{ fontSize: 16 }} /> Refresh</button>
      </HeroActions>

      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text2)' }}>
        Projects that other companies have awarded to you as a subcontractor. Read-only — you see only your own scope, contract and payments.
      </div>

      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
          {[['Total contract', totals.contract, '#0099cc', 'ti-wallet'], ['Received', totals.paid, '#22c55e', 'ti-cash'], ['Balance due', totals.balance, totals.balance > 0 ? '#ef4444' : '#22c55e', 'ti-clock-dollar']].map(([l, v, c, ic]) => (
            <div key={l} style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 15px', background: `linear-gradient(135deg, ${c}1f, ${c}07)`, border: `1px solid ${c}2e` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: c + '24', color: c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className={'ti ' + ic} style={{ fontSize: 15 }} /></span>
                <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>{l}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, color: c }}>{AED(v)}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading…</div>
        : rows.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '50px 20px' }}>
            <i className="ti ti-briefcase-off" style={{ fontSize: 34, color: 'var(--text3)', display: 'block', marginBottom: 10 }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>No subcontracts yet</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>When a company adds you as a linked subcontractor on their project, it shows up here.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map(r => {
              const ss = SSTATUS[r.status] || SSTATUS.ongoing
              const g = gross(r), paid = Number(r.paid_amount) || 0, bal = g - paid
              const extraItems = Array.isArray(r.extra_work) ? r.extra_work : []
              const extraTotal = extraItems.reduce((a, e) => a + (Number(e.amount) || 0), 0)
              return (
                <div key={r.sub_id} style={{ ...card, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, flexWrap: 'wrap' }}>
                    <span style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {r.contractor_logo ? <img src={r.contractor_logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <i className="ti ti-building" style={{ fontSize: 18, color: 'var(--text3)' }} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{r.project_name || 'Project'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                        Awarded by <b>{r.contractor_name || 'Contractor'}</b>{r.trade ? ' · ' + r.trade : ''}{r.project_location ? ' · ' + r.project_location : ''}
                      </div>
                    </div>
                    <span style={{ background: ss.c + '1f', color: ss.c, fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>{ss.l}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginTop: 12 }}>
                    {[[r.apply_vat ? 'Contract (incl. VAT)' : 'Contract', AED(g), 'var(--text)'], ['Received', AED(paid), '#22c55e'], ['Balance', AED(bal), bal > 0 ? '#ef4444' : '#22c55e']].map(([k, v, c]) => (
                      <div key={k} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 10, color: 'var(--text3)' }}>{k}</div><div style={{ fontSize: 13.5, fontWeight: 700, color: c }}>{v}</div></div>
                    ))}
                  </div>
                  {extraTotal > 0 && <div style={{ fontSize: 11.5, color: '#b9770e', marginTop: 8 }}><i className="ti ti-tools" style={{ verticalAlign: '-2px' }} /> Includes additional work: {AED(extraTotal)} ({extraItems.length} item{extraItems.length === 1 ? '' : 's'})</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button onClick={() => openStatement(r)} className="btn btn-secondary btn-sm"><i className="ti ti-file-text" style={{ verticalAlign: '-2px', marginRight: 4 }} />Statement of Account</button>
                    {r.contractor_phone && <a href={`tel:${r.contractor_phone}`} className="btn btn-secondary btn-sm"><i className="ti ti-phone" style={{ verticalAlign: '-2px', marginRight: 4 }} />Call contractor</a>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {doc && createPortal(
        <div id="qv-docview">
          <style dangerouslySetInnerHTML={{ __html: DOCVIEW_CSS }} />
          <div className="qv-doc-bar">
            <span className="qv-title">{doc.title}</span>
            <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => window.print()} style={{ background: '#0099cc', color: '#fff' }}><i className="ti ti-printer" style={{ verticalAlign: '-2px', marginRight: 5 }} />Print / Save PDF</button>
              <button onClick={() => setDoc(null)} style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>Close</button>
            </span>
          </div>
          <div className="qv-doc-scroll" dangerouslySetInnerHTML={{ __html: doc.html }} />
        </div>,
        document.body
      )}
    </div>
  )
}
