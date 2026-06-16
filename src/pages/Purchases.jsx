import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const fmt = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
const todayStr = () => new Date().toISOString().slice(0, 10)
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const initials = nm => nm ? nm.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?'
const monthKey = d => (d || '').slice(0, 7)
const VAT_RATE = 5

const CATEGORIES = ['Material', 'Tools / Equipment', 'Subcontractor', 'Transport', 'Rent', 'Utilities', 'Office', 'Misc']
const PAY_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Online', 'Credit (unpaid)']
const PURCHASE_STATUS = { unpaid: { label: 'Unpaid', color: '#b91c1c', bg: '#fee2e2' }, partial: { label: 'Partial', color: '#92400e', bg: '#fef9ed' }, paid: { label: 'Paid', color: '#0f6e56', bg: '#e1f5ee' } }

// Split a typed amount into net / vat / gross.
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
function statusOf(total, paid) {
  const p = Number(paid) || 0
  if (p <= 0) return 'unpaid'
  return p >= Math.round(Number(total) || 0) ? 'paid' : 'partial'
}

const blankPurchase = () => ({
  id: null, supplier_id: '', supplier_name: '', supplier_trn: '', invoice_number: '',
  invoice_date: todayStr(), category: 'Material', description: '',
  client_id: '', client_name: '', purchased_by: '',
  amount: '', hasVat: true, amountType: 'gross', method: 'Cash', payment_remark: '', paid: '', notes: '',
})
const blankSupplier = () => ({ id: null, name: '', trn: '', phone: '', email: '', address: '', notes: '' })

export default function Purchases() {
  const { company, user, staff } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [, forceUpdate] = useState(0)

  const [tab, setTab] = useState('purchases')         // purchases | suppliers
  const [purchases, setPurchases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [pModal, setPModal] = useState(false)
  const [pForm, setPForm] = useState(blankPurchase())
  const [sModal, setSModal] = useState(false)
  const [sForm, setSForm] = useState(blankSupplier())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (company?.id) load()
    const obs = new MutationObserver(() => forceUpdate(n => n + 1))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [company?.id])

  async function load() {
    setLoading(true)
    try {
      const [pRes, sRes, cRes] = await Promise.all([
        supabase.from('purchase_invoices').select('*').eq('company_id', company.id).order('invoice_date', { ascending: false }),
        supabase.from('suppliers').select('*').eq('company_id', company.id).order('name'),
        supabase.from('clients').select('id, name').eq('company_id', company.id).order('name'),
      ])
      setPurchases(pRes.data || [])
      setSuppliers(sRes.data || [])
      setClients(cRes.data || [])
    } catch (e) { /* keep usable */ } finally { setLoading(false) }
  }

  // ---------- purchase actions ----------
  function openAddPurchase() { setPForm({ ...blankPurchase(), purchased_by: staff?.name || '' }); setPModal(true) }
  function openEditPurchase(p) {
    setPForm({
      id: p.id, supplier_id: p.supplier_id || '', supplier_name: p.supplier_name || '', supplier_trn: p.supplier_trn || '',
      invoice_number: p.invoice_number || '', invoice_date: (p.invoice_date || '').slice(0, 10) || todayStr(),
      category: p.category || 'Material', description: p.description || '',
      client_id: p.client_id || '', client_name: p.client_name || '', purchased_by: p.purchased_by || '',
      amount: String(p.subtotal ?? ''), hasVat: Number(p.vat_amount) > 0, amountType: 'net',
      method: p.method || 'Cash', payment_remark: p.payment_remark || '',
      paid: p.paid ? String(p.paid) : '', notes: p.notes || '',
    })
    setPModal(true)
  }
  // Type-or-pick fields (single input + datalist): match a typed name to a saved
  // row so we keep its id, else treat it as free text (id cleared).
  function setSupplierName(val) {
    const s = suppliers.find(x => x.name === val)
    setPForm(f => ({ ...f, supplier_name: val, supplier_id: s ? s.id : '', supplier_trn: s ? (s.trn || '') : f.supplier_trn }))
  }
  function setClientName(val) {
    const c = clients.find(x => x.name === val)
    setPForm(f => ({ ...f, client_name: val, client_id: c ? c.id : '' }))
  }
  async function savePurchase() {
    if (!pForm.supplier_name.trim()) { toast.error('Enter or pick a supplier'); return }
    if (!(Number(pForm.amount) > 0)) { toast.error('Enter an amount'); return }
    setSaving(true)
    try {
      const { net, vat, total } = splitVat(pForm)
      const paid = Number(pForm.paid) || 0
      const payload = {
        company_id: company.id, supplier_id: pForm.supplier_id || null, supplier_name: pForm.supplier_name.trim(),
        supplier_trn: pForm.supplier_trn.trim() || null, invoice_number: pForm.invoice_number.trim() || null,
        invoice_date: pForm.invoice_date || todayStr(), category: pForm.category || 'Material',
        description: pForm.description.trim() || null, subtotal: net, vat_rate: pForm.hasVat ? VAT_RATE : 0, vat_amount: vat, total,
        client_id: pForm.client_id || null, client_name: pForm.client_name.trim() || null, purchased_by: pForm.purchased_by.trim() || null,
        method: pForm.method || 'Cash', payment_remark: pForm.payment_remark.trim() || null,
        paid, status: statusOf(total, paid), notes: pForm.notes.trim() || null,
      }
      if (pForm.id) {
        const { error } = await supabase.from('purchase_invoices').update(payload).eq('id', pForm.id).eq('company_id', company.id)
        if (error) throw error
        toast.success('Purchase updated ✓')
      } else {
        payload.created_by_email = user?.email || null
        const { error } = await supabase.from('purchase_invoices').insert(payload)
        if (error) throw error
        toast.success('Purchase recorded ✓')
      }
      setPModal(false); load()
    } catch (e) {
      toast.error(/purchase_invoices|suppliers/.test(e.message || '') ? 'Run the purchases migration first (db/2026-06-16_purchases.sql)' : 'Save failed: ' + (e.message || 'unknown'))
    } finally { setSaving(false) }
  }
  async function deletePurchase(p) {
    if (!window.confirm('Delete this purchase bill? This cannot be undone.')) return
    const { error } = await supabase.from('purchase_invoices').delete().eq('id', p.id).eq('company_id', company.id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Purchase deleted'); load()
  }

  // ---------- supplier actions ----------
  function openAddSupplier() { setSForm(blankSupplier()); setSModal(true) }
  function openEditSupplier(s) { setSForm({ id: s.id, name: s.name || '', trn: s.trn || '', phone: s.phone || '', email: s.email || '', address: s.address || '', notes: s.notes || '' }); setSModal(true) }
  async function saveSupplier() {
    if (!sForm.name.trim()) { toast.error('Supplier name is required'); return }
    setSaving(true)
    try {
      const payload = { company_id: company.id, name: sForm.name.trim(), trn: sForm.trn.trim() || null, phone: sForm.phone.trim() || null, email: sForm.email.trim() || null, address: sForm.address.trim() || null, notes: sForm.notes.trim() || null }
      if (sForm.id) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', sForm.id).eq('company_id', company.id)
        if (error) throw error
        toast.success('Supplier updated ✓')
      } else {
        payload.created_by_email = user?.email || null
        const { error } = await supabase.from('suppliers').insert(payload)
        if (error) throw error
        toast.success('Supplier added ✓')
      }
      setSModal(false); load()
    } catch (e) {
      toast.error(/suppliers/.test(e.message || '') ? 'Run the purchases migration first (db/2026-06-16_purchases.sql)' : 'Save failed: ' + (e.message || 'unknown'))
    } finally { setSaving(false) }
  }
  async function deleteSupplier(s) {
    if (!window.confirm(`Delete supplier "${s.name}"? Their recorded bills stay in the ledger.`)) return
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id).eq('company_id', company.id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Supplier deleted'); load()
  }

  // ---------- theme ----------
  const text = isDark ? '#f1f5f9' : '#0f172a', textSub = isDark ? '#94a3b8' : '#64748b', textMuted = isDark ? '#475569' : '#94a3b8'
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', cardBg = isDark ? '#1e293b' : '#ffffff'
  const subBg = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', inputBg = isDark ? '#0f172a' : '#fff', pillBg = isDark ? 'rgba(255,255,255,0.05)' : '#fff'
  const inputStyle = { padding: '9px 11px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, background: inputBg, color: text, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const card = { background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '14px 16px' }
  const RED = '#dc2626', BLUE = '#0099cc'

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 50 }}>
      <div style={{ width: 34, height: 34, border: '3px solid #0099cc', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <p style={{ color: textMuted, fontSize: 13 }}>Loading purchases…</p>
    </div>
  )

  // ---------- derived ----------
  const thisMonth = monthKey(new Date().toISOString())
  const monthPurch = purchases.filter(p => monthKey(p.invoice_date) === thisMonth)
  const totMonth = monthPurch.reduce((s, p) => s + Number(p.total || 0), 0)
  const inputVatMonth = monthPurch.reduce((s, p) => s + Number(p.vat_amount || 0), 0)
  const unpaidTot = purchases.reduce((s, p) => s + Math.max(0, Number(p.total || 0) - Number(p.paid || 0)), 0)

  let pList = purchases
  if (search.trim()) {
    const s = search.toLowerCase()
    pList = pList.filter(p => (p.supplier_name || '').toLowerCase().includes(s) || (p.invoice_number || '').toLowerCase().includes(s) || (p.category || '').toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s))
  }
  let sList = suppliers
  if (search.trim() && tab === 'suppliers') {
    const s = search.toLowerCase()
    sList = sList.filter(x => (x.name || '').toLowerCase().includes(s) || (x.trn || '').toLowerCase().includes(s) || (x.phone || '').toLowerCase().includes(s))
  }

  const { net: pvNet, vat: pvVat, total: pvTotal } = splitVat(pForm)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 700, color: text, margin: 0 }}>Purchases &amp; Suppliers</h1>
          <p style={{ fontSize: 13, color: textSub, marginTop: 3 }}>Record supplier bills with VAT — flows into your Ledger as Input VAT</p>
        </div>
        <button onClick={tab === 'purchases' ? openAddPurchase : openAddSupplier} style={{ padding: '9px 16px', background: BLUE, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <i className="ti ti-plus" style={{ fontSize: 15 }} /> {tab === 'purchases' ? 'New Purchase' : 'Add Supplier'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'inline-flex', background: pillBg, border: `1px solid ${border}`, borderRadius: 10, padding: 3, marginBottom: 14 }}>
        {[['purchases', 'Purchase Bills', 'ti-file-dollar'], ['suppliers', 'Suppliers', 'ti-building-warehouse']].map(([v, l, ic]) => (
          <button key={v} onClick={() => setTab(v)} style={{ fontSize: 13, fontWeight: tab === v ? 600 : 400, padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, background: tab === v ? (isDark ? 'rgba(3,193,245,0.15)' : '#e0f9ff') : 'transparent', color: tab === v ? BLUE : textSub }}>
            <i className={`ti ${ic}`} style={{ fontSize: 15 }} /> {l}{v === 'suppliers' && suppliers.length ? ` (${suppliers.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'purchases' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div style={card}><div style={{ fontSize: 11.5, color: textMuted }}>Purchases (this month)</div><div style={{ fontSize: 20, fontWeight: 700, color: RED, marginTop: 4 }}>{fmt(totMonth)}</div></div>
            <div style={card}><div style={{ fontSize: 11.5, color: textMuted }}>Input VAT (this month)</div><div style={{ fontSize: 20, fontWeight: 700, color: BLUE, marginTop: 4 }}>{fmt(inputVatMonth)}</div></div>
            <div style={card}><div style={{ fontSize: 11.5, color: textMuted }}>Unpaid to suppliers</div><div style={{ fontSize: 20, fontWeight: 700, color: text, marginTop: 4 }}>{fmt(unpaidTot)}</div></div>
          </div>

          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier, bill no, category…" style={{ ...inputStyle, marginBottom: 12 }} />

          {pList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 20px', background: cardBg, border: `1px solid ${border}`, borderRadius: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: subBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><i className="ti ti-file-dollar" style={{ fontSize: 26, color: textMuted }} /></div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: text, margin: '0 0 6px' }}>{purchases.length === 0 ? 'No purchase bills yet' : 'No bills match'}</h3>
              <p style={{ fontSize: 13, color: textSub, margin: '0 0 16px' }}>Record a supplier bill — VAT is calculated and added to your Ledger.</p>
              <button onClick={openAddPurchase} style={{ padding: '10px 18px', background: BLUE, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New Purchase</button>
            </div>
          ) : (
            <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
              {pList.map((p, i) => {
                const st = PURCHASE_STATUS[p.status || 'unpaid'] || PURCHASE_STATUS.unpaid
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i > 0 ? `1px solid ${border}` : 'none' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: isDark ? '#dc262622' : '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: RED, flexShrink: 0 }}>{initials(p.supplier_name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.supplier_name || '—'}</div>
                      <div style={{ fontSize: 11.5, color: textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[p.category, p.client_name, p.invoice_number, p.method, p.purchased_by].filter(Boolean).join(' · ') || '—'}{Number(p.vat_amount) > 0 ? ` · VAT ${fmt(p.vat_amount)}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: text }}>{fmt(p.total)}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: st.color, background: isDark ? st.color + '22' : st.bg, padding: '1px 7px', borderRadius: 99 }}>{st.label}</span>
                        <span style={{ fontSize: 10.5, color: textMuted }}>{fmtDate(p.invoice_date)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => openEditPurchase(p)} title="Edit" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${border}`, background: cardBg, color: textSub, cursor: 'pointer' }}><i className="ti ti-edit" style={{ fontSize: 13 }} /></button>
                      <button onClick={() => deletePurchase(p)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${border}`, background: cardBg, color: RED, cursor: 'pointer' }}><i className="ti ti-trash" style={{ fontSize: 13 }} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'suppliers' && (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier name, TRN, phone…" style={{ ...inputStyle, marginBottom: 12 }} />
          {sList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 20px', background: cardBg, border: `1px solid ${border}`, borderRadius: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: subBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><i className="ti ti-building-warehouse" style={{ fontSize: 26, color: textMuted }} /></div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: text, margin: '0 0 6px' }}>{suppliers.length === 0 ? 'No suppliers yet' : 'No suppliers match'}</h3>
              <p style={{ fontSize: 13, color: textSub, margin: '0 0 16px' }}>Save vendors once, then pick them when recording a purchase.</p>
              <button onClick={openAddSupplier} style={{ padding: '10px 18px', background: BLUE, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add Supplier</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {sList.map(s => {
                const billed = purchases.filter(p => p.supplier_id === s.id).reduce((a, p) => a + Number(p.total || 0), 0)
                return (
                  <div key={s.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: subBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: BLUE, flexShrink: 0 }}>{initials(s.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                        {s.trn && <div style={{ fontSize: 10.5, color: textMuted }}>TRN {s.trn}</div>}
                      </div>
                    </div>
                    {(s.phone || s.email) && <div style={{ fontSize: 11.5, color: textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[s.phone, s.email].filter(Boolean).join(' · ')}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: textMuted }}>Billed: <b style={{ color: text }}>{fmt(billed)}</b></span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => openEditSupplier(s)} title="Edit" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${border}`, background: cardBg, color: textSub, cursor: 'pointer' }}><i className="ti ti-edit" style={{ fontSize: 13 }} /></button>
                        <button onClick={() => deleteSupplier(s)} title="Delete" style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${border}`, background: cardBg, color: RED, cursor: 'pointer' }}><i className="ti ti-trash" style={{ fontSize: 13 }} /></button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Purchase modal */}
      {pModal && (
        <div onClick={() => !saving && setPModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: cardBg, borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', border: `1px solid ${border}` }}>
            <div style={{ padding: '15px 18px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{pForm.id ? 'Edit purchase bill' : 'Record purchase bill'}</div>
              <button onClick={() => setPModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, fontSize: 18 }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {/* supplier — one field: type or pick a saved supplier */}
              <div>
                <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Supplier {pForm.supplier_id && <span style={{ color: '#0f6e56' }}>· saved ✓</span>}</label>
                <input list="purchase-supplier-dl" value={pForm.supplier_name} onChange={e => setSupplierName(e.target.value)} placeholder="Type or pick a supplier…" style={inputStyle} />
                <datalist id="purchase-supplier-dl">{suppliers.map(s => <option key={s.id} value={s.name} />)}</datalist>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Bill / invoice no.</label><input value={pForm.invoice_number} onChange={e => setPForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="e.g. ACE-2291" style={inputStyle} /></div>
                <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Bill date</label><input type="date" value={pForm.invoice_date} onChange={e => setPForm(f => ({ ...f, invoice_date: e.target.value }))} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Category</label>
                  <select value={pForm.category} onChange={e => setPForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>{CATEGORIES.map(c => <option key={c} value={c} style={{ background: inputBg, color: text }}>{c}</option>)}</select>
                </div>
                <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Amount (AED)</label><input type="number" value={pForm.amount} onChange={e => setPForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" style={inputStyle} /></div>
              </div>
              <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Description <span>(optional)</span></label><input value={pForm.description} onChange={e => setPForm(f => ({ ...f, description: e.target.value }))} placeholder="What did you buy?" style={inputStyle} /></div>
              {/* For client / job — who/what this purchase was for */}
              <div>
                <label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>For client / job <span>(optional)</span> {pForm.client_id && <span style={{ color: '#0f6e56' }}>· client ✓</span>}</label>
                <input list="purchase-client-dl" value={pForm.client_name} onChange={e => setClientName(e.target.value)} placeholder="Type or pick a client · or e.g. Office stock" style={inputStyle} />
                <datalist id="purchase-client-dl">{clients.map(c => <option key={c.id} value={c.name} />)}</datalist>
              </div>
              {/* VAT */}
              <div style={{ background: pForm.hasVat ? (isDark ? 'rgba(0,153,204,0.08)' : '#f0faff') : subBg, border: `1px solid ${pForm.hasVat ? BLUE : border}`, borderRadius: 9, padding: '10px 12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={pForm.hasVat} onChange={e => setPForm(f => ({ ...f, hasVat: e.target.checked }))} style={{ width: 'auto' }} />
                  <i className="ti ti-receipt-tax" style={{ fontSize: 15, color: BLUE }} /> This bill has 5% VAT
                </label>
                {pForm.hasVat && (
                  <>
                    <div style={{ fontSize: 10.5, color: textMuted, margin: '8px 0 4px' }}>The amount you typed is:</div>
                    <div style={{ display: 'inline-flex', background: pillBg, border: `1px solid ${border}`, borderRadius: 8, padding: 3 }}>
                      {[['gross', 'VAT-inclusive (total)'], ['net', 'Before VAT (net)']].map(([v, l]) => (
                        <button key={v} onClick={() => setPForm(f => ({ ...f, amountType: v }))} style={{ fontSize: 11.5, fontWeight: pForm.amountType === v ? 600 : 400, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: pForm.amountType === v ? (isDark ? 'rgba(3,193,245,0.15)' : '#e0f9ff') : 'transparent', color: pForm.amountType === v ? BLUE : textSub }}>{l}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 10, fontSize: 12, color: textSub }}>
                      <span>Net {fmt(pvNet)}</span><span style={{ color: BLUE, fontWeight: 600 }}>VAT {fmt(pvVat)}</span><span style={{ fontWeight: 700, color: text }}>Total {fmt(pvTotal)}</span>
                    </div>
                  </>
                )}
              </div>
              {/* Payment — how it was paid, by whom */}
              <div style={{ background: subBg, border: `1px solid ${border}`, borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: textSub, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><i className="ti ti-wallet" style={{ fontSize: 14, color: BLUE }} /> Payment</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Mode of payment</label>
                    <select value={pForm.method} onChange={e => setPForm(f => ({ ...f, method: e.target.value }))} style={inputStyle}>{PAY_METHODS.map(m => <option key={m} value={m} style={{ background: inputBg, color: text }}>{m}</option>)}</select>
                  </div>
                  <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Paid so far <span>(optional)</span></label><input type="number" value={pForm.paid} onChange={e => setPForm(f => ({ ...f, paid: e.target.value }))} placeholder="0" style={inputStyle} /></div>
                </div>
                <div style={{ marginTop: 10 }}><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Payment remark <span>(optional)</span></label><input value={pForm.payment_remark} onChange={e => setPForm(f => ({ ...f, payment_remark: e.target.value }))} placeholder="e.g. Card ****1234 · Cheque #0098 · bank ref" style={inputStyle} /></div>
                <div style={{ fontSize: 10, color: textMuted, marginTop: 5 }}>Leave Paid as 0 if unpaid · enter the total if fully paid.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Purchased by</label><input value={pForm.purchased_by} onChange={e => setPForm(f => ({ ...f, purchased_by: e.target.value }))} placeholder="Who bought it" style={inputStyle} /></div>
                <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Notes <span>(optional)</span></label><input value={pForm.notes} onChange={e => setPForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any note" style={inputStyle} /></div>
              </div>
            </div>
            <div style={{ padding: '13px 18px', borderTop: `1px solid ${border}`, display: 'flex', gap: 8 }}>
              <button onClick={() => setPModal(false)} disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={savePurchase} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 9, border: 'none', background: BLUE, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : (pForm.id ? 'Update purchase' : 'Save purchase')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier modal */}
      {sModal && (
        <div onClick={() => !saving && setSModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: cardBg, borderRadius: 16, width: '100%', maxWidth: 440, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', border: `1px solid ${border}` }}>
            <div style={{ padding: '15px 18px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{sForm.id ? 'Edit supplier' : 'Add supplier'}</div>
              <button onClick={() => setSModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, fontSize: 18 }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Supplier name <span style={{ color: RED }}>*</span></label><input value={sForm.name} onChange={e => setSForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ACE Hardware LLC" style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>TRN <span>(optional)</span></label><input value={sForm.trn} onChange={e => setSForm(f => ({ ...f, trn: e.target.value }))} placeholder="Tax reg. no." style={inputStyle} /></div>
                <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Phone</label><input value={sForm.phone} onChange={e => setSForm(f => ({ ...f, phone: e.target.value }))} placeholder="05x…" style={inputStyle} /></div>
              </div>
              <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Email <span>(optional)</span></label><input value={sForm.email} onChange={e => setSForm(f => ({ ...f, email: e.target.value }))} placeholder="vendor@email.com" style={inputStyle} /></div>
              <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Address <span>(optional)</span></label><input value={sForm.address} onChange={e => setSForm(f => ({ ...f, address: e.target.value }))} placeholder="Area, city" style={inputStyle} /></div>
              <div><label style={{ fontSize: 11, color: textMuted, display: 'block', marginBottom: 3 }}>Notes <span>(optional)</span></label><input value={sForm.notes} onChange={e => setSForm(f => ({ ...f, notes: e.target.value }))} placeholder="What they supply, terms…" style={inputStyle} /></div>
            </div>
            <div style={{ padding: '13px 18px', borderTop: `1px solid ${border}`, display: 'flex', gap: 8 }}>
              <button onClick={() => setSModal(false)} disabled={saving} style={{ flex: 1, padding: '11px', borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveSupplier} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 9, border: 'none', background: BLUE, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : (sForm.id ? 'Update supplier' : 'Save supplier')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
