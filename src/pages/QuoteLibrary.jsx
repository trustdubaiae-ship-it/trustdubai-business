// trustdubai-business/src/pages/QuoteLibrary.jsx
import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/* =========================================================================
   DESCRIPTION LIBRARY — reusable BOQ line items.
   Save full descriptions once (trade + description + unit + default rate),
   then reuse them in quotations (autocomplete) instead of re-typing.
   Trades: 10 defaults + add your own ("+ New trade" in the modal).
   Per-company, owner-only (RLS on quote_library). Responsive + light/dark.
   ========================================================================= */

const DEFAULT_TRADES = [
  'Civil', 'Electrical', 'Plumbing', 'HVAC / AC', 'False Ceiling',
  'Flooring', 'Painting', 'Joinery', 'Sanitary', 'Misc',
]
const TRADE_COLOR = {
  'Civil':'#a16207','Electrical':'#d97706','Plumbing':'#0891b2','HVAC / AC':'#0284c7',
  'False Ceiling':'#7c3aed','Flooring':'#c026d3','Painting':'#db2777','Joinery':'#b45309',
  'Sanitary':'#0d9488','Misc':'#64748b',
}
// stable color for custom trades
const PALETTE = ['#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#7c3aed','#db2777','#0d9488','#a16207','#0284c7','#c026d3']
function tradeColor(name) {
  if (TRADE_COLOR[name]) return TRADE_COLOR[name]
  let h = 0
  for (const ch of (name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
const UNITS = ['nos','m²','m³','lm','sqft','set','ls','kg','point','panel','door','job']

const ACCENT = '#0099cc'

export default function QuoteLibrary() {
  const { company, user } = useAuth()
  const companyId = company?.id != null ? String(company.id) : null
  const ownerEmail = user?.email || ''

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [trade, setTrade] = useState('all')
  const [modal, setModal] = useState(null)   // null | {} (new) | {...row} (edit)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { if (companyId) load() }, [companyId])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('quote_library').select('*')
        .eq('company_id', companyId)
        .order('trade_section', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      setItems(data || [])
    } catch (e) { console.error('load library', e) }
    finally { setLoading(false) }
  }

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 2000) }

  async function saveItem(form) {
    if (!form.description?.trim()) { showToast('Description is required'); return }
    setSaving(true)
    try {
      const row = {
        company_id: companyId,
        owner_email: ownerEmail,
        trade_section: (form.trade_section || 'Misc').trim(),
        label: form.label?.trim() || null,
        description: form.description.trim(),
        unit: form.unit || null,
        default_rate: Number(form.default_rate) || 0,
        updated_at: new Date().toISOString(),
      }
      if (form.id) {
        const { error } = await supabase.from('quote_library').update(row).eq('id', form.id)
        if (error) throw error
        showToast('Item updated')
      } else {
        const { error } = await supabase.from('quote_library').insert(row)
        if (error) throw error
        showToast('Item added to library')
      }
      setModal(null)
      load()
    } catch (e) { console.error('save item', e); showToast('Could not save — try again') }
    finally { setSaving(false) }
  }

  async function removeItem(id) {
    if (!window.confirm('Delete this item from the library?')) return
    try {
      const { error } = await supabase.from('quote_library').delete().eq('id', id)
      if (error) throw error
      setItems(it => it.filter(x => x.id !== id))
      showToast('Item deleted')
    } catch (e) { console.error('delete', e); showToast('Could not delete') }
  }

  const filtered = items.filter(it => {
    if (trade !== 'all' && it.trade_section !== trade) return false
    const q = search.trim().toLowerCase()
    if (q) {
      const hay = `${it.label||''} ${it.description||''} ${it.trade_section||''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // counts per trade for filter chips
  const tradeCounts = items.reduce((acc, it) => { const t = it.trade_section || 'Misc'; acc[t] = (acc[t]||0)+1; return acc }, {})
  // chips: defaults that are used first, then custom trades (sorted)
  const usedTrades = Object.keys(tradeCounts)
  const chipTrades = [
    ...DEFAULT_TRADES.filter(t => tradeCounts[t]),
    ...usedTrades.filter(t => !DEFAULT_TRADES.includes(t)).sort(),
  ]
  // all known trades for the modal dropdown (defaults + any custom already in use)
  const knownTrades = [
    ...DEFAULT_TRADES,
    ...usedTrades.filter(t => !DEFAULT_TRADES.includes(t)).sort(),
  ]

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap', marginBottom:16 }}>
        <div style={{ flex:1, minWidth:200 }}>
          <h1 style={{ fontSize:'clamp(20px,5vw,26px)', fontWeight:800, color:'var(--text)', margin:0, display:'flex', alignItems:'center', gap:9 }}>
            <i className="ti ti-books" style={{ color:ACCENT }}/> Description Library
          </h1>
          <p style={{ fontSize:13, color:'var(--text2)', margin:'4px 0 0' }}>Save BOQ descriptions once, reuse them in quotations — no more re-typing.</p>
        </div>
        <button onClick={() => setModal({})} style={{ ...btnPrimary, padding:'11px 18px' }}>
          <i className="ti ti-plus" style={{ fontSize:16 }}/> Add item
        </button>
      </div>

      {/* search */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 12px', flex:1, minWidth:200 }}>
          <i className="ti ti-search" style={{ fontSize:14, color:'var(--text3)' }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search descriptions…"
            style={{ border:'none', background:'none', outline:'none', fontSize:13, width:'100%', color:'var(--text)' }}/>
          {search && <i className="ti ti-x" onClick={() => setSearch('')} style={{ fontSize:14, color:'var(--text3)', cursor:'pointer' }}/>}
        </div>
      </div>
      {/* trade filter chips */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        <Chip on={trade==='all'} onClick={() => setTrade('all')} color={ACCENT}>All <span style={{ opacity:.7 }}>{items.length}</span></Chip>
        {chipTrades.map(t => (
          <Chip key={t} on={trade===t} onClick={() => setTrade(t)} color={tradeColor(t)}>{t} <span style={{ opacity:.7 }}>{tradeCounts[t]}</span></Chip>
        ))}
      </div>

      {/* list */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}>
          <div style={{ width:30, height:30, border:`3px solid ${ACCENT}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : items.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'48px 20px', textAlign:'center' }}>
          <i className="ti ti-books" style={{ fontSize:36, color:'var(--text3)', display:'block', marginBottom:10 }}/>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:5 }}>Your library is empty</div>
          <div style={{ fontSize:13, color:'var(--text2)', marginBottom:20, maxWidth:380, marginLeft:'auto', marginRight:'auto', lineHeight:1.5 }}>
            Add the BOQ items you use often (with unit &amp; default rate). Next time you build a quote, just pick them — no re-typing.
          </div>
          <button onClick={() => setModal({})} style={btnPrimary}><i className="ti ti-plus" style={{ fontSize:16 }}/> Add your first item</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', color:'var(--text3)', fontSize:13, padding:'40px 0' }}>No items match your search.</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
          {filtered.map(it => {
            const c = tradeColor(it.trade_section)
            return (
              <div key={it.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 15px', display:'flex', flexDirection:'column', gap:9 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:c, background:`${c}1f`, borderRadius:6, padding:'3px 9px', letterSpacing:'.02em' }}>{it.trade_section || 'Misc'}</span>
                  <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                    <button onClick={() => setModal(it)} title="Edit" style={iconBtn}><i className="ti ti-edit" style={{ fontSize:15 }}/></button>
                    <button onClick={() => removeItem(it.id)} title="Delete" style={{ ...iconBtn, color:'#ef4444' }}><i className="ti ti-trash" style={{ fontSize:15 }}/></button>
                  </div>
                </div>
                {it.label && <div style={{ fontSize:13.5, fontWeight:700, color:'var(--text)' }}>{it.label}</div>}
                <div style={{ fontSize:12.5, color:'var(--text2)', lineHeight:1.5 }}>{it.description}</div>
                <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:'auto', paddingTop:8, borderTop:'1px solid var(--border)' }}>
                  <span style={{ fontSize:11.5, color:'var(--text3)' }}>Unit: <b style={{ color:'var(--text)' }}>{it.unit || '—'}</b></span>
                  <span style={{ fontSize:11.5, color:'var(--text3)' }}>Rate: <b style={{ color:ACCENT }}>AED {Number(it.default_rate||0).toLocaleString()}</b></span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* add/edit modal */}
      {modal && <ItemModal initial={modal} knownTrades={knownTrades} saving={saving} onClose={() => setModal(null)} onSave={saveItem} />}

      {toast && <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#0f172a', color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:300 }}>{toast}</div>}
    </div>
  )
}

function Chip({ on, onClick, color, children }) {
  return (
    <button onClick={onClick} style={{ fontSize:11.5, fontWeight:600, padding:'6px 12px', borderRadius:99, cursor:'pointer',
      background: on ? `${color}1f` : 'transparent', color: on ? color : 'var(--text2)',
      border: on ? `1px solid ${color}` : '1px solid var(--border)', display:'inline-flex', gap:5, alignItems:'center' }}>
      {children}
    </button>
  )
}

function ItemModal({ initial, knownTrades, saving, onClose, onSave }) {
  const [form, setForm] = useState({
    id: initial.id || null,
    trade_section: initial.trade_section || (knownTrades[0] || 'Civil'),
    label: initial.label || '',
    description: initial.description || '',
    unit: initial.unit || 'nos',
    default_rate: initial.default_rate != null ? initial.default_rate : '',
  })
  const [addingTrade, setAddingTrade] = useState(false)
  const [newTrade, setNewTrade] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // make sure the current value is always an option (e.g. editing a custom trade)
  const tradeOptions = knownTrades.includes(form.trade_section) || !form.trade_section
    ? knownTrades : [...knownTrades, form.trade_section]

  function confirmNewTrade() {
    const t = newTrade.trim()
    if (!t) return
    set('trade_section', t)
    setNewTrade(''); setAddingTrade(false)
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto', padding:22 }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:18 }}>
          <i className="ti ti-books" style={{ fontSize:20, color:ACCENT }}/>
          <h3 style={{ margin:0, fontSize:17, fontWeight:700, color:'var(--text)' }}>{form.id ? 'Edit item' : 'Add library item'}</h3>
          <button onClick={onClose} style={{ ...iconBtn, marginLeft:'auto' }}><i className="ti ti-x" style={{ fontSize:18 }}/></button>
        </div>

        <Field label="Trade section">
          {addingTrade ? (
            <div style={{ display:'flex', gap:8 }}>
              <input autoFocus value={newTrade} onChange={e => setNewTrade(e.target.value)} placeholder="New trade name (e.g. Glass & Mirror)"
                onKeyDown={e => { if (e.key==='Enter') confirmNewTrade(); if (e.key==='Escape') { setAddingTrade(false); setNewTrade('') } }}
                style={{ ...inputStyle, flex:1 }}/>
              <button onClick={confirmNewTrade} disabled={!newTrade.trim()} style={{ ...btnPrimary, padding:'9px 13px', opacity:newTrade.trim()?1:0.5 }}><i className="ti ti-check" style={{ fontSize:15 }}/></button>
              <button onClick={() => { setAddingTrade(false); setNewTrade('') }} style={{ ...btnGhost, padding:'9px 12px' }}><i className="ti ti-x" style={{ fontSize:15 }}/></button>
            </div>
          ) : (
            <select value={form.trade_section}
              onChange={e => { if (e.target.value === '__new__') { setAddingTrade(true) } else { set('trade_section', e.target.value) } }}
              style={inputStyle}>
              {tradeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="__new__">+ New trade…</option>
            </select>
          )}
        </Field>

        <Field label="Short label (optional)">
          <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="e.g. Gypsum false ceiling" style={inputStyle}/>
        </Field>

        <Field label="Full description *">
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4}
            placeholder="Full BOQ description — item + material spec (brand/grade) + scope (supply & install) + finish. End with 'All as per approved drawing and engineer's instruction.'"
            style={{ ...inputStyle, resize:'vertical', minHeight:90, fontFamily:'inherit', lineHeight:1.5 }}/>
        </Field>

        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          <Field label="Unit" style={{ flex:1, minWidth:120 }}>
            <select value={form.unit} onChange={e => set('unit', e.target.value)} style={inputStyle}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Default rate (AED)" style={{ flex:1, minWidth:120 }}>
            <input type="number" value={form.default_rate} onChange={e => set('default_rate', e.target.value)} placeholder="0" min="0" style={inputStyle}/>
          </Field>
        </div>

        <div style={{ display:'flex', gap:10, marginTop:18 }}>
          <button onClick={onClose} style={{ ...btnGhost, flex:1, justifyContent:'center' }}>Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.description.trim()} style={{ ...btnPrimary, flex:1, justifyContent:'center', opacity:(saving||!form.description.trim())?0.6:1 }}>
            {saving ? 'Saving…' : (form.id ? 'Update item' : 'Add to library')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom:14, ...style }}>
      <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:'var(--text2)', marginBottom:5 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = { width:'100%', background:'var(--bg2,rgba(127,127,127,0.05))', border:'1px solid var(--border)', borderRadius:9, padding:'9px 11px', fontSize:13.5, color:'var(--text)', outline:'none', boxSizing:'border-box' }
const btnPrimary = { display:'inline-flex', alignItems:'center', gap:6, padding:'10px 16px', borderRadius:10, border:'none', background:ACCENT, color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer' }
const btnGhost = { display:'inline-flex', alignItems:'center', gap:6, padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:13.5, fontWeight:600, cursor:'pointer' }
const iconBtn = { display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text2)', cursor:'pointer' }
