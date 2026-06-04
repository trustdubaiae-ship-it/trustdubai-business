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
  { key:'meta',     label:'Meta',     icon:'ti-brand-meta',     color:'#3b82f6' },
  { key:'whatsapp', label:'WhatsApp', icon:'ti-brand-whatsapp', color:'#22c55e' },
  { key:'own',      label:'Manual',   icon:'ti-user-plus',      color:'#8b5cf6' },
]

const LEAD_SOURCES = ['Meta Ads','WhatsApp','Instagram','Referral','Walk-in','Website','Direct Call','Holiday Home Operator','Other']

const PROJECT_TYPES = ['Villa Renovation','Apartment Renovation','Office Fit-out','Retail Fit-out','Holiday Home Beautification','Bathroom Renovation','Kitchen Renovation','False Ceiling','Flooring & Tiling','Painting & Wallpaper','Full Interior Design','MEP Works','Swimming Pool Area','Landscape & Outdoor','Commercial Renovation','Showroom Fit-out','Restaurant Fit-out','Hotel Room Renovation','TV Wall Panel','Other']

const TEMP = {
  hot:  { label:'Hot',  color:'#ef4444', bg:'rgba(239,68,68,0.14)' },
  warm: { label:'Warm', color:'#f59e0b', bg:'rgba(245,158,11,0.14)' },
  cold: { label:'Cold', color:'#64748b', bg:'rgba(100,116,139,0.14)' },
}

const OUTCOMES = ['Called','WhatsApp','Site visit','Meeting','Email','No answer','Voicemail','Interested','Not interested']

const DEFAULT_TEMPLATES = [
  { name: 'Gentle check-in', body: 'Hi {name}, just following up on your {req} inquiry. Would you like to schedule a quick call this week?' },
  { name: 'Share quote',     body: 'Hi {name}, thank you for your interest. I have prepared a quote for your {req} — when is a good time to discuss?' },
  { name: 'Site visit invite', body: 'Hi {name}, we would love to visit your site for an accurate assessment. What day works best for you?' },
  { name: 'Thank you',       body: 'Hi {name}, thank you for choosing us. We look forward to working on your {req}.' },
]

const SAFE_TOP = 'env(safe-area-inset-top)'

const SELECT_CHEVRON =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")"

export default function LeadsPage() {
  const { company } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const [mainTab, setMainTab] = useState('trustdubai')
  const [forms, setForms] = useState([])
  const [editingForm, setEditingForm] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [distLeads, setDistLeads] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [newFormTitle, setNewFormTitle] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(null)
  const [view, setView] = useState('board')
  const [search, setSearch] = useState('')
  const [fSource, setFSource] = useState('all')
  const [quickFilter, setQuickFilter] = useState('')
  const [mobileStage, setMobileStage] = useState('new')
  const [dragId, setDragId] = useState(null)

  const [openLead, setOpenLead] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [tlLoading, setTlLoading] = useState(false)
  const [logOutcome, setLogOutcome] = useState('')
  const [logNote, setLogNote] = useState('')
  const [logNext, setLogNext] = useState('')
  const [logStage, setLogStage] = useState('')
  const [logTemp, setLogTemp] = useState('warm')
  const [savingLog, setSavingLog] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [showNewTpl, setShowNewTpl] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplBody, setTplBody] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [addMore, setAddMore] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)
  const blankAdd = { name:'', phone:'', source:'Meta Ads', projectType:'', email:'', whatsapp:'', location:'', budget:'', followUp:'', status:'new', temp:'warm', notes:'' }
  const [addF, setAddF] = useState(blankAdd)

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
    const { data: tplData } = await supabase
      .from('message_templates').select('*').eq('company_id', company.id).order('sort_order', { ascending: true })
    setTemplates(tplData || [])
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
  async function openEditor(form) { setEditingForm(form); await fetchQuestions(form.id) }
  function closeEditor() { setEditingForm(null); setQuestions([]) }
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
    if (editingForm?.id === formId) closeEditor()
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

  function openAdd() { setAddF(blankAdd); setAddMore(false); setShowAdd(true) }
  function closeAdd() { setShowAdd(false) }
  function setA(k, v) { setAddF(p => ({ ...p, [k]: v })) }

  async function saveAddLead() {
    if (!addF.name.trim()) { toast.error('Client name is required'); return }
    if (!addF.phone.trim()) { toast.error('Phone is required'); return }
    setSavingAdd(true)
    const answers = {}
    answers['Source'] = addF.source
    if (addF.projectType) answers['Project Type'] = addF.projectType
    if (addF.location) answers['Location'] = addF.location
    if (addF.budget) answers['Budget (AED)'] = addF.budget
    if (addF.whatsapp) answers['WhatsApp'] = addF.whatsapp
    if (addF.notes) answers['Notes'] = addF.notes
    const { error } = await supabase.from('lead_submissions').insert({
      company_id: company.id, name: addF.name.trim(), phone: addF.phone.trim(), email: addF.email.trim() || null,
      status: addF.status, status_updated_at: new Date().toISOString(),
      follow_up_date: addF.followUp || null, temperature: addF.temp, notes: addF.notes || null, answers,
    })
    if (error) { setSavingAdd(false); toast.error('Could not save lead'); console.error(error); return }

    await supabase.from('clients').insert({
      name: addF.name.trim(),
      phone: addF.phone.trim(),
      email: addF.email.trim() || null,
      source: addF.source || 'manual',
    })

    setSavingAdd(false)
    await fetchAll()
    setShowAdd(false)
    setMainTab('mine')
    toast.success('Lead added!')
  }

  async function applyStageToDB(lead, newStage) {
    if (lead.distId) {
      const { error } = await supabase.from('lead_distributions')
        .update({ status: PAGE_TO_DIST[newStage] || 'assigned', status_updated_at: new Date().toISOString() })
        .eq('id', lead.distId)
      if (error) { console.error('Dist update failed:', error); toast.error('Update failed: ' + error.message); return false }
      setDistLeads(prev => prev.map(d => d.id === lead.distId ? { ...d, status: PAGE_TO_DIST[newStage] || 'assigned' } : d))
    } else {
      const { error } = await supabase.from('lead_submissions')
        .update({ status: newStage, status_updated_at: new Date().toISOString() })
        .eq('id', lead.subId)
      if (error) { console.error('Sub update failed:', error); toast.error('Update failed: ' + error.message); return false }
      setSubmissions(prev => prev.map(s => s.id === lead.subId ? { ...s, status: newStage } : s))
    }
    return true
  }
  async function updateLeadStage(lead, newStage) {
    if (newStage === lead.status) return
    setUpdatingStatus(lead.key)
    const ok = await applyStageToDB(lead, newStage)
    if (ok) {
      await supabase.from('lead_activity').insert({
        lead_id: lead.subId || null, distribution_id: lead.distId || null, company_id: company.id,
        actor_name: company.name, kind: 'stage_change', old_stage: lead.status, new_stage: newStage,
      })
    }
    setUpdatingStatus(null)
  }

  function leadReq(lead) {
    return lead.answers?.['Project Type'] || lead.answers?.category || lead.answers?.['Notes'] || 'project'
  }
  function fillTemplate(body, lead) {
    return (body || '').replace(/\{name\}/g, lead.name || '').replace(/\{req\}/g, leadReq(lead))
  }

  async function openModal(lead) {
    setOpenLead(lead)
    setLogOutcome(''); setLogNote(''); setLogNext(lead.follow_up_date || ''); setLogStage(lead.status); setLogTemp(lead.temperature || 'warm')
    setMsgText(''); setShowNewTpl(false); setTplName(''); setTplBody('')
    setTlLoading(true)
    const q = supabase.from('lead_activity').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
    const { data } = lead.distId ? await q.eq('distribution_id', lead.distId) : await q.eq('lead_id', lead.subId)
    setTimeline(data || [])
    setTlLoading(false)
  }
  function closeModal() { setOpenLead(null); setTimeline([]) }

  async function saveLog() {
    if (!openLead) return
    setSavingLog(true)
    const lead = openLead
    const stageChanged = logStage !== lead.status
    let err = null
    if (lead.distId) {
      const res = await supabase.from('lead_distributions').update({
        follow_up_date: logNext || null, notes: logNote || lead.notes, temperature: logTemp,
        ...(stageChanged ? { status: PAGE_TO_DIST[logStage] || 'assigned', status_updated_at: new Date().toISOString() } : {})
      }).eq('id', lead.distId)
      err = res.error
      if (!err) setDistLeads(prev => prev.map(d => d.id === lead.distId ? { ...d, follow_up_date: logNext || null, notes: logNote || d.notes, temperature: logTemp, ...(stageChanged ? { status: PAGE_TO_DIST[logStage] } : {}) } : d))
    } else {
      const res = await supabase.from('lead_submissions').update({
        follow_up_date: logNext || null, notes: logNote || lead.notes, temperature: logTemp,
        ...(stageChanged ? { status: logStage, status_updated_at: new Date().toISOString() } : {})
      }).eq('id', lead.subId)
      err = res.error
      if (!err) setSubmissions(prev => prev.map(s => s.id === lead.subId ? { ...s, follow_up_date: logNext || null, notes: logNote || s.notes, temperature: logTemp, ...(stageChanged ? { status: logStage } : {}) } : s))
    }
    if (err) { console.error('Save log failed:', err); toast.error('Save failed: ' + err.message); setSavingLog(false); return }
    await supabase.from('lead_activity').insert({
      lead_id: lead.subId || null, distribution_id: lead.distId || null, company_id: company.id,
      actor_name: company.name, kind: stageChanged ? 'stage_change' : 'follow_up',
      outcome: logOutcome || null, note: logNote || null, next_follow_up: logNext || null,
      old_stage: stageChanged ? lead.status : null, new_stage: stageChanged ? logStage : null,
    })
    setSavingLog(false)
    toast.success('Follow-up logged!')
    closeModal()
  }

  function sendWhatsApp() {
    if (!openLead?.phone || !msgText.trim()) { toast.error('Enter a message first'); return }
    const url = 'https://wa.me/' + openLead.phone.replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(msgText)
    window.open(url, '_blank')
    supabase.from('lead_activity').insert({
      lead_id: openLead.subId || null, distribution_id: openLead.distId || null, company_id: company.id,
      actor_name: company.name, kind: 'follow_up', outcome: 'WhatsApp', note: 'Message sent: ' + msgText.slice(0, 60),
    })
  }

  async function saveTemplate() {
    if (!tplName.trim() || !tplBody.trim()) { toast.error('Enter name and message'); return }
    const { data, error } = await supabase.from('message_templates')
      .insert({ company_id: company.id, name: tplName.trim(), body: tplBody.trim(), sort_order: templates.length })
      .select().single()
    if (error) { toast.error('Could not save template'); return }
    setTemplates(prev => [...prev, data])
    setShowNewTpl(false); setTplName(''); setTplBody('')
    toast.success('Template saved!')
  }
  async function deleteTemplate(id) {
    await supabase.from('message_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
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

      const clientRows = records.map(r => ({
        name: r.name,
        phone: r.phone || null,
        email: r.email || null,
        source: r.answers?.['Source'] || 'excel',
      }))
      for (let i = 0; i < clientRows.length; i += 50) {
        await supabase.from('clients').insert(clientRows.slice(i, i + 50))
      }

      await fetchAll(); toast.success(`${ok} leads imported!`); setMainTab('mine') 
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
  const tdLeads = distLeads.map(unifyDist)
  const myLeads = submissions.map(unifyOwn)

  function mySource(lead) {
    const src = (lead.answers?.Source || '').toLowerCase()
    if (src.includes('meta') || src.includes('facebook') || src.includes('instagram')) return 'meta'
    if (src.includes('whatsapp')) return 'whatsapp'
    return 'own'
  }
  const mySourceBadge = (lead) => {
    const k = mySource(lead)
    if (k === 'meta') return { label: 'Meta', color: '#3b82f6', bg: 'rgba(59,130,246,0.14)' }
    if (k === 'whatsapp') return { label: 'WhatsApp', color: '#22c55e', bg: 'rgba(34,197,94,0.14)' }
    return { label: 'Manual', color: '#8b5cf6', bg: 'rgba(139,92,246,0.14)' }
  }

  const isTD = mainTab === 'trustdubai'
  const baseLeads = isTD ? tdLeads : myLeads
  const today = new Date().toISOString().split('T')[0]

  function matchesQuick(l) {
    if (quickFilter === 'due') return l.follow_up_date === today && !['won','lost'].includes(l.status)
    if (quickFilter === 'overdue') return l.follow_up_date && l.follow_up_date < today && !['won','lost'].includes(l.status)
    if (quickFilter === 'hot') return l.temperature === 'hot' && !['won','lost'].includes(l.status)
    return true
  }

  const filtered = baseLeads.filter(l => {
    const q = search.trim().toLowerCase()
    if (q && !(`${l.name || ''} ${l.phone || ''} ${l.email || ''}`.toLowerCase().includes(q))) return false
    if (!isTD && fSource !== 'all' && mySource(l) !== fSource) return false
    if (!matchesQuick(l)) return false
    return true
  })

  const dueToday = baseLeads.filter(l => l.follow_up_date === today && !['won','lost'].includes(l.status)).length
  const overdue  = baseLeads.filter(l => l.follow_up_date && l.follow_up_date < today && !['won','lost'].includes(l.status)).length
  const hotCount = baseLeads.filter(l => l.temperature === 'hot' && !['won','lost'].includes(l.status)).length
  const wonCount = baseLeads.filter(l => l.status === 'won').length
  const wonRate  = baseLeads.length > 0 ? Math.round((wonCount / baseLeads.length) * 100) : 0
  const mySrcCount = (k) => myLeads.filter(l => mySource(l) === k).length

  function toggleSource(k) { setFSource(prev => prev === k ? 'all' : k) }
  function toggleQuick(k) { setQuickFilter(prev => prev === k ? '' : k) }
  function nextStage(stage) {
    const i = PIPELINE.findIndex(p => p.stage === stage)
    if (i >= 0 && i < PIPELINE.length - 1) return PIPELINE[i + 1].stage
    return stage
  }

  const QUICK_LABELS = { due: 'Due today', overdue: 'Overdue', hot: 'Hot leads' }

  const card = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 16 }
  const inputStyle = { border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }
  const selectStyle = {
    ...inputStyle,
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    backgroundImage: SELECT_CHEVRON, backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center', paddingRight: 30,
  }
  const waMsg = (l) => 'https://wa.me/' + (l.phone || '').replace(/[^0-9]/g, '') + '?text=Hi ' + (l.name || '') + ', regarding your inquiry. How can I help you?'
  const optStyle = { background: 'var(--card)', color: 'var(--text)' }

  function waNumber(lead) {
    const wa = lead.answers?.['WhatsApp'] || lead.answers?.whatsapp || ''
    const num = (wa || lead.phone || '').replace(/[^0-9]/g, '')
    return num
  }
  function callNumber(lead) {
    return (lead.phone || '').replace(/[^0-9+]/g, '')
  }

  function LeadCard({ lead, draggable }) {
    const temp = TEMP[lead.temperature] || TEMP.warm
    const accent = lead.isPlatform ? '#0891b2' : mySourceBadge(lead).color
    const isOverdue = lead.follow_up_date && lead.follow_up_date < today && !['won','lost'].includes(lead.status)
    const isDueToday = lead.follow_up_date === today
    const proj = lead.answers?.['Project Type'] || lead.answers?.category || ''
    const budget = lead.answers?.['Budget (AED)'] || lead.answers?.budget || ''
    const isClosed = ['won','lost'].includes(lead.status)
    const callNo = callNumber(lead)
    const waNo = waNumber(lead)
    const canMove = !isClosed
    return (
      <div
        draggable={draggable}
        onDragStart={draggable ? () => setDragId(lead) : undefined}
        onDragEnd={draggable ? () => setDragId(null) : undefined}
        onClick={() => openModal(lead)}
        style={{ background: 'var(--bg2)', borderRadius: 9, padding: 10, marginBottom: 7, borderLeft: '3px solid ' + accent, cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{lead.name || 'Anonymous'}</div>
          <span style={{ fontSize: 8.5, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: temp.bg, color: temp.color, flexShrink: 0 }}>{temp.label}</span>
        </div>
        {(proj || budget) && <div style={{ fontSize: 10, color: 'var(--text3)', margin: '3px 0' }}>{proj}{budget ? ' · ' + budget : ''}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {lead.isPlatform
            ? <span style={{ fontSize: 8.5, padding: '1px 6px', borderRadius: 99, background: 'rgba(8,145,178,0.14)', color: '#0891b2' }}>Rank #{lead.rank}</span>
            : <span style={{ fontSize: 8.5, padding: '1px 6px', borderRadius: 99, background: mySourceBadge(lead).bg, color: mySourceBadge(lead).color }}>{mySourceBadge(lead).label}</span>}
          {isOverdue && <span style={{ fontSize: 9, color: '#ef4444' }}><i className="ti ti-clock" style={{ fontSize: 10 }} /> Overdue</span>}
          {!isOverdue && isDueToday && <span style={{ fontSize: 9, color: '#f59e0b' }}><i className="ti ti-clock" style={{ fontSize: 10 }} /> Today</span>}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 9 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => canMove && updateLeadStage(lead, nextStage(lead.status))}
            disabled={!canMove || updatingStatus === lead.key}
            title={canMove ? 'Move to next stage' : 'Lead is closed'}
            style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '7px 4px', borderRadius: 8, border: 'none',
              background: canMove ? '#0099cc' : 'var(--bg)', color: canMove ? '#fff' : 'var(--text3)',
              cursor: canMove ? 'pointer' : 'not-allowed', opacity: canMove ? 1 : 0.55,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, whiteSpace: 'nowrap' }}>
            <i className="ti ti-arrow-right" style={{ fontSize: 13 }} /> Move
          </button>

          <button
            onClick={() => callNo && window.open('tel:' + callNo, '_self')}
            disabled={!callNo}
            title={callNo ? 'Call ' + lead.phone : 'No phone number'}
            style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '7px 4px', borderRadius: 8, border: 'none',
              background: callNo ? 'rgba(8,145,178,0.14)' : 'var(--bg)', color: callNo ? '#0077a3' : 'var(--text3)',
              cursor: callNo ? 'pointer' : 'not-allowed', opacity: callNo ? 1 : 0.55,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <i className="ti ti-phone" style={{ fontSize: 13 }} /> Call
          </button>

          <button
            onClick={() => waNo && openModal(lead)}
            disabled={!waNo}
            title={waNo ? 'Open templates & send WhatsApp' : 'No WhatsApp number'}
            style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '7px 4px', borderRadius: 8, border: 'none',
              background: waNo ? 'rgba(34,197,94,0.14)' : 'var(--bg)', color: waNo ? '#0f7a52' : 'var(--text3)',
              cursor: waNo ? 'pointer' : 'not-allowed', opacity: waNo ? 1 : 0.55,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <i className="ti ti-brand-whatsapp" style={{ fontSize: 13 }} /> WA
          </button>
        </div>
      </div>
    )
  }

  function AddLeadModal() {
    if (!showAdd) return null
    const lbl = { fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 5 }
    const lblSm = { fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 4 }
    return (
      <div onClick={closeAdd} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 210, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: mobile ? 0 : '24px 16px', overflowY: 'auto' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: mobile ? '100%' : 480, minHeight: mobile ? '100%' : 'auto', background: 'var(--card)', borderRadius: mobile ? 0 : 14, border: '0.5px solid var(--border)' }}>

          <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--card)', padding: '14px 18px', paddingTop: mobile ? `calc(14px + ${SAFE_TOP})` : 14, borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: mobile ? 0 : '14px 14px 0 0' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Add new lead</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Just name & phone is enough</div>
            </div>
            <button onClick={closeAdd} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20 }}><i className="ti ti-x" /></button>
          </div>

          <div style={{ padding: 18 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Client name <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={addF.name} onChange={e => setA('name', e.target.value)} placeholder="e.g. Mr Ankit Sharma" style={{ width: '100%', padding: '9px 11px', ...inputStyle, fontSize: 13 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Phone (Primary) <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={addF.phone} onChange={e => setA('phone', e.target.value)} placeholder="+971 50 XXX XXXX" style={{ width: '100%', padding: '9px 11px', ...inputStyle, fontSize: 13 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Lead source <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={addF.source} onChange={e => setA('source', e.target.value)} style={{ width: '100%', padding: '9px 11px', ...selectStyle, fontSize: 13 }}>
                {LEAD_SOURCES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Project type</label>
              <select value={addF.projectType} onChange={e => setA('projectType', e.target.value)} style={{ width: '100%', padding: '9px 11px', ...selectStyle, fontSize: 13 }}>
                <option value="" style={optStyle}>Select</option>
                {PROJECT_TYPES.map(p => <option key={p} value={p} style={optStyle}>{p}</option>)}
              </select>
            </div>
          </div>

          <div onClick={() => setAddMore(v => !v)} style={{ borderTop: '0.5px dashed var(--border)', paddingTop: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0099cc' }}><i className={'ti ' + (addMore ? 'ti-minus' : 'ti-plus')} style={{ fontSize: 13 }} /> More details (optional)</span>
            <i className={'ti ' + (addMore ? 'ti-chevron-up' : 'ti-chevron-down')} style={{ fontSize: 15, color: '#0099cc' }} />
          </div>

          {addMore && (
            <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: 13, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 11 }}>
                <div><label style={lblSm}>Email</label><input value={addF.email} onChange={e => setA('email', e.target.value)} placeholder="name@email.com" style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12 }} /></div>
                <div><label style={lblSm}>WhatsApp (if different)</label><input value={addF.whatsapp} onChange={e => setA('whatsapp', e.target.value)} placeholder="+971 ..." style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12 }} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 11 }}>
                <div><label style={lblSm}>Location</label><input value={addF.location} onChange={e => setA('location', e.target.value)} placeholder="e.g. Business Bay" style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12 }} /></div>
                <div><label style={lblSm}>Budget (AED)</label><input value={addF.budget} onChange={e => setA('budget', e.target.value)} placeholder="e.g. 50,000" style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12 }} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 11 }}>
                <div><label style={lblSm}>Next follow-up</label><input type="date" value={addF.followUp} onChange={e => setA('followUp', e.target.value)} style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12 }} /></div>
                <div><label style={lblSm}>Status</label>
                  <select value={addF.status} onChange={e => setA('status', e.target.value)} style={{ width: '100%', padding: '7px 9px', ...selectStyle, fontSize: 12 }}>
                    {LEAD_STATUSES.map(s => <option key={s.value} value={s.value} style={optStyle}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 11 }}>
                <label style={lblSm}>Priority</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Object.entries(TEMP).map(([k, v]) => (
                    <button key={k} onClick={() => setA('temp', k)}
                      style={{ flex: 1, fontSize: 11, padding: '6px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                        border: '0.5px solid ' + (addF.temp === k ? v.color : 'var(--border)'),
                        background: addF.temp === k ? v.bg : 'var(--card)', color: addF.temp === k ? v.color : 'var(--text2)' }}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lblSm}>Requirements / notes</label>
                <textarea value={addF.notes} onChange={e => setA('notes', e.target.value)} placeholder="What does the client need…" style={{ width: '100%', minHeight: 44, padding: '7px 9px', ...inputStyle, fontSize: 12, resize: 'vertical' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, paddingBottom: mobile ? `calc(4px + env(safe-area-inset-bottom))` : 0 }}>
            <button onClick={saveAddLead} disabled={savingAdd} style={{ flex: 1, padding: 10, borderRadius: 8, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{savingAdd ? 'Saving...' : 'Save lead'}</button>
            <button onClick={closeAdd} style={{ padding: '10px 18px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
          </div>
          </div>
        </div>
      </div>
    )
  }

  function Modal() {
    if (!openLead) return null
    const lead = openLead
    const sc = LEAD_STATUSES.find(s => s.value === lead.status) || LEAD_STATUSES[0]
    const srcLabel = lead.isPlatform ? 'TrustDubai · Rank #' + lead.rank : mySourceBadge(lead).label
    const isOverdue = lead.follow_up_date && lead.follow_up_date < today && !['won','lost'].includes(lead.status)
    const proj = lead.answers?.['Project Type'] || lead.answers?.category || ''
    const budget = lead.answers?.['Budget (AED)'] || lead.answers?.budget || ''
    const loc = lead.answers?.['Location'] || lead.answers?.area || ''
    return (
      <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: mobile ? 0 : '24px 16px', overflowY: 'auto' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: mobile ? '100%' : 560, minHeight: mobile ? '100%' : 'auto', background: 'var(--card)', borderRadius: mobile ? 0 : 14, border: '0.5px solid var(--border)' }}>

          <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--card)', padding: '14px 18px', paddingTop: mobile ? `calc(14px + ${SAFE_TOP})` : 14, borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderRadius: mobile ? 0 : '14px 14px 0 0' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.name || 'Anonymous'}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{srcLabel} · {new Date(lead.created_at).toLocaleDateString('en-AE')}</div>
            </div>
            <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20, flexShrink: 0, marginLeft: 10 }}><i className="ti ti-x" /></button>
          </div>

          <div style={{ padding: 18 }}>

          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: (TEMP[lead.temperature]||TEMP.warm).bg, color: (TEMP[lead.temperature]||TEMP.warm).color }}>{(TEMP[lead.temperature]||TEMP.warm).label}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: sc.bg, color: sc.color }}>{sc.label}</span>
            {isOverdue && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: 'rgba(239,68,68,0.14)', color: '#ef4444' }}><i className="ti ti-clock" style={{ fontSize: 11 }} /> Overdue</span>}
          </div>

          <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
            {lead.phone && <a href={waMsg(lead)} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: 8, borderRadius: 8, background: 'rgba(34,197,94,0.14)', color: '#0f7a52', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><i className="ti ti-brand-whatsapp" style={{ fontSize: 15 }} />WhatsApp</a>}
            {lead.phone && <a href={'tel:' + lead.phone} style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: 8, borderRadius: 8, background: 'rgba(8,145,178,0.14)', color: '#0077a3', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><i className="ti ti-phone" style={{ fontSize: 15 }} />Call</a>}
            {lead.email && <a href={'mailto:' + lead.email} style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: 8, borderRadius: 8, background: 'var(--bg2)', color: 'var(--text2)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><i className="ti ti-mail" style={{ fontSize: 15 }} />Email</a>}
          </div>

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

          <div style={{ border: '0.5px solid var(--border)', borderRadius: 10, padding: 13, marginBottom: 12 }}>
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
              style={{ width: '100%', minHeight: 50, padding: '8px 10px', ...inputStyle, fontSize: 12, resize: 'vertical', marginBottom: 9 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 9 }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Next follow-up</label>
                <input type="date" value={logNext} onChange={e => setLogNext(e.target.value)} style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12 }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Move to stage</label>
                <select value={logStage} onChange={e => setLogStage(e.target.value)} style={{ width: '100%', padding: '7px 9px', ...selectStyle, fontSize: 12 }}>
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

          <div style={{ border: '0.5px solid var(--border)', borderRadius: 10, padding: 13, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}><i className="ti ti-message-2" style={{ fontSize: 14, color: '#0f7a52' }} /> Send follow-up message</div>
            <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Quick templates</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {DEFAULT_TEMPLATES.map(t => (
                <button key={t.name} onClick={() => setMsgText(fillTemplate(t.body, lead))}
                  style={{ fontSize: 10, padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: 'var(--bg2)', color: 'var(--text2)' }}>{t.name}</button>
              ))}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>My templates</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {templates.map(t => (
                <span key={t.id} style={{ fontSize: 10, padding: '5px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.12)', color: '#7c3aed', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ cursor: 'pointer' }} onClick={() => setMsgText(fillTemplate(t.body, lead))}>{t.name}</span>
                  <i className="ti ti-x" style={{ fontSize: 11, opacity: 0.6, cursor: 'pointer' }} onClick={() => deleteTemplate(t.id)} />
                </span>
              ))}
              <button onClick={() => setShowNewTpl(v => !v)}
                style={{ fontSize: 10, padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', border: '0.5px dashed var(--border)', background: 'transparent', color: 'var(--text2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-plus" style={{ fontSize: 12 }} /> New template
              </button>
            </div>
            {showNewTpl && (
              <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 11, marginBottom: 10 }}>
                <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder='Template name — e.g. "Ramadan greeting"'
                  style={{ width: '100%', padding: '7px 10px', ...inputStyle, fontSize: 12, marginBottom: 7 }} />
                <textarea value={tplBody} onChange={e => setTplBody(e.target.value)} placeholder="Message text… use {name} for customer name, {req} for requirement"
                  style={{ width: '100%', minHeight: 44, padding: '7px 10px', ...inputStyle, fontSize: 12, resize: 'vertical', marginBottom: 4 }} />
                <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 8 }}>Tip: {'{name}'} = customer name, {'{req}'} = requirement (auto-filled when sending)</div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <button onClick={saveTemplate} style={{ flex: 1, padding: 8, borderRadius: 8, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Save template</button>
                  <button onClick={() => { setShowNewTpl(false); setTplName(''); setTplBody('') }} style={{ padding: '8px 14px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                </div>
              </div>
            )}
            <textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Tap a template above or write your message..."
              style={{ width: '100%', minHeight: 50, padding: '8px 10px', ...inputStyle, fontSize: 12, resize: 'vertical', marginBottom: 9 }} />
            <button onClick={sendWhatsApp} disabled={!lead.phone}
              style={{ width: '100%', padding: 9, borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', cursor: lead.phone ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600, opacity: lead.phone ? 1 : 0.5 }}>
              <i className="ti ti-brand-whatsapp" style={{ fontSize: 14 }} /> Send on WhatsApp
            </button>
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Timeline</div>
          {tlLoading ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: 10 }}>Loading...</div>
          ) : timeline.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: 10 }}>No activity yet — log your first follow-up.</div>
          ) : (
            <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginLeft: 4, paddingBottom: mobile ? `calc(4px + env(safe-area-inset-bottom))` : 0 }}>
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
      </div>
    )
  }

  function Board() {
    if (baseLeads.length === 0) {
      return (
        <div style={{ ...card, textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{isTD ? '🎯' : '📭'}</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>{isTD ? 'No TrustDubai leads yet' : 'No leads yet'}</h3>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
            {isTD ? 'Verified leads from the TrustDubai platform will appear here automatically.' : 'Add a lead manually, import a CSV, or connect your Meta ad account.'}
          </p>
          {!isTD && <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={openAdd}>+ Add Lead</button>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>⬆ Import CSV</button>
          </div>}
        </div>
      )
    }
    if (quickFilter && filtered.length === 0) {
      const msg = quickFilter === 'due' ? "No follow-ups due today — you're all caught up!" : quickFilter === 'overdue' ? 'No overdue follow-ups — nicely done!' : 'No hot leads right now.'
      return (
        <div style={{ ...card, textAlign: 'center', padding: '50px 20px' }}>
          <i className="ti ti-circle-check" style={{ fontSize: 40, color: '#10b981', display: 'block', marginBottom: 12 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{msg}</h3>
          <button onClick={() => setQuickFilter('')} className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Show all leads</button>
        </div>
      )
    }
    if (view === 'board' && mobile) {
      return (
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
      )
    }
    if (view === 'board') {
      return (
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
      )
    }
    return (
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                <th style={{ textAlign: 'left', padding: '11px 14px', fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '11px 10px', fontWeight: 600 }}>{isTD ? 'Rank' : 'Source'}</th>
                <th style={{ textAlign: 'left', padding: '11px 10px', fontWeight: 600 }}>Stage</th>
                <th style={{ textAlign: 'right', padding: '11px 14px', fontWeight: 600 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => {
                const sc = LEAD_STATUSES.find(s => s.value === lead.status) || LEAD_STATUSES[0]
                return (
                  <tr key={lead.key} onClick={() => openModal(lead)} style={{ borderTop: '0.5px solid var(--border)', cursor: 'pointer' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg2)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(lead.name || 'A')[0].toUpperCase()}</div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{lead.name || 'Anonymous'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{lead.phone || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      {lead.isPlatform
                        ? <span style={{ background: 'rgba(8,145,178,0.12)', color: '#0891b2', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>#{lead.rank}</span>
                        : <span style={{ background: mySourceBadge(lead).bg, color: mySourceBadge(lead).color, fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>{mySourceBadge(lead).label}</span>}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <select value={lead.status} onClick={e => e.stopPropagation()} onChange={e => updateLeadStage(lead, e.target.value)} disabled={updatingStatus === lead.key}
                        style={{ padding: '4px 26px 4px 10px', borderRadius: 20, border: '1px solid ' + sc.color, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', backgroundImage: SELECT_CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
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
    )
  }

  function Toolbar() {
    const STAT_CARDS = [
      { key: 'due',     label: 'Due today', value: dueToday, color: '#0891b2', icon: 'ti-clock', click: true },
      { key: 'overdue', label: 'Overdue',   value: overdue,  color: '#ef4444', icon: 'ti-alert-triangle', click: true },
      { key: 'hot',     label: 'Hot',       value: hotCount, color: '#d85a30', icon: 'ti-flame', click: true },
      { key: 'won',     label: 'Won rate',  value: wonRate + '%', color: '#10b981', icon: 'ti-trophy', click: false },
    ]
    return (
      <>
        {baseLeads.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
            {STAT_CARDS.map(s => {
              const active = s.click && quickFilter === s.key
              return (
                <div key={s.key} onClick={s.click ? () => toggleQuick(s.key) : undefined}
                  style={{ ...card, padding: '11px 14px', cursor: s.click ? 'pointer' : 'default',
                    borderColor: active ? s.color : 'var(--border)', borderWidth: active ? 1.5 : 0.5, borderStyle: 'solid' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5 }}><i className={'ti ' + s.icon} style={{ fontSize: 12, color: s.color }} /> {s.label}</div>
                    {active && <i className="ti ti-circle-check-filled" style={{ fontSize: 13, color: s.color }} />}
                  </div>
                  <div style={{ fontSize: 21, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
                </div>
              )
            })}
          </div>
        )}

        {quickFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg2)', borderRadius: 8, padding: '8px 13px', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Showing: <b style={{ color: 'var(--text)' }}>{QUICK_LABELS[quickFilter]}</b> · {filtered.length} {filtered.length === 1 ? 'lead' : 'leads'}</span>
            <button onClick={() => setQuickFilter('')} style={{ marginLeft: 'auto', fontSize: 12, color: '#0099cc', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-x" style={{ fontSize: 13 }} /> Show all
            </button>
          </div>
        )}

        {!isTD && myLeads.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {SOURCE_CARDS.map(s => {
              const active = fSource === s.key
              return (
                <div key={s.key} onClick={() => toggleSource(s.key)}
                  style={{ flex: 1, minWidth: 110, ...card, padding: '9px 13px', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', borderColor: active ? s.color : 'var(--border)', borderWidth: active ? 1.5 : 0.5, borderStyle: 'solid' }}>
                  <i className={'ti ' + s.icon} style={{ fontSize: 16, color: s.color }} />
                  <div><span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{mySrcCount(s.key)}</span> <span style={{ fontSize: 10, color: 'var(--text2)' }}>{s.label}</span></div>
                  {active && <i className="ti ti-circle-check-filled" style={{ fontSize: 14, color: s.color, marginLeft: 'auto' }} />}
                </div>
              )
            })}
          </div>
        )}

        {baseLeads.length > 0 && (
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
            {!isTD && <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Lead</button>}
            {!isTD && <button className="btn btn-secondary btn-sm" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? 'Importing...' : '⬆ Import'}</button>}
          </div>
        )}
      </>
    )
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>

  return (
    <div className="page-content animate-in" style={{ color: 'var(--text)' }}>
      <Modal />
      <AddLeadModal />
      <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: 'none' }} />

      <div style={{ marginBottom: 18 }}>
        <h1 className="font-syne fw-700" style={{ fontSize: 23, marginBottom: 4, color: 'var(--text)' }}>Lead Hub</h1>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>Capture, track and close — every lead in one place</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {[
          { id: 'trustdubai', label: 'TrustDubai Leads', count: tdLeads.length, icon: 'ti-shield-check' },
          { id: 'mine',       label: 'My Leads',         count: myLeads.length, icon: 'ti-building-store' },
          { id: 'forms',      label: 'Forms',            count: forms.length,   icon: 'ti-forms' },
        ].map(t => (
          <button key={t.id} onClick={() => { setMainTab(t.id); setFSource('all'); setSearch(''); setQuickFilter(''); closeEditor() }} style={{
            padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
            color: mainTab === t.id ? 'var(--primary)' : 'var(--text2)',
            borderBottom: mainTab === t.id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1
          }}>
            <i className={'ti ' + t.icon} style={{ fontSize: 15 }} /> {t.label} <span style={{ fontSize: 11, opacity: 0.7 }}>({t.count})</span>
          </button>
        ))}
      </div>

      {mainTab === 'trustdubai' && (
        <div>
          <div style={{ background: 'rgba(8,145,178,0.07)', border: '0.5px solid rgba(8,145,178,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 9 }}>
            <i className="ti ti-shield-check" style={{ fontSize: 18, color: '#0891b2' }} />
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Verified leads delivered to you by the <b style={{ color: '#0891b2' }}>TrustDubai</b> platform, ranked by match.</div>
          </div>
          <Toolbar />
          <Board />
        </div>
      )}

      {mainTab === 'mine' && (
        <div>
          <div style={{ background: 'rgba(139,92,246,0.07)', border: '0.5px solid rgba(139,92,246,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 9 }}>
            <i className="ti ti-building-store" style={{ fontSize: 18, color: '#7c3aed' }} />
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Your own leads — from Meta ads, WhatsApp, manual entry and CSV imports. <span style={{ color: 'var(--text3)' }}>Meta auto-sync coming soon.</span></div>
          </div>
          <Toolbar />
          <Board />
        </div>
      )}

      {mainTab === 'forms' && (
        <div>
          {!editingForm ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--text2)' }}>Create lead capture forms to embed or share — submissions land in My Leads.</p>
                <button className="btn btn-primary btn-sm" onClick={() => setShowNewForm(true)}>+ New Form</button>
              </div>

              {showNewForm && (
                <div style={{ ...card, marginBottom: 16 }}>
                  <div className="card-title" style={{ marginBottom: 12 }}>New Form</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input value={newFormTitle} onChange={e => setNewFormTitle(e.target.value)} placeholder="Form title e.g. Interior Design Inquiry"
                      style={{ flex: '1 1 200px', padding: '10px 14px', ...inputStyle }} onKeyDown={e => e.key === 'Enter' && createForm()} />
                    <button className="btn btn-primary btn-sm" onClick={createForm}>Create</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowNewForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px' }}>
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
          ) : (
            <div>
              <button onClick={closeEditor} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-arrow-left" style={{ fontSize: 15 }} /> Back to forms
              </button>
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
                            <select value={q.type} onChange={e => updateQuestion(q.id, 'type', e.target.value)} style={{ padding: '8px 26px 8px 10px', ...selectStyle, fontSize: 12 }}>
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
                      <button className="btn btn-secondary" onClick={closeEditor}>Back</button>
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}
