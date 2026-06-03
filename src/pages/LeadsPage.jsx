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
  { value: 'new',            label: 'New',             color: '#64748b', bg: 'rgba(100,116,139,0.14)' },
  { value: 'qualified',      label: 'Qualified',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.14)' },
  { value: 'in_conversation',label: 'In Conversation', color: '#3b82f6', bg: 'rgba(59,130,246,0.14)' },
  { value: 'proposal_given', label: 'Proposal Given',  color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
  { value: 'won',            label: 'Won',             color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
  { value: 'lost',           label: 'Lost',            color: '#ef4444', bg: 'rgba(239,68,68,0.14)' },
]

const PIPELINE = [
  { stage: 'new',            label: 'New',       color: '#0891b2' },
  { stage: 'in_conversation',label: 'Contacted', color: '#f59e0b' },
  { stage: 'proposal_given', label: 'Quoted',    color: '#8b5cf6' },
  { stage: 'won',            label: 'Won',       color: '#10b981' },
]
const LOST = { stage: 'lost', label: 'Lost', color: '#ef4444' }

const STATUS_MAP = {
  'new':'new', 'contacted':'in_conversation', 'in conversation':'in_conversation',
  'interested':'qualified', 'qualified':'qualified',
  'proposal sent':'proposal_given', 'proposal given':'proposal_given', 'proposal':'proposal_given',
  'won':'won', 'lost':'lost',
}

const DIST_TO_PAGE = { assigned:'new', viewed:'qualified', contacted:'in_conversation', quoted:'proposal_given', won:'won', lost:'lost', transferred:'lost' }
const PAGE_TO_DIST = { new:'assigned', qualified:'viewed', in_conversation:'contacted', proposal_given:'quoted', won:'won', lost:'lost' }

const SOURCE_CARDS = [
  { key:'trustdubai', label:'Platform', icon:'ti-world',          color:'#0891b2' },
  { key:'meta',       label:'Meta',     icon:'ti-brand-meta',     color:'#3b82f6' },
  { key:'whatsapp',   label:'WhatsApp', icon:'ti-brand-whatsapp', color:'#22c55e' },
  { key:'own',        label:'Own',      icon:'ti-user-plus',      color:'#8b5cf6' },
]

const TEMP = {
  hot:  { label:'Hot',  color:'#ef4444', bg:'rgba(239,68,68,0.14)' },
  warm: { label:'Warm', color:'#f59e0b', bg:'rgba(245,158,11,0.14)' },
  cold: { label:'Cold', color:'#64748b', bg:'rgba(100,116,139,0.14)' },
}

const OUTCOMES = ['Called','WhatsApp','Site visit','Meeting','Email','No answer','Voicemail','Interested','Not interested']

export default function LeadsPage() {
  const { company } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const [tab, setTab] = useState('leads')
  const [forms, setForms] = useState([])
  const [editingForm, setEditingForm] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [distLeads, setDistLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [newFormTitle, setNewFormTitle] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(null)
  const [view, setView] = useState('board')
  const [search, setSearch] = useState('')
  const [fSource, setFSource] = useState('all')
  const [mobileStage, setMobileStage] = useState('new')
  const [dragId, setDragId] = useState(null)

  // detail drawer
  const [openLead, setOpenLead] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [tlLoading, setTlLoading] = useState(false)
  const [logOutcome, setLogOutcome] = useState('')
  const [logNote, setLogNote] = useState('')
  const [logNext, setLogNext] = useState('')
  const [logStage, setLogStage] = useState('')
  const [logTemp, setLogTemp] = useState('warm')
  const [savingLog, setSavingLog] = useState(false)

  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const mobile = vw < 768

  useEffect(() => { if (company) fetchAll() }, [company])

  async function fetchAll() {
    setLoading(true)
    const { data: formsData } = await supabase
      .from('lead_forms').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
    setForms(formsData || [])
    const { data: subData } = await supabase
      .from('lead_submissions').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
    setSubmissions(subData || [])
    const { data: distData } = await supabase
      .from('lead_distributions')
      .select('id, rank, status, assigned_at, follow_up_date, notes, temperature, lead_id, lead_submissions(id, name, phone, email, answers, created_at, source)')
      .eq('company_id', company.id)
      .order('assigned_at', { ascending: false })
    setDistLeads(distData || [])
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
  async function openEditor(form) { setEditingForm(form); await fetchQuestions(form.id); setTab('editor') }
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

  async function applyStageToDB(lead, newStage) {
    if (lead.distId) {
      await supabase.from('lead_distributions').update({ status: PAGE_TO_DIST[newStage] || 'assigned', status_updated_at: new Date().toISOString() }).eq('id', lead.distId)
      setDistLeads(prev => prev.map(d => d.id === lead.distId ? { ...d, status: PAGE_TO_DIST[newStage] || 'assigned' } : d))
    } else {
      await supabase.from('lead_submissions').update({ status: newStage, status_updated_at: new Date().toISOString() }).eq('id', lead.subId)
      setSubmissions(prev => prev.map(s => s.id === lead.subId ? { ...s, status: newStage } : s))
    }
  }

  async function updateLeadStage(lead, newStage) {
    if (newStage === lead.status) return
    setUpdatingStatus(lead.key)
    await applyStageToDB(lead, newStage)
    supabase.from('lead_activity').insert({
      lead_id: lead.subId || null, distribution_id: lead.distId || null, company_id: company.id,
      actor_name: company.name, kind: 'stage_change', old_stage: lead.status, new_stage: newStage,
    })
    setUpdatingStatus(null)
  }

  // ===== drawer =====
  async function openDrawer(lead) {
    setOpenLead(lead)
    setLogOutcome(''); setLogNote(''); setLogNext(lead.follow_up_date || ''); setLogStage(lead.status); setLogTemp(lead.temperature || 'warm')
    setTlLoading(true)
    const q = supabase.from('lead_activity').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
    const { data } = lead.distId
      ? await q.eq('distribution_id', lead.distId)
      : await q.eq('lead_id', lead.subId)
    setTimeline(data || [])
    setTlLoading(false)
  }
  function closeDrawer() { setOpenLead(null); setTimeline([]) }

  async function saveLog() {
    if (!openLead) return
    setSavingLog(true)
    const lead = openLead
    const stageChanged = logStage !== lead.status

    // 1. update lead fields (follow-up, notes, temperature, stage)
    if (lead.distId) {
      await supabase.from('lead_distributions').update({
        follow_up_date: logNext || null, notes: logNote || lead.notes, temperature: logTemp,
        ...(stageChanged ? { status: PAGE_TO_DIST[logStage] || 'assigned', status_updated_at: new Date().toISOString() } : {})
      }).eq('id', lead.distId)
      setDistLeads(prev => prev.map(d => d.id === lead.distId ? { ...d, follow_up_date: logNext || null, notes: logNote || d.notes, temperature: logTemp, ...(stageChanged ? { status: PAGE_TO_DIST[logStage] } : {}) } : d))
    } else {
      await supabase.from('lead_submissions').update({
        follow_up_date: logNext || null, notes: logNote || lead.notes, temperature: logTemp,
        ...(stageChanged ? { status: logStage, status_updated_at: new Date().toISOString() } : {})
      }).eq('id', lead.subId)
      setSubmissions(prev => prev.map(s => s.id === lead.subId ? { ...s, follow_up_date: logNext || null, notes: logNote || s.notes, temperature: logTemp, ...(stageChanged ? { status: logStage } : {}) } : s))
    }

    // 2. activity log
    await supabase.from('lead_activity').insert({
      lead_id: lead.subId || null, distribution_id: lead.distId || null, company_id: company.id,
      actor_name: company.name, kind: stageChanged ? 'stage_change' : 'follow_up',
      outcome: logOutcome || null, note: logNote || null, next_follow_up: logNext || null,
      old_stage: stageChanged ? lead.status : null, new_stage: stageChanged ? logStage : null,
    })

    // 3. refresh timeline + drawer state
    const q = supabase.from('lead_activity').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
    const { data } = lead.distId ? await q.eq('distribution_id', lead.distId) : await q.eq('lead_id', lead.subId)
    setTimeline(data || [])
    setOpenLead({ ...lead, follow_up_date: logNext || null, notes: logNote || lead.notes, temperature: logTemp, status: logStage })
    setLogOutcome(''); setLogNote('')
    setSavingLog(false)
    toast.success('Follow-up logged!')
  }

  function addQuestion() { setQuestions(prev => [...prev, { id: 'new-' + Date.now(), question: '', type: 'text', options: [], required: true, order_num: prev.length }]) }
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

  function unifyDist(d) {
    const s = d.lead_submissions || {}
    return { key: 'dist-' + d.id, subId: s.id, distId: d.id, isPlatform: true, rank: d.rank,
      name: s.name, phone: s.phone, email: s.email, answers: s.answers || {},
      status: DIST_TO_PAGE[d.status] || 'new', created_at: d.assigned_at || s.created_at,
      follow_up_date: d.follow_up_date, notes: d.notes, temperature: d.temperature || 'warm' }
  }
  function unifyOwn(s) {
    return { key: 'own-' + s.id, subId: s.id, distId: null, isPlatform: false, rank: null,
      name: s.name, phone: s.phone, email: s.email, answers: s.answers || {},
      status: s.status || 'new', created_at: s.created_at,
      follow_up_date: s.follow_up_date, notes: s.notes, temperature: s.temperature || 'warm' }
  }
  const allLeads = [...distLeads.map(unifyDist), ...submissions.map(unifyOwn)]

  const sourceBadge = (lead) => {
    if (lead.isPlatform) return { key:'trustdubai', label: 'Platform', color: '#0891b2', bg: 'rgba(8,145,178,0.14)' }
    const src = (lead.answers?.Source || '').toLowerCase()
    if (src.includes('meta') || src.includes('facebook') || src.includes('instagram')) return { key:'meta', label: 'Meta', color: '#3b82f6', bg: 'rgba(59,130,246,0.14)' }
    if (src.includes('whatsapp')) return { key:'whatsapp', label: 'WhatsApp', color: '#22c55e', bg: 'rgba(34,197,94,0.14)' }
    if (src.includes('referral')) return { key:'referral', label: 'Referral', color: '#8b5cf6', bg: 'rgba(139,92,246,0.14)' }
    return { key:'own', label: 'Own', color: '#8b5cf6', bg: 'rgba(139,92,246,0.14)' }
  }
  function srcBucket(lead) {
    if (lead.isPlatform) return 'trustdubai'
    const k = sourceBadge(lead).key
    if (k === 'meta') return 'meta'
    if (k === 'whatsapp') return 'whatsapp'
    return 'own'
  }

  const filtered = allLeads.filter(l => {
    const q = search.trim().toLowerCase()
    if (q && !(`${l.name || ''} ${l.phone || ''} ${l.email || ''}`.toLowerCase().includes(q))) return false
    if (fSource !== 'all' && srcBucket(l) !== fSource) return false
    return true
  })

  const today = new Date().toISOString().split('T')[0]
  const dueToday = allLeads.filter(l => l.follow_up_date === today && !['won','lost'].includes(l.status)).length
  const overdue  = allLeads.filter(l => l.follow_up_date && l.follow_up_date < today && !['won','lost'].includes(l.status)).length
  const hotCount = allLeads.filter(l => l.temperature === 'hot' && !['won','lost'].includes(l.status)).length
  const wonCount = allLeads.filter(l => l.status === 'won').length
  const wonRate  = allLeads.length > 0 ? Math.round((wonCount / allLeads.length) * 100) : 0
  const srcCount = (k) => allLeads.filter(l => srcBucket(l) === k).length

  function toggleSource(k) { setFSource(prev => prev === k ? 'all' : k) }
  function nextStage(stage) {
    const i = PIPELINE.findIndex(p => p.stage === stage)
    if (i >= 0 && i < PIPELINE.length - 1) return PIPELINE[i + 1].stage
    return stage
  }

  const card = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 16 }
  const inputStyle = { border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }
  const waMsg = (l) => 'https://wa.me/' + (l.phone || '').replace(/[^0-9]/g, '') + '?text=Hi ' + (l.name || '') + ', I received your inquiry from TrustDubai. How can I help you?'
  const optStyle = { background: 'var(--card)', color: 'var(--text)' }

  function LeadCard({ lead, draggable }) {
    const sb = sourceBadge(lead)
    const temp = TEMP[lead.temperature] || TEMP.warm
    const isOverdue = lead.follow_up_date && lead.follow_up_date < today && !['won','lost'].includes(lead.status)
    const isDueToday = lead.follow_up_date === today
    const proj = lead.answers?.['Project Type'] || lead.answers?.category || ''
    const budget = lead.answers?.['Budget (AED)'] || lead.answers?.budget || ''
    return (
      <div
        draggable={draggable}
        onDragStart={draggable ? (e) => { setDragId(lead) } : undefined}
        onDragEnd={draggable ? () => setDragId(null) : undefined}
        onClick={() => openDrawer(lead)}
        style={{ background: 'var(--bg2)', borderRadius: 9, padding: 10, marginBottom: 7, borderLeft: '3px solid ' + sb.color, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{lead.name || 'Anonymous'}</div>
          <span style={{ fontSize: 8.5, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: temp.bg, color: temp.color, flexShrink: 0 }}>{temp.label}</span>
        </div>
        {(proj || budget) && <div style={{ fontSize: 10, color: 'var(--text3)', margin: '3px 0' }}>{proj}{budget ? ' · ' + budget : ''}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          <span style={{ fontSize: 8.5, padding: '1px 6px', borderRadius: 99, background: sb.bg, color: sb.color }}>
            {sb.label}{lead.isPlatform && lead.rank ? ' #' + lead.rank : ''}
          </span>
          {isOverdue && <span style={{ fontSize: 9, color: '#ef4444' }}><i className="ti ti-clock" style={{ fontSize: 10 }} /> Overdue</span>}
          {!isOverdue && isDueToday && <span style={{ fontSize: 9, color: '#f59e0b' }}><i className="ti ti-clock" style={{ fontSize: 10 }} /> Today</span>}
        </div>
        {mobile && !['won','lost'].includes(lead.status) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 9 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => updateLeadStage(lead, nextStage(lead.status))} disabled={updatingStatus === lead.key}
              style={{ flex: 1, fontSize: 11, padding: 7, borderRadius: 8, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Move to next →
            </button>
            {lead.phone && <button onClick={() => window.open(waMsg(lead), '_blank')}
              style={{ fontSize: 11, padding: '7px 10px', borderRadius: 8, background: 'rgba(34,197,94,0.14)', color: '#0f7a52', border: 'none', cursor: 'pointer' }}>
              <i className="ti ti-brand-whatsapp" style={{ fontSize: 13 }} />
            </button>}
          </div>
        )}
      </div>
    )
  }

  // ===== DETAIL DRAWER =====
  function Drawer() {
    if (!openLead) return null
    const lead = openLead
    const sb = sourceBadge(lead)
    const sc = LEAD_STATUSES.find(s => s.value === lead.status) || LEAD_STATUSES[0]
    const isOverdue = lead.follow_up_date && lead.follow_up_date < today && !['won','lost'].includes(lead.status)
    const proj = lead.answers?.['Project Type'] || lead.answers?.category || ''
    const budget = lead.answers?.['Budget (AED)'] || lead.answers?.budget || ''
    const loc = lead.answers?.['Location'] || lead.answers?.area || ''
    return (
      <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', justifyContent: mobile ? 'center' : 'flex-end' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: mobile ? '100%' : 440, height: '100%', background: 'var(--card)', overflowY: 'auto', padding: 18, borderLeft: mobile ? 'none' : '0.5px solid var(--border)' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{lead.name || 'Anonymous'}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sb.label}{lead.isPlatform && lead.rank ? ' · Rank #' + lead.rank : ''} · {new Date(lead.created_at).toLocaleDateString('en-AE')}</div>
            </div>
            <button onClick={closeDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20 }}><i className="ti ti-x" /></button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: (TEMP[lead.temperature]||TEMP.warm).bg, color: (TEMP[lead.temperature]||TEMP.warm).color }}>{(TEMP[lead.temperature]||TEMP.warm).label}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: sc.bg, color: sc.color }}>{sc.label}</span>
            {isOverdue && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: 'rgba(239,68,68,0.14)', color: '#ef4444' }}><i className="ti ti-clock" style={{ fontSize: 11 }} /> Overdue</span>}
          </div>

          {/* quick actions */}
          <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
            {lead.phone && <a href={waMsg(lead)} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: 8, borderRadius: 8, background: 'rgba(34,197,94,0.14)', color: '#0f7a52', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><i className="ti ti-brand-whatsapp" style={{ fontSize: 15 }} />WhatsApp</a>}
            {lead.phone && <a href={'tel:' + lead.phone} style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: 8, borderRadius: 8, background: 'rgba(8,145,178,0.14)', color: '#0077a3', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><i className="ti ti-phone" style={{ fontSize: 15 }} />Call</a>}
            {lead.email && <a href={'mailto:' + lead.email} style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: 8, borderRadius: 8, background: 'var(--bg2)', color: 'var(--text2)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><i className="ti ti-mail" style={{ fontSize: 15 }} />Email</a>}
          </div>

          {/* contacts + requirement */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div style={{ background: 'var(--bg2)', borderRadius: 9, padding: 11 }}>
              <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Contacts</div>
              <div style={{ fontSize: 11, color: 'var(--text)' }}>{lead.phone || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', wordBreak: 'break-all' }}>{lead.email || '—'}</div>
            </div>
            <div style={{ background: 'var(--bg2)', borderRadius: 9, padding: 11 }}>
              <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Requirement</div>
              <div style={{ fontSize: 11, color: 'var(--text)' }}>{proj || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{[budget, loc].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          </div>

          {/* full answers */}
          {lead.answers && Object.keys(lead.answers).length > 0 && (
            <div style={{ background: 'var(--bg2)', borderRadius: 9, padding: 11, marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>All answers</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {Object.entries(lead.answers).map(([q, a]) => (
                  <div key={q} style={{ fontSize: 11 }}><span style={{ color: 'var(--text3)' }}>{q}: </span><span style={{ color: 'var(--text)' }}>{String(a)}</span></div>
                ))}
              </div>
            </div>
          )}

          {/* LOG FOLLOW-UP */}
          <div style={{ border: '0.5px solid var(--border)', borderRadius: 10, padding: 13, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}><i className="ti ti-pencil-plus" style={{ fontSize: 14, color: '#0099cc' }} /> Log follow-up</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 11 }}>
              {OUTCOMES.map(o => (
                <button key={o} onClick={() => setLogOutcome(logOutcome === o ? '' : o)}
                  style={{ fontSize: 10, padding: '5px 10px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                    border: '0.5px solid ' + (logOutcome === o ? '#0099cc' : 'var(--border)'),
                    background: logOutcome === o ? 'rgba(0,153,204,0.12)' : 'transparent',
                    color: logOutcome === o ? '#0099cc' : 'var(--text2)' }}>{o}</button>
              ))}
            </div>
            <textarea value={logNote} onChange={e => setLogNote(e.target.value)} placeholder="Notes — what was discussed..."
              style={{ width: '100%', minHeight: 56, padding: '8px 10px', ...inputStyle, fontSize: 12, resize: 'vertical', marginBottom: 9 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 9 }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Next follow-up</label>
                <input type="date" value={logNext} onChange={e => setLogNext(e.target.value)} style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Move to stage</label>
                <select value={logStage} onChange={e => setLogStage(e.target.value)} style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12 }}>
                  {LEAD_STATUSES.map(s => <option key={s.value} value={s.value} style={optStyle}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 11 }}>
              <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Temperature</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {Object.entries(TEMP).map(([k, v]) => (
                  <button key={k} onClick={() => setLogTemp(k)}
                    style={{ flex: 1, fontSize: 11, padding: '6px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                      border: '0.5px solid ' + (logTemp === k ? v.color : 'var(--border)'),
                      background: logTemp === k ? v.bg : 'transparent', color: logTemp === k ? v.color : 'var(--text2)' }}>{v.label}</button>
                ))}
              </div>
            </div>
            <button onClick={saveLog} disabled={savingLog}
              style={{ width: '100%', padding: 9, borderRadius: 8, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              {savingLog ? 'Saving...' : 'Save log'}
            </button>
          </div>

          {/* TIMELINE */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Timeline</div>
          {tlLoading ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: 10 }}>Loading...</div>
          ) : timeline.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: 10 }}>No activity yet — log your first follow-up.</div>
          ) : (
            <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginLeft: 4 }}>
              {timeline.map(t => (
                <div key={t.id} style={{ marginBottom: 11 }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{new Date(t.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })} · {new Date(t.created_at).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}</div>
                  <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px', marginTop: 3 }}>
                    <div style={{ fontSize: 11, color: 'var(--text)' }}>
                      {t.kind === 'stage_change' && <span><i className="ti ti-arrow-right" style={{ fontSize: 11 }} /> Moved to {(LEAD_STATUSES.find(s=>s.value===t.new_stage)||{}).label || t.new_stage}</span>}
                      {t.kind === 'follow_up' && <span>{t.outcome || 'Follow-up'}{t.note ? ' · ' + t.note : ''}</span>}
                      {t.kind === 'created' && <span>Lead received</span>}
                      {t.kind === 'note' && <span>{t.note}</span>}
                    </div>
                    {t.next_follow_up && <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>Next: {new Date(t.next_follow_up).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}</div>}
                    {t.actor_name && <div style={{ fontSize: 9, color: 'var(--text3)' }}>by {t.actor_name}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    )
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>

  return (
    <div className="page-content animate-in" style={{ color: 'var(--text)' }}>
      <Drawer />

      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="font-syne fw-700" style={{ fontSize: 23, marginBottom: 4, color: 'var(--text)' }}>Lead Hub</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Capture, track and close — every lead in one pipeline</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNewForm(true)}>+ New Form</button>
      </div>

      {showNewForm && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>New Form</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input value={newFormTitle} onChange={e => setNewFormTitle(e.target.value)} placeholder="Form title e.g. Interior Design Inquiry"
              style={{ flex: 1, padding: '10px 14px', ...inputStyle }} onKeyDown={e => e.key === 'Enter' && createForm()} />
            <button className="btn btn-primary btn-sm" onClick={createForm}>Create</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNewForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'forms',  label: 'All Forms (' + forms.length + ')' },
          { id: 'editor', label: editingForm ? 'Editing: ' + editingForm.title : 'Editor', disabled: !editingForm },
          { id: 'leads',  label: 'Leads (' + allLeads.length + ')' },
        ].map(t => (
          <button key={t.id} onClick={() => !t.disabled && setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', background: 'none', cursor: t.disabled ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            color: t.disabled ? 'var(--text3)' : tab === t.id ? 'var(--primary)' : 'var(--text2)',
            borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, opacity: t.disabled ? 0.5 : 1
          }}>{t.label}</button>
        ))}
      </div>

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
                        {form.is_active && <span style={{ background: 'rgba(8,145,178,0.14)', color: '#0891b2', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, border: '1px solid #0891b2' }}>LIVE</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>Created {new Date(form.created_at).toLocaleDateString('en-AE')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!form.is_active && <button className="btn btn-sm btn-secondary" onClick={() => setActive(form.id)}>Set as Active</button>}
                      <button className="btn btn-sm btn-primary" onClick={() => openEditor(form)}>Edit</button>
                      <button onClick={() => deleteForm(form.id)} style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.14)', color: '#ef4444', border: 'none', borderRadius: 6, cursor: 'pointer' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'editor' && editingForm && (
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 360px', gap: 20 }}>
          <div>
            <div style={{ ...card, marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Form Title</div>
              <input value={editingForm.title} onChange={e => setEditingForm(prev => ({ ...prev, title: e.target.value }))} style={{ width: '100%', padding: '10px 14px', ...inputStyle }} />
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
                      <input value={q.question} onChange={e => updateQuestion(q.id, 'question', e.target.value)} placeholder={'Question ' + (i + 1)} style={{ flex: 1, padding: '8px 12px', ...inputStyle, fontSize: 13 }} />
                      <select value={q.type} onChange={e => updateQuestion(q.id, 'type', e.target.value)} style={{ padding: '8px 10px', ...inputStyle, fontSize: 12 }}>
                        {QUESTION_TYPES.map(t => <option key={t.value} value={t.value} style={optStyle}>{t.label}</option>)}
                      </select>
                      <button onClick={() => deleteQuestion(q.id)} style={{ padding: '8px', border: 'none', background: 'rgba(239,68,68,0.14)', borderRadius: 6, cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
                    </div>
                    {(q.type === 'radio' || q.type === 'select') && (
                      <div style={{ paddingLeft: 8 }}>
                        {(q.options || []).map((opt, oi) => (
                          <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                            <input value={opt} onChange={e => updateOption(q.id, oi, e.target.value)} placeholder={'Option ' + (oi + 1)} style={{ flex: 1, padding: '6px 10px', ...inputStyle, fontSize: 12 }} />
                            <button onClick={() => removeOption(q.id, oi)} style={{ padding: '6px 8px', border: 'none', background: 'rgba(239,68,68,0.14)', borderRadius: 6, cursor: 'pointer', color: '#ef4444', fontSize: 12 }}>✕</button>
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
          {!mobile && (
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
                      {q.type === 'text' && <input disabled placeholder="Customer answer..." style={{ width: '100%', padding: '8px 10px', ...inputStyle, fontSize: 12 }} />}
                      {q.type === 'select' && <select disabled style={{ width: '100%', padding: '8px 10px', ...inputStyle, fontSize: 12 }}><option style={optStyle}>Select an option</option>{(q.options || []).map((o, i) => <option key={i} style={optStyle}>{o}</option>)}</select>}
                      {q.type === 'radio' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{(q.options || []).map((o, i) => <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}><input type="radio" disabled /> {o || 'Option ' + (i + 1)}</label>)}</div>}
                    </div>
                  ))}
                  <div style={{ background: 'var(--primary)', color: '#fff', textAlign: 'center', padding: '8px', borderRadius: 20, fontSize: 13, fontWeight: 500, marginTop: 8 }}>Submit — Get Quote</div>
                  <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: 'var(--text3)' }}>Powered by TrustDubai</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'leads' && (
        <div>
          {allLeads.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
              {[
                { label: 'Due today', value: dueToday, color: '#0891b2', icon: 'ti-clock' },
                { label: 'Overdue',   value: overdue,  color: '#ef4444', icon: 'ti-alert-triangle' },
                { label: 'Hot',       value: hotCount, color: '#d85a30', icon: 'ti-flame' },
                { label: 'Won rate',  value: wonRate + '%', color: '#10b981', icon: 'ti-trophy' },
              ].map(s => (
                <div key={s.label} style={{ ...card, padding: '11px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}><i className={'ti ' + s.icon} style={{ fontSize: 12, color: s.color }} /> {s.label}</div>
                  <div style={{ fontSize: 21, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {allLeads.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {SOURCE_CARDS.map(s => {
                const active = fSource === s.key
                return (
                  <div key={s.key} onClick={() => toggleSource(s.key)}
                    style={{ flex: 1, minWidth: 110, ...card, padding: '9px 13px', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', borderColor: active ? s.color : 'var(--border)', borderWidth: active ? 1.5 : 0.5, borderStyle: 'solid' }}>
                    <i className={'ti ' + s.icon} style={{ fontSize: 16, color: s.color }} />
                    <div><span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{srcCount(s.key)}</span> <span style={{ fontSize: 10, color: 'var(--text2)' }}>{s.label}</span></div>
                    {active && <i className="ti ti-circle-check-filled" style={{ fontSize: 14, color: s.color, marginLeft: 'auto' }} />}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', flex: '1 1 200px', minWidth: 160 }}>
              <i className="ti ti-search" style={{ fontSize: 14, color: 'var(--text3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..." style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', width: '100%', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 8, padding: 2 }}>
              {[['board','ti-layout-kanban','Board'],['list','ti-list','List']].map(([v,ic,lbl]) => (
                <button key={v} onClick={() => setView(v)} style={{ padding: '6px 11px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, background: view === v ? 'var(--card)' : 'transparent', color: view === v ? 'var(--primary)' : 'var(--text3)' }}>
                  <i className={`ti ${ic}`} style={{ fontSize: 14 }} /> {lbl}
                </button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: 'none' }} />
            <button className="btn btn-secondary btn-sm" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? 'Importing...' : '⬆ Import'}</button>
          </div>

          {allLeads.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>No leads yet</h3>
              <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>Platform leads, form submissions, ya CSV import yahan dikhenge</p>
              <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>⬆ Import CSV</button>
            </div>
          ) : view === 'board' && mobile ? (
            <div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14, paddingBottom: 4 }}>
                {[...PIPELINE, LOST].map(p => {
                  const count = filtered.filter(l => l.status === p.stage).length
                  const active = mobileStage === p.stage
                  return (
                    <button key={p.stage} onClick={() => setMobileStage(p.stage)} style={{ flexShrink: 0, fontSize: 11, padding: '6px 13px', borderRadius: 99, border: 'none', cursor: 'pointer', background: active ? p.color : 'var(--bg2)', color: active ? '#fff' : 'var(--text2)', fontWeight: 500 }}>{p.label} {count}</button>
                  )
                })}
              </div>
              {filtered.filter(l => l.status === mobileStage).length === 0 ? (
                <div style={{ ...card, textAlign: 'center', padding: 30, color: 'var(--text3)', fontSize: 13 }}>No leads in this stage</div>
              ) : (
                filtered.filter(l => l.status === mobileStage).map(lead => <LeadCard key={lead.key} lead={lead} draggable={false} />)
              )}
            </div>
          ) : view === 'board' ? (
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              {PIPELINE.map(col => {
                const colLeads = filtered.filter(l => l.status === col.stage)
                return (
                  <div key={col.stage} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragId && dragId.status !== col.stage) updateLeadStage(dragId, col.stage); setDragId(null) }}
                    style={{ flex: 1, ...card, padding: 9, minHeight: 120 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: col.color, marginBottom: 9, display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid ' + col.color, paddingBottom: 6 }}>
                      <span>{col.label}</span><span>{colLeads.length}</span>
                    </div>
                    {colLeads.map(lead => <LeadCard key={lead.key} lead={lead} draggable={true} />)}
                  </div>
                )
              })}
              <div onDragOver={e => e.preventDefault()} onDrop={() => { if (dragId && dragId.status !== 'lost') updateLeadStage(dragId, 'lost'); setDragId(null) }}
                style={{ width: 90, ...card, padding: 9, minHeight: 120, borderStyle: 'dashed' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: LOST.color, marginBottom: 9, display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid ' + LOST.color, paddingBottom: 6 }}>
                  <span>Lost</span><span>{filtered.filter(l => l.status === 'lost').length}</span>
                </div>
                {filtered.filter(l => l.status === 'lost').map(lead => <LeadCard key={lead.key} lead={lead} draggable={true} />)}
              </div>
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                      <th style={{ textAlign: 'left', padding: '11px 14px', fontWeight: 600 }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '11px 10px', fontWeight: 600 }}>Source</th>
                      <th style={{ textAlign: 'left', padding: '11px 10px', fontWeight: 600 }}>Stage</th>
                      <th style={{ textAlign: 'right', padding: '11px 14px', fontWeight: 600 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(lead => {
                      const sc = LEAD_STATUSES.find(s => s.value === lead.status) || LEAD_STATUSES[0]
                      const sb = sourceBadge(lead)
                      return (
                        <tr key={lead.key} onClick={() => openDrawer(lead)} style={{ borderTop: '0.5px solid var(--border)', cursor: 'pointer' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg2)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(lead.name || 'A')[0].toUpperCase()}</div>
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{lead.name || 'Anonymous'} {lead.isPlatform && lead.rank && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#0891b2', background: 'rgba(8,145,178,0.12)', padding: '1px 6px', borderRadius: 99 }}>#{lead.rank}</span>}</div>
                                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{lead.phone || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px' }}><span style={{ background: sb.bg, color: sb.color, fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>{sb.label}</span></td>
                          <td style={{ padding: '10px' }}>
                            <select value={lead.status} onClick={e => e.stopPropagation()} onChange={e => updateLeadStage(lead, e.target.value)} disabled={updatingStatus === lead.key}
                              style={{ padding: '4px 8px', borderRadius: 20, border: '1px solid ' + sc.color, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {LEAD_STATUSES.map(s => <option key={s.value} value={s.value} style={optStyle}>{s.label}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {lead.phone && <button onClick={e => { e.stopPropagation(); window.open(waMsg(lead), '_blank') }} style={{ padding: '5px 10px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>WhatsApp</button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
