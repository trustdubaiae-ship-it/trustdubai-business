/*
  Contract Agreement document.

  Renders the same letterhead as the quotation PDF (accent bar, logo block,
  Arial, 760px column) so a contract and its quote look like one family of
  documents. Everything commercial is read from `contract.snapshot`, which was
  frozen when the contract was generated — later quotation revisions must not
  change a contract that has already been issued.
*/

const THEMES = {
  gold:    { accent: '#c9952a' },
  royal:   { accent: '#2563eb' },
  emerald: { accent: '#0f9d6b' },
  slate:   { accent: '#475569' },
}
export function accentFor(theme) { return (THEMES[theme] || THEMES.gold).accent }

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

/* RFP-011 -> CNT-011, QTN-002 -> CNT-002. Falls back to prefixing when the
   quote ref has no trailing number. Revisions never change the number: a
   contract for RFP-011 Rev.02 is still CNT-011. */
export function contractNoFromQuote(quoteNumber) {
  const ref = String(quoteNumber || '').trim()
  if (!ref) return 'CNT-001'
  const m = ref.match(/^(.*?)([-/]?)(\d+)\s*$/)
  if (m) return `CNT-${m[3]}`
  return `CNT-${ref}`
}

export const DEFAULT_CLAUSES = {
  timeline_text:
    'The works shall be completed within 2 weeks (14 working days) from the date of receipt of approval from the management.',
  warranty_text:
    'All works executed under this Agreement, including waterproofing, carry a warranty of 12 months from the date of handover.',
  payment_terms_text:
    'Payments shall be made strictly to the registered company bank account stated in Annexure A. No cash payments to individuals will be accepted.',
  variation_text:
    'Any variation to the agreed scope shall be priced separately via a written Variation Order, signed by the Client prior to execution.',
}

/* The frozen commercial copy taken at generation time. */
export function buildSnapshot(q, payments) {
  return {
    quote_number: q.quote_number || '',
    revision: Number(q.revision) || 0,
    mode: q.mode || 'simple',
    quote_theme: q.quote_theme || 'gold',
    project_title: q.project_title || '',
    location: q.location || '',
    client_prefix: q.client_prefix || '',
    client_email: q.client_email || '',
    client_trn: q.client_trn || '',
    items: Array.isArray(q.items) ? q.items : [],
    subtotal: Number(q.subtotal) || 0,
    discount_type: q.discount_type || null,
    discount_value: Number(q.discount_value) || 0,
    vat_enabled: q.vat_enabled !== false,
    vat_amount: Number(q.vat_amount) || 0,
    total: Number(q.total) || 0,
    payment_terms: Array.isArray(payments) ? payments : [],
    frozen_at: new Date().toISOString(),
  }
}

export function scopeReferenceFor(q) {
  const rev = Number(q.revision) > 0 ? ` Rev.${String(Number(q.revision)).padStart(2, '0')}` : ''
  return `Quotation Ref ${q.quote_number || ''}${rev}, attached as Annexure A`
}

const money = v => Math.round(Number(v) || 0).toLocaleString('en-AE')
const fmtDate = d => d
  ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—'

/*
  buildContractHTML(contract, { company, tpl })
  Returns the printable page as an HTML string (same shape the quote generator
  produces, so it drops straight into A4Preview and DocViewer).
*/
export default function buildContractHTML(contract, ctx = {}) {
  const { company, tpl } = ctx
  const c = contract || {}
  const snap = c.snapshot || {}
  const ACC = accentFor(snap.quote_theme)

  const cName   = escapeHtml(tpl?.company_legal_name || company?.name || 'Company')
  const cLogo   = company?.logo_url || ''
  const tagline = escapeHtml(tpl?.tagline || 'Dubai, UAE')
  const cPhone  = escapeHtml(tpl?.contact_phone || company?.phone || '')
  const cEmail  = escapeHtml(tpl?.contact_email || '')
  const trn     = escapeHtml(tpl?.trn_number || company?.trn || '')
  const licence = escapeHtml(company?.trade_license_number || '')
  const cAddr   = escapeHtml(company?.address || company?.location || '')

  const logoBox = cLogo
    ? `<img src="${escapeHtml(cLogo)}" style="width:54px;height:54px;border-radius:11px;object-fit:cover;">`
    : `<div style="width:54px;height:54px;border-radius:11px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;color:${ACC};">${cName[0] || 'C'}</div>`

  const items = Array.isArray(snap.items) ? snap.items : []
  const sub = Number(snap.subtotal) || 0
  const vat = Number(snap.vat_amount) || 0
  const tot = Number(snap.total) || 0
  const disc = Math.max(0, sub - (tot - vat))
  const pays = Array.isArray(snap.payment_terms) ? snap.payment_terms : []

  const sectionHead = (num, label) => `
    <div style="font-size:10px;color:${ACC};text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">${num}. ${escapeHtml(label)}</div>`

  const clause = (num, label, body) => body && String(body).trim() ? `
    <div style="padding:16px 30px 0;page-break-inside:avoid;break-inside:avoid;">
      ${sectionHead(num, label)}
      <div style="font-size:10px;color:#4a4a4a;line-height:1.75;white-space:pre-line;">${escapeHtml(body)}</div>
    </div>` : ''

  // ---- 3. Scope of works -------------------------------------------------
  const itemRows = items.map((it, i) => `
    <tr>
      <td style="padding:7px 8px;font-size:10.5px;border-bottom:0.5px solid #ededed;color:#999;">${i + 1}</td>
      <td style="padding:7px 8px;font-size:10.5px;border-bottom:0.5px solid #ededed;word-break:break-word;overflow-wrap:anywhere;white-space:pre-line;">
        ${it.title ? `<div style="font-weight:700;margin-bottom:2px;">${escapeHtml(it.title)}</div>` : ''}${escapeHtml(it.desc || '').replace(/\n/g, '<br>')}
        ${it.trade ? `<div style="font-size:9px;color:#8a8a8a;margin-top:2px;">${escapeHtml(it.trade)}</div>` : ''}
      </td>
      <td style="padding:7px 8px;font-size:10.5px;border-bottom:0.5px solid #ededed;text-align:center;color:#777;">${escapeHtml(it.unit || '')}</td>
      <td style="padding:7px 8px;font-size:10.5px;border-bottom:0.5px solid #ededed;text-align:center;color:#777;">${escapeHtml(it.qty ?? 0)}</td>
      <td style="padding:7px 8px;font-size:10.5px;border-bottom:0.5px solid #ededed;text-align:right;color:#777;">${money(it.rate)}</td>
      <td style="padding:7px 8px;font-size:10.5px;border-bottom:0.5px solid #ededed;text-align:right;">${money((Number(it.qty) || 0) * (Number(it.rate) || 0))}</td>
    </tr>`).join('')

  const scopeBlock = `
    <div style="padding:16px 30px 0;">
      ${sectionHead(3, 'Scope of Works')}
      ${c.scope_reference ? `<div style="font-size:10px;color:#4a4a4a;line-height:1.7;margin-bottom:10px;">${escapeHtml(c.scope_reference)}</div>` : ''}
      ${items.length ? `
      <table style="width:100%;border-collapse:collapse;">
        <colgroup><col style="width:26px"><col><col style="width:52px"><col style="width:38px"><col style="width:64px"><col style="width:76px"></colgroup>
        <thead>
          <tr style="background:${ACC};color:#fff;">
            <th style="padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;">#</th>
            <th style="padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;">Description</th>
            <th style="padding:7px 8px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:.5px;">Unit</th>
            <th style="padding:7px 8px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:.5px;">Qty</th>
            <th style="padding:7px 8px;text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:.5px;">Rate</th>
            <th style="padding:7px 8px;text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:.5px;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>` : `<div style="font-size:10px;color:#8a8a8a;">Scope as per the referenced quotation.</div>`}
    </div>`

  // ---- 4. Contract value -------------------------------------------------
  const valueRow = (label, val, strong) => `
    <div style="display:flex;justify-content:space-between;padding:${strong ? '8px 0 2px' : '4px 0'};${strong ? `border-top:1px solid ${ACC};margin-top:4px;` : ''}">
      <span style="font-size:${strong ? '11.5px' : '10.5px'};color:${strong ? '#1a1a1a' : '#6b6b6b'};font-weight:${strong ? 700 : 400};">${escapeHtml(label)}</span>
      <span style="font-size:${strong ? '13px' : '10.5px'};color:${strong ? ACC : '#1a1a1a'};font-weight:${strong ? 700 : 600};">AED ${money(val)}</span>
    </div>`

  const valueBlock = `
    <div style="padding:16px 30px 0;page-break-inside:avoid;break-inside:avoid;">
      ${sectionHead(4, 'Contract Value')}
      <div style="display:flex;justify-content:flex-end;">
        <div style="width:270px;max-width:100%;border:0.5px solid #eee;border-left:2px solid ${ACC};padding:11px 14px;background:#fbfaf8;">
          ${valueRow('Subtotal', sub)}
          ${disc > 0 ? valueRow('Discount', -disc) : ''}
          ${vat > 0 ? valueRow('VAT 5%', vat) : ''}
          ${valueRow('Total Contract Value', tot, true)}
        </div>
      </div>
    </div>`

  // ---- 5. Payment schedule ----------------------------------------------
  const payBlock = pays.length ? `
    <div style="padding:16px 30px 0;page-break-inside:avoid;break-inside:avoid;">
      ${sectionHead(5, 'Payment Schedule')}
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${pays.map(p => `<div style="flex:1;min-width:120px;border:0.5px solid #eee;border-top:2px solid ${ACC};padding:9px 10px;">
          <div style="font-size:16px;font-weight:700;color:${ACC};">${escapeHtml(p.percent || 0)}%</div>
          <div style="font-size:11px;font-weight:700;color:#1a1a1a;margin-top:1px;">AED ${money(tot * (Number(p.percent) || 0) / 100)}</div>
          <div style="font-size:9.5px;font-weight:700;margin-top:3px;">${escapeHtml(p.label || '')}</div>
          ${p.description ? `<div style="font-size:8.5px;color:#888;margin-top:2px;line-height:1.4;">${escapeHtml(p.description)}</div>` : ''}
        </div>`).join('')}
      </div>
    </div>` : ''

  // ---- 10. Additional clauses -------------------------------------------
  const extras = Array.isArray(c.extra_clauses) ? c.extra_clauses.filter(x => x && (x.title || x.body)) : []
  const extraBlock = extras.length ? `
    <div style="padding:16px 30px 0;page-break-inside:avoid;break-inside:avoid;">
      ${sectionHead(10, 'Additional Clauses')}
      ${extras.map((x, i) => `<div style="margin-bottom:9px;">
        ${x.title ? `<div style="font-size:10px;font-weight:700;color:#1a1a1a;margin-bottom:2px;">10.${i + 1} ${escapeHtml(x.title)}</div>` : `<div style="font-size:10px;font-weight:700;color:#1a1a1a;margin-bottom:2px;">10.${i + 1}</div>`}
        ${x.body ? `<div style="font-size:10px;color:#4a4a4a;line-height:1.75;white-space:pre-line;">${escapeHtml(x.body)}</div>` : ''}
      </div>`).join('')}
    </div>` : ''

  const clientLine = `${snap.client_prefix ? escapeHtml(snap.client_prefix) + ' ' : ''}${escapeHtml(c.client_name || '')}`

  // Signature / stamp artwork on the contractor side, printed only when this
  // contract opts in AND the company has uploaded one. Absolutely positioned
  // over the signing line so ticking the box never reflows the block.
  const signArt = (() => {
    const sig = c.show_sign_image ? (tpl?.signature_data || '') : ''
    const stp = c.show_stamp_image ? (tpl?.stamp_data || '') : ''
    if (!sig && !stp) return ''
    const img = (src, extra) => `<img src="${escapeHtml(src)}" style="position:absolute;bottom:2px;max-height:58px;max-width:46%;object-fit:contain;${extra}">`
    return `<div style="position:relative;height:0;">
      ${stp ? img(stp, 'right:4%;opacity:.92;') : ''}
      ${sig ? img(sig, 'left:6%;') : ''}
    </div>`
  })()

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:760px;margin:0 auto;background:#fff;">
    <div style="height:5px;background:${ACC};"></div>
    <div style="padding:22px 30px 0;">

      <!-- 1. Title -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
        <div style="display:flex;gap:13px;align-items:center;">
          ${logoBox}
          <div>
            <div style="font-size:16px;font-weight:700;">${cName}</div>
            <div style="font-size:9px;color:#8a8a8a;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">${tagline}</div>
            <div style="font-size:9.5px;color:#8a8a8a;margin-top:3px;">${cPhone}${cEmail ? ' · ' + cEmail : ''}${trn ? ' · TRN ' + trn : ''}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:19px;font-weight:700;color:${ACC};letter-spacing:1.5px;">CONTRACT AGREEMENT</div>
          <div style="display:inline-block;margin-top:6px;background:#faf6ec;border:0.5px solid #e8d9b5;border-radius:5px;padding:5px 9px;text-align:left;">
            <div style="font-size:9px;color:#6b6b6b;font-family:monospace;">Contract · ${escapeHtml(c.contract_no || '')}</div>
            ${snap.quote_number ? `<div style="font-size:9px;color:#6b6b6b;font-family:monospace;">Against · ${escapeHtml(snap.quote_number)}${Number(snap.revision) > 0 ? ' Rev.' + String(Number(snap.revision)).padStart(2, '0') : ''}</div>` : ''}
            <div style="font-size:9px;color:#6b6b6b;">Date · ${fmtDate(c.contract_date)}</div>
          </div>
        </div>
      </div>

      <!-- 2. Parties. The title block above is section 1, so the numbered
           sections start at 2 and run unbroken to 11. -->
      ${sectionHead(2, 'Parties')}
      <div style="display:flex;gap:14px;margin-bottom:4px;flex-wrap:wrap;">
        <div style="flex:1;min-width:220px;background:#faf9f7;border-left:2.5px solid ${ACC};padding:10px 13px;">
          <div style="font-size:8.5px;color:#b08f3f;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;">The Contractor</div>
          <div style="font-size:12.5px;font-weight:700;word-break:break-word;">${cName}</div>
          ${licence ? `<div style="font-size:10px;color:#6b6b6b;margin-top:2px;">Trade Licence No: ${licence}</div>` : ''}
          ${cAddr ? `<div style="font-size:10px;color:#6b6b6b;">${cAddr}</div>` : ''}
          ${cPhone ? `<div style="font-size:10px;color:#6b6b6b;">${cPhone}</div>` : ''}
          ${trn ? `<div style="font-size:10px;color:#6b6b6b;">TRN: ${trn}</div>` : ''}
        </div>
        <div style="flex:1;min-width:220px;background:#faf9f7;border-left:2.5px solid ${ACC};padding:10px 13px;">
          <div style="font-size:8.5px;color:#b08f3f;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;">The Client</div>
          <div style="font-size:12.5px;font-weight:700;word-break:break-word;">${clientLine || '—'}</div>
          ${c.client_address ? `<div style="font-size:10px;color:#6b6b6b;margin-top:2px;white-space:pre-line;">${escapeHtml(c.client_address)}</div>` : ''}
          ${c.client_phone ? `<div style="font-size:10px;color:#6b6b6b;">${escapeHtml(c.client_phone)}</div>` : ''}
          ${snap.client_trn ? `<div style="font-size:10px;color:#6b6b6b;">TRN: ${escapeHtml(snap.client_trn)}</div>` : ''}
        </div>
      </div>
      ${snap.project_title ? `<div style="font-size:10px;color:#6b6b6b;margin-top:8px;">Project · <span style="color:#1a1a1a;font-weight:700;">${escapeHtml(snap.project_title)}</span>${snap.location ? ' · ' + escapeHtml(snap.location) : ''}</div>` : ''}
    </div>

    ${scopeBlock}
    ${valueBlock}
    ${payBlock}
    ${clause(6, 'Timeline', c.timeline_text)}
    ${clause(7, 'Warranty', c.warranty_text)}
    ${clause(8, 'Variation Orders', c.variation_text)}
    ${clause(9, 'Payment Terms', c.payment_terms_text)}
    ${extraBlock}

    <!-- 11. Signatures -->
    <div style="padding:16px 30px 0;page-break-inside:avoid;break-inside:avoid;">
      ${sectionHead(11, 'Signatures')}
    </div>
    <div style="padding:6px 30px 8px;display:flex;gap:30px;flex-wrap:wrap;page-break-inside:avoid;break-inside:avoid;">
      <div style="flex:1;min-width:220px;text-align:center;">
        <div style="font-size:9px;font-weight:700;color:#6b6b6b;margin-bottom:30px;">For and on behalf of ${cName}</div>
        ${signArt}
        <div style="border-bottom:1px solid #1a1a1a;"></div>
        <div style="font-size:8px;color:#999;margin-top:4px;">Authorised Signatory · Date · Company Stamp</div>
      </div>
      <div style="flex:1;min-width:220px;text-align:center;">
        <div style="font-size:9px;font-weight:700;color:#6b6b6b;margin-bottom:30px;">For and on behalf of the Client</div>
        <div style="border-bottom:1px solid #1a1a1a;"></div>
        <div style="font-size:9px;color:#1a1a1a;font-weight:700;margin-top:4px;">${clientLine || 'Client'}</div>
        <div style="font-size:8px;color:#999;margin-top:1px;">Signature · Date</div>
      </div>
    </div>
    <div style="padding:0 30px 24px;font-size:8.5px;color:#9a9a9a;line-height:1.6;">
      This Agreement is executed on the date stated above and reflects the scope and commercial terms of ${escapeHtml(snap.quote_number || 'the referenced quotation')} as at the date of issue.
    </div>
  </div>`
}
