import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const fmt = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
function parsePayments(raw) {
  try { const a = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
const cap = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : ''
const monthKey = d => (d || '').slice(0, 7)
const yearKey  = d => (d || '').slice(0, 4)

const INCOME_CATS  = ['Sale / Service', 'Advance', 'Other income']
const EXPENSE_CATS = ['Material', 'Labour', 'Subcontractor', 'Rent', 'Salary', 'Transport', 'Utilities', 'Marketing', 'Tools / Equipment', 'Govt / Fees', 'Bank charges', 'Misc']
const METHODS      = ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Online']
const VAT_RATE     = 5

// Normalise any method label (from invoices, purchases, manual, sub-payments)
// into one bucket so the dashboard can total cash vs bank vs card etc.
const METHOD_KEYS  = ['Cash', 'Bank', 'Card', 'Cheque', 'Online', 'Other']
const METHOD_ICON  = { Cash: 'ti-coin', Bank: 'ti-building-bank', Card: 'ti-credit-card', Cheque: 'ti-checkbox', Online: 'ti-world', Other: 'ti-dots' }
function normMethod(m) {
  const s = (m || '').toLowerCase()
  if (!s) return 'Other'
  if (s.includes('cash')) return 'Cash'
  if (s.includes('bank') || s.includes('transfer')) return 'Bank'
  if (s.includes('card')) return 'Card'
  if (s.includes('cheque') || s.includes('check')) return 'Cheque'
  if (s.includes('online')) return 'Online'
  return 'Other'
}

const SOURCE_BADGE = {
  invoice:  { label: 'Invoice',  color: '#185fa5', bg: '#e6f1fb' },
  manual:   { label: 'Manual',   color: '#7c3aed', bg: '#f3e8ff' },
  site:     { label: 'Site',     color: '#b45309', bg: '#fef3c7' },
  purchase: { label: 'Purchase', color: '#9a3412', bg: '#ffedd5' },
}

const blankEntry = () => ({
  id: null, kind: 'expense', category: 'Material', party: '', description: '',
  amount: '', hasVat: false, amountType: 'net', method: 'Cash', reference: '',
  entry_date: new Date().toISOString().slice(0, 10), notes: '',
})

// Split a typed amount into net / vat / gross based on whether VAT applies and
// whether the amount entered is pre-VAT (net) or VAT-inclusive (gross).
function splitVat({ amount, hasVat, amountType }) {
  const a = Number(amount) || 0
  if (!hasVat || a <= 0) return { net: a, vat: 0, total: a }
  if (amountType === 'gross') {
    const net = a / (1 + VAT_RATE / 100)
    return { net: Math.round(net), vat: Math.round(a - net), total: Math.round(a) }
  }
  const vat = a * VAT_RATE / 100
  return { net: Math.round(a), vat: Math.round(vat), total: Math.round(a + vat) }
}

export default function Ledger() {
  const { company, user } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [, forceUpdate] = useState(0)

  const [rows, setRows]       = useState([])         // unified transactions
  const [invoiceVat, setInvoiceVat] = useState([])   // [{ date, vat }] issued-invoice output VAT
  const [trn, setTrn]         = useState('')
  const [clients, setClients] = useState([])         // for the income party search
  const [suppliers, setSuppliers] = useState([])     // for the expense party search
  const [loading, setLoading] = useState(true)

  const [period, setPeriod]   = useState('month')    // month | lastMonth | year | all
  const [typeFilter, setTypeFilter] = useState('all') // all | income | expense
  const [search, setSearch]   = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]       = useState(blankEntry())
  const [saving, setSaving]   = useState(false)
  const [hasTable, setHasTable] = useState(true)     // false until the migration is run

  useEffect(() => {
    if (company?.id) load()
    const obs = new MutationObserver(() => forceUpdate(n => n + 1))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [company?.id])

  async function load() {
    setLoading(true)
    try {
      const [invRes, projRes, seRes, spRes, piRes, tplRes, clRes, supRes] = await Promise.all([
        supabase.from('invoices').select('invoice_number, client_name, project_title, issue_date, vat_enabled, vat_amount, total, payments, status').eq('company_id', company.id),
        supabase.from('ops_projects').select('id, name').eq('company_id', company.id),
        supabase.from('site_expenses').select('id, project_id, category, description, amount, spent_on').eq('company_id', company.id),
        supabase.from('sub_payments').select('id, project_id, amount, paid_on, method, reference, note').eq('company_id', company.id),
        supabase.from('purchase_invoices').select('id, supplier_name, invoice_number, invoice_date, category, description, client_name, method, subtotal, vat_amount, total').eq('company_id', company.id),
        supabase.from('quotation_templates').select('trn_number').eq('company_id', company.id).maybeSingle(),
        supabase.from('clients').select('name').eq('company_id', company.id).order('name'),
        supabase.from('suppliers').select('name').eq('company_id', company.id).order('name'),
      ])
      // ledger_entries may not exist until the migration is run — handle gracefully
      let entries = []
      const entRes = await supabase.from('ledger_entries').select('*').eq('company_id', company.id)
      if (entRes.error) setHasTable(false); else { entries = entRes.data || []; setHasTable(true) }

      setTrn(tplRes.data?.trn_number || '')
      setClients((clRes.data || []).map(c => c.name).filter(Boolean))
      setSuppliers((supRes.data || []).map(s => s.name).filter(Boolean))
      const projMap = {}
      ;(projRes.data || []).forEach(p => { projMap[p.id] = p.name })

      const out = []
      const vatRows = []
      ;(invRes.data || []).forEach(inv => {
        if (inv.vat_enabled !== false && Number(inv.vat_amount) > 0) vatRows.push({ date: inv.issue_date || '', vat: Number(inv.vat_amount) || 0 })
        const label = [inv.invoice_number, inv.project_title].filter(Boolean).join(' · ')
        parsePayments(inv.payments).forEach((p, idx) => {
          const amt = Number(p.amount) || 0
          out.push({
            id: `inv-${inv.invoice_number}-${idx}`, source: 'invoice', kind: 'income',
            date: p.date || '', party: inv.client_name || '—', category: 'Sale / Service',
            description: label || 'Invoice payment', method: p.method || '', reference: inv.invoice_number || '',
            net: amt, vat: 0, total: amt, editable: false,
          })
        })
      })
      entries.forEach(e => {
        out.push({
          id: `led-${e.id}`, _id: e.id, source: 'manual', kind: e.kind || 'expense',
          date: e.entry_date || '', party: e.party || '', category: e.category || '',
          description: e.description || '', method: e.method || '', reference: e.reference || '',
          net: Number(e.amount) || 0, vat: Number(e.vat_amount) || 0, total: Number(e.total) || (Number(e.amount) || 0),
          notes: e.notes || '', editable: true, raw: e,
        })
      })
      ;(seRes.data || []).forEach(x => {
        const amt = Number(x.amount) || 0
        out.push({
          id: `se-${x.id}`, source: 'site', kind: 'expense', date: x.spent_on || '',
          party: projMap[x.project_id] || 'Project', category: cap(x.category) || 'Site',
          description: x.description || 'Site expense', method: '', reference: '',
          net: amt, vat: 0, total: amt, editable: false,
        })
      })
      ;(spRes.data || []).forEach(x => {
        const amt = Number(x.amount) || 0
        out.push({
          id: `sp-${x.id}`, source: 'site', kind: 'expense', date: x.paid_on || '',
          party: projMap[x.project_id] || 'Subcontractor', category: 'Subcontractor',
          description: x.note || 'Subcontractor payment', method: x.method || '', reference: x.reference || '',
          net: amt, vat: 0, total: amt, editable: false,
        })
      })
      ;(piRes.data || []).forEach(x => {
        out.push({
          id: `pi-${x.id}`, source: 'purchase', kind: 'expense', date: x.invoice_date || '',
          party: x.supplier_name || 'Supplier', category: x.category || 'Purchase',
          description: [x.client_name, x.invoice_number, x.description].filter(Boolean).join(' · ') || 'Purchase bill', method: x.method || '', reference: x.invoice_number || '',
          net: Number(x.subtotal) || 0, vat: Number(x.vat_amount) || 0, total: Number(x.total) || (Number(x.subtotal) || 0), editable: false,
        })
      })
      out.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setRows(out); setInvoiceVat(vatRows)
    } catch (e) { /* keep page usable */ } finally { setLoading(false) }
  }

  // ---------- period filter ----------
  const now = new Date()
  const thisMonth = monthKey(now.toISOString())
  const lastMonthD = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = monthKey(lastMonthD.toISOString())
  const thisYear = String(now.getFullYear())
  function inPeriod(date) {
    if (!date) return period === 'all'
    if (period === 'month') return monthKey(date) === thisMonth
    if (period === 'lastMonth') return monthKey(date) === lastMonth
    if (period === 'year') return yearKey(date) === thisYear
    return true
  }
  const periodLabel = { month: 'This month', lastMonth: 'Last month', year: thisYear, all: 'All time' }[period]

  // ---------- derived totals ----------
  const pRows = rows.filter(r => inPeriod(r.date))
  const income  = pRows.filter(r => r.kind === 'income').reduce((s, r) => s + r.total, 0)
  const expense = pRows.filter(r => r.kind === 'expense').reduce((s, r) => s + r.total, 0)
  const netCash = income - expense

  const outputVat = invoiceVat.filter(v => inPeriod(v.date)).reduce((s, v) => s + v.vat, 0)
    + pRows.filter(r => r.kind === 'income' && r.source === 'manual').reduce((s, r) => s + r.vat, 0)
  const inputVat  = pRows.filter(r => r.kind === 'expense').reduce((s, r) => s + r.vat, 0)
  const netVat    = outputVat - inputVat

  // method-wise money in/out for the period (cash vs bank vs card …)
  const byMethod = {}
  METHOD_KEYS.forEach(k => { byMethod[k] = { in: 0, out: 0 } })
  pRows.forEach(r => { byMethod[normMethod(r.method)][r.kind === 'income' ? 'in' : 'out'] += r.total })
  const activeMethods = METHOD_KEYS.filter(k => byMethod[k].in || byMethod[k].out)

  // ---------- list (period + type + search) ----------
  let list = pRows
  if (typeFilter !== 'all') list = list.filter(r => r.kind === typeFilter)
  if (search.trim()) {
    const s = search.toLowerCase()
    list = list.filter(r => (r.party || '').toLowerCase().includes(s) || (r.description || '').toLowerCase().includes(s) || (r.category || '').toLowerCase().includes(s) || (r.reference || '').toLowerCase().includes(s))
  }

  // ---------- actions ----------
  function openAdd(kind) {
    // Expense bills are usually VAT-inclusive (you have the supplier's total);
    // sales you quote net + VAT. Default the amount type to match.
    setForm({ ...blankEntry(), kind, category: kind === 'income' ? INCOME_CATS[0] : EXPENSE_CATS[0], amountType: kind === 'expense' ? 'gross' : 'net' })
    setModalOpen(true)
  }
  function openEdit(r) {
    const e = r.raw || {}
    setForm({
      id: r._id, kind: r.kind, category: r.category || '', party: r.party || '', description: r.description || '',
      amount: String(e.amount ?? r.net ?? ''), hasVat: Number(r.vat) > 0, amountType: 'net',
      method: r.method || 'Cash', reference: r.reference || '', entry_date: (e.entry_date || r.date || '').slice(0, 10), notes: r.notes || '',
    })
    setModalOpen(true)
  }
  async function saveEntry() {
    if (!company?.id) return
    if (!(Number(form.amount) > 0)) { toast.error('Enter an amount'); return }
    setSaving(true)
    try {
      const { net, vat, total } = splitVat(form)
      const payload = {
        company_id: company.id, kind: form.kind, category: form.category || null,
        party: form.party.trim() || null, description: form.description.trim() || null,
        amount: net, vat_rate: form.hasVat ? VAT_RATE : 0, vat_amount: vat, total,
        entry_date: form.entry_date || new Date().toISOString().slice(0, 10),
        method: form.method || null, reference: form.reference.trim() || null, notes: form.notes.trim() || null,
      }
      if (form.id) {
        const { error } = await supabase.from('ledger_entries').update(payload).eq('id', form.id).eq('company_id', company.id)
        if (error) throw error
        toast.success('Entry updated ✓')
      } else {
        payload.created_by_email = user?.email || null
        const { error } = await supabase.from('ledger_entries').insert(payload)
        if (error) throw error
        toast.success(form.kind === 'income' ? 'Income recorded ✓' : 'Expense recorded ✓')
      }
      setModalOpen(false); load()
    } catch (e) {
      toast.error(/ledger_entries/.test(e.message || '') ? 'Run the ledger migration first (db/2026-06-16_ledger_entries.sql)' : 'Save failed: ' + (e.message || 'unknown'))
    } finally { setSaving(false) }
  }
  async function deleteEntry(r) {
    if (!r?._id) return
    if (!window.confirm('Delete this entry? This cannot be undone.')) return
    const { error } = await supabase.from('ledger_entries').delete().eq('id', r._id).eq('company_id', company.id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Entry deleted'); load()
  }
  function exportCSV() {
    const head = ['Date', 'Type', 'Category', 'Party', 'Description', 'Method', 'Reference', 'Net', 'VAT', 'Total']
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [head.join(',')]
    list.forEach(r => lines.push([r.date, r.kind, r.category, r.party, r.description, r.method, r.reference, r.net, r.vat, r.total].map(esc).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `ledger-${period}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // ---------- theme ----------
  const text = isDark ? '#f1f5f9' : '#0f172a', textSub = isDark ? '#94a3b8' : '#64748b', textMuted = isDark ? '#475569' : '#94a3b8'
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', cardBg = isDark ? '#1e293b' : '#ffffff'
  const subBg = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', inputBg = isDark ? '#0f172a' : '#fff', pillBg = isDark ? 'rgba(255,255,255,0.05)' : '#fff'
  const inputStyle = { padding: '9px 11px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, background: inputBg, color: text, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const card = { background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '14px 16px' }
  const GREEN = '#0f6e56', RED = '#dc2626'

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 50 }}>
      <div style={{ width: 34, height: 34, border: '3px solid #0099cc', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <p style={{ color: textMuted, fontSize: 13 }}>Loading ledger…</p>
    </div>
  )

  const { net: pvNet, vat: pvVat, total: pvTotal } = splitVat(form)
  const cats = form.kind === 'income' ? INCOME_CATS : EXPENSE_CATS

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: text, margin: 0 }}>Ledger &amp; Accounts</h1>
          <p style={{ fontSize: 13, color: textSub, marginTop: 3 }}>Income, expenses &amp; VAT — your full money picture{trn ? ` · TRN ${trn}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => openAdd('income')} style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: GREEN, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><i className="ti ti-arrow-down-left" style={{ fontSize: 15 }} /> Income</button>
          <button onClick={() => openAdd('expense')} style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: RED, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><i className="ti ti-arrow-up-right" style={{ fontSize: 15 }} /> Expense</button>
        </div>
      </div>

      {!hasTable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: isDark ? 'rgba(232,184,75,0.1)' : '#fffbeb', border: `1px solid ${isDark ? 'rgba(232,184,75,0.25)' : '#fcd34d'}`, borderRadius: 10, padding: '11px 14px', marginBottom: 14 }}>
          <i className="ti ti-database-cog" style={{ fontSize: 18, color: '#d97706' }} />
          <div style={{ fontSize: 12.5, color: text }}>Manual entries need a one-time setup — run <b>db/2026-06-16_ledger_entries.sql</b> in Supabase. Auto income/expenses below still work.</div>
        </div>
      )}

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', background: pillBg, border: `1px solid ${border}`, borderRadius: 99, padding: 3 }}>
          {[['month', 'This month'], ['lastMonth', 'Last month'], ['year', thisYear], ['all', 'All time']].map(([v, l]) => (
            <button key={v} onClick={() => setPeriod(v)} style={{ fontSize: 12, fontWeight: period === v ? 600 : 400, padding: '5px 13px', borderRadius: 99, border: 'none', cursor: 'pointer', background: period === v ? (isDark ? 'rgba(3,193,245,0.15)' : '#e0f9ff') : 'transparent', color: period === v ? '#0099cc' : textMuted }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: textMuted }}><i className="ti ti-arrow-down-left" style={{ color: GREEN }} /> Income</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: GREEN, marginTop: 4 }}>{fmt(income)}</div>
          <div style={{ fontSize: 10.5, color: textMuted, marginTop: 2 }}>{periodLabel}</div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: textMuted }}><i className="ti ti-arrow-up-right" style={{ color: RED }} /> Expenses</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: RED, marginTop: 4 }}>{fmt(expense)}</div>
          <div style={{ fontSize: 10.5, color: textMuted, marginTop: 2 }}>{periodLabel}</div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: textMuted }}><i className="ti ti-scale" /> Net profit</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: netCash >= 0 ? GREEN : RED, marginTop: 4 }}>{netCash < 0 ? '− ' : ''}{fmt(Math.abs(netCash))}</div>
          <div style={{ fontSize: 10.5, color: textMuted, marginTop: 2 }}>Income − Expenses</div>
        </div>
      </div>

      {/* VAT return panel */}
      <div style={{ ...card, marginBottom: 14, borderLeft: `3px solid #0099cc` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <i className="ti ti-receipt-tax" style={{ fontSize: 17, color: '#0099cc' }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: text }}>VAT Return <span style={{ fontWeight: 400, color: textMuted }}>· {periodLabel}</span></span>
          </div>
          <span style={{ fontSize: 10.5, color: textMuted }}>Output (sales) − Input (purchases) = Net VAT</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <div style={{ background: subBg, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: textMuted }}>Output VAT <span style={{ fontSize: 9.5 }}>(on sales)</span></div>
            <div style={{ fontSize: 17, fontWeight: 700, color: text, marginTop: 3 }}>{fmt(outputVat)}</div>
          </div>
          <div style={{ background: subBg, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: textMuted }}>Input VAT <span style={{ fontSize: 9.5 }}>(on purchases)</span></div>
            <div style={{ fontSize: 17, fontWeight: 700, color: text, marginTop: 3 }}>{fmt(inputVat)}</div>
          </div>
          <div style={{ background: netVat >= 0 ? (isDark ? 'rgba(220,38,38,0.12)' : '#fef2f2') : (isDark ? 'rgba(15,110,86,0.14)' : '#ecfdf5'), borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: textMuted }}>{netVat >= 0 ? 'Net VAT payable' : 'VAT reclaimable'}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: netVat >= 0 ? RED : GREEN, marginTop: 3 }}>{fmt(Math.abs(netVat))}</div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: textMuted, marginTop: 9, lineHeight: 1.5 }}>Output VAT is from invoices issued in this period (5%). Input VAT is from VAT-marked expense entries. Indicative only — confirm with your accountant before filing.</div>
      </div>

      {/* Payment-method breakdown */}
      {activeMethods.length > 0 && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <i className="ti ti-wallet" style={{ fontSize: 16, color: '#0099cc' }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: text }}>By payment method <span style={{ fontWeight: 400, color: textMuted }}>· {periodLabel}</span></span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 300 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8, padding: '0 0 6px', fontSize: 10.5, color: textMuted, textTransform: 'uppercase', letterSpacing: '.3px', borderBottom: `1px solid ${border}` }}>
                <span>Method</span><span style={{ textAlign: 'right' }}>In</span><span style={{ textAlign: 'right' }}>Out</span>
              </div>
              {activeMethods.map(k => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8, padding: '7px 0', fontSize: 12.5, borderBottom: `1px solid ${border}` }}>
                  <span style={{ color: text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><i className={`ti ${METHOD_ICON[k] || 'ti-coin'}`} style={{ fontSize: 14, color: textSub }} />{k}</span>
                  <span style={{ textAlign: 'right', color: byMethod[k].in ? GREEN : textMuted }}>{byMethod[k].in ? fmt(byMethod[k].in) : '—'}</span>
                  <span style={{ textAlign: 'right', color: byMethod[k].out ? RED : textMuted }}>{byMethod[k].out ? fmt(byMethod[k].out) : '—'}</span>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8, padding: '8px 0 0', fontSize: 12.5, fontWeight: 700 }}>
                <span style={{ color: text }}>Total</span>
                <span style={{ textAlign: 'right', color: GREEN }}>{fmt(income)}</span>
                <span style={{ textAlign: 'right', color: RED }}>{fmt(expense)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search party, category, description, ref…" style={{ ...inputStyle, flex: 1, minWidth: 200, width: 'auto' }} />
        <div style={{ display: 'inline-flex', background: pillBg, border: `1px solid ${border}`, borderRadius: 99, padding: 3 }}>
          {[['all', 'All'], ['income', 'In'], ['expense', 'Out']].map(([v, l]) => (
            <button key={v} onClick={() => setTypeFilter(v)} style={{ fontSize: 12, fontWeight: typeFilter === v ? 600 : 400, padding: '5px 13px', borderRadius: 99, border: 'none', cursor: 'pointer', background: typeFilter === v ? (isDark ? 'rgba(3,193,245,0.15)' : '#e0f9ff') : 'transparent', color: typeFilter === v ? '#0099cc' : textMuted }}>{l}</button>
          ))}
        </div>
        <button onClick={exportCSV} disabled={!list.length} style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: list.length ? text : textMuted, fontSize: 12.5, fontWeight: 600, cursor: list.length ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><i className="ti ti-download" style={{ fontSize: 14 }} /> CSV</button>
      </div>

      {/* Transactions */}
      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', background: cardBg, border: `1px solid ${border}`, borderRadius: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: subBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><i className="ti ti-book-2" style={{ fontSize: 26, color: textMuted }} /></div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: text, margin: '0 0 6px' }}>{rows.length === 0 ? 'No transactions yet' : 'Nothing in this view'}</h3>
          <p style={{ fontSize: 13, color: textSub, margin: '0 0 16px' }}>{rows.length === 0 ? 'Record income & expenses, or they flow in from invoices & projects.' : 'Try another period, filter or search.'}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => openAdd('income')} style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: GREEN, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Income</button>
            <button onClick={() => openAdd('expense')} style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: RED, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Expense</button>
          </div>
        </div>
      ) : (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
          {list.map((r, i) => {
            const inc = r.kind === 'income'
            const sb = SOURCE_BADGE[r.source] || SOURCE_BADGE.manual
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i > 0 ? `1px solid ${border}` : 'none' }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: inc ? (isDark ? '#0f6e5622' : '#e1f5ee') : (isDark ? '#dc262622' : '#fef2f2'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`ti ${inc ? 'ti-arrow-down-left' : 'ti-arrow-up-right'}`} style={{ fontSize: 16, color: inc ? GREEN : RED }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.party || r.category || '—'}
                    <span style={{ fontSize: 9, fontWeight: 700, color: sb.color, background: isDark ? sb.color + '22' : sb.bg, padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>{sb.label}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[r.category, r.description, r.method, r.reference].filter(Boolean).join(' · ') || '—'}{r.vat > 0 ? ` · VAT ${fmt(r.vat)}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: inc ? GREEN : RED }}>{inc ? '+ ' : '− '}{fmt(r.total)}</div>
                  <div style={{ fontSize: 11, color: textMuted }}>{fmtDate(r.date)}</div>
                </div>
                {r.editable && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => openEdit(r)} title="Edit" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${border}`, background: cardBg, color: textSub, cursor: 'pointer' }}><i className="ti ti-edit" style={{ fontSize: 13 }} /></button>
                    <button onClick={() => deleteEntry(r)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${border}`, background: cardBg, color: RED, cursor: 'pointer' }}><i className="ti ti-trash" style={{ fontSize: 13 }} /></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit modal */}
      {modalOpen && (
        <div onClick={() => !saving && setModalOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: cardBg, borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', border: `1px solid ${border}` }}>
            <div style={{ padding: '15px 18px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{form.id ? 'Edit entry' : (form.kind === 'income' ? 'Record income' : 'Record expense')}</div>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, fontSize: 18 }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {/* type toggle */}
              <div style={{ display: 'inline-flex', background: pillBg, border: `1px solid ${border}`, borderRadius: 9, padding: 3 }}>
                {[['income', 'Income', GREEN], ['expense', 'Expense', RED]].map(([v, l, c]) => (
                  <button key={v} onClick={() => setForm(f => ({ ...f, kind: v, category: v === 'income' ? INCOME_CATS[0] : EXPENSE_CATS[0], amountType: v === 'expense' ? 'gross' : 'net' }))} style={{ flex: 1, fontSize: 13, fontWeight: form.kind === v ? 700 : 400, padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer', background: form.kind === v ? (v === 'income' ? (isDark ? '#0f6e5622' : '#e1f5ee') : (isDark ? '#dc262622' : '#fef2f2')) : 'transparent', color: form.kind === v ? c : textSub }}>{l}</button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Date</label>
                  <input type="date" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                    {cats.map(c => <option key={c} value={c} style={{ background: inputBg, color: text }}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>{form.kind === 'income' ? 'Client / received from' : 'Vendor / paid to'}</label>
                <input list="ledger-party-dl" value={form.party} onChange={e => setForm(f => ({ ...f, party: e.target.value }))} placeholder={form.kind === 'income' ? 'Type or pick a client…' : 'Type or pick a supplier…'} style={inputStyle} />
                <datalist id="ledger-party-dl">{(form.kind === 'income' ? clients : suppliers).map((nm, i) => <option key={i} value={nm} />)}</datalist>
              </div>
              <div>
                <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Description <span>(optional)</span></label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What was this for?" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Amount (AED)</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Method</label>
                  <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} style={inputStyle}>
                    {METHODS.map(m => <option key={m} value={m} style={{ background: inputBg, color: text }}>{m}</option>)}
                  </select>
                </div>
              </div>
              {/* VAT */}
              <div style={{ background: form.hasVat ? (isDark ? 'rgba(0,153,204,0.08)' : '#f0faff') : subBg, border: `1px solid ${form.hasVat ? '#0099cc' : border}`, borderRadius: 9, padding: '10px 12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.hasVat} onChange={e => setForm(f => ({ ...f, hasVat: e.target.checked }))} style={{ width: 'auto' }} />
                  <i className="ti ti-receipt-tax" style={{ fontSize: 15, color: '#0099cc' }} />
                  {form.kind === 'income' ? 'Charge 5% VAT on this sale' : 'This is a 5% VAT bill'}
                </label>
                {!form.hasVat && (
                  <div style={{ fontSize: 10.5, color: textMuted, marginTop: 6, marginLeft: 26, lineHeight: 1.5 }}>
                    Tick this so the VAT counts in your VAT Return ({form.kind === 'income' ? 'Output' : 'Input'} VAT).
                  </div>
                )}
                {form.hasVat && (
                  <>
                    <div style={{ fontSize: 10.5, color: textMuted, margin: '8px 0 4px' }}>The amount you typed is:</div>
                    <div style={{ display: 'inline-flex', background: pillBg, border: `1px solid ${border}`, borderRadius: 8, padding: 3 }}>
                      {[['net', 'Before VAT (net)'], ['gross', 'VAT-inclusive (total)']].map(([v, l]) => (
                        <button key={v} onClick={() => setForm(f => ({ ...f, amountType: v }))} style={{ fontSize: 11.5, fontWeight: form.amountType === v ? 600 : 400, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: form.amountType === v ? (isDark ? 'rgba(3,193,245,0.15)' : '#e0f9ff') : 'transparent', color: form.amountType === v ? '#0099cc' : textSub }}>{l}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10, fontSize: 12, color: textSub }}>
                      <span>Net {fmt(pvNet)}</span><span style={{ color: '#0099cc', fontWeight: 600 }}>VAT {fmt(pvVat)}</span><span style={{ fontWeight: 700, color: text }}>Total {fmt(pvTotal)}</span>
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Reference <span>(optional)</span></label>
                  <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Bill / receipt no." style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Notes <span>(optional)</span></label>
                  <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any note" style={inputStyle} />
                </div>
              </div>
            </div>
            <div style={{ padding: '13px 18px', borderTop: `1px solid ${border}`, display: 'flex', gap: 8 }}>
              <button onClick={() => setModalOpen(false)} disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveEntry} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 9, border: 'none', background: form.kind === 'income' ? GREEN : RED, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : (form.id ? 'Update entry' : 'Save entry')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
