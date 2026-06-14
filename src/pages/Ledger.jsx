import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const fmt = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
function parsePayments(raw) {
  try { const a = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}
function monthKey(d) { return (d || '').slice(0, 7) }

export default function Ledger() {
  const { company } = useAuth()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [, forceUpdate] = useState(0)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (company?.id) load()
    const obs = new MutationObserver(() => forceUpdate(n => n + 1))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [company?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('invoices')
      .select('invoice_number, client_name, quote_number, payments')
      .eq('company_id', company.id)
    const out = []
    ;(data || []).forEach(inv => {
      parsePayments(inv.payments).forEach((p, idx) => {
        out.push({
          id: `${inv.invoice_number}-${idx}`,
          date: p.date || '', client: inv.client_name || '—',
          invoice: inv.invoice_number || '', method: p.method || '', note: p.note || '',
          amount: Number(p.amount) || 0,
        })
      })
    })
    out.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    setRows(out); setLoading(false)
  }

  // theme
  const text = isDark ? '#f1f5f9' : '#0f172a', textSub = isDark ? '#94a3b8' : '#64748b', textMuted = isDark ? '#475569' : '#94a3b8'
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', cardBg = isDark ? '#1e293b' : '#ffffff'
  const subBg = isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', inputBg = isDark ? '#0f172a' : '#fff'
  const inputStyle = { padding: '9px 11px', border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, background: inputBg, color: text, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const card = { background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 50 }}>
      <div style={{ width: 34, height: 34, border: '3px solid #0099cc', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p style={{ color: textMuted, fontSize: 13 }}>Loading ledger…</p>
    </div>
  )

  const thisMonth = monthKey(new Date().toISOString())
  const totalAll = rows.reduce((s, r) => s + r.amount, 0)
  const totalMonth = rows.filter(r => monthKey(r.date) === thisMonth).reduce((s, r) => s + r.amount, 0)

  let list = rows
  if (search.trim()) {
    const s = search.toLowerCase()
    list = list.filter(r => r.client.toLowerCase().includes(s) || r.invoice.toLowerCase().includes(s) || r.method.toLowerCase().includes(s))
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, color: text, margin: 0 }}>Ledger</h1>
        <p style={{ fontSize: 13, color: textSub, marginTop: 3 }}>Every payment received, across all invoices</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ ...card, marginBottom: 0, textAlign: 'center' }}><div style={{ fontSize: 11, color: textMuted }}>Received (this month)</div><div style={{ fontSize: 18, fontWeight: 700, color: '#0f6e56' }}>{fmt(totalMonth)}</div></div>
        <div style={{ ...card, marginBottom: 0, textAlign: 'center' }}><div style={{ fontSize: 11, color: textMuted }}>Received (all time)</div><div style={{ fontSize: 18, fontWeight: 700, color: text }}>{fmt(totalAll)}</div></div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client, invoice, method…" style={{ ...inputStyle, marginBottom: 12 }} />

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px', background: cardBg, border: `1px solid ${border}`, borderRadius: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: subBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><i className="ti ti-book-2" style={{ fontSize: 26, color: textMuted }} /></div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: text, margin: '0 0 6px' }}>{rows.length === 0 ? 'No payments yet' : 'No entries match'}</h3>
          <p style={{ fontSize: 13, color: textSub, margin: 0 }}>{rows.length === 0 ? 'Payments recorded against invoices appear here.' : 'Try a different search.'}</p>
        </div>
      ) : (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden' }}>
          {list.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i > 0 ? `1px solid ${border}` : 'none' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: isDark ? '#0f6e5622' : '#e1f5ee', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="ti ti-arrow-down-left" style={{ fontSize: 16, color: '#0f6e56' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.client}</div>
                <div style={{ fontSize: 11.5, color: textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.invoice}{r.method ? ' · ' + r.method : ''}{r.note ? ' · ' + r.note : ''}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f6e56' }}>+ {fmt(r.amount)}</div>
                <div style={{ fontSize: 11, color: textMuted }}>{r.date ? new Date(r.date).toLocaleDateString('en-GB') : '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
