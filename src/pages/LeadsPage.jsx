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

const STATUS_MAP = {
  'new':'new', 'contacted':'in_conversation', 'in conversation':'in_conversation',
  'interested':'qualified', 'qualified':'qualified',
  'proposal sent':'proposal_given', 'proposal given':'proposal_given', 'proposal':'proposal_given',
  'won':'won', 'lost':'lost',
}

export default function LeadsPage() {
  const { company } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const [tab, setTab] = useState('leads')
  const [forms, setForms] = useState([])
  const [editingForm, setEditingForm] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [newFormTitle, setNewFormTitle] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(null)
  // view + filters
  const [view, setView] = useState('table')        // table | compact | cards
  const [search, setSearch] = useState('')
  const [fSource, setFSource] = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [expanded, setExpanded] = useState(null)

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

  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (q) { if (c === '"' && text[i+1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
      else { if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = '' } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' } else if (c === '\r') {} else cur += c }
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row) }
    return rows.filter(r => r.some(c => c.trim()))
  }

  async function handleCSV(e) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      if (rows.length < 2) { toast.error('CSV empty or invalid'); setImporting(false); return }
      const head = rows[0].map(h => h.trim().toLowerCase())
      const idx = (names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i } return -1 }
      const ci = {
        name: idx(['name','client name','full name']), phone: idx(['phone','whatsapp','primary contact','mobile','contact']),
        email: idx(['email','e-mail']), type: idx(['project type','type','scope','service']),
        loc: idx(['location','area','city']), budget: idx(['budget','budget (aed)','amount','value']),
        source: idx(['source','lead source']), status: idx(['status']), notes: idx(['notes','note','remarks']),
      }
      if (ci.name < 0) { toast.error('CSV mein "Name" column nahi mila'); setImporting(false); return }
      const records = []
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]; const get = (k) => ci[k] >= 0 ? (row[ci[k]] || '').trim() : ''
        const name = get('name'); if (!name) continue
        const status = STATUS_MAP[get('status').toLowerCase()] || 'new'
        let phone = get('phone'); if (phone === name) phone = ''
        let email = get('email'); if (email === name || !email.includes('@')) email = ''
        const answers = {}
        const t = get('type'), l = get('loc'), b = get('budget'), s = get('source'), nn = get('notes')
        if (t && t !== name) answers['Project Type'] = t
        if (l && l !== name) answers['Location'] = l
        if (b && b !== name) answers['Budget (AED)'] = b
        if (s && s !== name) answers['Source'] = s
        if (nn && nn !== name) answers['Notes'] = nn
        records.push({ company_id: company.id, name, phone, email, status, status_updated_at: new Date().toISOString(), answers })
      }
      if (records.length === 0) { toast.error('Koi valid lead nahi mila'); setImporting(false); return }
      let ok = 0
      for (let i = 0; i < records.length; i += 50) {
        const chunk = records.slice(i, i + 50)
        const { error } = await supabase.from('lead_submissions').insert(chunk)
        if (!error) ok += chunk.length
      }
      await fetchAll(); toast.success(`${ok} leads imported!`); setTab('leads')
    } catch (err) { console.error(err); toast.error('Import failed — CSV format check karo') }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const statusConfig = (s) => LEAD_STATUSES.find(x => x.value === s) || LEAD_STATUSES[0]

  const sourceBadge = (sub) => {
    const src = (sub.answers?.Source || '').toLowerCase()
    if (src.includes('meta') || src.includes('facebook') || src.includes('instagram')) return { key:'meta', label: 'Meta Ads', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' }
    if (src.includes('whatsapp')) return { key:'whatsapp', label: 'WhatsApp', color: '#25D366', bg: 'rgba(37,211,102,0.12)' }
    if (src.includes('referral')) return { key:'referral', label: 'Referral', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' }
    if (src) return { key:'other', label: sub.answers.Source, color: '#64748b', bg: 'var(--bg2)' }
    return { key:'trustdubai', label: 'TrustDubai', color: '#03C1F5', bg: 'rgba(3,193,245,0.12)' }
  }

  // filtered list
  const filtered = submissions.filter(s => {
    const q = search.trim().toLowerCase()
    if (q && !(`${s.name || ''} ${s.phone || ''} ${s.email || ''}`.toLowerCase().includes(q))) return false
    if (fStatus !== 'all' && (s.status || 'new') !== fStatus) return false
    if (fSource !== 'all' && sourceBadge(s).key !== fSource) return false
    return true
  })

  const wonCount = submissions.filter(s => s.status === 'won').length
  const lostCount = submissions.filter(s => s.status === 'lost').length
  const activeCount = submissions.filter(s => !['won', 'lost'].includes(s.status)).length

  const card = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 16 }
  const waMsg = (sub) => 'https://wa.me/' + (sub.phone || '').replace(/[^0-9]/g, '') + '?text=Hi ' + (sub.name || '') + ', I received your inquiry from TrustDubai. How can I help you?'

  const SOURCES = [
    { k:'all', l:'All Sources' }, { k:'trustdubai', l:'TrustDubai' }, { k:'whatsapp', l:'WhatsApp' },
    { k:'meta', l:'Meta Ads' }, { k:'referral', l:'Referral' },
  ]

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>

  return (
    <div className="page-content animate-in" style={{ color: 'var(--text)' }}>
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize: 23, marginBottom: 4, color: 'var(--text)' }}>Lead Hub</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Forms banao, leads import karo, inquiry se close tak track karo</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNewForm(true)}>+ New Form</button>
      </div>

      {showNewForm && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>New Form</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input value={newFormTitle} onChange={e => setNewFormTitle(e.target.value)} placeholder="Form title e.g. Interior Design Inquiry"
              style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              onKeyDown={e => e.key === 'Enter' && createForm()} />
            <button className="btn btn-primary btn-sm" onClick={createForm}>Create</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNewForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'forms',  label: 'All Forms (' + forms.length + ')' },
          { id: 'editor', label: editingForm ? 'Editing: ' + editingForm.title : 'Editor', disabled: !editingForm },
          { id: 'leads',  label: 'Leads (' + submissions.length + ')' },
        ].map(t => (
          <button key={t.id} onClick={() => !t.disabled && setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', background: 'none', cursor: t.disabled ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            color: t.disabled ? 'var(--text3)' : tab === t.id ? 'var(--primary)' : 'var(--text2)',
            borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, opacity: t.disabled ? 0.5 : 1
          }}>{t.label}</button>
        ))}
      </div>

      {/* FORMS TAB */}
      {tab === 'forms' && (
        <div>
          {forms.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>No forms yet</h3>
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>Create your first lead form</p>
              <button className="btn btn-primary" onClick={() => setShowNewForm(true)}>+ Create Form</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {forms.map(form => (
                <div key={form.id} style={{ ...card, borderColor: form.is_active ? 'var(--primary)' : 'var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{form.title}</div>
                        {form.is_active && <span style={{ background: 'rgba(3,193,245,0.12)', color: '#03C1F5', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, border: '1px solid #03C1F5' }}>LIVE</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>Created {new Date(form.created_at).toLocaleDateString('en-AE')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!form.is_active && <button className="btn btn-sm btn-secondary" onClick={() => setActive(form.id)}>Set as Active</button>}
                      <button className="btn btn-sm btn-primary" onClick={() => openEditor(form)}>Edit</button>
                      <button onClick={() => deleteForm(form.id)} style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'none', borderRadius: 6, cursor: 'pointer' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EDITOR TAB */}
      {tab === 'editor' && editingForm && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
          <div>
            <div style={{ ...card, marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Form Title</div>
              <input value={editingForm.title} onChange={e => setEditingForm(prev => ({ ...prev, title: e.target.value }))}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }} />
            </div>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="card-title">Questions</div>
                <button className="btn btn-sm btn-secondary" onClick={addQuestion}>+ Add Question</button>
              </div>
              {questions.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 13 }}>No questions yet</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {questions.map((q, i) => (
                  <div key={q.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--bg2)' }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                      <input value={q.question} onChange={e => updateQuestion(q.id, 'question', e.target.value)} placeholder={'Question ' + (i + 1)}
                        style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
                      <select value={q.type} onChange={e => updateQuestion(q.id, 'type', e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--text)' }}>
                        {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button onClick={() => deleteQuestion(q.id)} style={{ padding: '8px', border: 'none', background: 'rgba(239,68,68,0.12)', borderRadius: 6, cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
                    </div>
                    {(q.type === 'radio' || q.type === 'select') && (
                      <div style={{ paddingLeft: 8 }}>
                        {(q.options || []).map((opt, oi) => (
                          <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                            <input value={opt} onChange={e => updateOption(q.id, oi, e.target.value)} placeholder={'Option ' + (oi + 1)}
                              style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }} />
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
            </div>
          </div>
          <div>
            <div style={{ ...card, position: 'sticky', top: 20 }}>
              <div className="card-title" style={{ marginBottom: 16 }}>Live Preview</div>
              <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{editingForm.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>Fill this form to get a response</div>
                {questions.map((q, i) => (
                  <div key={q.id} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>
                      {q.question || 'Question ' + (i + 1)}{q.required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
                    </label>
                    {q.type === 'text' && <input disabled placeholder="Customer answer..." style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--card)', color: 'var(--text)' }} />}
                    {q.type === 'select' && <select disabled style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--card)', color: 'var(--text)' }}><option>Select an option</option>{(q.options || []).map((o, i) => <option key={i}>{o}</option>)}</select>}
                    {q.type === 'radio' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{(q.options || []).map((o, i) => <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}><input type="radio" disabled /> {o || 'Option ' + (i + 1)}</label>)}</div>}
                  </div>
                ))}
                <div style={{ background: '#03C1F5', color: '#fff', textAlign: 'center', padding: '8px', borderRadius: 20, fontSize: 13, fontWeight: 500, marginTop: 8 }}>Submit — Get Quote</div>
                <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: 'var(--text3)' }}>Powered by TrustDubai</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LEADS TAB */}
      {tab === 'leads' && (
        <div>
          {/* stat cards */}
          {submissions.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Active Leads', value: activeCount, color: '#03C1F5', glow: 'rgba(3,193,245,0.16)' },
                { label: 'Won', value: wonCount, color: '#10b981', glow: 'rgba(16,185,129,0.16)' },
                { label: 'Lost', value: lostCount, color: '#ef4444', glow: 'rgba(239,68,68,0.16)' },
              ].map(s => (
                <div key={s.label} style={{ ...card, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', right: -20, top: -20, width: 64, height: 64, borderRadius: '50%', background: s.glow, filter: 'blur(6px)' }} />
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color, position: 'relative' }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, position: 'relative' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* toolbar: search + filters + view + import */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', flex: '1 1 220px', minWidth: 180 }}>
              <i className="ti ti-search" style={{ fontSize: 14, color: 'var(--text3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..."
                style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', width: '100%', fontFamily: 'inherit' }} />
            </div>
            <select value={fSource} onChange={e => setFSource(e.target.value)}
              style={{ padding: '7px 10px', border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--text)', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>
              {SOURCES.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}
            </select>
            <select value={fStatus} onChange={e => setFStatus(e.target.value)}
              style={{ padding: '7px 10px', border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--text)', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="all">All Status</option>
              {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {/* view toggle */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 8, padding: 2 }}>
              {[['table','ti-table'],['compact','ti-list'],['cards','ti-layout-grid']].map(([v,ic]) => (
                <button key={v} onClick={() => setView(v)} title={v}
                  style={{ padding: '6px 9px', border: 'none', borderRadius: 6, cursor: 'pointer', background: view === v ? 'var(--card)' : 'transparent', color: view === v ? 'var(--primary)' : 'var(--text3)' }}>
                  <i className={`ti ${ic}`} style={{ fontSize: 15 }} />
                </button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: 'none' }} />
            <button className="btn btn-secondary btn-sm" disabled={importing} onClick={() => fileRef.current?.click()}>
              {importing ? 'Importing...' : '⬆ Import CSV'}
            </button>
          </div>

          {submissions.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>No leads yet</h3>
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>Form se aaye leads yahan dikhenge — ya CSV import karo</p>
              <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>⬆ Import CSV</button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>No leads match your filter</div>
          ) : view === 'table' ? (
            /* ---------- TABLE VIEW ---------- */
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                      <th style={{ textAlign: 'left', padding: '11px 14px', fontWeight: 600 }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '11px 10px', fontWeight: 600 }}>Contact</th>
                      <th style={{ textAlign: 'left', padding: '11px 10px', fontWeight: 600 }}>Source</th>
                      <th style={{ textAlign: 'left', padding: '11px 10px', fontWeight: 600 }}>Status</th>
                      <th style={{ textAlign: 'right', padding: '11px 14px', fontWeight: 600 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(sub => {
                      const sc = statusConfig(sub.status || 'new'); const sb = sourceBadge(sub)
                      const isOpen = expanded === sub.id
                      return (
                        <>
                          <tr key={sub.id} onClick={() => setExpanded(isOpen ? null : sub.id)}
                            style={{ borderTop: '0.5px solid var(--border)', cursor: 'pointer' }}>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(3,193,245,0.12)', color: '#03C1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(sub.name || 'A')[0].toUpperCase()}</div>
                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{sub.name || 'Anonymous'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px', color: 'var(--text2)', fontSize: 12 }}>{sub.phone || '—'}</td>
                            <td style={{ padding: '10px' }}><span style={{ background: sb.bg, color: sb.color, fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>{sb.label}</span></td>
                            <td style={{ padding: '10px' }}>
                              <select value={sub.status || 'new'} onClick={e => e.stopPropagation()} onChange={e => updateLeadStatus(sub.id, e.target.value)} disabled={updatingStatus === sub.id}
                                style={{ padding: '4px 8px', borderRadius: 20, border: '1px solid ' + sc.color, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {LEAD_STATUSES.map(s => <option key={s.value} value={s.value} style={{ background: 'var(--card)', color: 'var(--text)' }}>{s.label}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              {sub.phone && <button onClick={e => { e.stopPropagation(); window.open(waMsg(sub), '_blank') }} style={{ padding: '5px 10px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>WhatsApp</button>}
                            </td>
                          </tr>
                          {isOpen && (sub.answers && Object.keys(sub.answers).length > 0) && (
                            <tr key={sub.id + '-x'}>
                              <td colSpan={5} style={{ padding: '0 14px 12px' }}>
                                <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>
                                  {Object.entries(sub.answers).map(([q, a]) => (
                                    <div key={q} style={{ fontSize: 12 }}><span style={{ color: 'var(--text3)' }}>{q}: </span><span style={{ color: 'var(--text)', fontWeight: 500 }}>{a}</span></div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : view === 'compact' ? (
            /* ---------- COMPACT VIEW ---------- */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(sub => {
                const sc = statusConfig(sub.status || 'new'); const sb = sourceBadge(sub)
                return (
                  <div key={sub.id} style={{ ...card, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(3,193,245,0.12)', color: '#03C1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{(sub.name || 'A')[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{sub.name || 'Anonymous'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{sub.phone || '—'}{sub.answers?.['Project Type'] ? ' · ' + sub.answers['Project Type'] : ''}</div>
                    </div>
                    <span style={{ background: sb.bg, color: sb.color, fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>{sb.label}</span>
                    <select value={sub.status || 'new'} onChange={e => updateLeadStatus(sub.id, e.target.value)} disabled={updatingStatus === sub.id}
                      style={{ padding: '4px 8px', borderRadius: 20, border: '1px solid ' + sc.color, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {LEAD_STATUSES.map(s => <option key={s.value} value={s.value} style={{ background: 'var(--card)', color: 'var(--text)' }}>{s.label}</option>)}
                    </select>
                    {sub.phone && <button onClick={() => window.open(waMsg(sub), '_blank')} style={{ padding: '5px 10px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>WhatsApp</button>}
                  </div>
                )
              })}
            </div>
          ) : (
            /* ---------- CARDS VIEW (2-col compact) ---------- */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
              {filtered.map(sub => {
                const sc = statusConfig(sub.status || 'new'); const sb = sourceBadge(sub)
                return (
                  <div key={sub.id} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(3,193,245,0.12)', color: '#03C1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{(sub.name || 'A')[0].toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{sub.name || 'Anonymous'}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{sub.phone || '—'}</div>
                        </div>
                      </div>
                      <span style={{ background: sb.bg, color: sb.color, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99 }}>{sb.label}</span>
                    </div>
                    {sub.answers?.['Project Type'] && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>{sub.answers['Project Type']}{sub.answers['Budget (AED)'] ? ' · AED ' + sub.answers['Budget (AED)'] : ''}</div>}
                    {sub.answers?.['Location'] && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10 }}>📍 {sub.answers['Location']}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '0.5px solid var(--border)', paddingTop: 10 }}>
                      <select value={sub.status || 'new'} onChange={e => updateLeadStatus(sub.id, e.target.value)} disabled={updatingStatus === sub.id}
                        style={{ padding: '4px 8px', borderRadius: 20, border: '1px solid ' + sc.color, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flex: 1 }}>
                        {LEAD_STATUSES.map(s => <option key={s.value} value={s.value} style={{ background: 'var(--card)', color: 'var(--text)' }}>{s.label}</option>)}
                      </select>
                      {sub.phone && <button onClick={() => window.open(waMsg(sub), '_blank')} style={{ padding: '5px 12px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>WhatsApp</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
