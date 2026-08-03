// Statement of Account for work awarded TO us as a subcontractor.
// Shared by the "My Subcontracts" page and the "Awarded to me" section on
// Projects, so both render the exact same document.
// Returns the INNER sheet html (a .__page block) — the caller wraps it in
// .__sheet (MySubcontracts) or hands it to printDocs (ProjectsPage).

export const escDoc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

// contract_amount is stored pre-VAT; add 5% when the contractor ticked "Add VAT".
export const awardedGross = s => { const c = Number(s?.contract_amount) || 0; return c + (s?.apply_vat ? Math.round(c * 0.05) : 0) }

export function awardedStatementSheet(row, myName, payments = []) {
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
  return `<div class="__page" style="font-family:'Inter','Segoe UI',sans-serif;color:${NAVY};background:#fff;">
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
}
