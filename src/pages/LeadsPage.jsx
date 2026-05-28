import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, GripVertical, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'

const QUESTION_TYPES = [
  { value: 'text',   label: 'Text answer' },
  { value: 'radio',  label: 'Multiple choice' },
  { value: 'select', label: 'Dropdown' },
]

export default function LeadsPage() {
  const { company } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('builder')
  const [form, setForm] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formTitle, setFormTitle] = useState('Get a Free Quote')

  useEffect(() => {
    if (company) fetchAll()
  }, [company])

  async function fetchAll() {
    setLoading(true)
    const { data: formData } = await supabase
      .from('lead_forms')
      .select('*')
      .eq('company_id', company.id)
      .single()

    if (formData) {
      setForm(formData)
      setFormTitle(formData.title)
      const { data: qData } = await supabase
        .from('lead_form_questions')
        .select('*')
        .eq('form_id', formData.id)
        .order('order_num')
      setQuestions(qData || [])
    }

    const { data: subData } = await supabase
      .from('lead_submissions')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    setSubmissions(subData || [])
    setLoading(false)
  }

  async function createForm() {
    const { data, error } = await supabase
      .from('lead_forms')
      .insert({ company_id: company.id, title: formTitle })
      .select().single()
    if (error) { toast.error('Could not create form'); return }
    setForm(data)

    // Default questions add karo
    const defaults = [
      { form_id: data.id, question: 'Your name', type: 'text', required: true, order_num: 0 },
      { form_id: data.id, question: 'Your phone number', type: 'text', required: true, order_num: 1 },
      { form_id: data.id, question: 'What service do you need?', type: 'text', required: true, order_num: 2 },
    ]
    const { data: qData } = await supabase.from('lead_form_questions').insert(defaults).select()
    setQuestions(qData || [])
    toast.success('Form created!')
  }

  async function saveForm() {
    setSaving(true)
    await supabase.from('lead_forms').update({ title: formTitle }).eq('id', form.id)
    for (const q of questions) {
      if (q.id.startsWith('new-')) {
        const { id, ...rest } = q
        await supabase.from('lead_form_questions').insert({ ...rest, form_id: form.id })
      } else {
        await supabase.from('lead_form_questions').update(q).eq('id', q.id)
      }
    }
    await fetchAll()
    setSaving(false)
    toast.success('Form saved!')
  }

  async function deleteQuestion(qId) {
    if (!qId.startsWith('new-')) {
      await supabase.from('lead_form_questions').delete().eq('id', qId)
    }
    setQuestions(prev => prev.filter(q => q.id !== qId))
  }

  async function toggleForm() {
    const newState = !form.is_active
    await supabase.from('lead_forms').update({ is_active: newState }).eq('id', form.id)
    setForm(prev => ({ ...prev, is_active: newState }))
    toast.success(newState ? 'Form activated!' : 'Form deactivated')
  }

  function addQuestion() {
    setQuestions(prev => [...prev, {
      id: 'new-' + Date.now(),
      form_id: form?.id,
      question: '',
      type: 'text',
      options: [],
      required: true,
      order_num: prev.length
    }])
  }

  function updateQuestion(id, field, value) {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q))
  }

  function addOption(qId) {
    setQuestions(prev => prev.map(q => q.id === qId
      ? { ...q, options: [...(q.options || []), ''] }
      : q
    ))
  }

  function updateOption(qId, idx, value) {
    setQuestions(prev => prev.map(q => q.id === qId
      ? { ...q, options: q.options.map((o, i) => i === idx ? value : o) }
      : q
    ))
  }

  function removeOption(qId, idx) {
    setQuestions(prev => prev.map(q => q.id === qId
      ? { ...q, options: q.options.filter((_, i) => i !== idx) }
      : q
    ))
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading...</div>

  return (
    <div className="page-content animate-in">
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize: 24, marginBottom: 4 }}>Lead Form</h1>
          <p className="text-secondary" style={{ fontSize: 14 }}>Build your custom inquiry form — customers fill it from your public profile</p>
        </div>
        {form && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Form status:</span>
            <button onClick={toggleForm} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 12,
              background: form.is_active ? '#ecfdf5' : '#f3f4f6',
              color: form.is_active ? '#065f46' : '#6b7280'
            }}>
              {form.is_active ? 'Active' : 'Inactive'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--card-border)', paddingBottom: 0 }}>
        {[
          { id: 'builder', label: 'Form Builder', icon: 'ti-forms' },
          { id: 'leads', label: `Leads (${submissions.length})`, icon: 'ti-inbox' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            color: tab === t.id ? 'var(--primary)' : 'var(--text-secondary)',
            borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -1
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* BUILDER TAB */}
      {tab === 'builder' && (
        !form ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Create your lead form</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
              Customers will fill this form on your public profile — leads come directly to you via WhatsApp
            </p>
            <div style={{ marginBottom: 16, maxWidth: 320, margin: '0 auto 16px' }}>
              <input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Form title e.g. Get a Free Quote"
                style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 12 }}
              />
            </div>
            <button className="btn btn-primary" onClick={createForm}>
              Create Form
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>

            {/* Left — Editor */}
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 12 }}>Form Title</div>
                <input
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
                />
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div className="card-title">Questions</div>
                  <button className="btn btn-sm btn-secondary" onClick={addQuestion}>
                    + Add Question
                  </button>
                </div>

                {questions.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                    No questions yet — add your first question
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ border: '1px solid var(--card-border)', borderRadius: 10, padding: 14, background: 'var(--bg)' }}>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <input
                            value={q.question}
                            onChange={e => updateQuestion(q.id, 'question', e.target.value)}
                            placeholder={'Question ' + (i + 1)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}
                          />
                        </div>
                        <select
                          value={q.type}
                          onChange={e => updateQuestion(q.id, 'type', e.target.value)}
                          style={{ padding: '8px 10px', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: 'var(--card-bg)' }}
                        >
                          {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <button onClick={() => deleteQuestion(q.id)} style={{ padding: '8px', border: 'none', background: '#fef2f2', borderRadius: 6, cursor: 'pointer', color: '#ef4444' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Options for radio/select */}
                      {(q.type === 'radio' || q.type === 'select') && (
                        <div style={{ paddingLeft: 8 }}>
                          {(q.options || []).map((opt, oi) => (
                            <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                              <input
                                value={opt}
                                onChange={e => updateOption(q.id, oi, e.target.value)}
                                placeholder={'Option ' + (oi + 1)}
                                style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--card-border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }}
                              />
                              <button onClick={() => removeOption(q.id, oi)} style={{ padding: '6px 8px', border: 'none', background: '#fef2f2', borderRadius: 6, cursor: 'pointer', color: '#ef4444', fontSize: 12 }}>✕</button>
                            </div>
                          ))}
                          <button onClick={() => addOption(q.id)} style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                            + Add option
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <input type="checkbox" checked={q.required} onChange={e => updateQuestion(q.id, 'required', e.target.checked)} id={'req-' + q.id} />
                        <label htmlFor={'req-' + q.id} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Required</label>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={saveForm} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                    {saving ? 'Saving...' : 'Save Form'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right — Preview */}
            <div>
              <div className="card" style={{ position: 'sticky', top: 20 }}>
                <div className="card-title" style={{ marginBottom: 16 }}>Live Preview</div>
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{formTitle}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Fill this form to get a response</div>
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 4 }}>
                        {q.question || 'Question ' + (i + 1)}
                        {q.required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
                      </label>
                      {q.type === 'text' && (
                        <input disabled placeholder="Customer answer..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, background: '#fff' }} />
                      )}
                      {q.type === 'select' && (
                        <select disabled style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, background: '#fff' }}>
                          <option>Select an option</option>
                          {(q.options || []).map((o, i) => <option key={i}>{o}</option>)}
                        </select>
                      )}
                      {q.type === 'radio' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {(q.options || []).map((o, i) => (
                            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                              <input type="radio" disabled /> {o || 'Option ' + (i + 1)}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ background: '#03C1F5', color: '#fff', textAlign: 'center', padding: '8px', borderRadius: 20, fontSize: 13, fontWeight: 500, marginTop: 8 }}>
                    Submit — Get Quote
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: '#9ca3af' }}>
                    Powered by TrustDubai
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* LEADS TAB */}
      {tab === 'leads' && (
        <div>
          {submissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No leads yet</h3>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                When customers fill your form, leads will appear here
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {submissions.map(sub => (
                <div key={sub.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e0f9ff', color: '#03C1F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>
                        {(sub.name || 'A')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{sub.name || 'Anonymous'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub.phone} {sub.email && '· ' + sub.email}</div>
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
                    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                      {Object.entries(sub.answers).map(([q, a]) => (
                        <div key={q} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
                          <span style={{ color: 'var(--text-secondary)', minWidth: 140 }}>{q}:</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {sub.phone && (
                    <div style={{ marginTop: 12 }}>
                      <button
                        onClick={() => window.open('https://wa.me/' + sub.phone.replace(/[^0-9]/g, '') + '?text=Hi ' + (sub.name || '') + ', I received your inquiry from TrustDubai. How can I help you?', '_blank')}
                        style={{ padding: '7px 16px', background: '#25D366', color: '#fff', border: 'none', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                      >
                        Reply on WhatsApp
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
