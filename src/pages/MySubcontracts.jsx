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
import { awardedGross as gross, awardedStatementSheet } from '../lib/subcontractStatement'

const AED = n => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')

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
      setDoc({ title: `Statement · ${row.project_name || 'Project'}`, html: `<div class="__sheet">${awardedStatementSheet(row, company?.name || 'Our company', data || [])}</div>` })
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
