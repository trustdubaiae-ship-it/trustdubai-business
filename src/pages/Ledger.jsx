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
// Petty Cash is a SEPARATE account (the small float the accountant manages,
// kept apart from the company bank/cash). It is its own method + balance bucket.
const METHODS      = ['Cash', 'Petty Cash', 'Bank Transfer', 'Card', 'Cheque', 'Online']
const VAT_RATE     = 5

// Normalise any method label (from invoices, purchases, manual, sub-payments)
// into one bucket so the dashboard can total cash vs petty vs bank vs card etc.
const METHOD_KEYS  = ['Cash', 'Petty', 'Bank', 'Card', 'Cheque', 'Online', 'Other']
const METHOD_ICON  = { Cash: 'ti-coin', Petty: 'ti-wallet', Bank: 'ti-building-bank', Card: 'ti-credit-card', Cheque: 'ti-checkbox', Online: 'ti-world', Other: 'ti-dots' }
const METHOD_LABEL = { Cash: 'Cash', Petty: 'Petty Cash', Bank: 'Bank', Card: 'Card', Cheque: 'Cheque', Online: 'Online', Other: 'Other' }
function normMethod(m) {
  const s = (m || '').toLowerCase()
  if (!s) return 'Other'
  if (s.includes('petty')) return 'Petty'        // check petty BEFORE cash
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

const CATEGORY_ICON = {
  'Sale / Service': 'ti-businessplan', 'Advance': 'ti-coin', 'Other income': 'ti-circle-plus',
  'Material': 'ti-package', 'Labour': 'ti-tool', 'Subcontractor': 'ti-users', 'Rent': 'ti-building',
  'Salary': 'ti-cash', 'Transport': 'ti-truck', 'Utilities': 'ti-bulb', 'Marketing': 'ti-speakerphone',
  'Tools / Equipment': 'ti-tools', 'Govt / Fees': 'ti-building-bank', 'Bank charges': 'ti-credit-card',
  'Purchase': 'ti-shopping-cart', 'Misc': 'ti-dots', 'Site': 'ti-tools',
}
const catIcon = c => CATEGORY_ICON[c] || (CATEGORY_ICON[cap(c)] || 'ti-circle')

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
  const [receivable, setReceivable] = useState(0)    // unpaid invoice balances (owed to you)
  const [payable, setPayable] = useState(0)          // unpaid purchase balances (you owe)
  const [trn, setTrn]         = useState('')
  const [clients, setClients] = useState([])         // for the income party search
  const [suppliers, setSuppliers] = useState([])     // for the expense party search
  const [loading, setLoading] = useState(true)

  const [period, setPeriod]   = useState('month')    // month | lastMonth | year | all
  const [typeFilter, setTypeFilter] = useState('all') // all | income | expense
  const [search, setSearch]   = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]       = useState(blankEntry())
  const [transferOpen, setTransferOpen] = useState(false)
  const [tForm, setTForm]     = useState({ id: null, from: 'Bank Transfer', to: 'Cash', amount: '', entry_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [openingOpen, setOpeningOpen] = useState(false)
  const [oForm, setOForm]     = useState({ date: new Date().toISOString().slice(0, 10), balances: {} })
  const [saving, setSaving]   = useState(false)
  const [hasTable, setHasTable] = useState(true)     // false until the migration is run

  useEffect(() => {
    if (company?.id) load()
    const obs = new MutationObserver(() => forceUpdate(n => n + 1))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [company?.id])

  // Keyboard: Esc closes any open modal, Enter (from a text field) saves it.
  useEffect(() => {
    if (!modalOpen && !transferOpen && !openingOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') { setModalOpen(false); setTransferOpen(false); setOpeningOpen(false); return }
      if (e.key === 'Enter' && !saving && (e.target.tagName || '').toLowerCase() === 'input') {
        e.preventDefault()
        if (modalOpen) saveEntry(); else if (transferOpen) saveTransfer(); else if (openingOpen) saveOpening()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modalOpen, transferOpen, openingOpen, saving, form, tForm, oForm])

  async function load() {
    setLoading(true)
    try {
      const [invRes, projRes, seRes, spRes, piRes, tplRes, clRes, supRes] = await Promise.all([
        supabase.from('invoices').select('invoice_number, client_name, project_title, issue_date, vat_enabled, vat_amount, total, payments, status').eq('company_id', company.id),
        supabase.from('ops_projects').select('id, name').eq('company_id', company.id),
        supabase.from('site_expenses').select('id, project_id, category, description, amount, spent_on').eq('company_id', company.id),
        supabase.from('sub_payments').select('id, project_id, amount, paid_on, method, reference, note').eq('company_id', company.id),
        supabase.from('purchase_invoices').select('id, supplier_name, invoice_number, invoice_date, category, description, client_name, method, subtotal, vat_amount, total, paid').eq('company_id', company.id),
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
      let recvSum = 0, paySum = 0
      ;(invRes.data || []).forEach(inv => {
        if (inv.vat_enabled !== false && Number(inv.vat_amount) > 0) vatRows.push({ date: inv.issue_date || '', vat: Number(inv.vat_amount) || 0 })
        const label = [inv.invoice_number, inv.project_title].filter(Boolean).join(' · ')
        const invPaid = parsePayments(inv.payments).reduce((s, p) => s + (Number(p.amount) || 0), 0)
        recvSum += Math.max(0, (Number(inv.total) || 0) - invPaid)   // money still owed to you
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
          transferTo: e.transfer_to || '',
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
        paySum += Math.max(0, (Number(x.total) || 0) - (Number(x.paid) || 0))   // money you still owe suppliers
        out.push({
          id: `pi-${x.id}`, source: 'purchase', kind: 'expense', date: x.invoice_date || '',
          party: x.supplier_name || 'Supplier', category: x.category || 'Purchase',
          description: [x.client_name, x.invoice_number, x.description].filter(Boolean).join(' · ') || 'Purchase bill', method: x.method || '', reference: x.invoice_number || '',
          net: Number(x.subtotal) || 0, vat: Number(x.vat_amount) || 0, total: Number(x.total) || (Number(x.subtotal) || 0), editable: false,
        })
      })
      out.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setRows(out); setInvoiceVat(vatRows); setReceivable(recvSum); setPayable(paySum)
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

  // All-time running balance = money the company actually holds (ignores the period filter),
  // split by where it sits — cash in hand (petty cash) vs bank vs other methods.
  const allIncome  = rows.filter(r => r.kind === 'income').reduce((s, r) => s + r.total, 0)
  const allExpense = rows.filter(r => r.kind === 'expense').reduce((s, r) => s + r.total, 0)
  const balanceAll = allIncome - allExpense
  const allByMethod = {}
  METHOD_KEYS.forEach(k => { allByMethod[k] = { in: 0, out: 0 } })
  rows.forEach(r => {
    const m = normMethod(r.method)
    if (r.kind === 'transfer') {
      allByMethod[m].out += r.total                          // money leaves the FROM account
      allByMethod[normMethod(r.transferTo)].in += r.total    // money enters the TO account
    } else if (r.kind === 'expense') {
      allByMethod[m].out += r.total
    } else {
      allByMethod[m].in += r.total                           // income + opening balance add to the account
    }
  })
  const balOf  = k => allByMethod[k].in - allByMethod[k].out
  const balCash  = balOf('Cash')
  const balPetty = balOf('Petty')
  const balBank  = balOf('Bank')
  const balOther = balOf('Card') + balOf('Cheque') + balOf('Online') + balOf('Other')

  // Petty cash account — its own statement (top-ups in, small expenses out)
  function pettyDelta(r) {
    const fromPetty = normMethod(r.method) === 'Petty'
    const toPetty = r.kind === 'transfer' && normMethod(r.transferTo) === 'Petty'
    if (r.kind === 'transfer') return toPetty ? r.total : (fromPetty ? -r.total : 0)
    if (r.kind === 'expense') return fromPetty ? -r.total : 0
    return fromPetty ? r.total : 0   // income / opening into petty cash
  }
  const pettyRows = rows.filter(r => pettyDelta(r) !== 0).slice(0, 6)

  const outputVat = invoiceVat.filter(v => inPeriod(v.date)).reduce((s, v) => s + v.vat, 0)
    + pRows.filter(r => r.kind === 'income' && r.source === 'manual').reduce((s, r) => s + r.vat, 0)
  const inputVat  = pRows.filter(r => r.kind === 'expense').reduce((s, r) => s + r.vat, 0)
  const netVat    = outputVat - inputVat

  // method-wise money in/out for the period (cash vs bank vs card …)
  const byMethod = {}
  METHOD_KEYS.forEach(k => { byMethod[k] = { in: 0, out: 0 } })
  pRows.filter(r => r.kind === 'income' || r.kind === 'expense').forEach(r => { byMethod[normMethod(r.method)][r.kind === 'income' ? 'in' : 'out'] += r.total })
  const activeMethods = METHOD_KEYS.filter(k => byMethod[k].in || byMethod[k].out || balOf(k))

  // ---------- trend vs the previous comparable period ----------
  function inPrevPeriod(date) {
    if (!date || period === 'all') return false
    if (period === 'month') return monthKey(date) === lastMonth
    if (period === 'lastMonth') return monthKey(date) === monthKey(new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString())
    if (period === 'year') return yearKey(date) === String(now.getFullYear() - 1)
    return false
  }
  const prevRows = rows.filter(r => inPrevPeriod(r.date))
  const prevIncome  = prevRows.filter(r => r.kind === 'income').reduce((s, r) => s + r.total, 0)
  const prevExpense = prevRows.filter(r => r.kind === 'expense').reduce((s, r) => s + r.total, 0)
  const pctChange = (cur, prev) => prev > 0 ? Math.round((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0)
  const showTrend = period !== 'all'

  // ---------- last-6-months cash-flow series ----------
  const monthSeries = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = monthKey(d.toISOString())
    let inc = 0, exp = 0
    rows.forEach(r => { if (monthKey(r.date) === key) { if (r.kind === 'income') inc += r.total; else if (r.kind === 'expense') exp += r.total } })
    monthSeries.push({ key, label: d.toLocaleDateString('en-GB', { month: 'short' }), inc, exp })
  }
  const maxBar = Math.max(1, ...monthSeries.flatMap(m => [m.inc, m.exp]))

  // ---------- top expense categories for the period ----------
  const expCatMap = {}
  pRows.filter(r => r.kind === 'expense').forEach(r => { const c = r.category || 'Misc'; expCatMap[c] = (expCatMap[c] || 0) + r.total })
  const expByCat = Object.entries(expCatMap).map(([cat, amt]) => ({ cat, amt })).sort((a, b) => b.amt - a.amt).slice(0, 6)
  const expCatMax = Math.max(1, ...expByCat.map(c => c.amt))

  // ---------- list (period + type + search) ----------
  let list = pRows.filter(r => r.kind !== 'opening')   // opening balances are config, not transactions
  if (typeFilter !== 'all') list = list.filter(r => r.kind === typeFilter)
  if (search.trim()) {
    const s = search.toLowerCase()
    list = list.filter(r => (r.party || '').toLowerCase().includes(s) || (r.description || '').toLowerCase().includes(s) || (r.category || '').toLowerCase().includes(s) || (r.reference || '').toLowerCase().includes(s))
  }

  // ---------- actions ----------
  function openAdd(kind, method) {
    // Expense bills are usually VAT-inclusive (you have the supplier's total);
    // sales you quote net + VAT. Default the amount type to match.
    setForm({ ...blankEntry(), kind, category: kind === 'income' ? INCOME_CATS[0] : EXPENSE_CATS[0], amountType: kind === 'expense' ? 'gross' : 'net', method: method || 'Cash' })
    setModalOpen(true)
  }
  function openPettyTopup() { setTForm({ id: null, from: 'Bank Transfer', to: 'Petty Cash', amount: '', entry_date: new Date().toISOString().slice(0, 10), notes: 'Petty cash top-up' }); setTransferOpen(true) }
  function openPettyExpense() { openAdd('expense', 'Petty Cash') }
  function openEdit(r) {
    const e = r.raw || {}
    if (r.kind === 'transfer') {
      setTForm({ id: r._id, from: r.method || 'Bank Transfer', to: r.transferTo || 'Cash', amount: String(e.amount ?? r.total ?? ''), entry_date: (e.entry_date || r.date || '').slice(0, 10), notes: r.notes || '' })
      setTransferOpen(true)
      return
    }
    setForm({
      id: r._id, kind: r.kind, category: r.category || '', party: r.party || '', description: r.description || '',
      amount: String(e.amount ?? r.net ?? ''), hasVat: Number(r.vat) > 0, amountType: 'net',
      method: r.method || 'Cash', reference: r.reference || '', entry_date: (e.entry_date || r.date || '').slice(0, 10), notes: r.notes || '',
    })
    setModalOpen(true)
  }
  function openTransfer() { setTForm({ id: null, from: 'Bank Transfer', to: 'Cash', amount: '', entry_date: new Date().toISOString().slice(0, 10), notes: '' }); setTransferOpen(true) }
  function openOpening() {
    const balances = {}
    METHODS.forEach(m => { balances[m] = '' })
    let date = new Date().toISOString().slice(0, 10)
    rows.filter(r => r.kind === 'opening').forEach(r => { balances[r.method] = String(r.total); if (r.date) date = r.date })
    setOForm({ date, balances })
    setOpeningOpen(true)
  }
  async function saveOpening() {
    if (!company?.id) return
    setSaving(true)
    try {
      // opening balances are stored as kind='opening' rows (one per account) — replace them all
      await supabase.from('ledger_entries').delete().eq('company_id', company.id).eq('kind', 'opening')
      const toInsert = METHODS.filter(m => Number(oForm.balances[m]) !== 0 && oForm.balances[m] !== '').map(m => ({
        company_id: company.id, kind: 'opening', category: 'Opening balance', method: m,
        amount: Math.round(Number(oForm.balances[m])), vat_rate: 0, vat_amount: 0, total: Math.round(Number(oForm.balances[m])),
        entry_date: oForm.date || new Date().toISOString().slice(0, 10), notes: 'Opening balance', created_by_email: user?.email || null,
      }))
      if (toInsert.length) {
        const { error } = await supabase.from('ledger_entries').insert(toInsert)
        if (error) throw error
      }
      toast.success('Opening balances saved ✓')
      setOpeningOpen(false); load()
    } catch (e) {
      toast.error(/ledger_entries/.test(e.message || '') ? 'Run the ledger migration first (db/2026-06-16_ledger_entries.sql)' : 'Save failed: ' + (e.message || 'unknown'))
    } finally { setSaving(false) }
  }
  async function saveTransfer() {
    if (!company?.id) return
    if (!(Number(tForm.amount) > 0)) { toast.error('Enter an amount'); return }
    if (tForm.from === tForm.to) { toast.error('From and To accounts must differ'); return }
    setSaving(true)
    try {
      const amt = Math.round(Number(tForm.amount) || 0)
      const payload = {
        company_id: company.id, kind: 'transfer', category: 'Transfer', party: null,
        description: null, amount: amt, vat_rate: 0, vat_amount: 0, total: amt,
        entry_date: tForm.entry_date || new Date().toISOString().slice(0, 10),
        method: tForm.from, transfer_to: tForm.to, reference: null, notes: tForm.notes.trim() || null,
      }
      if (tForm.id) {
        const { error } = await supabase.from('ledger_entries').update(payload).eq('id', tForm.id).eq('company_id', company.id)
        if (error) throw error
        toast.success('Transfer updated ✓')
      } else {
        payload.created_by_email = user?.email || null
        const { error } = await supabase.from('ledger_entries').insert(payload)
        if (error) throw error
        toast.success('Transfer recorded ✓')
      }
      setTransferOpen(false); load()
    } catch (e) {
      toast.error(/transfer_to/.test(e.message || '') ? 'Run the transfer migration first (db/2026-06-17_ledger_transfer.sql)' : 'Save failed: ' + (e.message || 'unknown'))
    } finally { setSaving(false) }
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

  // small ▲/▼ % badge vs the previous period (goodUp = is an increase good?)
  const trendEl = (cur, prev, goodUp = true) => {
    if (!showTrend) return null
    const p = pctChange(cur, prev)
    if (p === 0) return <span style={{ fontSize: 10.5, color: textMuted }}>— vs prev period</span>
    const up = p > 0, good = goodUp ? up : !up
    return <span style={{ fontSize: 10.5, fontWeight: 700, color: good ? GREEN : RED }}>{up ? '▲' : '▼'} {Math.abs(p)}% <span style={{ fontWeight: 400, color: textMuted }}>vs prev</span></span>
  }

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
          <button onClick={openTransfer} title="Move money between accounts (e.g. Bank → petty cash)" style={{ padding: '9px 14px', borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><i className="ti ti-arrows-exchange" style={{ fontSize: 15, color: '#0099cc' }} /> Transfer</button>
        </div>
      </div>

      {!hasTable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: isDark ? 'rgba(232,184,75,0.1)' : '#fffbeb', border: `1px solid ${isDark ? 'rgba(232,184,75,0.25)' : '#fcd34d'}`, borderRadius: 10, padding: '11px 14px', marginBottom: 14 }}>
          <i className="ti ti-database-cog" style={{ fontSize: 18, color: '#d97706' }} />
          <div style={{ fontSize: 12.5, color: text }}>Manual entries need a one-time setup — run <b>db/2026-06-16_ledger_entries.sql</b> in Supabase. Auto income/expenses below still work.</div>
        </div>
      )}

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', background: pillBg, border: `1px solid ${border}`, borderRadius: 99, padding: 3 }}>
          {[['month', 'This month'], ['lastMonth', 'Last month'], ['year', thisYear], ['all', 'All time']].map(([v, l]) => (
            <button key={v} onClick={() => setPeriod(v)} style={{ fontSize: 12, fontWeight: period === v ? 600 : 400, padding: '5px 13px', borderRadius: 99, border: 'none', cursor: 'pointer', background: period === v ? (isDark ? 'rgba(3,193,245,0.15)' : '#e0f9ff') : 'transparent', color: period === v ? '#0099cc' : textMuted }}>{l}</button>
          ))}
        </div>
        <button onClick={openOpening} title="Set starting cash & bank balances (one time)" style={{ padding: '6px 12px', borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><i className="ti ti-adjustments-dollar" style={{ fontSize: 14, color: '#0099cc' }} /> Opening balance</button>
      </div>

      {/* Hero — total balance + where the money sits */}
      <div style={{ borderRadius: 16, padding: '18px 20px', marginBottom: 12, background: 'linear-gradient(135deg,#0f766e 0%,#0d9488 48%,#0891b2 100%)', color: '#fff', boxShadow: '0 10px 26px rgba(13,148,136,0.28)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, opacity: 0.88, display: 'flex', alignItems: 'center', gap: 6 }}><i className="ti ti-wallet" /> Total balance · all time</div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 5, lineHeight: 1 }}>{balanceAll < 0 ? '− ' : ''}{fmt(Math.abs(balanceAll))}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 6 }}>Money the company holds now · income − expenses</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', textAlign: 'right' }}>
              <div style={{ fontSize: 10, opacity: 0.85 }}>In · {periodLabel}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{fmt(income)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 12px', textAlign: 'right' }}>
              <div style={{ fontSize: 10, opacity: 0.85 }}>Out · {periodLabel}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{fmt(expense)}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 15 }}>
          {[['ti-coin', 'Cash in hand', balCash], ['ti-wallet', 'Petty cash', balPetty], ['ti-building-bank', 'Bank balance', balBank], ...(balOther !== 0 ? [['ti-credit-card', 'Other', balOther]] : [])].map(([ic, lb, val]) => (
            <div key={lb} style={{ background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className={`ti ${ic}`} style={{ fontSize: 16, opacity: 0.9 }} />
              <div>
                <div style={{ fontSize: 10, opacity: 0.82 }}>{lb}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{val < 0 ? '− ' : ''}{fmt(Math.abs(val))}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPI row — income / expenses / net, with trend vs the previous period */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: textMuted }}><i className="ti ti-arrow-down-left" style={{ color: GREEN }} /> Income · {periodLabel}</div>
          <div style={{ fontSize: 21, fontWeight: 700, color: GREEN, marginTop: 4 }}>{fmt(income)}</div>
          <div style={{ marginTop: 4 }}>{trendEl(income, prevIncome, true) || <span style={{ fontSize: 10.5, color: textMuted }}>money received</span>}</div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: textMuted }}><i className="ti ti-arrow-up-right" style={{ color: RED }} /> Expenses · {periodLabel}</div>
          <div style={{ fontSize: 21, fontWeight: 700, color: RED, marginTop: 4 }}>{fmt(expense)}</div>
          <div style={{ marginTop: 4 }}>{trendEl(expense, prevExpense, false) || <span style={{ fontSize: 10.5, color: textMuted }}>money spent</span>}</div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: textMuted }}><i className="ti ti-scale" /> Net profit · {periodLabel}</div>
          <div style={{ fontSize: 21, fontWeight: 700, color: netCash >= 0 ? GREEN : RED, marginTop: 4 }}>{netCash < 0 ? '− ' : ''}{fmt(Math.abs(netCash))}</div>
          <div style={{ fontSize: 10.5, color: textMuted, marginTop: 4 }}>{income > 0 ? Math.round(netCash / income * 100) : 0}% margin · In − Out</div>
        </div>
      </div>

      {/* Petty cash — a separate small float, managed on its own */}
      <div style={{ ...card, marginBottom: 14, borderLeft: '3px solid #d97706' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: isDark ? 'rgba(217,119,6,0.15)' : '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="ti ti-wallet" style={{ fontSize: 19, color: '#d97706' }} /></div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: text }}>Petty Cash</div>
              <div style={{ fontSize: 10.5, color: textMuted }}>Small cash float — kept &amp; managed separately</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: textMuted }}>Balance in box</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: balPetty >= 0 ? GREEN : RED }}>{balPetty < 0 ? '− ' : ''}{fmt(Math.abs(balPetty))}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={openPettyTopup} style={{ padding: '8px 13px', borderRadius: 9, border: 'none', background: '#d97706', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><i className="ti ti-arrow-down-left" style={{ fontSize: 14 }} /> Top up from bank</button>
          <button onClick={openPettyExpense} style={{ padding: '8px 13px', borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><i className="ti ti-arrow-up-right" style={{ fontSize: 14, color: RED }} /> Petty expense</button>
        </div>
        {pettyRows.length > 0 && (
          <div style={{ borderTop: `1px solid ${border}`, marginTop: 11, paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: textMuted, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 4 }}>Recent petty cash movements</div>
            {pettyRows.map(r => {
              const d = pettyDelta(r); const into = d > 0
              const label = r.kind === 'transfer' ? (into ? `Top-up from ${r.method}` : `Moved to ${r.transferTo}`) : (r.party || r.category || r.description || (r.kind === 'opening' ? 'Opening balance' : '—'))
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
                  <i className={`ti ${into ? 'ti-arrow-down-left' : 'ti-arrow-up-right'}`} style={{ fontSize: 13, color: into ? GREEN : RED, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, color: textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  <span style={{ color: into ? GREEN : RED, fontWeight: 600, flexShrink: 0 }}>{into ? '+ ' : '− '}{fmt(Math.abs(d))}</span>
                  <span style={{ fontSize: 10.5, color: textMuted, flexShrink: 0 }}>{fmtDate(r.date)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Charts: cash flow + top expense categories */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12, marginBottom: 14 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><i className="ti ti-chart-bar" style={{ fontSize: 16, color: '#0099cc' }} /><span style={{ fontSize: 13.5, fontWeight: 700, color: text }}>Cash flow · last 6 months</span></div>
            <div style={{ display: 'flex', gap: 10, fontSize: 10.5 }}><span style={{ color: GREEN }}>● In</span><span style={{ color: RED }}>● Out</span></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
            {monthSeries.map(m => (
              <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100, width: '100%', justifyContent: 'center' }} title={`${m.label} · In ${fmt(m.inc)} · Out ${fmt(m.exp)}`}>
                  <div style={{ width: '42%', maxWidth: 16, height: `${Math.max(2, (m.inc / maxBar) * 100)}%`, background: GREEN, borderRadius: '3px 3px 0 0' }} />
                  <div style={{ width: '42%', maxWidth: 16, height: `${Math.max(2, (m.exp / maxBar) * 100)}%`, background: RED, borderRadius: '3px 3px 0 0' }} />
                </div>
                <span style={{ fontSize: 10, color: textMuted }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}><i className="ti ti-chart-donut" style={{ fontSize: 16, color: '#dc2626' }} /><span style={{ fontSize: 13.5, fontWeight: 700, color: text }}>Top expenses · {periodLabel}</span></div>
          {expByCat.length === 0 ? (
            <div style={{ fontSize: 12, color: textMuted, padding: '24px 0', textAlign: 'center' }}>No expenses in this period.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {expByCat.map(c => (
                <div key={c.cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><i className={`ti ${catIcon(c.cat)}`} style={{ fontSize: 13, color: textSub, flexShrink: 0 }} />{c.cat}</span>
                    <span style={{ color: textSub, flexShrink: 0, marginLeft: 8 }}>{fmt(c.amt)} · {Math.round(c.amt / expense * 100) || 0}%</span>
                  </div>
                  <div style={{ height: 7, background: subBg, borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${(c.amt / expCatMax) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#f87171,#dc2626)', borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Receivables & payables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ ...card, borderLeft: `3px solid ${GREEN}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: textMuted }}><i className="ti ti-receipt-2" style={{ color: GREEN }} /> Receivable · owed to you</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: GREEN, marginTop: 4 }}>{fmt(receivable)}</div>
          <div style={{ fontSize: 10.5, color: textMuted, marginTop: 3 }}>Unpaid balance across your invoices</div>
        </div>
        <div style={{ ...card, borderLeft: `3px solid ${RED}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: textMuted }}><i className="ti ti-cash-banknote" style={{ color: RED }} /> Payable · you owe</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: RED, marginTop: 4 }}>{fmt(payable)}</div>
          <div style={{ fontSize: 10.5, color: textMuted, marginTop: 3 }}>Unpaid balance on your purchase bills</div>
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
            <div style={{ minWidth: 380 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 8, padding: '0 0 6px', fontSize: 10.5, color: textMuted, textTransform: 'uppercase', letterSpacing: '.3px', borderBottom: `1px solid ${border}` }}>
                <span>Method</span><span style={{ textAlign: 'right' }}>In</span><span style={{ textAlign: 'right' }}>Out</span><span style={{ textAlign: 'right' }}>Balance</span>
              </div>
              {activeMethods.map(k => {
                const bal = balOf(k)   // current true balance for this account (all time, incl. transfers)
                return (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 8, padding: '7px 0', fontSize: 12.5, borderBottom: `1px solid ${border}` }}>
                    <span style={{ color: text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><i className={`ti ${METHOD_ICON[k] || 'ti-coin'}`} style={{ fontSize: 14, color: textSub }} />{METHOD_LABEL[k] || k}</span>
                    <span style={{ textAlign: 'right', color: byMethod[k].in ? GREEN : textMuted }}>{byMethod[k].in ? fmt(byMethod[k].in) : '—'}</span>
                    <span style={{ textAlign: 'right', color: byMethod[k].out ? RED : textMuted }}>{byMethod[k].out ? fmt(byMethod[k].out) : '—'}</span>
                    <span style={{ textAlign: 'right', fontWeight: 600, color: bal >= 0 ? text : RED }}>{bal < 0 ? '− ' : ''}{fmt(Math.abs(bal))}</span>
                  </div>
                )
              })}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 8, padding: '8px 0 0', fontSize: 12.5, fontWeight: 700 }}>
                <span style={{ color: text }}>Total</span>
                <span style={{ textAlign: 'right', color: GREEN }}>{fmt(income)}</span>
                <span style={{ textAlign: 'right', color: RED }}>{fmt(expense)}</span>
                <span style={{ textAlign: 'right', color: balanceAll >= 0 ? GREEN : RED }}>{balanceAll < 0 ? '− ' : ''}{fmt(Math.abs(balanceAll))}</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: textMuted, marginTop: 9, lineHeight: 1.5 }}>In / Out = money in &amp; out this period (income/expenses). <b>Balance</b> = each account’s current total now (all time, including transfers) — matches “Money in hand” above.</div>
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
            const isTransfer = r.kind === 'transfer'
            const sb = SOURCE_BADGE[r.source] || SOURCE_BADGE.manual
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i > 0 ? `1px solid ${border}` : 'none', transition: 'background .12s' }}
                onMouseEnter={e => e.currentTarget.style.background = subBg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: isTransfer ? (isDark ? '#0099cc22' : '#e0f9ff') : (inc ? (isDark ? '#0f6e5622' : '#e1f5ee') : (isDark ? '#dc262622' : '#fef2f2')), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className={`ti ${isTransfer ? 'ti-arrows-exchange' : (inc ? 'ti-arrow-down-left' : 'ti-arrow-up-right')}`} style={{ fontSize: 16, color: isTransfer ? '#0099cc' : (inc ? GREEN : RED) }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isTransfer ? `${r.method || '—'} → ${r.transferTo || '—'}` : (r.party || r.category || '—')}
                    <span style={{ fontSize: 9, fontWeight: 700, color: isTransfer ? '#0099cc' : sb.color, background: isTransfer ? (isDark ? '#0099cc22' : '#e0f9ff') : (isDark ? sb.color + '22' : sb.bg), padding: '1px 6px', borderRadius: 99, flexShrink: 0 }}>{isTransfer ? 'Transfer' : sb.label}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isTransfer ? (r.notes || 'Moved between accounts') : ([r.category, r.description, r.method, r.reference].filter(Boolean).join(' · ') || '—')}{!isTransfer && r.vat > 0 ? ` · VAT ${fmt(r.vat)}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: isTransfer ? textSub : (inc ? GREEN : RED) }}>{isTransfer ? '' : (inc ? '+ ' : '− ')}{fmt(r.total)}</div>
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

      {/* Transfer modal — move money between accounts (e.g. Bank → petty cash) */}
      {transferOpen && (
        <div onClick={() => !saving && setTransferOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: cardBg, borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', border: `1px solid ${border}` }}>
            <div style={{ padding: '15px 18px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: text, display: 'flex', alignItems: 'center', gap: 7 }}><i className="ti ti-arrows-exchange" style={{ fontSize: 18, color: '#0099cc' }} /> {tForm.id ? 'Edit transfer' : 'Transfer money'}</div>
              <button onClick={() => setTransferOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, fontSize: 18 }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ fontSize: 11.5, color: textSub, lineHeight: 1.5, background: subBg, borderRadius: 8, padding: '9px 11px' }}>Move money between your accounts — e.g. take cash out of the <b>bank</b> into your <b>petty cash</b> box. This isn’t income or expense; it just shifts the balance.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>From</label>
                  <select value={tForm.from} onChange={e => setTForm(f => ({ ...f, from: e.target.value }))} style={inputStyle}>
                    {METHODS.map(m => <option key={m} value={m} style={{ background: inputBg, color: text }}>{m}</option>)}
                  </select>
                </div>
                <i className="ti ti-arrow-right" style={{ fontSize: 18, color: textMuted, paddingBottom: 9 }} />
                <div>
                  <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>To</label>
                  <select value={tForm.to} onChange={e => setTForm(f => ({ ...f, to: e.target.value }))} style={inputStyle}>
                    {METHODS.map(m => <option key={m} value={m} style={{ background: inputBg, color: text }}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Amount (AED)</label>
                  <input type="number" value={tForm.amount} onChange={e => setTForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Date</label>
                  <input type="date" value={tForm.entry_date} onChange={e => setTForm(f => ({ ...f, entry_date: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Note <span>(optional)</span></label>
                <input value={tForm.notes} onChange={e => setTForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Petty cash top-up" style={inputStyle} />
              </div>
            </div>
            <div style={{ padding: '13px 18px', borderTop: `1px solid ${border}`, display: 'flex', gap: 8 }}>
              <button onClick={() => setTransferOpen(false)} disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveTransfer} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 9, border: 'none', background: '#0099cc', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : (tForm.id ? 'Update transfer' : 'Save transfer')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Opening balance modal — starting cash/bank balances (one time) */}
      {openingOpen && (
        <div onClick={() => !saving && setOpeningOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: cardBg, borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', border: `1px solid ${border}` }}>
            <div style={{ padding: '15px 18px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: text, display: 'flex', alignItems: 'center', gap: 7 }}><i className="ti ti-adjustments-dollar" style={{ fontSize: 18, color: '#0099cc' }} /> Opening balances</div>
              <button onClick={() => setOpeningOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, fontSize: 18 }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ fontSize: 11.5, color: textSub, lineHeight: 1.5, background: subBg, borderRadius: 8, padding: '9px 11px' }}>How much each account <b>already had</b> when you started using this ledger — e.g. money already in your bank or petty-cash box. This sets the starting balance; it isn’t counted as income.</div>
              <div>
                <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>As of date</label>
                <input type="date" value={oForm.date} onChange={e => setOForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
              </div>
              {METHODS.map(m => (
                <div key={m} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 10, alignItems: 'center' }}>
                  <label style={{ fontSize: 12.5, color: text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><i className={`ti ${METHOD_ICON[normMethod(m)] || 'ti-coin'}`} style={{ fontSize: 14, color: textSub }} />{m === 'Cash' ? 'Cash (petty cash)' : m}</label>
                  <input type="number" value={oForm.balances[m] ?? ''} onChange={e => setOForm(f => ({ ...f, balances: { ...f.balances, [m]: e.target.value } }))} placeholder="0" style={inputStyle} />
                </div>
              ))}
            </div>
            <div style={{ padding: '13px 18px', borderTop: `1px solid ${border}`, display: 'flex', gap: 8 }}>
              <button onClick={() => setOpeningOpen(false)} disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveOpening} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 9, border: 'none', background: '#0099cc', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save opening balances'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
