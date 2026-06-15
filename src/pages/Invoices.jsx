import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const STATUS_STYLE = {
  unpaid:  { label: 'Unpaid',  color: '#b91c1c', bg: '#fee2e2' },
  partial: { label: 'Partial', color: '#92400e', bg: '#fef9ed' },
  paid:    { label: 'Paid',    color: '#0f6e56', bg: '#e1f5ee' },
}
const todayStr = () => new Date().toISOString().slice(0, 10)
const fmt = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
const num = n => Math.round(Number(n) || 0).toLocaleString('en-AE')
const initials = nm => nm ? nm.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?'

function parsePayments(raw) {
  try { const a = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
function parseSchedule(raw) {
  try { const a = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); return Array.isArray(a) ? a.map(x => ({ percent: Number(x.percent) || 0, label: x.label || '', description: x.description || '' })) : [] } catch { return [] }
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
function statusOf(total, payments) {
  const paid = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
  if (paid <= 0) return 'unpaid'
  return paid >= Math.round(Number(total) || 0) ? 'paid' : 'partial'
}

export default function Invoices({ subRoute = '', setSubRoute }) {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  const [view, setView] = useState('list')        // list | create | detail
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [tpl, setTpl] = useState(null)

  // create flow
  const [approvedQuotes, setApprovedQuotes] = useState([])
  const [quoteSearch, setQuoteSearch] = useState('')
  const [selQuote, setSelQuote] = useState(null)
  const [invType, setInvType] = useState('full')   // 'full' | milestone index
  const [issueDate, setIssueDate] = useState(todayStr())
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  // detail
  const [active, setActive] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(todayStr())
  const [payMethod, setPayMethod] = useState('')
  const [payNote, setPayNote] = useState('')

  useEffect(() => {
    if (company?.id) { fetchInvoices(); fetchTemplate() }
  }, [company?.id])

  async function fetchInvoices() {
    setLoading(true)
    const { data } = await supabase.from('invoices').select('*')
      .eq('company_id', company.id).order('created_at', { ascending: false }).limit(500)
    setInvoices(data || []); setLoading(false)
  }
  async function fetchTemplate() {
    const { data } = await supabase.from('quotation_templates').select('*').eq('company_id', company.id).maybeSingle()
    setTpl(data || null)
  }
  async function fetchApprovedQuotes() {
    const { data } = await supabase.from('quotations').select('*')
      .eq('company_id', company.id).eq('status', 'approved').order('created_at', { ascending: false })
    setApprovedQuotes(data || [])
  }

  function openCreate() { setSelQuote(null); setInvType('full'); setIssueDate(todayStr()); setDueDate(''); setQuoteSearch(''); fetchApprovedQuotes(); setView('create') }
  function openDetail(inv) { setActive(inv); setPayAmount(''); setPayMethod(''); setPayNote(''); setPayDate(todayStr()); setView('detail') }

  async function createInvoice() {
    if (!selQuote) { toast.error('Select an approved quote'); return }
    setSaving(true)
    try {
      const q = selQuote
      const schedule = parseSchedule(q.payment_terms)
      let kind = 'full', milestone_label = null, items = [], subtotal = 0, vat_amount = 0, total = 0
      let mode = q.mode || 'simple', vat_enabled = (q.vat_enabled != null ? q.vat_enabled : !!q.vat_amount)
      if (invType === 'full') {
        items = Array.isArray(q.items) ? q.items : []
        subtotal = Number(q.subtotal || 0); vat_amount = Number(q.vat_amount || 0); total = Number(q.total || 0)
      } else {
        const m = schedule[invType]
        const pct = Number(m?.percent) || 0
        total = Math.round(Number(q.total || 0) * pct / 100)
        vat_amount = Math.round(Number(q.vat_amount || 0) * pct / 100)
        subtotal = total - vat_amount
        kind = 'milestone'; milestone_label = `${m?.label || 'Payment'} (${pct}%)`; mode = 'simple'; vat_enabled = Number(vat_amount) > 0
        items = [{ desc: `${m?.label || 'Payment'} — ${pct}% of ${q.quote_number}`, unit: 'Lump Sum', qty: 1, rate: subtotal }]
      }
      const { data: seq, error: seqErr } = await supabase.rpc('fn_next_invoice_seq', { p_company_id: company.id })
      if (seqErr) throw seqErr
      const prefix = tpl?.invoice_prefix || 'INV'
      const payload = {
        company_id: company.id,
        invoice_number: `${prefix}-${String(seq).padStart(3, '0')}`,
        quotation_id: q.id, quote_number: q.quote_number,
        client_id: q.client_id, client_uid: q.client_uid, client_name: q.client_name, client_phone: q.client_phone, client_email: q.client_email,
        project_title: q.project_title, location: q.location,
        kind, milestone_label, mode, items, vat_enabled, subtotal, vat_amount, total,
        issue_date: issueDate || todayStr(), due_date: dueDate || null,
        payments: [], status: 'unpaid', phase: 'proforma',
      }
      const { data, error } = await supabase.from('invoices').insert(payload).select().single()
      if (error) throw error
      toast.success('Invoice created ✓')
      fetchInvoices()
      if (data) openDetail(data); else setView('list')
    } catch (e) { toast.error('Create failed: ' + (e.message || 'unknown')) } finally { setSaving(false) }
  }

  async function savePayments(inv, newPayments) {
    try {
      const status = statusOf(inv.total, newPayments)
      const phase = newPayments.length > 0 ? 'tax' : 'proforma'   // first payment converts Proforma → Tax Invoice
      const { data, error } = await supabase.from('invoices')
        .update({ payments: newPayments, status, phase }).eq('id', inv.id).eq('company_id', company.id).select()
      if (error) { toast.error('Update failed: ' + error.message); return false }
      if (!data || data.length === 0) { toast.error('Could not save — update not allowed for this invoice (RLS?)'); return false }
      const updated = { ...inv, payments: newPayments, status, phase }
      setActive(updated); setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i))
      return true
    } catch (e) { toast.error('Update error: ' + (e.message || 'unknown')); return false }
  }
  async function addPayment() {
    const amt = Number(payAmount) || 0
    if (amt <= 0) { toast.error('Enter a valid amount'); return }
    const alreadyPaid = parsePayments(active.payments).reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const balance = (Number(active.total) || 0) - alreadyPaid
    const fmtN = v => 'AED ' + Math.round(Number(v) || 0).toLocaleString('en-AE')
    if (amt > balance + 0.5) {
      if (!window.confirm(`This payment (${fmtN(amt)}) is more than the outstanding balance (${fmtN(balance)}). Record it anyway?`)) return
    }
    const newP = [...parsePayments(active.payments), { amount: amt, date: payDate || todayStr(), method: payMethod.trim() || 'Cash', note: payNote.trim() || '' }]
    if (await savePayments(active, newP)) { setPayAmount(''); setPayMethod(''); setPayNote(''); toast.success('Payment recorded ✓') }
  }
  async function removePayment(idx) {
    const newP = parsePayments(active.payments).filter((_, i) => i !== idx)
    await savePayments(active, newP)
  }
  async function deleteInvoice(inv) {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return
    const { error } = await supabase.from('invoices').delete().eq('id', inv.id).eq('company_id', company.id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Invoice deleted')
    if (active?.id === inv.id) { setActive(null); setView('list') }
    fetchInvoices()
  }

  // ---------- Invoice PDF ----------
  function buildInvoiceHTML(inv) {
    const cName = escapeHtml(tpl?.company_legal_name || company?.name || 'Company')
    const cLogo = company?.logo_url || ''
    const tagline = escapeHtml(tpl?.tagline || 'Dubai, UAE')
    const cPhone = escapeHtml(tpl?.contact_phone || company?.phone || '')
    const trn = escapeHtml(tpl?.trn_number || '')
    const items = Array.isArray(inv.items) ? inv.items : []
    const n = v => Math.round(Number(v) || 0).toLocaleString('en-AE')
    const sub = Number(inv.subtotal || 0), vat = Number(inv.vat_amount || 0), tot = Number(inv.total || 0)
    const disc = Math.max(0, Math.round(sub - (tot - vat)))   // discount = gross subtotal − (total − VAT), so Subtotal − Discount + VAT = Total
    const payments = parsePayments(inv.payments)
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const bal = Math.max(0, tot - paid)
    const dateStr = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    const td = 'padding:7px 9px;font-size:10.5px;border-bottom:0.5px solid #ededed;'
    const rows = items.map((it, i) => `<tr>
      <td style="${td}color:#999;">${i + 1}</td>
      <td style="${td}word-break:break-word;">${escapeHtml(it.desc || '')}</td>
      <td style="${td}text-align:center;color:#777;">${escapeHtml(it.unit || '')}</td>
      <td style="${td}text-align:center;color:#777;">${escapeHtml(it.qty || 0)}</td>
      <td style="${td}text-align:right;color:#777;">${n((Number(it.rate) || 0))}</td>
      <td style="${td}text-align:right;">${n((Number(it.qty) || 0) * (Number(it.rate) || 0))}</td>
    </tr>`).join('')
    const payRows = payments.map(p => `<tr>
      <td style="${td}">${dateStr(p.date)}</td>
      <td style="${td}">${escapeHtml(p.method || '')}${p.note ? ' · ' + escapeHtml(p.note) : ''}</td>
      <td style="${td}text-align:right;color:#0f6e56;">AED ${n(p.amount)}</td>
    </tr>`).join('')
    const logoBox = cLogo
      ? `<img src="${escapeHtml(cLogo)}" style="width:50px;height:50px;border-radius:10px;object-fit:cover;">`
      : `<div style="width:50px;height:50px;border-radius:10px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:#c9952a;">${cName[0] || 'C'}</div>`
    const paidOn = payments.map(p => p.date).filter(Boolean).sort().slice(-1)[0] || ''
    const paidStamp = bal <= 0
      ? `<div style="position:absolute;top:47%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);border:3px solid #0f6e56;color:#0f6e56;font-weight:800;font-size:30px;letter-spacing:4px;padding:8px 22px;border-radius:12px;opacity:.8;text-align:center;z-index:5;">PAID${paidOn ? `<div style="font-size:11px;letter-spacing:1px;font-weight:700;margin-top:3px;">${dateStr(paidOn)}</div>` : ''}</div>` : ''
    return `<div style="position:relative;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:680px;margin:0 auto;background:#fff;">
      ${paidStamp}
      <div style="height:5px;background:#c9952a;"></div>
      <div style="padding:22px 30px 0;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
          <div style="display:flex;gap:12px;align-items:center;">
            ${logoBox}
            <div><div style="font-size:16px;font-weight:700;">${cName}</div>
              <div style="font-size:9px;color:#8a8a8a;letter-spacing:1px;text-transform:uppercase;">${tagline}</div>
              <div style="font-size:9.5px;color:#8a8a8a;margin-top:3px;">${cPhone}${trn ? ' · TRN ' + trn : ''}</div></div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:20px;font-weight:700;color:#c9952a;letter-spacing:1px;">${paid > 0 ? 'TAX INVOICE' : 'PROFORMA INVOICE'}</div>
            <div style="display:inline-block;margin-top:6px;background:#faf6ec;border:0.5px solid #e8d9b5;border-radius:5px;padding:5px 9px;text-align:left;">
              <div style="font-size:9px;color:#6b6b6b;font-family:monospace;">Invoice · ${escapeHtml(inv.invoice_number || '')}</div>
              ${inv.quote_number ? `<div style="font-size:9px;color:#6b6b6b;font-family:monospace;">Ref Quote · ${escapeHtml(inv.quote_number)}</div>` : ''}
              <div style="font-size:9px;color:#6b6b6b;">Issued · ${dateStr(inv.issue_date)}</div>
              ${inv.due_date ? `<div style="font-size:9px;color:#6b6b6b;">Due · ${dateStr(inv.due_date)}</div>` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:14px;margin-bottom:16px;">
          <div style="flex:1;background:#faf9f7;border-left:2.5px solid #c9952a;padding:10px 13px;">
            <div style="font-size:8.5px;color:#b08f3f;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;">Bill To</div>
            <div style="font-size:12.5px;font-weight:700;">${escapeHtml(inv.client_name || '')}</div>
            ${inv.location ? `<div style="font-size:10px;color:#6b6b6b;">${escapeHtml(inv.location)}</div>` : ''}
            ${inv.client_phone ? `<div style="font-size:10px;color:#6b6b6b;">${escapeHtml(inv.client_phone)}</div>` : ''}
          </div>
          <div style="flex:1;background:#faf9f7;border-left:2.5px solid #c9952a;padding:10px 13px;">
            <div style="font-size:8.5px;color:#b08f3f;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px;">Project</div>
            <div style="font-size:12.5px;font-weight:700;">${escapeHtml(inv.project_title || '—')}</div>
            ${inv.milestone_label ? `<div style="font-size:10px;color:#6b6b6b;">${escapeHtml(inv.milestone_label)}</div>` : ''}
          </div>
        </div>
      </div>
      <div style="padding:0 30px;">
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup><col style="width:26px"><col><col style="width:44px"><col style="width:36px"><col style="width:62px"><col style="width:74px"></colgroup>
          <thead><tr style="background:#1a1a1a;color:#fff;">
            <th style="padding:7px 9px;text-align:left;font-size:9px;">#</th><th style="padding:7px 9px;text-align:left;font-size:9px;">Description</th>
            <th style="padding:7px 9px;text-align:center;font-size:9px;">Unit</th><th style="padding:7px 9px;text-align:center;font-size:9px;">Qty</th>
            <th style="padding:7px 9px;text-align:right;font-size:9px;">Rate</th><th style="padding:7px 9px;text-align:right;font-size:9px;">Amount</th>
          </tr></thead><tbody>${rows}</tbody>
        </table>
      </div>
      <div style="padding:16px 30px 0;display:flex;justify-content:flex-end;">
        <div style="width:260px;">
          <div style="display:flex;justify-content:space-between;font-size:10.5px;padding:3px 0;color:#6b6b6b;"><span>Subtotal</span><span>AED ${n(sub)}</span></div>
          ${disc > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10.5px;padding:3px 0;color:#b91c1c;"><span>Discount</span><span>− AED ${n(disc)}</span></div>` : ''}
          ${vat > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10.5px;padding:3px 0;color:#6b6b6b;"><span>VAT 5%</span><span>${n(vat)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:7px 10px;margin-top:5px;background:#1a1a1a;color:#fff;border-radius:4px;"><span>Invoice Total</span><span style="color:#c9952a;">AED ${n(tot)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:10.5px;padding:5px 0 2px;color:#0f6e56;"><span>Paid</span><span>− AED ${n(paid)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;padding:4px 0;border-top:1px solid #eee;"><span>Balance Due</span><span style="color:${bal > 0 ? '#b91c1c' : '#0f6e56'};">AED ${n(bal)}</span></div>
        </div>
      </div>
      ${payments.length ? `<div style="padding:16px 30px 0;">
        <div style="font-size:10px;color:#c9952a;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:8px;">— Payments Received</div>
        <table style="width:100%;border-collapse:collapse;"><tbody>${payRows}</tbody></table>
      </div>` : ''}
      <div style="background:#1a1a1a;color:#9a9a9a;font-size:8.5px;text-align:center;padding:9px;margin-top:20px;">${cName} · ${cPhone}${trn ? ' · TRN ' + trn : ''}</div>
    </div>`
  }
  function printInvoice(inv) {
    const w = window.open('', '_blank')
    if (!w) { toast.error('Allow pop-ups to print'); return }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(inv.invoice_number || 'Invoice')}</title>
      <style>@media print{@page{margin:8mm}}body{margin:0;background:#fff}</style></head><body>${buildInvoiceHTML(inv)}
      <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`)
    w.document.close()
  }
  function whatsappInvoice(inv) {
    const payments = parsePayments(inv.payments)
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const bal = Math.max(0, Number(inv.total || 0) - paid)
    const phone = (inv.client_phone || '').replace(/[^0-9]/g, '')
    const msg = `Dear ${inv.client_name || 'Client'},\n\nInvoice ${inv.invoice_number} from ${company?.name || ''}.\nTotal: AED ${num(inv.total)} · Balance due: AED ${num(bal)}\n\nThank you.`
    window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank')
  }

  // ---------- theme ----------
  const text = isDark ? '#f1f5f9' : '#0f172a', textSub = isDark ? '#94a3b8' : '#64748b', textMuted = isDark ? '#475569' : '#94a3b8'
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', cardBg = isDark ? '#1e293b' : '#ffffff'
  const subBg = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', inputBg = isDark ? '#0f172a' : '#fff'
  const inputStyle = { padding: '9px 11px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, background: inputBg, color: text, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const card = { background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 50 }}>
      <div style={{ width: 34, height: 34, border: '3px solid #0099cc', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p style={{ color: textMuted, fontSize: 13 }}>Loading invoices…</p>
    </div>
  )

  // ============ CREATE ============
  if (view === 'create') {
    const schedule = selQuote ? parseSchedule(selQuote.payment_terms) : []
    const qList = approvedQuotes.filter(q => {
      if (!quoteSearch.trim()) return true
      const s = quoteSearch.toLowerCase()
      return q.quote_number?.toLowerCase().includes(s) || q.client_name?.toLowerCase().includes(s) || q.project_title?.toLowerCase().includes(s)
    })
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={() => setView('list')} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${border}`, background: cardBg, color: textSub, cursor: 'pointer' }}><i className="ti ti-arrow-left" /></button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: text, margin: 0 }}>New Invoice</h1>
        </div>

        {!selQuote ? (
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 10 }}>Select an approved quote</div>
            <input value={quoteSearch} onChange={e => setQuoteSearch(e.target.value)} placeholder="Search quote number, client, project…" style={{ ...inputStyle, marginBottom: 10 }} />
            {qList.length === 0 ? (
              <div style={{ fontSize: 12.5, color: textMuted, textAlign: 'center', padding: '20px 0' }}>No approved quotes yet. Approve a quote first to invoice it.</div>
            ) : qList.map(q => (
              <div key={q.id} onClick={() => { setSelQuote(q); setInvType('full') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 9, border: `1px solid ${border}`, marginBottom: 7, cursor: 'pointer' }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: subBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#0077a3' }}>{initials(q.client_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{q.quote_number} · {q.client_name}</div>
                  <div style={{ fontSize: 11.5, color: textSub }}>{q.project_title || '—'} · {fmt(q.total)}</div>
                </div>
                <i className="ti ti-chevron-right" style={{ color: textMuted }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{selQuote.quote_number} · {selQuote.client_name}</div>
                  <div style={{ fontSize: 12, color: textSub }}>{selQuote.project_title || '—'} · Total {fmt(selQuote.total)}</div>
                </div>
                <button onClick={() => setSelQuote(null)} style={{ fontSize: 12, color: '#0099cc', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Change</button>
              </div>
            </div>

            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 10 }}>Invoice for</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 9, border: `1px solid ${invType === 'full' ? '#0099cc' : border}`, marginBottom: 8, cursor: 'pointer' }}>
                <input type="radio" checked={invType === 'full'} onChange={() => setInvType('full')} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: text }}>Full amount</div><div style={{ fontSize: 11.5, color: textSub }}>Entire quote</div></div>
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{fmt(selQuote.total)}</div>
              </label>
              {schedule.map((m, i) => {
                const amt = Math.round(Number(selQuote.total || 0) * (Number(m.percent) || 0) / 100)
                return (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 9, border: `1px solid ${invType === i ? '#0099cc' : border}`, marginBottom: 8, cursor: 'pointer' }}>
                    <input type="radio" checked={invType === i} onChange={() => setInvType(i)} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: text }}>{m.label || 'Payment'} <span style={{ color: '#c9952a' }}>({m.percent}%)</span></div>{m.description && <div style={{ fontSize: 11, color: textMuted }}>{m.description}</div>}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{fmt(amt)}</div>
                  </label>
                )
              })}
              {schedule.length === 0 && <div style={{ fontSize: 11.5, color: textMuted }}>This quote has no payment milestones — only a full invoice is available.</div>}
            </div>

            <div style={card}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10 }}>
                <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Issue date</label><input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} style={inputStyle} /></div>
                <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Due date (optional)</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} /></div>
              </div>
            </div>

            <button onClick={createInvoice} disabled={saving} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: '#0099cc', color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating…' : 'Create Invoice'}
            </button>
          </>
        )}
      </div>
    )
  }

  // ============ DETAIL ============
  if (view === 'detail' && active) {
    const inv = active
    const st = STATUS_STYLE[inv.status || 'unpaid'] || STATUS_STYLE.unpaid
    const items = Array.isArray(inv.items) ? inv.items : []
    const payments = parsePayments(inv.payments)
    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const bal = Math.max(0, Number(inv.total || 0) - paid)
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={() => { setView('list'); setActive(null) }} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${border}`, background: cardBg, color: textSub, cursor: 'pointer' }}><i className="ti ti-arrow-left" /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: text }}>{inv.invoice_number}</div>
            <div style={{ fontSize: 12, color: textMuted }}>{paid > 0 ? 'Tax Invoice' : 'Proforma Invoice'}{inv.quote_number ? ` · from ${inv.quote_number}` : ''}{inv.milestone_label ? ' · ' + inv.milestone_label : ''}</div>
          </div>
          <span style={{ fontSize: 11, color: st.color, background: isDark ? st.color + '22' : st.bg, padding: '4px 11px', borderRadius: 99, fontWeight: 600 }}>{st.label}</span>
        </div>

        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: isDark ? 'rgba(3,193,245,0.12)' : '#e0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: '#0077a3' }}>{initials(inv.client_name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: text }}>{inv.client_name}</div>
            <div style={{ fontSize: 12, color: textSub }}>{inv.client_phone || '—'}{inv.project_title ? ' · ' + inv.project_title : ''}</div>
          </div>
        </div>

        {/* Amount summary */}
        <div style={{ ...card, display: 'flex', gap: 10, textAlign: 'center' }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: textMuted }}>Total</div><div style={{ fontSize: 16, fontWeight: 700, color: text }}>{fmt(inv.total)}</div></div>
          <div style={{ flex: 1, borderLeft: `1px solid ${border}` }}><div style={{ fontSize: 11, color: textMuted }}>Paid</div><div style={{ fontSize: 16, fontWeight: 700, color: '#0f6e56' }}>{fmt(paid)}</div></div>
          <div style={{ flex: 1, borderLeft: `1px solid ${border}` }}><div style={{ fontSize: 11, color: textMuted }}>Balance</div><div style={{ fontSize: 16, fontWeight: 700, color: bal > 0 ? '#b91c1c' : '#0f6e56' }}>{fmt(bal)}</div></div>
        </div>

        {/* Items */}
        <div style={card}>
          <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Items</div>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: i < items.length - 1 ? `1px solid ${border}` : 'none', color: text }}>
              <span style={{ flex: 1, minWidth: 0 }}>{it.desc}{it.qty > 1 ? ` · ${it.qty} ${it.unit}` : ''}</span>
              <span style={{ fontWeight: 600 }}>{fmt((Number(it.qty) || 0) * (Number(it.rate) || 0))}</span>
            </div>
          ))}
        </div>

        {/* Payments */}
        <div style={card}>
          <div style={{ fontSize: 11, color: textMuted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Payments</div>
          {payments.length === 0 && <div style={{ fontSize: 12, color: textMuted, marginBottom: 10 }}>No payments recorded yet.</div>}
          {payments.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '6px 0', borderBottom: `1px solid ${border}` }}>
              <div style={{ flex: 1 }}><span style={{ fontWeight: 600, color: text }}>{fmt(p.amount)}</span> <span style={{ color: textSub }}>· {p.method}</span>{p.note ? <span style={{ color: textMuted }}> · {p.note}</span> : ''}</div>
              <span style={{ fontSize: 11, color: textMuted }}>{p.date ? new Date(p.date).toLocaleDateString('en-GB') : ''}</span>
              <i className="ti ti-x" onClick={() => removePayment(i)} style={{ fontSize: 14, color: textMuted, cursor: 'pointer' }} />
            </div>
          ))}
          {bal > 0 && (
            <div style={{ marginTop: 10, padding: '11px', border: `1px dashed ${border}`, borderRadius: 9 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Amount (bal ${num(bal)})`} style={inputStyle} />
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={inputStyle} />
                <input value={payMethod} onChange={e => setPayMethod(e.target.value)} placeholder="Method (Cash, Bank…)" style={inputStyle} />
                <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Note (optional)" style={inputStyle} />
              </div>
              <button onClick={addPayment} style={{ width: '100%', padding: '10px', borderRadius: 9, border: 'none', background: '#0f6e56', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <i className="ti ti-plus" style={{ verticalAlign: '-2px', marginRight: 4 }} />Record payment
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <button onClick={() => printInvoice(inv)} style={{ flex: 1, minWidth: 110, padding: '10px', borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><i className="ti ti-printer" style={{ verticalAlign: '-2px', marginRight: 4 }} />Print / PDF</button>
          <button onClick={() => whatsappInvoice(inv)} style={{ flex: 1, minWidth: 110, padding: '10px', borderRadius: 9, border: 'none', background: '#22c55e', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><i className="ti ti-brand-whatsapp" style={{ verticalAlign: '-2px', marginRight: 4 }} />WhatsApp</button>
          <button onClick={() => deleteInvoice(inv)} style={{ flex: 1, minWidth: 110, padding: '10px', borderRadius: 9, border: '1px solid #fca5a5', background: cardBg, color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><i className="ti ti-trash" style={{ verticalAlign: '-2px', marginRight: 4 }} />Delete</button>
        </div>
      </div>
    )
  }

  // ============ LIST ============
  let list = invoices
  if (filter !== 'all') list = list.filter(i => (i.status || 'unpaid') === filter)
  if (search.trim()) {
    const s = search.toLowerCase()
    list = list.filter(i => i.invoice_number?.toLowerCase().includes(s) || i.client_name?.toLowerCase().includes(s) || i.project_title?.toLowerCase().includes(s) || i.quote_number?.toLowerCase().includes(s))
  }
  const totInvoiced = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
  const totReceived = invoices.reduce((s, i) => s + parsePayments(i.payments).reduce((a, p) => a + (Number(p.amount) || 0), 0), 0)
  const totOutstanding = Math.max(0, totInvoiced - totReceived)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: text, margin: 0 }}>Invoices</h1>
          <p style={{ fontSize: 13, color: textSub, marginTop: 3 }}>Invoice approved quotes &amp; track payments</p>
        </div>
        <button onClick={openCreate} style={{ padding: '9px 16px', background: '#0099cc', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New Invoice</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
        {[['Invoiced', totInvoiced, text], ['Received', totReceived, '#0f6e56'], ['Outstanding', totOutstanding, '#b91c1c']].map(([l, v, c]) => (
          <div key={l} style={{ ...card, marginBottom: 0, textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: 11, color: textMuted }}>{l}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c }}>{fmt(v)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices…" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {['all', 'unpaid', 'partial', 'paid'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${filter === f ? '#0099cc' : border}`, background: filter === f ? (isDark ? 'rgba(3,193,245,0.12)' : '#e0f9ff') : cardBg, color: filter === f ? '#0099cc' : textSub, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{f}</button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', background: cardBg, border: `1px solid ${border}`, borderRadius: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: subBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><i className="ti ti-receipt" style={{ fontSize: 26, color: textMuted }} /></div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: text, margin: '0 0 6px' }}>{invoices.length === 0 ? 'No invoices yet' : 'No invoices match'}</h3>
          <p style={{ fontSize: 13, color: textSub, margin: '0 0 18px' }}>{invoices.length === 0 ? 'Create an invoice from an approved quote.' : 'Try a different filter or search.'}</p>
          {invoices.length === 0 && <button onClick={openCreate} style={{ padding: '10px 18px', background: '#0099cc', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New Invoice</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {list.map(inv => {
            const st = STATUS_STYLE[inv.status || 'unpaid'] || STATUS_STYLE.unpaid
            const paid = parsePayments(inv.payments).reduce((a, p) => a + (Number(p.amount) || 0), 0)
            const bal = Math.max(0, Number(inv.total || 0) - paid)
            return (
              <div key={inv.id} onClick={() => openDetail(inv)} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: subBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="ti ti-receipt" style={{ fontSize: 19, color: textSub }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: text, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{inv.invoice_number}
                    <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: paid > 0 ? (isDark ? '#0f6e5622' : '#e1f5ee') : (isDark ? '#94a3b822' : '#f1f5f9'), color: paid > 0 ? '#0f6e56' : textSub }}>{paid > 0 ? 'Tax' : 'Proforma'}</span>
                    {inv.milestone_label ? <span style={{ fontSize: 11, color: textMuted, fontWeight: 400 }}>· {inv.milestone_label}</span> : null}
                  </div>
                  <div style={{ fontSize: 12, color: textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.client_name || 'No client'}{inv.project_title ? ' · ' + inv.project_title : ''}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: text }}>{fmt(inv.total)}</div>
                  <span style={{ fontSize: 11, color: st.color, background: isDark ? st.color + '22' : st.bg, padding: '2px 9px', borderRadius: 99 }}>{st.label}</span>
                  {bal > 0 && <div style={{ fontSize: 10.5, color: '#b91c1c', marginTop: 2 }}>Bal {num(bal)}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
