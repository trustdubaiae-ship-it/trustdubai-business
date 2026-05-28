import { useState, useEffect } from 'react'
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
  { value: 'new',           label: 'New',             color: '#03C1F5', bg: '#e0f9ff' },
  { value: 'qualified',     label: 'Qualified',       color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'in_conversation',label: 'In Conversation', color: '#3b82f6', bg: '#eff6ff' },
  { value: 'proposal_given',label: 'Proposal Given',  color: '#f59e0b', bg: '#fef9ed' },
  { value: 'won',           label: 'Won',             color: '#10b981', bg: '#ecfdf5' },
  { value: 'lost',          label: 'Lost',            color: '#ef4444', bg: '#fef2f2' },
]

export default function LeadsPage() {
  const { company } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('forms')
  const [forms, setForms] = useState([])
  const [editingForm, setEditingForm] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newFormTitle, setNewFormTitle] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(null)

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

  const statusConfig = (status) => LEAD_STATUSES.find(s => s.value === status) || LEAD_STATUSES[0]

  // Lead stats
  const wonCount = submissions.filter(s => s.status === 'won').length
  const lostCount = submissions.filter(s => s.status === 'lost').length
  const activeCount = submissions.filter(s => !['won', 'lost'].includes(s.status)).length

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading...</div>

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Lead Forms</h1>
          <p className="text-secondary" style={{ fontSize: 14 }}>Create forms — track leads from inquiry to close</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNewForm(true)}>+ New Form</button>
      </div>

      {showNewForm && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>New Form</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input value={newFormTitle} onChange={e => setNewFormTitle(e.target.value)} placeholder="Form title e.g. Interior Design Inquiry"
              style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
              onKeyDown={e => e.key === 'Enter' && createForm()} />
            <button className="btn btn-primary btn-sm" onClick={createForm}>Create</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNewForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--card-border)' }}>
        {[
          { id: 'forms',  label: 'All Forms (' + forms.length + ')' },
          { id: 'editor', label: editingForm ? 'Editing: ' + editingForm.title : 'Editor', disabled: !editingForm },
          { id: 'leads',  label: 'Leads (' + submissions.length + ')' },
        ].map(t => (
          <button key={t.id} onClick={() => !t.disabled && setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', background: 'none', cursor: t.disabled ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            color: t.disabled ? 'var(--text-muted)' : tab === t.id ? 'var(--primary)' : 'var(--text-secondary)',
            borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -1, opacity: t.disabled ? 0.5 : 1
          }}>{t.label}</button>
        ))}
      </div>

      {/* FORMS TAB */}
      {tab === 'forms' && (
        <div>
          {forms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No forms yet</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>Create your first lead form</p>
              <button className="btn btn-primary" onClick={() => setShowNewForm(true)}>+ Create Form</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {forms.map(form => (
                <div key={form.id} className="card" style={{ borderColor: form.is_active ? '#03C1F5' : 'var(--card-border)', borderWidth: form.is_active ? 2 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{form.title}</div>
                        {form.is_active && <span style={{ background: '#e0f9ff', color: '#03C1F5', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, border: '1px solid #03C1F5' }}>LIVE</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Created {new Date(form.created_at).toLocaleDateString('en-AE')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!form.is_active && <button className="btn btn-sm btn-secondary" onClick={() => setActive(form.id)}>Set as Active</button>}
                      <button className="btn btn-sm btn-primary" onClick={() => openEditor(form)}>Edit</button>
                      <button onClick={() => deleteForm(form.id)} style={{ padding: '6px 10px', background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
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
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Form Title</div>
              <input value={editingForm.title} onChange={e => setEditingForm(prev => ({ ...prev, title: e.target.value }))}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }} />
            </div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="card-title">Questions</div>
                <button className="btn btn-sm btn-secondary" onClick={addQuestion}>+ Add Question</button>
              </div>
              {questions.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>No questions yet</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {questions.map((q, i) => (
                  <div key={q.id} style={{ border: '1px solid var(--card-border)', borderRadius: 10, padding: 14, background: 'var(--bg)' }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                      <input value={q.question} onChange={e => updateQuestion(q.id, 'question', e.target.value)} placeholder={'Question ' + (i + 1)}
                        style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
                      <select value={q.type} onChange={e => updateQuestion(q.id, 'type', e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: 'var(--card-bg)' }}>
                        {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <button onClick={() => deleteQuestion(q.id)} style={{ padding: '8px', border: 'none', background: '#fef2f2', borderRadius: 6, cursor: 'pointer', color: '#ef4444' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {(q.type === 'radio' || q.type === 'select') && (
                      <div style={{ paddingLeft: 8 }}>
                        {(q.options || []).map((opt, oi) => (
                          <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                            <input value={opt} onChange={e => updateOption(q.id, oi, e.target.value)} placeholder={'Option ' + (oi + 1)}
                              style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }} />
                            <button onClick={() => removeOption(q.id, oi)} style={{ padding: '6px 8px', border: 'none', background: '#fef2f2', borderRadius: 6, cursor: 'pointer', color: '#ef4444', fontSize: 12 }}>✕</button>
                          </div>
                        ))}
                        <button onClick={() => addOption(q.id)} style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add option</button>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <input type="checkbox" checked={q.required} onChange={e => updateQuestion(q.id, 'required', e.target.checked)} id={'req-' + q.id} />
                      <label htmlFor={'req-' + q.id} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Required</label>
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
            <div className="card" style={{ position: 'sticky', top: 20 }}>
              <div className="card-title" style={{ marginBottom: 16 }}>Live Preview</div>
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{editingForm.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Fill this form to get a response</div>
                {questions.map((q, i) => (
                  <div key={q.id} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
                      {q.question || 'Question ' + (i + 1)}{q.required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
                    </label>
                    {q.type === 'text' && <input disabled placeholder="Customer answer..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, background: '#fff' }} />}
                    {q.type === 'select' && <select disabled style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, background: '#fff' }}><option>Select an option</option>{(q.options || []).map((o, i) => <option key={i}>{o}</option>)}</select>}
                    {q.type === 'radio' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{(q.options || []).map((o, i) => <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}><input type="radio" disabled /> {o || 'Option ' + (i + 1)}</label>)}</div>}
                  </div>
                ))}
                <div style={{ background: '#03C1F5', color: '#fff', textAlign: 'center', padding: '8px', borderRadius: 20, fontSize: 13, fontWeight: 500, marginTop: 8 }}>Submit — Get Quote</div>
                <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: '#9ca3af' }}>Powered by TrustDubai</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LEADS TAB */}
      {tab === 'leads' && (
        <div>
          {/* Stats */}
          {submissions.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Active Leads', value: activeCount, color: '#03C1F5' },
                { label: 'Won', value: wonCount, color: '#10b981' },
                { label: 'Lost', value: lostCount, color: '#ef4444' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {submissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No leads yet</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>When customers fill your form, leads will appear here</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {submissions.map(sub => {
                const sc = statusConfig(sub.status || 'new')
                return (
                  <div key={sub.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e0f9ff', color: '#03C1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>
                          {(sub.name || 'A')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{sub.name || 'Anonymous'}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub.phone}{sub.email && ' · ' + sub.email}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(sub.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span style={{ background: '#e0f9ff', color: '#03C1F5', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99 }}>
                          Lead from TrustDubai
                        </span>
                      </div>
                    </div>

                    {sub.answers && Object.keys(sub.answers).length > 0 && (
                      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        {Object.entries(sub.answers).map(([q, a]) => (
                          <div key={q} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
                            <span style={{ color: 'var(--text-secondary)', minWidth: 140 }}>{q}:</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{a}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Status + Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <select
                        value={sub.status || 'new'}
                        onChange={e => updateLeadStatus(sub.id, e.target.value)}
                        disabled={updatingStatus === sub.id}
                        style={{
                          padding: '6px 12px', borderRadius: 20, border: '1.5px solid ' + sc.color,
                          background: sc.bg, color: sc.color, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit'
                        }}
                      >
                        {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>

                      {sub.phone && (
                        <button
                          onClick={() => window.open('https://wa.me/' + sub.phone.replace(/[^0-9]/g, '') + '?text=Hi ' + (sub.name || '') + ', I received your inquiry from TrustDubai. How can I help you?', '_blank')}
                          style={{ padding: '6px 14px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                        >
                          💬 WhatsApp
                        </button>
                      )}

                      {sub.status_updated_at && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Updated {new Date(sub.status_updated_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
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
