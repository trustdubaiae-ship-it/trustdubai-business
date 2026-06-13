// tritova-business/src/pages/Organizer.jsx
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

/* =========================================================================
   MY ORGANIZER — private diary (owner only). Meetings · Tasks · Notes.
   Fully responsive (phone → desktop) + light/dark via app CSS vars.
   Reads/writes organizer_items (RLS = owner email only).
   ========================================================================= */

const TYPES = {
  meeting: { label: 'Meeting', icon: 'ti-calendar-event', color: '#3b82f6' },
  task:    { label: 'Task',    icon: 'ti-checkbox',       color: '#22c55e' },
  note:    { label: 'Note',    icon: 'ti-note',           color: '#f59e0b' },
}

const VIEWS = [
  { key: 'today',    label: 'Today',    icon: 'ti-sun' },
  { key: 'upcoming', label: 'Upcoming', icon: 'ti-calendar' },
  { key: 'todo',     label: 'To-do',    icon: 'ti-checklist' },
  { key: 'notes',    label: 'Notes',    icon: 'ti-notes' },
]

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x }
function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
}

export default function Organizer({ onNavigate }) {
  const { company, user } = useAuth()
  const ownerEmail = user?.email || ''
  const companyId = company?.id != null ? String(company.id) : null

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('today')
  const [modal, setModal] = useState(null)   // null | {item}
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { if (ownerEmail) load() }, [ownerEmail])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('organizer_items')
        .select('*')
        .order('start_at', { ascending: true, nullsFirst: false })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      setItems(data || [])
    } catch (e) { console.error('organizer load', e) }
    finally { setLoading(false) }
  }

  function showToast(m) { setToast(m); setTimeout(() => setToast(''), 2000) }

  function openNew(type) {
    setModal({
      item: { type, title: '', notes: '', start_at: '', due_date: '', alert_minutes_before: 30, is_done: false },
      isNew: true,
    })
  }
  function openEdit(it) {
    setModal({ item: { ...it, start_at: it.start_at ? it.start_at.slice(0,16) : '', due_date: it.due_date || '' }, isNew: false })
  }

  async function saveItem() {
    const it = modal.item
    if (!it.title.trim()) { showToast('Title required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id: companyId,
        owner_email: ownerEmail,
        type: it.type,
        title: it.title.trim(),
        notes: it.notes || null,
        start_at: it.type === 'meeting' && it.start_at ? new Date(it.start_at).toISOString() : null,
        due_date: it.type === 'task' && it.due_date ? it.due_date : null,
        alert_minutes_before: it.type === 'meeting' ? (parseInt(it.alert_minutes_before) || 0) : null,
        is_done: !!it.is_done,
        updated_at: new Date().toISOString(),
      }
      if (modal.isNew) {
        const { error } = await supabase.from('organizer_items').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from('organizer_items').update(payload).eq('id', it.id)
        if (error) throw error
      }
      setModal(null)
      showToast('Saved ✓')
      load()
    } catch (e) { console.error(e); showToast('Save failed') }
    finally { setSaving(false) }
  }

  async function toggleDone(it) {
    try {
      await supabase.from('organizer_items').update({ is_done: !it.is_done }).eq('id', it.id)
      setItems(xs => xs.map(x => x.id === it.id ? { ...x, is_done: !x.is_done } : x))
    } catch (e) { console.error(e) }
  }

  async function removeItem(id) {
    try {
      await supabase.from('organizer_items').delete().eq('id', id)
      setItems(xs => xs.filter(x => x.id !== id))
      setModal(null)
      showToast('Deleted')
    } catch (e) { console.error(e); showToast('Delete failed') }
  }

  // filter per view
  const filtered = useMemo(() => {
    const today = startOfDay(new Date())
    const tEnd = new Date(today); tEnd.setHours(23,59,59,999)
    if (view === 'today') {
      return items.filter(it => {
        if (it.type === 'meeting' && it.start_at) {
          const s = new Date(it.start_at); return s >= today && s <= tEnd
        }
        if (it.type === 'task' && it.due_date) {
          const d = startOfDay(it.due_date); return d.getTime() === today.getTime()
        }
        return false
      })
    }
    if (view === 'upcoming') {
      return items.filter(it => {
        if (it.type === 'meeting' && it.start_at) return new Date(it.start_at) > tEnd
        if (it.type === 'task' && it.due_date && !it.is_done) return startOfDay(it.due_date) > today
        return false
      })
    }
    if (view === 'todo') return items.filter(it => it.type === 'task')
    if (view === 'notes') return items.filter(it => it.type === 'note')
    return items
  }, [items, view])

  const counts = useMemo(() => {
    const today = startOfDay(new Date())
    const tEnd = new Date(today); tEnd.setHours(23,59,59,999)
    return {
      today: items.filter(it => (it.type==='meeting'&&it.start_at&&new Date(it.start_at)>=today&&new Date(it.start_at)<=tEnd) || (it.type==='task'&&it.due_date&&startOfDay(it.due_date).getTime()===today.getTime())).length,
      todo: items.filter(it => it.type==='task' && !it.is_done).length,
      notes: items.filter(it => it.type==='note').length,
    }
  }, [items])

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:6 }}>
        <div>
          <h1 style={{ fontSize:'clamp(20px,5vw,26px)', fontWeight:800, color:'var(--text)', margin:0, display:'flex', alignItems:'center', gap:9 }}>
            <i className="ti ti-calendar-event" style={{ color:'#22c55e' }}/> My Organizer
          </h1>
          <p style={{ fontSize:13, color:'var(--text2)', margin:'4px 0 0' }}>Your private diary — meetings, tasks & notes. Only you can see this.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => openNew('meeting')} style={btnGhost}><i className="ti ti-calendar-plus" style={{ fontSize:15 }}/> Meeting</button>
          <button onClick={() => openNew('task')} style={btnGhost}><i className="ti ti-plus" style={{ fontSize:15 }}/> Task</button>
          <button onClick={() => openNew('note')} style={btnPrimary}><i className="ti ti-note" style={{ fontSize:15 }}/> Note</button>
        </div>
      </div>

      {/* view tabs */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', margin:'16px 0 18px' }}>
        {VIEWS.map(v => {
          const on = view === v.key
          const badge = v.key==='today'?counts.today : v.key==='todo'?counts.todo : v.key==='notes'?counts.notes : 0
          return (
            <button key={v.key} onClick={() => setView(v.key)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, cursor:'pointer', fontSize:13, fontWeight:600,
                background: on ? 'rgba(34,197,94,0.12)' : 'var(--card)', color: on ? '#16a34a' : 'var(--text2)',
                border: on ? '1px solid #22c55e' : '1px solid var(--border)' }}>
              <i className={`ti ${v.icon}`} style={{ fontSize:15 }}/> {v.label}
              {badge > 0 && <span style={{ fontSize:10, fontWeight:700, background: on?'#22c55e':'var(--bg2,rgba(127,127,127,0.15))', color: on?'#fff':'var(--text2)', borderRadius:99, padding:'1px 7px' }}>{badge}</span>}
            </button>
          )
        })}
      </div>

      {/* list */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}>
          <div style={{ width:32, height:32, border:'3px solid #22c55e', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'48px 20px', textAlign:'center' }}>
          <i className="ti ti-mood-smile" style={{ fontSize:34, color:'var(--text3)', display:'block', marginBottom:10 }}/>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Nothing here yet</div>
          <div style={{ fontSize:13, color:'var(--text2)', marginBottom:18 }}>
            {view==='notes' ? 'Add a quick note to get started.' : view==='todo' ? 'Add a task to track your to-dos.' : 'Nothing scheduled. Add a meeting or task.'}
          </div>
          <button onClick={() => openNew(view==='notes'?'note':view==='todo'?'task':'meeting')} style={btnPrimary}><i className="ti ti-plus" style={{ fontSize:15 }}/> Add {view==='notes'?'Note':view==='todo'?'Task':'Item'}</button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
          {filtered.map(it => {
            const t = TYPES[it.type] || TYPES.note
            return (
              <div key={it.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:13, padding:'13px 15px', display:'flex', alignItems:'flex-start', gap:12 }}>
                {it.type === 'task' ? (
                  <button onClick={() => toggleDone(it)} aria-label="toggle"
                    style={{ width:22, height:22, borderRadius:7, border:`2px solid ${it.is_done?'#22c55e':'var(--text3)'}`, background:it.is_done?'#22c55e':'transparent', color:'#fff', cursor:'pointer', flexShrink:0, marginTop:1, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>
                    {it.is_done ? '✓' : ''}
                  </button>
                ) : (
                  <span style={{ width:30, height:30, borderRadius:8, background:t.color+'1f', color:t.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <i className={`ti ${t.icon}`} style={{ fontSize:16 }}/>
                  </span>
                )}
                <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => openEdit(it)}>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', textDecoration: it.is_done?'line-through':'none', opacity: it.is_done?0.6:1, wordBreak:'break-word' }}>{it.title}</div>
                  {it.notes && <div style={{ fontSize:12.5, color:'var(--text2)', marginTop:2, wordBreak:'break-word', whiteSpace:'pre-wrap' }}>{it.notes}</div>}
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:5 }}>
                    <span style={{ fontSize:10.5, fontWeight:700, color:t.color, background:t.color+'18', borderRadius:6, padding:'2px 7px' }}>{t.label}</span>
                    {it.type==='meeting' && it.start_at && <span style={{ fontSize:11.5, color:'var(--text3)' }}><i className="ti ti-clock" style={{ fontSize:12, verticalAlign:'-1px' }}/> {fmtDate(it.start_at)} · {fmtTime(it.start_at)}</span>}
                    {it.type==='task' && it.due_date && <span style={{ fontSize:11.5, color:'var(--text3)' }}><i className="ti ti-flag" style={{ fontSize:12, verticalAlign:'-1px' }}/> Due {fmtDate(it.due_date)}</span>}
                  </div>
                </div>
                <button onClick={() => openEdit(it)} aria-label="edit"
                  style={{ width:30, height:30, borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text3)', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className="ti ti-dots" style={{ fontSize:16 }}/>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#0f172a', color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:300 }}>{toast}</div>
      )}

      {/* add/edit modal */}
      {modal && (
        <div onClick={() => setModal(null)}
          style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:18, width:'100%', maxWidth:460, padding:'clamp(18px,4vw,26px)', maxHeight:'90vh', overflowY:'auto' }}>
            {/* type switch */}
            <div style={{ display:'flex', gap:6, marginBottom:18 }}>
              {Object.keys(TYPES).map(k => {
                const t = TYPES[k]; const on = modal.item.type === k
                return (
                  <button key={k} onClick={() => setModal(m => ({ ...m, item: { ...m.item, type: k } }))}
                    style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'8px', borderRadius:9, cursor:'pointer', fontSize:12.5, fontWeight:600,
                      background: on ? t.color+'1f' : 'transparent', color: on ? t.color : 'var(--text3)', border: on ? `1px solid ${t.color}` : '1px solid var(--border)' }}>
                    <i className={`ti ${t.icon}`} style={{ fontSize:15 }}/> {t.label}
                  </button>
                )
              })}
            </div>

            <label style={lbl}>Title</label>
            <input autoFocus value={modal.item.title} onChange={e => setModal(m => ({ ...m, item: { ...m.item, title: e.target.value } }))}
              placeholder={modal.item.type==='meeting'?'Client meeting…':modal.item.type==='task'?'Follow up with…':'Quick note…'} style={{ ...input, marginBottom:12 }}/>

            {modal.item.type === 'meeting' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                <div><label style={lbl}>Date & time</label>
                  <input type="datetime-local" value={modal.item.start_at} onChange={e => setModal(m => ({ ...m, item: { ...m.item, start_at: e.target.value } }))} style={input}/></div>
                <div><label style={lbl}>Remind before</label>
                  <select value={modal.item.alert_minutes_before} onChange={e => setModal(m => ({ ...m, item: { ...m.item, alert_minutes_before: e.target.value } }))} style={input}>
                    <option value={0}>No reminder</option>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={60}>1 hour</option>
                    <option value={1440}>1 day</option>
                  </select></div>
              </div>
            )}

            {modal.item.type === 'task' && (
              <div style={{ marginBottom:12 }}>
                <label style={lbl}>Due date</label>
                <input type="date" value={modal.item.due_date} onChange={e => setModal(m => ({ ...m, item: { ...m.item, due_date: e.target.value } }))} style={input}/>
              </div>
            )}

            <label style={lbl}>Notes</label>
            <textarea value={modal.item.notes} onChange={e => setModal(m => ({ ...m, item: { ...m.item, notes: e.target.value } }))}
              rows={3} placeholder="Details…" style={{ ...input, resize:'vertical', minHeight:70, marginBottom:18 }}/>

            <div style={{ display:'flex', gap:9, alignItems:'center' }}>
              {!modal.isNew && (
                <button onClick={() => removeItem(modal.item.id)}
                  style={{ width:42, height:42, borderRadius:10, border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.08)', color:'#ef4444', cursor:'pointer', flexShrink:0 }}>
                  <i className="ti ti-trash" style={{ fontSize:17 }}/>
                </button>
              )}
              <button onClick={() => setModal(null)} style={{ flex:1, padding:'12px', borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--text2)', fontWeight:600, fontSize:14, cursor:'pointer' }}>Cancel</button>
              <button onClick={saveItem} disabled={saving} style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:'#22c55e', color:'#fff', fontWeight:600, fontSize:14, cursor:saving?'wait':'pointer', opacity:saving?0.7:1 }}>{saving?'Saving…':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const input = { width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--bg2,rgba(127,127,127,0.05))', color:'var(--text)', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
const lbl = { fontSize:12, color:'var(--text2)', display:'block', marginBottom:5, fontWeight:600 }
const btnGhost = { display:'flex', alignItems:'center', gap:5, padding:'9px 14px', borderRadius:9, border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer' }
const btnPrimary = { display:'flex', alignItems:'center', gap:5, padding:'9px 14px', borderRadius:9, border:'none', background:'#22c55e', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }
