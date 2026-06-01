import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { Trash2 } from 'lucide-react'

const QUESTION_TYPES = [
  { value: 'text',   label: 'Text answer' },
  { value: 'radio',  label: 'Multiple choice' },
  { value: 'select', label: 'Dropdown' },
]

const LEAD_STATUSES = [
  { value: 'new',            label: 'New',             color: '#03C1F5', bg: 'rgba(3,193,245,0.12)' },
  { value: 'qualified',      label: 'Qualified',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  { value: 'in_conversation',label: 'In Conversation', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  { value: 'proposal_given', label: 'Proposal Given',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { value: 'won',            label: 'Won',             color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  { value: 'lost',           label: 'Lost',            color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
]

/* premium card with corner glow */
function GlowCard({ glow, children, style, onClick }) {
  return (
    <div onClick={onClick} style={{ position:'relative', overflow:'hidden', background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:14, padding:16, ...style }}>
      {glow && <div style={{ position:'absolute', right:-22, top:-22, width:74, height:74, borderRadius:'50%', background:glow, filter:'blur(6px)', pointerEvents:'none' }}/>}
      <div style={{ position:'relative' }}>{children}</div>
    </div>
  )
}

/* minimal CSV parser — handles quoted fields & commas */
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i+1]
    if (inQuotes) {
      if (c === '"' && n === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') {}
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

export default function LeadsPage() {
  const { company } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('leads')
  const [forms, setForms] = useState([])
  const [editingForm, setEditingForm] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newFormTitle, setNewFormTitle] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState(null) // { rows, mapped }
  const fileRef = useRef(null)

  useEffect(() => { if (company) fetchAll() }, [company])

  async function fetchAll() {
    setLoading(true)
    const { data: formsData } = await supabase
      .from('lead_forms').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
    setForms(formsData || [])

    const { data: subData } = await supabase
      .from('lead_submissions').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
    setSubmissions(subData || [])
    setLoading(false)
  }

  async function fetchQuestions(formId) {
    const { data } = await supabase.from('lead_form_questions').select('*').eq('form_id', formId).order('order_num')
    setQuestions(data || [])
  }

  async function createForm() {
    if (!newFormTitle.trim()) { toast.error('Enter form title'); return }
    const { data, error } = await supabase.from('lead_forms').insert({ company_id: company.id, title: newFormTitle, is_active: forms.length === 0 }).select().single()
    if (error) { toast.error('Could not create form'); return }
    setNewFormTitle(''); setShowNewForm(false)
    await fetchAll(); openEditor(data)
    toast.success('Form created!')
  }

  async function openEditor(form) {
    setEditingForm(form)
    await fetchQuestions(form.id)
    setTab('editor')
  }

  async function setActive(formId) {
    await supabase.from('lead_forms').update({ is_active: false }).eq('company_id', company.id)
    await supabase.from('lead_forms').update({ is_active: true }).eq('id', formId)
    setForms(prev => prev.map(f => ({ ...f, is_active: f.id === formId })))
    toast.success('Form set as active!')
  }

  async function deleteForm(formId) {
    if (!window.confirm('Delete this form?')) return
    await supabase.from('lead_form_questions').delete().eq('form_id', formId)
    await supabase.from('lead_forms').delete().eq('id', formId)
    if (editingForm?.id === formId) { setEditingForm(null); setTab('forms') }
    await fetchAll(); toast.success('Form deleted')
  }

  async function saveForm() {
    setSaving(true)
    await supabase.from('lead_forms').update({ title: editingForm.title }).eq('id', editingForm.id)
    await supabase.from('lead_form_questions').delete().eq('form_id', editingForm.id)
    const toInsert = questions.map((q, i) => ({ form_id: editingForm.id, question: q.question, type: q.type, options: q.options || [], required: q.required, order_num: i }))
    if (toInsert.length > 0) await supabase.from('lead_form_questions').insert(toInsert)
    await fetchAll(); setSaving(false); toast.success('Form saved!')
  }

  async function updateLeadStatus(subId, status) {
    setUpdatingStatus(subId)
    await supabase.from('lead_submissions').update({ status, status_updated_at: new Date().toISOString() }).eq('id', subId)
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status } : s))
    setUpdatingStatus(null)
    toast.success('Status updated!')
  }

  function addQuestion() {
    setQuestions(prev => [...prev, { id: 'new-' + Date.now(), question: '', type: 'text', options: [], required: true, order_num: prev.length }])
  }
  function updateQuestion(id, field, value) { setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q)) }
  function deleteQuestion(id) { setQuestions(prev => prev.filter(q => q.id !== id)) }
  function addOption(qId) { setQuestions(prev => prev.map(q => q.id === qId ? { ...q, options: [...(q.options || []), ''] } : q)) }
  function updateOption(qId, idx, value) { setQuestions(prev => prev.map(q => q.id === qId ? { ...q, options: q.options.map((o, i) => i === idx ? value : o) } : q)) }
  function removeOption(qId, idx) { setQuestions(prev => prev.map(q => q.id === qId ? { ...q, options: q.options.filter((_, i) => i !== idx) } : q)) }

  /* ---------- CSV IMPORT ---------- */
  function onPickFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const rows = parseCSV(String(reader.result))
        if (rows.length < 2) { toast.error('CSV empty or no data rows'); return }
        const header = rows[0].map(h => h.trim().toLowerCase())
        const findCol = (...names) => header.findIndex(h => names.some(n => h.includes(n)))
        const iName  = findCol('name', 'full name')
        const iPhone = findCol('phone', 'mobile', 'whatsapp', 'contact', 'number')
        const iEmail = findCol('email', 'e-mail')
        const mapped = rows.slice(1).map(r => {
          const answers = {}
          header.forEach((h, idx) => {
            if (idx !== iName && idx !== iPhone && idx !== iEmail && r[idx]?.trim())
              answers[rows[0][idx].trim()] = r[idx].trim()
          })
          return {
            name:  iName  >= 0 ? (r[iName]  || '').trim() : '',
            phone: iPhone >= 0 ? (r[iPhone] || '').trim() : '',
            email: iEmail >= 0 ? (r[iEmail] || '').trim() : '',
            answers,
          }
        }).filter(m => m.name || m.phone || m.email)
        setImportPreview({ count: mapped.length, mapped })
      } catch {
        toast.error('Could not read CSV')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function confirmImport() {
    if (!importPreview?.mapped?.length) return
    setImporting(true)
    const toInsert = importPreview.mapped.map(m => ({
      company_id: company.id,
      name: m.name || 'Imported Lead',
      phone: m.phone || null,
      email: m.email || null,
      answers: m.answers || {},
      status: 'new',
      source: 'import',
      created_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('lead_submissions').insert(toInsert)
    setImporting(false)
    if (error) { toast.error('Import failed: ' + error.message); return }
    setImportPreview(null)
    await fetchAll()
    setTab('leads')
    toast.success(toInsert.length + ' leads imported!')
  }

  const statusConfig = (status) => LEAD_STATUSES.find(s => s.value === status) || LEAD_STATUSES[0]

  const wonCount = submissions.filter(s => s.status === 'won').length
  const lostCount = submissions.filter(s => s.status === 'lost').length
  const activeCount = submissions.filter(s => !['won', 'lost'].includes(s.status)).length

  const inputStyle = { padding:'10px 14px', border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', borderRadius:8, fontSize:14, fontFamily:'inherit', outline:'none' }
  const sectionTitle = { fontSize:11, fontWeight:700, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.04em' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>

  return (
    <div className="page-content animate-in" style={{ color:'var(--text)' }}>
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap:12, flexWrap:'wrap' }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize: 23, marginBottom: 4 }}>Leads</h1>
          <p style={{ fontSize: 13, color:'var(--text2)' }}>Forms banao · CSV se import karo · inquiry se close tak track</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            <i className="ti ti-upload" style={{ fontSize:14 }}/> Import CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewForm(true)}>+ New Form</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onPickFile} style={{ display:'none' }} />
        </div>
      </div>

      {/* IMPORT PREVIEW */}
      {importPreview && (
        <GlowCard glow="rgba(16,185,129,0.14)" style={{ marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{importPreview.count} leads ready to import</div>
              <div style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>
                CSV se name / phone / email auto-detect hue. Baaki columns answers mein save honge. Source = "Imported".
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setImportPreview(null)} disabled={importing}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={confirmImport} disabled={importing}>{importing ? 'Importing...' : 'Confirm Import'}</button>
            </div>
          </div>
        </GlowCard>
      )}

      {showNewForm && (
        <GlowCard glow="rgba(232,184,75,0.12)" style={{ marginBottom: 18 }}>
          <div style={{ ...sectionTitle, marginBottom: 12 }}>New Form</div>
          <div style={{ display: 'flex', gap: 10, flexWrap:'wrap' }}>
            <input value={newFormTitle} onChange={e => setNewFormTitle(e.target.value)} placeholder="Form title e.g. Interior Design Inquiry"
              style={{ ...inputStyle, flex: 1, minWidth:200 }} onKeyDown={e => e.key === 'Enter' && createForm()} />
            <button className="btn btn-primary btn-sm" onClick={createForm}>Create</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNewForm(false)}>Cancel</button>
          </div>
        </GlowCard>
      )}

      {/* TABS */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'leads',  label: 'Leads (' + submissions.length + ')' },
          { id: 'forms',  label: 'All Forms (' + forms.length + ')' },
          { id: 'editor', label: editingForm ? 'Editing: ' + editingForm.title : 'Editor', disabled: !editingForm },
        ].map(t => (
          <button key={t.id} onClick={() => !t.disabled && setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', background: 'none', cursor: t.disabled ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            color: t.disabled ? 'var(--text3)' : tab === t.id ? 'var(--primary)' : 'var(--text2)',
            borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -1, opacity: t.disabled ? 0.5 : 1
          }}>{t.label}</button>
        ))}
      </div>

      {/* LEADS TAB */}
      {tab === 'leads' && (
        <div>
          {submissions.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 18 }}>
              {[
                { label: 'Active Leads', value: activeCount, color: '#03C1F5', glow:'rgba(3,193,245,0.16)' },
                { label: 'Won',          value: wonCount,    color: '#10b981', glow:'rgba(16,185,129,0.16)' },
                { label: 'Lost',         value: lostCount,   color: '#ef4444', glow:'rgba(239,68,68,0.16)' },
              ].map(s => (
                <GlowCard key={s.label} glow={s.glow} style={{ textAlign:'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{s.label}</div>
                </GlowCard>
              ))}
            </div>
          )}

          {submissions.length === 0 ? (
            <GlowCard glow="rgba(3,193,245,0.1)" style={{ textAlign: 'center', padding: '54px 20px' }}>
              <div style={{ fontSize: 46, marginBottom: 14 }}>📭</div>
              <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, color:'var(--text)' }}>No leads yet</h3>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom:18 }}>Customer form bhare ya CSV import karo — leads yahan aayenge</p>
              <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                <i className="ti ti-upload" style={{ fontSize:14 }}/> Import CSV
              </button>
            </GlowCard>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {submissions.map(sub => {
                const sc = statusConfig(sub.status || 'new')
                const isImport = sub.source === 'import'
                return (
                  <GlowCard key={sub.id} glow="rgba(3,193,245,0.08)">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap:10, flexWrap:'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(3,193,245,0.14)', color: '#03C1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                          {(sub.name || 'A')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color:'var(--text)' }}>{sub.name || 'Anonymous'}</div>
                          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{sub.phone}{sub.email && ' · ' + sub.email}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {new Date(sub.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span style={{ background: isImport ? 'rgba(139,92,246,0.14)' : 'rgba(3,193,245,0.14)', color: isImport ? '#a78bfa' : '#03C1F5', fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 99 }}>
                          {isImport ? 'Imported' : 'TrustDubai lead'}
                        </span>
                      </div>
                    </div>

                    {sub.answers && Object.keys(sub.answers).length > 0 && (
                      <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        {Object.entries(sub.answers).map(([q, a]) => (
                          <div key={q} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
                            <span style={{ color: 'var(--text2)', minWidth: 140 }}>{q}:</span>
                            <span style={{ color: 'var(--text)', fontWeight: 500 }}>{String(a)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <select value={sub.status || 'new'} onChange={e => updateLeadStatus(sub.id, e.target.value)} disabled={updatingStatus === sub.id}
                        style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid ' + sc.color, background: sc.bg, color: sc.color, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {LEAD_STATUSES.map(s => <option key={s.value} value={s.value} style={{ color:'#0f172a' }}>{s.label}</option>)}
                      </select>

                      {sub.phone && (
                        <button onClick={() => window.open('https://wa.me/' + sub.phone.replace(/[^0-9]/g, '') + '?text=Hi ' + (sub.name || '') + ', I received your inquiry from TrustDubai. How can I help you?', '_blank')}
                          style={{ padding: '6px 14px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                          💬 WhatsApp
                        </button>
                      )}

                      {sub.status_updated_at && (
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                          Updated {new Date(sub.status_updated_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </GlowCard>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* FORMS TAB */}
      {tab === 'forms' && (
        <div>
          {forms.length === 0 ? (
            <GlowCard glow="rgba(232,184,75,0.1)" style={{ textAlign: 'center', padding: '54px 20px' }}>
              <div style={{ fontSize: 46, marginBottom: 14 }}>📋</div>
              <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, color:'var(--text)' }}>No forms yet</h3>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Apna pehla lead form banao</p>
              <button className="btn btn-primary" onClick={() => setShowNewForm(true)}>+ Create Form</button>
            </GlowCard>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {forms.map(form => (
                <GlowCard key={form.id} glow="rgba(3,193,245,0.08)" style={{ borderColor: form.is_active ? '#03C1F5' : 'var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap:'wrap' }}>
                    <div style={{ flex: 1, minWidth:180 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color:'var(--text)' }}>{form.title}</div>
                        {form.is_active && <span style={{ background: 'rgba(3,193,245,0.14)', color: '#03C1F5', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, border: '1px solid #03C1F5' }}>LIVE</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>Created {new Date(form.created_at).toLocaleDateString('en-AE')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!form.is_active && <button className="btn btn-sm btn-secondary" onClick={() => setActive(form.id)}>Set as Active</button>}
                      <button className="btn btn-sm btn-primary" onClick={() => openEditor(form)}>Edit</button>
                      <button onClick={() => deleteForm(form.id)} style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </GlowCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EDITOR TAB */}
      {tab === 'editor' && editingForm && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18 }}>
          <div>
            <GlowCard glow="rgba(232,184,75,0.1)" style={{ marginBottom: 14 }}>
              <div style={{ ...sectionTitle, marginBottom: 12 }}>Form Title</div>
              <input value={editingForm.title} onChange={e => setEditingForm(prev => ({ ...prev, title: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </GlowCard>
            <GlowCard glow="rgba(3,193,245,0.08)">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={sectionTitle}>Questions</div>
                <button className="btn btn-sm btn-secondary" onClick={addQuestion}>+ Add Question</button>
              </div>
              {questions.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 13 }}>No questions yet</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {questions.map((q, i) => (
                  <div key={q.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--bg2)' }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap:'wrap' }}>
                      <input value={q.question} onChange={e => updateQuestion(q.id, 'question', e.target.value)} placeholder={'Question ' + (i + 1)}
                        style={{ ...inputStyle, flex: 1, minWidth:160, padding:'8px 12px', fontSize:13 }} />
                      <select value={q.type} onChange={e => updateQuestion(q.id, 'type', e.target.value)}
                        style={{ ...inputStyle, padding: '8px 10px', fontSize: 12 }}>
                        {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button onClick={() => deleteQuestion(q.id)} style={{ padding: '8px', border: 'none', background: 'rgba(239,68,68,0.12)', borderRadius: 6, cursor: 'pointer', color: '#ef4444' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {(q.type === 'radio' || q.type === 'select') && (
                      <div style={{ paddingLeft: 8 }}>
                        {(q.options || []).map((opt, oi) => (
                          <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                            <input value={opt} onChange={e => updateOption(q.id, oi, e.target.value)} placeholder={'Option ' + (oi + 1)}
                              style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: 12 }} />
                            <button onClick={() => removeOption(q.id, oi)} style={{ padding: '6px 8px', border: 'none', background: 'rgba(239,68,68,0.12)', borderRadius: 6, cursor: 'pointer', color: '#ef4444', fontSize: 12 }}>✕</button>
                          </div>
                        ))}
                        <button onClick={() => addOption(q.id)} style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add option</button>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <input type="checkbox" checked={q.required} onChange={e => updateQuestion(q.id, 'required', e.target.checked)} id={'req-' + q.id} />
                      <label htmlFor={'req-' + q.id} style={{ fontSize: 12, color: 'var(--text2)' }}>Required</label>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" onClick={saveForm} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Saving...' : 'Save Form'}</button>
                <button className="btn btn-secondary" onClick={() => setTab('forms')}>Back</button>
              </div>
            </GlowCard>
          </div>
          <div>
            <GlowCard glow="rgba(3,193,245,0.08)" style={{ position: 'sticky', top: 20 }}>
              <div style={{ ...sectionTitle, marginBottom: 16 }}>Live Preview</div>
              <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color:'var(--text)' }}>{editingForm.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>Fill this form to get a response</div>
                {questions.map((q, i) => (
                  <div key={q.id} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                      {q.question || 'Question ' + (i + 1)}{q.required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
                    </label>
                    {q.type === 'text' && <input disabled placeholder="Customer answer..." style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--card)', color:'var(--text3)' }} />}
                    {q.type === 'select' && <select disabled style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--card)', color:'var(--text3)' }}><option>Select an option</option>{(q.options || []).map((o, i) => <option key={i}>{o}</option>)}</select>}
                    {q.type === 'radio' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{(q.options || []).map((o, i) => <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}><input type="radio" disabled /> {o || 'Option ' + (i + 1)}</label>)}</div>}
                  </div>
                ))}
                <div style={{ background: '#03C1F5', color: '#fff', textAlign: 'center', padding: '8px', borderRadius: 20, fontSize: 13, fontWeight: 500, marginTop: 8 }}>Submit — Get Quote</div>
                <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: 'var(--text3)' }}>Powered by TrustDubai</div>
              </div>
            </GlowCard>
          </div>
        </div>
      )}
    </div>
  )
}
