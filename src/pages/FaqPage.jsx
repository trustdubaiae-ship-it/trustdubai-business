// trustdubai-business/src/pages/FaqPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const ACCENT = '#0099cc'

export default function FaqPage() {
  const { company } = useAuth()
  const [faqs, setFaqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(null)   // faq id being edited, or 'new'
  const [form, setForm] = useState({ question: '', answer: '' })

  const load = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    const { data } = await supabase.from('company_faqs')
      .select('*').eq('company_id', company.id).order('display_order')
    setFaqs(data || [])
    setLoading(false)
  }, [company?.id])

  useEffect(() => { load() }, [load])

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 2200) }

  function startNew() { setEditing('new'); setForm({ question: '', answer: '' }) }
  function startEdit(f) { setEditing(f.id); setForm({ question: f.question, answer: f.answer }) }
  function cancel() { setEditing(null); setForm({ question: '', answer: '' }) }

  async function save() {
    if (!form.question.trim() || !form.answer.trim()) { flash('Error: Question and answer required'); return }
    setSaving(true)
    if (editing === 'new') {
      const { data, error } = await supabase.from('company_faqs').insert({
        company_id: company.id,
        question: form.question.trim(),
        answer: form.answer.trim(),
        display_order: faqs.length + 1,
        is_active: true,
      }).select()
      setSaving(false)
      if (error) { flash('Error: ' + error.message); return }
      if (!data || !data.length) { flash('Save failed — no permission'); return }
      setFaqs(arr => [...arr, data[0]])
    } else {
      const { data, error } = await supabase.from('company_faqs')
        .update({ question: form.question.trim(), answer: form.answer.trim(), updated_at: new Date().toISOString() })
        .eq('id', editing).select()
      setSaving(false)
      if (error) { flash('Error: ' + error.message); return }
      if (!data || !data.length) { flash('Save failed — no permission'); return }
      setFaqs(arr => arr.map(x => x.id === editing ? data[0] : x))
    }
    cancel()
    flash('Saved ✓')
  }

  async function toggleActive(f) {
    const { data, error } = await supabase.from('company_faqs')
      .update({ is_active: !f.is_active }).eq('id', f.id).select()
    if (error) { flash('Error: ' + error.message); return }
    if (data && data.length) setFaqs(arr => arr.map(x => x.id === f.id ? data[0] : x))
  }

  async function remove(f) {
    if (!confirm('Delete this FAQ?')) return
    const { error } = await supabase.from('company_faqs').delete().eq('id', f.id)
    if (error) { flash('Error: ' + error.message); return }
    setFaqs(arr => arr.filter(x => x.id !== f.id))
    flash('Deleted ✓')
  }

  async function move(f, dir) {
    const idx = faqs.findIndex(x => x.id === f.id)
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= faqs.length) return
    const a = faqs[idx], b = faqs[swap]
    await supabase.from('company_faqs').update({ display_order: b.display_order }).eq('id', a.id)
    await supabase.from('company_faqs').update({ display_order: a.display_order }).eq('id', b.id)
    load()
  }

  const card = { background: '#fff', border: '1px solid #e6eaf0', borderRadius: 14, padding: 20, marginBottom: 18 }
  const inputStyle = { width: '100%', padding: '11px 13px', borderRadius: 9, fontSize: 14, border: '1px solid #e6eaf0', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1e2a3a' }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '8px 4px 40px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e2a3a', margin: '4px 0 4px' }}>❓ FAQ Management</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        Add common questions &amp; answers. These show on your public profile under the “Achievement &amp; Badge” tab → FAQ Section.
      </p>

      {msg && <div style={{ marginBottom: 16, fontSize: 13, fontWeight: 600, color: msg.startsWith('Error') || msg.startsWith('Save failed') ? '#dc2626' : '#1e9e63' }}>{msg}</div>}

      {/* Add / Edit form */}
      {editing ? (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
            {editing === 'new' ? 'Add New FAQ' : 'Edit FAQ'}
          </div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1e2a3a', display: 'block', marginBottom: 6 }}>Question</label>
          <input value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} placeholder="e.g. Do you offer free site visits?" style={{ ...inputStyle, marginBottom: 14 }} />
          <label style={{ fontSize: 12.5, fontWeight: 600, color: '#1e2a3a', display: 'block', marginBottom: 6 }}>Answer</label>
          <textarea value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} placeholder="e.g. Yes, we provide free site assessment across Dubai." style={{ ...inputStyle, minHeight: 90, resize: 'vertical', marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={saving} style={{ padding: '10px 22px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save FAQ'}</button>
            <button onClick={cancel} style={{ padding: '10px 22px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e6eaf0', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={startNew} style={{ marginBottom: 18, padding: '11px 22px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add New FAQ</button>
      )}

      {/* List */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
          Your FAQs {loading ? '' : `(${faqs.length})`}
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: '#94a3b8', padding: 16, textAlign: 'center' }}>Loading…</div>
        ) : faqs.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94a3b8', padding: 24, textAlign: 'center', border: '1px dashed #e6eaf0', borderRadius: 10 }}>
            No FAQs yet. Click “Add New FAQ” to create one.
          </div>
        ) : (
          faqs.map((f, i) => (
            <div key={f.id} style={{ border: '1px solid #e6eaf0', borderRadius: 11, padding: 14, marginBottom: 10, opacity: f.is_active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e2a3a', marginBottom: 4 }}>{f.question}</div>
                  <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>{f.answer}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => move(f, 'up')} disabled={i === 0} style={{ width: 26, height: 24, borderRadius: 6, border: '1px solid #e6eaf0', background: '#fff', cursor: i === 0 ? 'default' : 'pointer', color: '#64748b', opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                  <button onClick={() => move(f, 'down')} disabled={i === faqs.length - 1} style={{ width: 26, height: 24, borderRadius: 6, border: '1px solid #e6eaf0', background: '#fff', cursor: i === faqs.length - 1 ? 'default' : 'pointer', color: '#64748b', opacity: i === faqs.length - 1 ? 0.4 : 1 }}>↓</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => startEdit(f)} style={{ fontSize: 11.5, padding: '5px 12px', borderRadius: 7, border: '1px solid #e6eaf0', background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>✏️ Edit</button>
                <button onClick={() => toggleActive(f)} style={{ fontSize: 11.5, padding: '5px 12px', borderRadius: 7, border: '1px solid #e6eaf0', background: '#fff', color: f.is_active ? '#1e9e63' : '#94a3b8', cursor: 'pointer', fontWeight: 600 }}>{f.is_active ? '● Visible' : '○ Hidden'}</button>
                <button onClick={() => remove(f)} style={{ fontSize: 11.5, padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(220,38,38,0.3)', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>🗑️ Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
