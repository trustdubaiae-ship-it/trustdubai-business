import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { Trash2 } from 'lucide-react'
import LeadVisualViews from './LeadVisualViews'

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

// quick reasons shown when closing/losing a lead
const LOST_REASONS = ['Budget too low', 'Out of our area', 'Out of our scope', 'Not interested', 'No response', 'Timeline mismatch', 'Went with competitor', 'Spam / Junk', 'Duplicate', 'Other']

const STATUS_MAP = {
  'new':'new', 'contacted':'in_conversation', 'in conversation':'in_conversation',
  'interested':'qualified', 'qualified':'qualified',
  'proposal sent':'proposal_given', 'proposal given':'proposal_given', 'proposal':'proposal_given',
  'won':'won', 'lost':'lost',
}

const DIST_TO_PAGE = { assigned:'new', viewed:'qualified', contacted:'in_conversation', quoted:'proposal_given', won:'won', lost:'lost', transferred:'lost' }
const PAGE_TO_DIST = { new:'assigned', qualified:'viewed', in_conversation:'contacted', proposal_given:'quoted', won:'won', lost:'lost' }

// Reassign SLA window (hours) — matches platform 12h rule
const SLA_HOURS = 12

// Public site base (where the shareable lead form lives) — NOT the business portal origin
const PUBLIC_BASE = 'https://quvera.ae'

// normalise a phone for duplicate matching — digits only, compare the last 9
// (so +971 50…, 0050…, 50… all match the same UAE number)
const normPhone = p => { const d = (p || '').replace(/\D/g, ''); return d.length > 9 ? d.slice(-9) : d }

// extract a number from a budget string ("AED 50,000" / "50000-80000" -> 80000)
const parseBudget = raw => { if (raw == null) return 0; const d = String(raw).replace(/[, ]/g, '').match(/\d+/g); return d ? Math.max(...d.map(Number)) : 0 }

const SOURCE_CARDS = [
  { key:'meta',     label:'Meta',        icon:'ti-brand-meta',     color:'#3b82f6' },
  { key:'whatsapp', label:'WhatsApp',    icon:'ti-brand-whatsapp', color:'#22c55e' },
  { key:'public',   label:'Public / QR', icon:'ti-qrcode',         color:'#0891b2' },
  { key:'own',      label:'Manual',      icon:'ti-user-plus',      color:'#8b5cf6' },
]

const STATUS_FILTERS = [
  { key:'new',             label:'New' },
  { key:'qualified',       label:'Qualified' },
  { key:'in_conversation', label:'Contacted' },
  { key:'proposal_given',  label:'Quoted' },
  { key:'won',             label:'Won' },
  { key:'lost',            label:'Lost' },
]

function FilterChip({ label, onClear }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:99, padding:'4px 6px 4px 10px', fontSize:11.5, fontWeight:600, color:'var(--text)' }}>
      {label}
      <button onClick={onClear} title="Remove filter" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:16, height:16, borderRadius:'50%', border:'none', background:'var(--bg2)', color:'var(--text2)', cursor:'pointer', padding:0 }}>
        <i className="ti ti-x" style={{ fontSize:11 }} />
      </button>
    </span>
  )
}

const LEAD_SOURCES = ['Meta Ads','WhatsApp','Instagram','Referral','Walk-in','Website','Direct Call','Holiday Home Operator','Other']

const PROJECT_TYPES = ['Villa Renovation','Apartment Renovation','Office Fit-out','Retail Fit-out','Holiday Home Beautification','Bathroom Renovation','Kitchen Renovation','False Ceiling','Flooring & Tiling','Painting & Wallpaper','Full Interior Design','MEP Works','Swimming Pool Area','Landscape & Outdoor','Commercial Renovation','Showroom Fit-out','Restaurant Fit-out','Hotel Room Renovation','TV Wall Panel','Joinery & Custom Furniture','Gypsum & Partition','AC / HVAC Works','Waterproofing','Villa Extension','Majlis Design','Wardrobe & Closet','Home Automation','Tiling & Marble','Demolition & Civil Works','Other']

const TEMP = {
  hot:  { label:'Hot',  color:'#ef4444', bg:'rgba(239,68,68,0.14)' },
  warm: { label:'Warm', color:'#f59e0b', bg:'rgba(245,158,11,0.14)' },
  cold: { label:'Cold', color:'#64748b', bg:'rgba(100,116,139,0.14)' },
}

const OUTCOMES = ['Called','WhatsApp','Site visit','Meeting','Email','No answer','Voicemail','Interested','Not interested']
// each follow-up outcome gets its own colour + icon (colourful chips like the 777 design)
const OUTCOME_META = {
  'Called':         { c: '#0891b2', ic: 'ti-phone-call' },
  'WhatsApp':       { c: '#22c55e', ic: 'ti-brand-whatsapp' },
  'Site visit':     { c: '#8b5cf6', ic: 'ti-map-pin' },
  'Meeting':        { c: '#3b82f6', ic: 'ti-calendar-event' },
  'Email':          { c: '#ec4899', ic: 'ti-mail' },
  'No answer':      { c: '#94a3b8', ic: 'ti-phone-off' },
  'Voicemail':      { c: '#f59e0b', ic: 'ti-microphone' },
  'Interested':     { c: '#16a34a', ic: 'ti-thumb-up' },
  'Not interested': { c: '#ef4444', ic: 'ti-thumb-down' },
}

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
  const { company, user } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  // Default Lead Hub tab = whichever tab you last picked (remembered per browser).
  const [mainTab, setMainTab] = useState(() => { try { return localStorage.getItem('lead_main_tab') || 'trustdubai' } catch { return 'trustdubai' } })
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
  const [view, setView] = useState(() => { try { return localStorage.getItem('td_leadhub_view') || 'board' } catch { return 'board' } })
  useEffect(() => { try { localStorage.setItem('td_leadhub_view', view) } catch {} }, [view])
  const [search, setSearch] = useState('')
  const [fSource, setFSource] = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [quickFilter, setQuickFilter] = useState('')
  const [minBudget, setMinBudget] = useState(0)   // company-wide, from companies.min_lead_budget
  async function saveMinBudget(v) {
    const n = Math.max(0, Math.round(Number(v) || 0))
    setMinBudget(n)
    if (!company?.id) return
    const { error } = await supabase.from('companies').update({ min_lead_budget: n || null }).eq('id', company.id)
    if (error) toast.error('Could not save min budget: ' + error.message)
  }
  useEffect(() => { setMinBudget(Number(company?.min_lead_budget) || 0) }, [company?.id, company?.min_lead_budget])
  function promptMinBudget() {
    const v = window.prompt('Minimum budget (AED) — leads below this are flagged "below budget". Set 0 to turn off.', minBudget || '')
    if (v === null) return
    saveMinBudget(v)
    if (!(Number(v) > 0) && quickFilter === 'belowbudget') setQuickFilter('')
  }
  const [mobileStage, setMobileStage] = useState('new')
  const [dragId, setDragId] = useState(null)

  // Share + QR
  const [shareForm, setShareForm] = useState(null)
  const [copied, setCopied] = useState(false)

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
  const [chatMsgs, setChatMsgs] = useState([])
  const [chatText, setChatText] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [aiReplyLoading, setAiReplyLoading] = useState(false)
  const [waDraft, setWaDraft] = useState(null)
  const [waDraftLoading, setWaDraftLoading] = useState(false)
  const [meetingForm, setMeetingForm] = useState(null) // null | { start, remind, notes }
  const [meetingSaving, setMeetingSaving] = useState(false)
  const [meetings, setMeetings] = useState([])         // upcoming company_meetings — powers each lead's "Next action"
  const [showNewTpl, setShowNewTpl] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplBody, setTplBody] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [addMore, setAddMore] = useState(false)
  const [savingAdd, setSavingAdd] = useState(false)
  const blankAdd = { name:'', phone:'', source:'Meta Ads', projectType:'', email:'', whatsapp:'', location:'', budget:'', followUp:'', status:'new', temp:'warm', notes:'' }
  const [addF, setAddF] = useState(blankAdd)
  const [dupMatch, setDupMatch] = useState(null)   // existing lead found while adding a duplicate
  const [lostFor, setLostFor] = useState(null)     // lead being closed — drives the "reason" popup
  const [lostNote, setLostNote] = useState('')
  const [editId, setEditId] = useState(null)

  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const mobile = vw < 768

  // tick every minute so the SLA timers stay live without a refresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (company) fetchAll() }, [company])

  async function fetchAll() {
    setLoading(true)
    const { data: formsData } = await supabase
      .from('lead_forms').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
    setForms(formsData || [])
    const { data: subData } = await supabase
      .from('lead_submissions').select('*').eq('company_id', company.id).order('created_at', { ascending: false }).limit(2000)
    setSubmissions(subData || [])
    const { data: distData } = await supabase
      .from('lead_distributions')
      .select('id, rank, status, assigned_at, follow_up_date, notes, temperature, lost_reason, lead_id, lead_submissions(id, name, phone, email, answers, created_at, source)')
      .eq('company_id', company.id)
      .order('assigned_at', { ascending: false }).limit(1000)
    setDistLeads(distData || [])
    const { data: tplData } = await supabase
      .from('message_templates').select('*').eq('company_id', company.id).order('sort_order', { ascending: true })
    setTemplates(tplData || [])
    const { data: mtgData } = await supabase
      .from('company_meetings').select('id, start_at, kind, status, lead_id')
      .eq('company_id', company.id).neq('status', 'cancelled')
      .order('start_at', { ascending: true }).limit(2000)
    setMeetings(mtgData || [])
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

  function openShare(form) { setShareForm(form); setCopied(false) }
  function closeShare() { setShareForm(null) }

  function openAdd() { setEditId(null); setAddF(blankAdd); setAddMore(false); setShowAdd(true) }
  function openEdit(lead) {
    const a = lead.answers || {}
    setEditId(lead.subId)
    setAddF({
      name: lead.name || '', phone: lead.phone || '', source: a['Source'] || 'Meta Ads',
      projectType: a['Project Type'] || '', email: lead.email || '', whatsapp: a['WhatsApp'] || '',
      location: a['Location'] || '', budget: a['Budget (AED)'] || '', followUp: lead.follow_up_date || '',
      status: lead.status || 'new', temp: lead.temperature || 'warm', notes: lead.notes || a['Notes'] || '',
    })
    setAddMore(!!(lead.email || a['WhatsApp'] || a['Location'] || a['Budget (AED)'] || lead.follow_up_date || lead.notes || a['Notes']))
    setShowAdd(true)
  }
  function closeAdd() { setShowAdd(false); setEditId(null) }
  function setA(k, v) { setAddF(p => ({ ...p, [k]: v })) }

  // find an existing lead with the same phone (or email) — across my leads + Quvera leads
  function findDuplicate() {
    const t = normPhone(addF.phone); if (!t) return null
    const em = (addF.email || '').trim().toLowerCase()
    for (const s of submissions) {
      if (editId && s.id === editId) continue
      if (normPhone(s.phone) === t || (em && (s.email || '').toLowerCase() === em))
        return { name: s.name, phone: s.phone, status: s.status, source: s.answers?.Source || s.source, created_at: s.created_at, kind: 'My lead' }
    }
    for (const d of distLeads) {
      const s = d.lead_submissions || {}
      if (normPhone(s.phone) === t || (em && (s.email || '').toLowerCase() === em))
        return { name: s.name, phone: s.phone, status: d.status, source: s.answers?.Source || s.source, created_at: s.created_at, kind: 'Quvera lead' }
    }
    return null
  }

  async function saveAddLead(force = false) {
    if (!addF.name.trim()) { toast.error('Client name is required'); return }
    if (!addF.phone.trim()) { toast.error('Phone is required'); return }
    if (!editId && !force) {
      const dup = findDuplicate()
      if (dup) { setDupMatch(dup); return }   // show duplicate popup instead of saving
    }
    setSavingAdd(true)
    const answers = {}
    answers['Source'] = addF.source
    if (addF.projectType) answers['Project Type'] = addF.projectType
    if (addF.location) answers['Location'] = addF.location
    if (addF.budget) answers['Budget (AED)'] = addF.budget
    if (addF.whatsapp) answers['WhatsApp'] = addF.whatsapp
    if (addF.notes) answers['Notes'] = addF.notes

    if (editId) {
      const { error: upErr } = await supabase.from('lead_submissions').update({
        name: addF.name.trim(), phone: addF.phone.trim(), email: addF.email.trim() || null,
        status: addF.status, status_updated_at: new Date().toISOString(),
        follow_up_date: addF.followUp || null, temperature: addF.temp, notes: addF.notes || null, answers,
      }).eq('id', editId)
      if (upErr) { setSavingAdd(false); toast.error('Could not update lead'); console.error(upErr); return }
      setSavingAdd(false); await fetchAll(); setShowAdd(false); setEditId(null); toast.success('Lead updated!'); return
    }

    const { error } = await supabase.from('lead_submissions').insert({
      company_id: company.id, name: addF.name.trim(), phone: addF.phone.trim(), email: addF.email.trim() || null,
      status: addF.status, status_updated_at: new Date().toISOString(),
      follow_up_date: addF.followUp || null, temperature: addF.temp, notes: addF.notes || null, answers,
    })
    if (error) { setSavingAdd(false); toast.error('Could not save lead'); console.error(error); return }

    await supabase.from('clients').insert({
      company_id: company.id,
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
    // closing a lead → ask for a reason first (Budget too low, etc.)
    if (newStage === 'lost') { setLostFor(lead); return }
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

  // close a lead as Lost with a reason; stores the reason (graceful if the
  // lost_reason column isn't migrated yet)
  async function closeAsLost(lead, reason) {
    const r = (reason || '').trim() || null
    setUpdatingStatus(lead.key)
    let res
    if (lead.distId) {
      res = await supabase.from('lead_distributions').update({ status: 'lost', status_updated_at: new Date().toISOString(), lost_reason: r }).eq('id', lead.distId)
      if (res.error) res = await supabase.from('lead_distributions').update({ status: 'lost', status_updated_at: new Date().toISOString() }).eq('id', lead.distId)
      if (!res.error) setDistLeads(prev => prev.map(d => d.id === lead.distId ? { ...d, status: 'lost', lost_reason: r } : d))
    } else {
      res = await supabase.from('lead_submissions').update({ status: 'lost', status_updated_at: new Date().toISOString(), lost_reason: r }).eq('id', lead.subId)
      if (res.error) res = await supabase.from('lead_submissions').update({ status: 'lost', status_updated_at: new Date().toISOString() }).eq('id', lead.subId)
      if (!res.error) setSubmissions(prev => prev.map(s => s.id === lead.subId ? { ...s, status: 'lost', lost_reason: r } : s))
    }
    if (res.error) { toast.error('Could not close lead: ' + res.error.message) }
    else {
      await supabase.from('lead_activity').insert({ lead_id: lead.subId || null, distribution_id: lead.distId || null, company_id: company.id, actor_name: company.name, kind: 'stage_change', old_stage: lead.status, new_stage: 'lost' })
      toast.success('Lead closed' + (r ? ' · ' + r : ''))
    }
    setUpdatingStatus(null); setLostFor(null)
    if (openLead?.key === lead.key) setOpenLead(null)
  }

  function leadReq(lead) {
    return lead.answers?.['Project Type'] || lead.answers?.category || lead.answers?.['Notes'] || 'project'
  }
  function fillTemplate(body, lead) {
    return (body || '').replace(/\{name\}/g, lead.name || '').replace(/\{req\}/g, leadReq(lead))
  }

  async function openModal(lead) {
    setOpenLead(lead)
    setLogOutcome(''); setLogNote(''); setLogStage(lead.status); setLogTemp(lead.temperature || 'warm')
    setLogNext(lead.nextMeeting ? toLocalInput(lead.nextMeeting.start_at) : (lead.follow_up_date ? String(lead.follow_up_date).slice(0, 10) + 'T09:00' : ''))
    setMsgText(''); setShowNewTpl(false); setTplName(''); setTplBody('')
    setTlLoading(true)
    const q = supabase.from('lead_activity').select('*').eq('company_id', company.id).order('created_at', { ascending: false })
    const { data } = lead.distId ? await q.eq('distribution_id', lead.distId) : await q.eq('lead_id', lead.subId)
    setTimeline(data || [])
    setTlLoading(false)
    setChatMsgs([]); setChatText(''); setWaDraft(null); setMeetingForm(null)
    loadChat(lead)
  }
  function closeModal() { setOpenLead(null); setTimeline([]); setChatMsgs([]); setChatText(''); setWaDraft(null); setMeetingForm(null) }

  async function loadChat(lead) {
    if (!lead || !lead.subId || !lead.isPlatform) { setChatMsgs([]); return }
    try {
      const { data } = await supabase
        .from('lead_chat')
        .select('id,sender_type,body,created_at,read_by_company,read_by_customer')
        .eq('lead_id', lead.subId)
        .eq('company_id', company.id)
        .order('created_at', { ascending: true })
      setChatMsgs(data || [])
      const unread = (data || []).filter(m => m.sender_type === 'customer' && !m.read_by_company)
      if (unread.length) {
        await supabase.from('lead_chat').update({ read_by_company: true })
          .eq('lead_id', lead.subId).eq('company_id', company.id).eq('sender_type', 'customer').eq('read_by_company', false)
      }
    } catch (e) { console.error('loadChat', e) }
  }

  async function sendChat() {
    const body = chatText.trim()
    if (!body || chatSending || !openLead?.subId) return
    setChatSending(true)
    const optimistic = { id: 'tmp' + Date.now(), sender_type: 'company', body, created_at: new Date().toISOString() }
    setChatMsgs(m => [...m, optimistic])
    setChatText('')
    try {
      await supabase.from('lead_chat').insert({
        lead_id: openLead.subId, company_id: company.id, customer_id: null,
        sender_type: 'company', body, read_by_company: true,
      })
    } catch (e) { console.error('sendChat', e) }
    finally { setChatSending(false) }
  }

  function aiLeadContext(lead) {
    return {
      name: lead.name || '',
      message: lead.answers?.Notes || lead.notes || '',
      project_type: lead.answers?.['Project Type'] || '',
      budget: lead.answers?.['Budget (AED)'] || '',
      area: lead.answers?.Location || '',
      source: lead.answers?.Source || lead.source || '',
    }
  }
  function aiError(data) {
    const code = data?.code
    if (code === 'no_credit') return 'AI credit khatam ho gaya'
    if (code === 'bad_key') return 'AI key invalid'
    if (code === 'rate_limit') return 'AI busy — thodi der baad try karo'
    return 'Could not generate a suggestion'
  }

  async function suggestChatReply() {
    const lead = openLead
    if (!lead || aiReplyLoading) return
    setAiReplyLoading(true)
    try {
      const conversation = chatMsgs.map(m => ({ from: m.sender_type === 'company' ? 'company' : 'customer', text: m.body }))
      const { data, error } = await supabase.functions.invoke('smart-function', {
        body: {
          action: 'reply', channel: 'chat',
          companyName: company.name || 'our company',
          companyCategory: company.categories?.[0] || company.category || '',
          lead: aiLeadContext(lead), conversation,
        },
      })
      if (error) throw error
      if (data?.reply) setChatText(data.reply)
      else toast.error(aiError(data))
    } catch (e) { console.error('suggestChatReply', e); toast.error('Could not suggest a reply') }
    finally { setAiReplyLoading(false) }
  }

  async function suggestWhatsApp(lead) {
    if (waDraftLoading) return
    setWaDraftLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('smart-function', {
        body: {
          action: 'reply', channel: 'whatsapp',
          companyName: company.name || 'our company',
          companyCategory: company.categories?.[0] || company.category || '',
          lead: aiLeadContext(lead),
        },
      })
      if (error) throw error
      if (data?.reply) setWaDraft(data.reply)
      else toast.error(aiError(data))
    } catch (e) { console.error('suggestWhatsApp', e); toast.error('Could not generate message') }
    finally { setWaDraftLoading(false) }
  }

  // format an ISO/date string for a <input type="datetime-local"> (local time, no seconds)
  function toLocalInput(d) {
    const dt = new Date(d); const p = n => String(n).padStart(2, '0')
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`
  }

  // The lead's "Next action" IS a single company_meetings row. Both the meeting form and the
  // Log-follow-up "Next" feed this — update the existing row if there is one (no duplicates),
  // and keep follow_up_date in sync so the card, stats and Planner all agree.
  async function upsertNextMeeting(lead, startLocal, kind = 'followup', notes = null, remind = 30) {
    if (!startLocal) return
    const kindLabel = { followup: 'Follow-up', meeting: 'Meeting', site_visit: 'Site Visit', call: 'Call' }[kind] || 'Follow-up'
    const base = { title: `${kindLabel} — ${lead.name || 'Lead'}`, kind, start_at: new Date(startLocal).toISOString() }
    if (notes != null) base.notes = notes
    if (remind != null) base.remind_minutes = parseInt(remind) || 0
    if (lead.nextMeeting?.id) {
      const { error } = await supabase.from('company_meetings').update(base).eq('id', lead.nextMeeting.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('company_meetings').insert({
        company_id: company.id, created_by_email: user?.email || null, status: 'scheduled',
        lead_id: lead.subId || null, lead_name: lead.name || null, ...base,
      })
      if (error) throw error
    }
    const dateOnly = String(startLocal).slice(0, 10)
    if (lead.distId) await supabase.from('lead_distributions').update({ follow_up_date: dateOnly }).eq('id', lead.distId)
    else if (lead.subId) await supabase.from('lead_submissions').update({ follow_up_date: dateOnly }).eq('id', lead.subId)
  }

  async function saveMeeting(lead) {
    const f = meetingForm
    if (!f?.start) { toast.error('Pick a date & time'); return }
    if (!user?.email) { toast.error('Sign in required'); return }
    setMeetingSaving(true)
    try {
      const existing = !!lead.nextMeeting?.id
      await upsertNextMeeting(lead, f.start, f.kind || 'followup', f.notes || null, f.remind)
      setMeetingForm(null)
      await fetchAll()
      toast.success(existing ? 'Next action updated ✓' : 'Scheduled ✓ — reminder set')
    } catch (e) { console.error('saveMeeting', e); toast.error('Meeting save failed: ' + (e?.message || e)) }
    finally { setMeetingSaving(false) }
  }

  useEffect(() => {
    if (!openLead || !openLead.isPlatform || !openLead.subId) return
    const t = setInterval(() => loadChat(openLead), 5000)
    return () => clearInterval(t)
  }, [openLead])

  async function saveLog() {
    if (!openLead) return
    setSavingLog(true)
    const lead = openLead
    const stageChanged = logStage !== lead.status
    const nextDate = logNext ? String(logNext).slice(0, 10) : null   // logNext is a datetime-local; store the date part
    let err = null
    if (lead.distId) {
      const res = await supabase.from('lead_distributions').update({
        follow_up_date: nextDate, notes: logNote || lead.notes, temperature: logTemp,
        ...(stageChanged ? { status: PAGE_TO_DIST[logStage] || 'assigned', status_updated_at: new Date().toISOString() } : {})
      }).eq('id', lead.distId)
      err = res.error
    } else {
      const res = await supabase.from('lead_submissions').update({
        follow_up_date: nextDate, notes: logNote || lead.notes, temperature: logTemp,
        ...(stageChanged ? { status: logStage, status_updated_at: new Date().toISOString() } : {})
      }).eq('id', lead.subId)
      err = res.error
    }
    if (err) { console.error('Save log failed:', err); toast.error('Save failed: ' + err.message); setSavingLog(false); return }
    await supabase.from('lead_activity').insert({
      lead_id: lead.subId || null, distribution_id: lead.distId || null, company_id: company.id,
      actor_name: company.name, kind: stageChanged ? 'stage_change' : 'follow_up',
      outcome: logOutcome || null, note: logNote || null, next_follow_up: nextDate,
      old_stage: stageChanged ? lead.status : null, new_stage: stageChanged ? logStage : null,
    })
    // the "Next" you set here is the same single record as the meeting — create/update it (with time) so nothing double-shows
    try { if (logNext) await upsertNextMeeting(lead, logNext, 'followup', logNote || null) } catch (e) { console.error('next-action sync', e) }
    await fetchAll()
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

  // ---- Create Quote from a lead ----
  const [creatingQuote, setCreatingQuote] = useState(false)
  async function createQuoteFromLead(lead) {
    if (!lead) return
    setCreatingQuote(true)
    try {
      const phoneDigits = (lead.phone || '').replace(/[^0-9]/g, '')
      let clientRow = null

      // 1) Try to find an existing client by phone (most reliable), else by exact name
      if (phoneDigits) {
        const { data } = await supabase.from('clients').select('*').eq('company_id', company.id).ilike('phone', `%${phoneDigits.slice(-9)}%`).limit(1)
        if (data && data.length) clientRow = data[0]
      }
      if (!clientRow && lead.name) {
        const { data } = await supabase.from('clients').select('*').eq('company_id', company.id).eq('name', lead.name).limit(1)
        if (data && data.length) clientRow = data[0]
      }

      // 2) If not found, create one
      if (!clientRow) {
        const { data, error } = await supabase.from('clients').insert({
          company_id: company.id,
          name: lead.name || 'Client',
          phone: lead.phone || null,
          email: lead.email || null,
          source: lead.answers?.['Source'] || (lead.isPlatform ? 'trustdubai' : 'lead'),
        }).select('*').single()
        if (error) throw error
        clientRow = data
      }

      // 3) Build a quote draft pre-filled with this client, then open the builder
      const projType = lead.answers?.['Project Type'] || lead.answers?.category || ''
      const loc = lead.answers?.['Location'] || lead.answers?.area || ''
      const draft = {
        mode: 'simple',
        client: {
          id: clientRow.id,
          uid: clientRow.uid || '',
          name: clientRow.name || lead.name || '',
          phone: clientRow.phone || lead.phone || '',
          email: clientRow.email || lead.email || '',
        },
        clientSearch: clientRow.name || lead.name || '',
        projectTitle: projType,
        items: [{ desc: '', unit: 'Nos', qty: 1, rate: 0 }],
        vatEnabled: true,
        discountType: null,
        discountValue: 0,
        notes: lead.answers?.['Notes'] || '',
        showFooter: true,
        showSignature: true,
        location: loc,
        preparedBy: '',
        clientEmail: clientRow.email || lead.email || '',
        sourceLead: { subId: lead.subId || null, distId: lead.distId || null, isPlatform: !!lead.isPlatform, status: lead.status || 'new' },
      }
      try { localStorage.setItem('td_quote_draft_v1', JSON.stringify(draft)) } catch {}

      closeModal()
      toast.success('Opening quote builder...')
      window.location.hash = 'quotations/builder'
    } catch (e) {
      console.error('Create quote failed:', e)
      toast.error('Could not start quote: ' + (e.message || 'unknown'))
    } finally {
      setCreatingQuote(false)
    }
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
        company_id: company.id,
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

  // earliest upcoming meeting per lead (today onward) — powers the card's "Next action" so it shows the timed meeting, not just a date
  const meetingsByLead = (() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const map = {}
    for (const m of meetings) {
      if (!m.lead_id || !m.start_at || new Date(m.start_at) < todayStart) continue
      const cur = map[m.lead_id]
      if (!cur || new Date(m.start_at) < new Date(cur.start_at)) map[m.lead_id] = { id: m.id, start_at: m.start_at, kind: m.kind }
    }
    return map
  })()
  function unifyDist(d) {
    const s = d.lead_submissions || {}
    return { key: 'dist-' + d.id, subId: s.id, distId: d.id, isPlatform: true, rank: d.rank,
      name: s.name, phone: s.phone, email: s.email, answers: s.answers || {},
      status: DIST_TO_PAGE[d.status] || 'new', created_at: d.assigned_at || s.created_at,
      assigned_at: d.assigned_at || s.created_at, nextMeeting: meetingsByLead[s.id] || null,
      follow_up_date: d.follow_up_date, notes: d.notes, temperature: d.temperature || 'warm', lostReason: d.lost_reason || null }
  }
  function unifyOwn(s) {
    return { key: 'own-' + s.id, subId: s.id, distId: null, isPlatform: false, rank: null,
      name: s.name, phone: s.phone, email: s.email, answers: s.answers || {}, source: s.source || null,
      status: s.status || 'new', created_at: s.created_at, assigned_at: s.created_at, nextMeeting: meetingsByLead[s.id] || null,
      follow_up_date: s.follow_up_date, notes: s.notes, temperature: s.temperature || 'warm', lostReason: s.lost_reason || null }
  }
  const tdLeads = distLeads.map(unifyDist)
  const myLeads = submissions.map(unifyOwn)

  function mySource(lead) {
    const col = (lead.source || '').toLowerCase()
    if (col === 'public_form') return 'public'
    const src = (lead.answers?.Source || '').toLowerCase()
    if (src.includes('meta') || src.includes('facebook') || src.includes('instagram')) return 'meta'
    if (src.includes('whatsapp')) return 'whatsapp'
    if (src.includes('qr') || src.includes('public form')) return 'public'
    return 'own'
  }
  const mySourceBadge = (lead) => {
    const k = mySource(lead)
    if (k === 'meta') return { label: 'Meta', color: '#3b82f6', bg: 'rgba(59,130,246,0.14)' }
    if (k === 'whatsapp') return { label: 'WhatsApp', color: '#22c55e', bg: 'rgba(34,197,94,0.14)' }
    if (k === 'public') return { label: 'Public / QR', color: '#0891b2', bg: 'rgba(8,145,178,0.14)' }
    return { label: 'Manual', color: '#8b5cf6', bg: 'rgba(139,92,246,0.14)' }
  }

  // Save the lead to the phone's contacts via a vCard (.vcf) — tapping it on a
  // phone opens the native "Add contact" screen.
  function addToContacts(lead) {
    const name = (lead.name || 'Lead').trim()
    const phone = (lead.phone || '').trim()
    const wa = (lead.answers?.['WhatsApp'] || lead.answers?.whatsapp || '').trim()
    const email = (lead.email || lead.answers?.['Email'] || '').trim()
    if (!phone && !wa && !email) { toast.error('No phone or email to save'); return }
    const note = [lead.answers?.['Project Type'], lead.answers?.['Location'], lead.answers?.['Budget (AED)'] && 'AED ' + lead.answers?.['Budget (AED)'], 'via Quvera']
      .filter(Boolean).join(' · ').replace(/[,;\\]/g, ' ')
    const esc = s => String(s || '').replace(/[,;\\]/g, ' ').trim()
    const vcard = [
      'BEGIN:VCARD', 'VERSION:3.0',
      `FN:${esc(name)}`, `N:${esc(name)};;;;`,
      phone ? `TEL;TYPE=CELL:${phone}` : '',
      wa && wa !== phone ? `TEL;TYPE=CELL,VOICE:${wa}` : '',
      email ? `EMAIL;TYPE=INTERNET:${email}` : '',
      note ? `NOTE:${note}` : '',
      'END:VCARD',
    ].filter(Boolean).join('\r\n')
    // iOS (iPhone/iPad) ignores the download attribute on a blob and just pops a
    // share sheet. Opening a data: vCard instead makes Safari show the native
    // "Add Contact" preview directly. Use the blob download elsewhere (desktop/Android).
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    try {
      if (isIOS) {
        const dataUrl = 'data:text/vcard;charset=utf-8,' + encodeURIComponent(vcard)
        const a = document.createElement('a')
        a.href = dataUrl; a.target = '_blank'; a.rel = 'noopener'
        document.body.appendChild(a); a.click()
        setTimeout(() => document.body.removeChild(a), 200)
        toast.success('Opening contact — tap "Create New Contact"')
        return
      }
      const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${name.replace(/[^\w\s-]/g, '').trim() || 'contact'}.vcf`
      document.body.appendChild(a); a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 200)
      toast.success('Contact card ready — open it to save')
    } catch (e) { toast.error('Could not create contact') }
  }

  // ---- SLA (response window) — REAL, from assigned_at + 12h reassign rule ----
  function slaInfo(lead) {
    // only meaningful for platform leads not yet acted on (still "new")
    const active = lead.isPlatform && lead.status === 'new'
    const base = lead.assigned_at || lead.created_at
    const hrsSince = base ? (Date.now() - new Date(base).getTime()) / 3600000 : 0
    const hrsLeft = SLA_HOURS - hrsSince
    const pct = Math.max(0, Math.min(1, hrsLeft / SLA_HOURS))
    const overdue = hrsLeft <= 0
    const color = overdue ? '#ef4444' : hrsLeft <= 4 ? '#f59e0b' : '#10b981'
    const left = hrsLeft >= 1 ? Math.ceil(hrsLeft) + 'h' : Math.max(1, Math.ceil(hrsLeft * 60)) + 'm'
    return { active, pct, overdue, color, left }
  }

  const isTD = mainTab === 'trustdubai'
  const baseLeads = isTD ? tdLeads : myLeads
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()  // LOCAL day (toISOString is UTC, shifts in Dubai UTC+4)
  // follow_up_date may be a date ('YYYY-MM-DD') or a timestamp — compare on the date part only
  const dateOnly = (d) => (d || '').slice(0, 10)

  // minimum-budget rule: a lead with a budget below the threshold is flagged
  function belowBudget(l) {
    if (minBudget <= 0) return false
    const b = parseBudget(l.answers?.['Budget (AED)'] || l.answers?.budget)
    return b > 0 && b < minBudget
  }
  function matchesQuick(l) {
    const fu = dateOnly(l.follow_up_date)
    if (quickFilter === 'due') return fu === today && !['won','lost'].includes(l.status)
    if (quickFilter === 'overdue') return fu && fu < today && !['won','lost'].includes(l.status)
    if (quickFilter === 'hot') return l.temperature === 'hot' && !['won','lost'].includes(l.status)
    if (quickFilter === 'belowbudget') return belowBudget(l) && !['won','lost'].includes(l.status)
    return true
  }

  const filtered = baseLeads.filter(l => {
    const q = search.trim().toLowerCase()
    if (q) {
      const hay = `${l.name || ''} ${l.phone || ''} ${l.email || ''} ${l.answers?.['Project Type'] || ''} ${l.answers?.Location || ''} ${l.answers?.Source || ''} ${l.answers?.['Budget (AED)'] || ''} ${l.notes || ''} ${l.answers?.Notes || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (!isTD && fSource !== 'all' && mySource(l) !== fSource) return false
    if (fStatus !== 'all' && l.status !== fStatus) return false
    if (!matchesQuick(l)) return false
    return true
  })

  const dueToday = baseLeads.filter(l => dateOnly(l.follow_up_date) === today && !['won','lost'].includes(l.status)).length
  const overdue  = baseLeads.filter(l => { const fu = dateOnly(l.follow_up_date); return fu && fu < today && !['won','lost'].includes(l.status) }).length
  const hotCount = baseLeads.filter(l => l.temperature === 'hot' && !['won','lost'].includes(l.status)).length
  const belowCount = baseLeads.filter(l => belowBudget(l) && !['won','lost'].includes(l.status)).length
  const wonCount = baseLeads.filter(l => l.status === 'won').length
  const wonRate  = baseLeads.length > 0 ? Math.round((wonCount / baseLeads.length) * 100) : 0
  const mySrcCount = (k) => myLeads.filter(l => mySource(l) === k).length

  function toggleSource(k) { setFSource(prev => prev === k ? 'all' : k) }
  function toggleQuick(k) { setQuickFilter(prev => prev === k ? '' : k) }
  function clearAllFilters() { setSearch(''); setFSource('all'); setFStatus('all'); setQuickFilter('') }
  const anyFilter = !!(search.trim() || (!isTD && fSource !== 'all') || fStatus !== 'all' || quickFilter)
  function nextStage(stage) {
    const i = PIPELINE.findIndex(p => p.stage === stage)
    if (i >= 0 && i < PIPELINE.length - 1) return PIPELINE[i + 1].stage
    return stage
  }

  const QUICK_LABELS = { due: 'Due today', overdue: 'Overdue', hot: 'Hot leads', belowbudget: 'Below budget' }

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
    const isOverdue = lead.follow_up_date && lead.follow_up_date < today && !['won','lost'].includes(lead.status)
    const isDueToday = lead.follow_up_date === today
    const proj = lead.answers?.['Project Type'] || lead.answers?.category || ''
    const budget = lead.answers?.['Budget (AED)'] || lead.answers?.budget || ''
    const isClosed = ['won','lost'].includes(lead.status)
    const isWon = lead.status === 'won'
    const dimCard = ['proposal_given','won','lost'].includes(lead.status)  // quoted/won/lost → dim the card
    const callNo = callNumber(lead)
    const waNo = waNumber(lead)
    const canMove = !isClosed

    // REAL response-timer (replaces the demo "match %"): % of the 12h window left
    const sla = slaInfo(lead)
    const C = 2 * Math.PI * 22 // ring circumference (r = 22)
    const loc = lead.answers?.['Location'] || lead.answers?.area || ''
    const sc = LEAD_STATUSES.find(s => s.value === lead.status) || LEAD_STATUSES[0]
    const budgetTxt = budget ? (/aed/i.test(String(budget)) ? String(budget) : 'AED ' + budget) : ''
    // palette follows the app theme — light board → light card, dark board → dark card
    const D = { text: 'var(--text)', sub: 'var(--text2)', mut: 'var(--text3)', line: 'var(--border)', surface: 'var(--bg2)' }
    // lead score (0–100) — drives the corner ring + first info row
    const score = (() => {
      if (lead.isPlatform && typeof lead.rank === 'number') return Math.max(45, 100 - (lead.rank - 1) * 7)
      let s = 45
      if (lead.phone) s += 15
      if (proj) s += 15
      if (budgetTxt) s += 15
      if (lead.answers?.['WhatsApp'] || lead.email) s += 8
      s += lead.temperature === 'hot' ? 12 : lead.temperature === 'warm' ? 6 : 0
      return Math.min(99, s)
    })()
    // ring shows the live SLA % while a Quvera lead is un-actioned, else the lead score — always visible
    const ring = sla.active
      ? { val: Math.round(sla.pct * 100), label: 'SLA', color: sla.color }
      : { val: score, label: 'SCORE', color: temp.color }
    // "time ago" from when the lead arrived
    const ago = (() => {
      if (!lead.created_at) return ''
      const d = (Date.now() - new Date(lead.created_at).getTime()) / 1000
      if (d < 60) return 'just now'
      if (d < 3600) return Math.floor(d / 60) + 'm ago'
      if (d < 86400) return Math.floor(d / 3600) + 'h ago'
      if (d < 2592000) return Math.floor(d / 86400) + 'd ago'
      return new Date(lead.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
    })()
    // Next-action band — a scheduled meeting (with time) wins; otherwise the date-only follow-up
    const KIND_LABEL = { followup: 'Follow-up', meeting: 'Meeting', site_visit: 'Site visit', call: 'Call' }
    const nextAction = lead.nextMeeting
      ? { label: (KIND_LABEL[lead.nextMeeting.kind] || 'Meeting') + ' · ' + new Date(lead.nextMeeting.start_at).toLocaleString('en-AE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }), color: '#0891b2', icon: 'ti-calendar-clock' }
      : isOverdue ? { label: 'Overdue — follow up now', color: '#f87171', icon: 'ti-alert-triangle' }
      : isDueToday ? { label: 'Follow up today', color: '#fbbf24', icon: 'ti-calendar-event' }
      : lead.follow_up_date ? { label: 'Follow up ' + new Date(lead.follow_up_date).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' }), color: '#e2b25f', icon: 'ti-calendar' }
      : { label: 'Set a follow-up', color: '#e2b25f', icon: 'ti-calendar-plus' }
    // Info rows (icon · label · value)
    const infoRows = [
      isWon
        ? { icon: 'ti-trophy', tint: '#f59e0b', label: 'Status', value: 'Won 🏆', vColor: '#b45309' }
        : { icon: 'ti-sparkles', tint: ring.color, label: ring.label === 'SLA' ? 'Response left' : 'Lead score', value: ring.val + '%', vColor: ring.color },
      budgetTxt && { icon: 'ti-coin', tint: '#34d399', label: 'Budget', value: budgetTxt },
      { icon: 'ti-arrow-up-right', tint: '#60a5fa', label: 'Source', value: lead.isPlatform ? 'Quvera · #' + lead.rank : mySourceBadge(lead).label },
    ].filter(Boolean)

    return (
      <div
        draggable={draggable}
        onDragStart={draggable ? () => setDragId(lead) : undefined}
        onDragEnd={draggable ? () => setDragId(null) : undefined}
        onClick={() => openModal(lead)}
        className="lead-kard"
        style={{ position: 'relative', background: `radial-gradient(135% 90% at 50% -12%, ${temp.color}24, transparent 55%), var(--card)`, border: '1px solid var(--border)', borderRadius: 18, padding: 14, marginBottom: 10, cursor: 'pointer', color: 'var(--text)', boxShadow: 'var(--shadow-md)', opacity: dimCard ? 0.62 : 1 }}
      >
        {/* top bar: HOT/temperature + menu/rank */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: temp.color, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: '.4px', boxShadow: `0 3px 10px ${temp.color}59` }}>
            <i className="ti ti-flame" style={{ fontSize: 12 }} /> {temp.label}
          </span>
          {!lead.isPlatform
            ? <button onClick={e => { e.stopPropagation(); openEdit(lead) }} title="Edit lead"
                style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: D.mut, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                <i className="ti ti-dots-vertical" />
              </button>
            : <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: 'rgba(8,145,178,0.22)', color: '#5bc7e6' }}>Rank #{lead.rank}</span>}
        </div>

        {/* name + score ring */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, color: D.text, lineHeight: 1.18, letterSpacing: '-.2px', wordBreak: 'break-word' }}>{lead.name || 'Anonymous'}</div>
          {isWon ? (
            /* Won → a gold crown badge instead of the score ring */
            <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: 'radial-gradient(circle at 50% 35%, rgba(245,158,11,0.28), rgba(245,158,11,0.10))', border: '1.5px solid rgba(245,158,11,0.55)', boxShadow: '0 3px 12px rgba(245,158,11,0.3)' }}>
              <i className="ti ti-crown" style={{ fontSize: 22, color: '#f59e0b', filter: 'drop-shadow(0 1px 2px rgba(180,83,9,0.4))' }} />
              <span style={{ fontSize: 7, fontWeight: 800, color: '#b45309', letterSpacing: '.5px' }}>WON</span>
            </div>
          ) : (
          <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
            <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="28" cy="28" r="22" fill="none" stroke="var(--border)" strokeWidth="4" />
              <circle cx="28" cy="28" r="22" fill="none" stroke={ring.color} strokeWidth="4" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - ring.val / 100)} style={{ transition: 'stroke-dashoffset .4s' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: D.text, lineHeight: 1 }}>{ring.val}<span style={{ fontSize: 8 }}>%</span></span>
              <span style={{ fontSize: 7, fontWeight: 700, color: ring.color, letterSpacing: '.4px', marginTop: 1 }}>{ring.label}</span>
            </div>
          </div>
          )}
        </div>

        {/* project + location */}
        {(proj || loc) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 11 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: temp.color + '26', color: temp.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-home" style={{ fontSize: 16 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              {proj && <div style={{ fontSize: 13, fontWeight: 600, color: D.text, lineHeight: 1.25, wordBreak: 'break-word' }}>{proj}</div>}
              {loc && <div style={{ fontSize: 11, color: D.sub, lineHeight: 1.25 }}>{loc}</div>}
            </div>
          </div>
        )}

        {/* info rows */}
        <div style={{ marginTop: 12, background: D.surface, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
          {infoRows.map((r, i) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderTop: i ? `1px solid ${D.line}` : 'none' }}>
              <i className={'ti ' + r.icon} style={{ fontSize: 15, color: r.tint, flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: D.sub }}>{r.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: r.vColor || D.text, textAlign: 'right', wordBreak: 'break-word' }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* next action band */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11, padding: '10px 12px', borderRadius: 12, background: nextAction.color + '1f', border: `1px solid ${nextAction.color}3d` }}>
          <i className={'ti ' + nextAction.icon} style={{ fontSize: 17, color: nextAction.color, flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: D.mut, textTransform: 'uppercase', letterSpacing: '.5px' }}>Next action</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: nextAction.color, lineHeight: 1.2 }}>{nextAction.label}</div>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 15, color: nextAction.color, flexShrink: 0 }} />
        </div>

        {/* actions: Call · WhatsApp · Move */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => callNo && window.open('tel:' + callNo, '_self')}
            disabled={!callNo}
            title={callNo ? 'Call ' + lead.phone : 'No phone number'}
            style={{ flex: 1, minHeight: 40, fontSize: 12, fontWeight: 700, borderRadius: 11,
              border: `1px solid ${callNo ? 'rgba(52,211,153,0.32)' : D.line}`,
              background: callNo ? 'rgba(52,211,153,0.16)' : D.surface, color: callNo ? '#5ee0a8' : D.mut,
              cursor: callNo ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <i className="ti ti-phone" style={{ fontSize: 15 }} /> Call
          </button>
          <button
            onClick={() => waNo && openModal(lead)}
            disabled={!waNo}
            title={waNo ? 'Open templates & send WhatsApp' : 'No WhatsApp number'}
            style={{ flex: 1, minHeight: 40, fontSize: 12, fontWeight: 700, borderRadius: 11,
              border: `1px solid ${D.line}`, background: D.surface, color: waNo ? D.text : D.mut,
              cursor: waNo ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <i className="ti ti-brand-whatsapp" style={{ fontSize: 15, color: waNo ? '#5ee0a8' : D.mut }} /> WhatsApp
          </button>
          <button
            onClick={() => canMove && updateLeadStage(lead, nextStage(lead.status))}
            disabled={!canMove || updatingStatus === lead.key}
            title={canMove ? 'Move to next stage' : 'Lead is closed'}
            style={{ width: 46, minHeight: 40, fontSize: 17, borderRadius: 11,
              border: `1px solid ${canMove ? 'rgba(139,92,246,0.4)' : D.line}`,
              background: canMove ? 'rgba(139,92,246,0.2)' : D.surface, color: canMove ? '#b794f6' : D.mut,
              cursor: canMove ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-arrow-right" />
          </button>
        </div>

        {/* footer: time ago + stage */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${D.line}` }}>
          <span style={{ fontSize: 10.5, color: D.sub, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <i className="ti ti-clock" style={{ fontSize: 12 }} /> {ago || '—'}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: sc.color + '2b', color: sc.color, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.color }} /> {sc.label}
          </span>
          {lead.status === 'lost' && lead.lostReason && (
            <span title={'Closed: ' + lead.lostReason} style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <i className="ti ti-ban" style={{ fontSize: 11 }} /> {lead.lostReason}
            </span>
          )}
          {!isClosed && belowBudget(lead) && (
            <span title={'Budget is below your minimum (AED ' + minBudget.toLocaleString() + ')'} style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'rgba(245,158,11,0.14)', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-cash-off" style={{ fontSize: 11 }} /> Below budget
            </span>
          )}
        </div>
      </div>
    )
  }

  function ShareModal() {
    if (!shareForm) return null
    const link = `${PUBLIC_BASE}/form/${shareForm.id}`
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=14&data=${encodeURIComponent(link)}`

    async function copyLink() {
      try {
        await navigator.clipboard.writeText(link)
        setCopied(true); setTimeout(() => setCopied(false), 1800)
      } catch (e) {
        const ta = document.createElement('textarea')
        ta.value = link; ta.style.position = 'fixed'; ta.style.opacity = '0'
        document.body.appendChild(ta); ta.select()
        try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch (e2) { toast.error('Could not copy link') }
        document.body.removeChild(ta)
      }
    }

    async function downloadQR() {
      try {
        const res = await fetch(qrSrc)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(shareForm.title || 'form').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch (e) {
        window.open(qrSrc, '_blank')
      }
    }

    function shareWhatsApp() {
      const text = `Get a quote from ${company?.name || 'us'} — fill this quick form: ${link}`
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')
    }

    return (
      <div onClick={closeShare} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 220, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: mobile ? 0 : '24px 16px', overflowY: 'auto' }}>
        <div onClick={e => e.stopPropagation()} style={{ width: mobile ? '100%' : 460, minHeight: mobile ? '100%' : 'auto', background: 'var(--card)', borderRadius: mobile ? 0 : 14, border: '0.5px solid var(--border)' }}>

          <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--card)', padding: '14px 18px', paddingTop: mobile ? `calc(14px + ${SAFE_TOP})` : 14, borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: mobile ? 0 : '14px 14px 0 0' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Share &amp; QR</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shareForm.title}</div>
            </div>
            <button onClick={closeShare} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20, flexShrink: 0, marginLeft: 10 }}><i className="ti ti-x" /></button>
          </div>

          <div style={{ padding: 18 }}>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '0.5px solid var(--border)' }}>
                <img src={qrSrc} alt="Form QR code" width={210} height={210} style={{ display: 'block', width: 210, height: 210 }} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
                Customers scan this to open your form — no app, no login. Leads land straight in <b style={{ color: 'var(--text2)' }}>My Leads</b>.
              </div>
            </div>

            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '.3px' }}>Public link</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input readOnly value={link} onFocus={e => e.target.select()} style={{ flex: 1, padding: '10px 12px', ...inputStyle, fontSize: 12.5, boxSizing: 'border-box', minWidth: 0 }} />
              <button onClick={copyLink} style={{ padding: '0 16px', borderRadius: 8, background: copied ? '#10b981' : '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <i className={'ti ' + (copied ? 'ti-check' : 'ti-copy')} style={{ fontSize: 14 }} /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingBottom: mobile ? `calc(4px + env(safe-area-inset-bottom))` : 0 }}>
              <button onClick={downloadQR} style={{ padding: 11, borderRadius: 8, background: 'var(--bg2)', color: 'var(--text)', border: '0.5px solid var(--border)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <i className="ti ti-download" style={{ fontSize: 15 }} /> Download QR
              </button>
              <button onClick={shareWhatsApp} style={{ padding: 11, borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <i className="ti ti-brand-whatsapp" style={{ fontSize: 15 }} /> Share
              </button>
            </div>

            {!shareForm.is_active && (
              <div style={{ marginTop: 14, padding: '9px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '0.5px solid rgba(245,158,11,0.3)', fontSize: 11.5, color: 'var(--text2)', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <i className="ti ti-info-circle" style={{ fontSize: 14, color: '#f59e0b', marginTop: 1, flexShrink: 0 }} />
                <span>This link works fine even though the form isn't set as Active. Set it Active if you also want it shown on your public profile page.</span>
              </div>
            )}

          </div>
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
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{editId ? 'Edit lead' : 'Add new lead'}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{editId ? 'Update details & save' : 'Just name & phone is enough'}</div>
            </div>
            <button onClick={closeAdd} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 20 }}><i className="ti ti-x" /></button>
          </div>

          <div style={{ padding: 18 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Client name <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={addF.name} onChange={e => setA('name', e.target.value)} placeholder="e.g. Mr Ankit Sharma" style={{ width: '100%', padding: '9px 11px', ...inputStyle, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Phone (Primary) <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={addF.phone} onChange={e => setA('phone', e.target.value)} placeholder="+971 50 XXX XXXX" style={{ width: '100%', padding: '9px 11px', ...inputStyle, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div style={{ minWidth: 0 }}>
              <label style={lbl}>Lead source <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={addF.source} onChange={e => setA('source', e.target.value)} style={{ display: 'block', width: '100%', padding: '9px 11px', ...selectStyle, fontSize: 13, boxSizing: 'border-box', minWidth: 0 }}>
                {LEAD_SOURCES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={lbl}>Project type</label>
              <select value={addF.projectType} onChange={e => setA('projectType', e.target.value)} style={{ display: 'block', width: '100%', padding: '9px 11px', ...selectStyle, fontSize: 13, boxSizing: 'border-box', minWidth: 0 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 11 }}>
                <div style={{ minWidth: 0 }}><label style={lblSm}>Email</label><input value={addF.email} onChange={e => setA('email', e.target.value)} placeholder="name@email.com" style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12, boxSizing: 'border-box' }} /></div>
                <div style={{ minWidth: 0 }}><label style={lblSm}>WhatsApp (if different)</label><input value={addF.whatsapp} onChange={e => setA('whatsapp', e.target.value)} placeholder="+971 ..." style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12, boxSizing: 'border-box' }} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 11 }}>
                <div style={{ minWidth: 0 }}><label style={lblSm}>Location</label><input value={addF.location} onChange={e => setA('location', e.target.value)} placeholder="e.g. Business Bay" style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12, boxSizing: 'border-box' }} /></div>
                <div style={{ minWidth: 0 }}><label style={lblSm}>Budget (AED)</label><input value={addF.budget} onChange={e => setA('budget', e.target.value)} placeholder="e.g. 50,000" style={{ width: '100%', padding: '7px 9px', ...inputStyle, fontSize: 12, boxSizing: 'border-box' }} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 11 }}>
                <div style={{ minWidth: 0 }}><label style={lblSm}>Next follow-up</label><input type="date" value={addF.followUp} onChange={e => setA('followUp', e.target.value)} style={{ display: 'block', width: '100%', padding: '8px 9px', ...inputStyle, fontSize: 12, boxSizing: 'border-box', minWidth: 0, WebkitAppearance: 'none', appearance: 'none' }} /></div>
                <div style={{ minWidth: 0 }}><label style={lblSm}>Status</label>
                  <select value={addF.status} onChange={e => setA('status', e.target.value)} style={{ display: 'block', width: '100%', padding: '8px 9px', ...selectStyle, fontSize: 12, boxSizing: 'border-box', minWidth: 0 }}>
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
                <textarea value={addF.notes} onChange={e => setA('notes', e.target.value)} placeholder="What does the client need…" style={{ width: '100%', minHeight: 44, padding: '7px 9px', ...inputStyle, fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, paddingBottom: mobile ? `calc(4px + env(safe-area-inset-bottom))` : 0 }}>
            <button onClick={() => saveAddLead()} disabled={savingAdd} style={{ flex: 1, padding: 10, borderRadius: 8, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{savingAdd ? (editId ? 'Updating...' : 'Saving...') : (editId ? 'Update lead' : 'Save lead')}</button>
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
    const srcLabel = lead.isPlatform ? 'Quvera · Rank #' + lead.rank : mySourceBadge(lead).label
    const isOverdue = lead.follow_up_date && lead.follow_up_date < today && !['won','lost'].includes(lead.status)
    const proj = lead.answers?.['Project Type'] || lead.answers?.category || ''
    const budget = lead.answers?.['Budget (AED)'] || lead.answers?.budget || ''
    const loc = lead.answers?.['Location'] || lead.answers?.area || ''
    const sla = slaInfo(lead)
    // --- theme-aware palette: dark = neon glass, light = soft glass ---
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    const T = isDark ? {
      vars: { '--card': '#15203a', '--bg2': 'rgba(255,255,255,0.055)', '--border': 'rgba(255,255,255,0.10)', '--text': '#eaf0fb', '--text2': '#a6b6d4', '--text3': '#7286a8' },
      modalBg: 'radial-gradient(120% 70% at 0% 0%, rgba(0,212,255,0.20), transparent 52%), radial-gradient(120% 70% at 100% 0%, rgba(139,92,246,0.24), transparent 52%), radial-gradient(100% 60% at 50% 120%, rgba(236,72,153,0.12), transparent 60%), linear-gradient(165deg, #0b1428 0%, #0c1838 55%, #0a1124 100%)',
      modalBorder: '1px solid rgba(0,212,255,0.30)', modalShadow: '0 30px 100px rgba(0,0,0,0.7), 0 0 80px rgba(0,212,255,0.10) inset',
      panelBg: 'rgba(255,255,255,0.04)', panelBd: '1px solid rgba(255,255,255,0.09)',
      headerBg: 'rgba(13,19,40,0.82)', closeBg: 'rgba(255,255,255,0.07)', overlay: 'rgba(4,8,18,0.74)',
      hoverBd: 'rgba(0,212,255,0.55)', hoverGlow: '0 0 24px rgba(0,212,255,0.28)',
    } : {
      vars: { '--card': '#ffffff', '--bg2': '#eef3fb', '--border': 'rgba(15,35,70,0.12)', '--text': '#0f1b33', '--text2': '#44546f', '--text3': '#7c8aa6' },
      modalBg: 'radial-gradient(120% 70% at 0% 0%, rgba(0,160,220,0.13), transparent 52%), radial-gradient(120% 70% at 100% 0%, rgba(139,92,246,0.13), transparent 52%), linear-gradient(165deg, #f6faff 0%, #eef3fc 100%)',
      modalBorder: '1px solid rgba(0,160,220,0.30)', modalShadow: '0 30px 80px rgba(20,40,80,0.22)',
      panelBg: '#ffffff', panelBd: '1px solid rgba(15,35,70,0.10)',
      headerBg: 'rgba(255,255,255,0.86)', closeBg: 'rgba(15,35,70,0.06)', overlay: 'rgba(15,25,45,0.5)',
      hoverBd: 'rgba(0,160,220,0.55)', hoverGlow: '0 0 22px rgba(0,160,220,0.22)',
    }
    const accent = isDark ? '#00D4FF' : '#0099cc'
    const isWon = lead.status === 'won'
    const tmp = TEMP[lead.temperature] || TEMP.warm
    const initials = (lead.name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
    // AI lead score (0–99) + conversion probability for the header gauge
    const score = (() => {
      if (lead.isPlatform && typeof lead.rank === 'number') return Math.max(45, 100 - (lead.rank - 1) * 7)
      let s = 45
      if (lead.phone) s += 15
      if (proj) s += 15
      if (budget) s += 15
      if (lead.answers?.['WhatsApp'] || lead.email) s += 8
      s += lead.temperature === 'hot' ? 12 : lead.temperature === 'warm' ? 6 : 0
      return Math.min(99, s)
    })()
    const convProb = Math.round(score * 0.82)
    const RING = 2 * Math.PI * 30
    // next action band
    const KIND_LABEL = { followup: 'Follow-up', meeting: 'Meeting', site_visit: 'Site visit', call: 'Call' }
    const nextAction = lead.nextMeeting
      ? { label: (KIND_LABEL[lead.nextMeeting.kind] || 'Meeting') + ' · ' + new Date(lead.nextMeeting.start_at).toLocaleString('en-AE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }), color: '#0891b2', icon: 'ti-calendar-clock' }
      : isOverdue ? { label: 'Overdue — follow up now', color: '#f87171', icon: 'ti-alert-triangle' }
      : lead.follow_up_date ? { label: 'Follow up ' + new Date(lead.follow_up_date).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' }), color: '#e2b25f', icon: 'ti-calendar' }
      : { label: 'Set a follow-up', color: '#e2b25f', icon: 'ti-calendar-plus' }
    // small quick-action tile for the header
    const QuickAction = ({ icon, label, onClick, color, disabled }) => (
      <button onClick={onClick} disabled={disabled} title={label}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10, border: '0.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', cursor: disabled ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left', opacity: disabled ? 0.6 : 1, width: '100%', minWidth: 0 }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: (color || accent) + '22', color: color || accent }}><i className={'ti ' + icon} style={{ fontSize: 15 }} /></span>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </button>
    )
    const PANEL = { background: T.panelBg, border: T.panelBd, borderRadius: 14, padding: 15, marginBottom: 12 }
    const SECT = { fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }
    // key/value row used inside the Lead details panel
    const DetailRow = ({ icon, label, value, color, first, href }) => value ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: first ? 'none' : '0.5px solid var(--border)' }}>
        <i className={'ti ' + icon} style={{ fontSize: 15, color: color || 'var(--text3)', width: 16, textAlign: 'center', flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, color: 'var(--text3)', flexShrink: 0 }}>{label}</span>
        {href
          ? <a href={href} onClick={e => e.stopPropagation()} style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', textAlign: 'right', wordBreak: 'break-word', textDecoration: 'none' }}>{value}</a>
          : <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>}
      </div>
    ) : null
    return (
      <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: T.overlay, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: mobile ? 0 : '24px 16px', overflowY: 'auto' }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: mobile ? '100%' : 1180, maxWidth: '100%', minHeight: mobile ? '100%' : 'auto',
          borderRadius: mobile ? 0 : 18, overflow: 'hidden', color: T.vars['--text'],
          ...T.vars,
          background: T.modalBg, border: T.modalBorder, boxShadow: T.modalShadow,
        }}>
          <style>{`.ld-card{transition:box-shadow .2s ease,border-color .2s ease,transform .2s ease}.ld-card:hover{border-color:${T.hoverBd} !important;box-shadow:${T.hoverGlow} !important;transform:translateY(-2px)}`}</style>

          <div style={{ position: 'sticky', top: 0, zIndex: 5, background: T.headerBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', padding: '16px 18px', paddingTop: mobile ? `calc(16px + ${SAFE_TOP})` : 16, borderBottom: '1px solid var(--border)' }}>
            <button onClick={closeModal} style={{ position: 'absolute', top: 12, right: 12, background: T.closeBg, border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 18, width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}><i className="ti ti-x" /></button>

            <div style={{ display: mobile ? 'block' : 'grid', gridTemplateColumns: mobile ? undefined : '1.95fr 0.8fr 1.2fr', gap: 18, alignItems: 'center' }}>

              {/* zone 1 — identity + contacts + meta */}
              <div style={{ minWidth: 0 }}>
                {/* avatar + name + status chips */}
                <div style={{ display: 'flex', gap: 13, alignItems: 'center', marginBottom: 13 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', background: isWon ? 'linear-gradient(135deg, #f59e0b, #b45309)' : 'linear-gradient(135deg, #8B5CF6 0%, #6366f1 100%)', boxShadow: '0 6px 18px rgba(124,58,237,0.45)' }}>
                    {isWon ? <i className="ti ti-crown" style={{ fontSize: 24 }} /> : initials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.name || 'Anonymous'}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: tmp.bg, color: tmp.color }}>{tmp.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: sc.bg, color: sc.color }}>{sc.label}</span>
                      {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'rgba(239,68,68,0.14)', color: '#ef4444' }}>Overdue</span>}
                    </div>
                  </div>
                </div>
                {/* buttons | contact info | meta */}
                <div style={{ display: mobile ? 'flex' : 'grid', flexWrap: 'wrap', gap: mobile ? 8 : 16, gridTemplateColumns: mobile ? undefined : 'auto 1fr 1fr', alignItems: 'start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {lead.phone && <a href={waMsg(lead)} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, background: 'rgba(34,197,94,0.14)', color: '#16a34a', textDecoration: 'none', fontSize: 11.5, fontWeight: 700 }}><i className="ti ti-brand-whatsapp" style={{ fontSize: 15 }} /> WhatsApp</a>}
                    {lead.phone && <a href={'tel:' + lead.phone} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, background: 'rgba(8,145,178,0.14)', color: '#0891b2', textDecoration: 'none', fontSize: 11.5, fontWeight: 700 }}><i className="ti ti-phone" style={{ fontSize: 15 }} /> Call</a>}
                    {lead.email && <a href={'mailto:' + lead.email} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, background: 'rgba(139,92,246,0.14)', color: '#7c3aed', textDecoration: 'none', fontSize: 11.5, fontWeight: 700 }}><i className="ti ti-mail" style={{ fontSize: 15 }} /> Email</a>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                    {lead.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)' }}><i className="ti ti-phone" style={{ fontSize: 14, color: 'var(--text3)', flexShrink: 0 }} /> {lead.phone}</div>}
                    {lead.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', minWidth: 0 }}><i className="ti ti-mail" style={{ fontSize: 14, color: 'var(--text3)', flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</span></div>}
                    {loc && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)' }}><i className="ti ti-map-pin" style={{ fontSize: 14, color: 'var(--text3)', flexShrink: 0 }} /> {loc}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><i className="ti ti-arrow-up-right" style={{ fontSize: 14, color: 'var(--text3)', marginTop: 1, flexShrink: 0 }} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 9.5, color: 'var(--text3)' }}>Source</div><div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{srcLabel}</div></div></div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><i className="ti ti-calendar-plus" style={{ fontSize: 14, color: 'var(--text3)', marginTop: 1, flexShrink: 0 }} /><div><div style={{ fontSize: 9.5, color: 'var(--text3)' }}>Created on</div><div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{new Date(lead.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div></div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><i className="ti ti-clock" style={{ fontSize: 14, color: 'var(--text3)', marginTop: 1, flexShrink: 0 }} /><div><div style={{ fontSize: 9.5, color: 'var(--text3)' }}>Last activity</div><div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{new Date(lead.status_updated_at || lead.created_at).toLocaleString('en-AE', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></div></div>
                  </div>
                </div>
              </div>

              {/* zone 2 — AI lead score gauge (gradient ring) */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: mobile ? '16px 0 4px' : 0, borderLeft: mobile ? 'none' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 7 }}>AI Lead Score</div>
                <div style={{ position: 'relative', width: 84, height: 84 }}>
                  <svg width="84" height="84" style={{ transform: 'rotate(-90deg)' }}>
                    <defs>
                      <linearGradient id="ldGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#8B5CF6" />
                        <stop offset="50%" stopColor="#ec4899" />
                        <stop offset="100%" stopColor="#f59e0b" />
                      </linearGradient>
                    </defs>
                    <circle cx="42" cy="42" r="34" fill="none" stroke="var(--border)" strokeWidth="7" />
                    <circle cx="42" cy="42" r="34" fill="none" stroke="url(#ldGaugeGrad)" strokeWidth="7" strokeLinecap="round" strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34 * (1 - score / 100)} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 25, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{score}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 700, color: tmp.color, letterSpacing: '.5px' }}>{tmp.label.toUpperCase()}</span>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, textAlign: 'center' }}>Conversion Probability <b style={{ color: '#22c55e' }}>{convProb}% <i className="ti ti-trending-up" style={{ fontSize: 11, verticalAlign: '-1px' }} /></b></div>
              </div>

              {/* zone 3 — quick actions */}
              <div style={{ minWidth: 0, marginTop: mobile ? 14 : 0, paddingLeft: mobile ? 0 : 18, borderLeft: mobile ? 'none' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Quick actions</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <QuickAction icon={['proposal_given', 'won'].includes(lead.status) ? 'ti-file-check' : 'ti-file-invoice'} label={['proposal_given', 'won'].includes(lead.status) ? 'Re-quote' : 'Create Quotation'} color="#0099cc" disabled={creatingQuote} onClick={() => createQuoteFromLead(lead)} />
                  <QuickAction icon="ti-calendar-plus" label="Schedule Meeting" color="#3b82f6" onClick={() => setMeetingForm(lead.nextMeeting ? { start: toLocalInput(lead.nextMeeting.start_at), remind: 30, notes: '', kind: lead.nextMeeting.kind || 'followup' } : { start: '', remind: 30, notes: '', kind: 'followup' })} />
                  {lead.isPlatform
                    ? <QuickAction icon="ti-sparkles" label="AI Suggest Reply" color="#8b5cf6" disabled={aiReplyLoading} onClick={suggestChatReply} />
                    : <QuickAction icon="ti-sparkles" label="AI WhatsApp Msg" color="#8b5cf6" disabled={waDraftLoading} onClick={() => suggestWhatsApp(lead)} />}
                  <QuickAction icon="ti-brand-whatsapp" label="Open WhatsApp" color="#16a34a" disabled={!lead.phone} onClick={() => lead.phone && window.open(waMsg(lead), '_blank')} />
                </div>
              </div>

            </div>
          </div>

          <div style={{ padding: 18, display: mobile ? 'block' : 'grid', gridTemplateColumns: mobile ? undefined : 'minmax(0,2fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>

          {/* MAIN — next/project, AI message, log/templates */}
          <div style={{ minWidth: 0 }}>

          {/* Response SLA banner — real countdown to reassign (un-actioned platform leads) */}
          {sla.active && (
            <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: 10, border: '0.5px solid ' + sla.color + '55', background: sla.color + '14' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: sla.color, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-clock-bolt" style={{ fontSize: 14 }} /> {sla.overdue ? 'Response window passed — may reassign' : 'Respond within ' + sla.left}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{Math.round(sla.pct * 100)}% left</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: (sla.pct * 100) + '%', background: sla.color, borderRadius: 99, transition: 'width .4s' }} />
              </div>
            </div>
          )}

          {/* Next action + Project requirement — side by side */}
          <div style={{ display: mobile ? 'block' : 'grid', gridTemplateColumns: mobile ? undefined : '1fr 1fr', gap: 12, alignItems: 'stretch', marginBottom: 12 }}>
          {/* Next action — at-a-glance what to do next */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: mobile ? 12 : 0, padding: '14px 16px', borderRadius: 14, background: 'linear-gradient(135deg, ' + nextAction.color + '3d, ' + nextAction.color + '1a)', border: '1.5px solid ' + nextAction.color + '88', boxShadow: '0 0 26px ' + nextAction.color + '33' }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: nextAction.color + '3d', color: nextAction.color }}><i className={'ti ' + nextAction.icon} style={{ fontSize: 21 }} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: nextAction.color, textTransform: 'uppercase', letterSpacing: '.5px', opacity: 0.9 }}>Next action</div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)', lineHeight: 1.25, wordBreak: 'break-word' }}>{nextAction.label}</div>
            </div>
          </div>

          <div className="ld-card" style={{ ...PANEL, marginBottom: 0 }}>
            <div style={SECT}><i className="ti ti-home" style={{ fontSize: 14, color: accent }} /> Project requirement</div>
            <DetailRow first icon="ti-home" label="Requirement" value={proj || '—'} color="#f59e0b" />
            <DetailRow icon="ti-coin" label="Budget" value={budget ? (/aed/i.test(String(budget)) ? String(budget) : 'AED ' + budget) : '—'} color="#22c55e" />
            <DetailRow icon="ti-map-pin" label="Location" value={loc || '—'} color="#ef4444" />
            <DetailRow icon="ti-phone" label="Phone" value={lead.phone} color="#0891b2" href={lead.phone ? 'tel:' + lead.phone : undefined} />
            <DetailRow icon="ti-mail" label="Email" value={lead.email} color="#8b5cf6" href={lead.email ? 'mailto:' + lead.email : undefined} />
            <DetailRow icon="ti-arrow-up-right" label="Source" value={srcLabel} color="#60a5fa" />
          </div>
          </div>{/* /next+project row */}

          {meetingForm != null && (
            <div style={{ border: '1px solid rgba(59,130,246,0.35)', borderRadius: 10, padding: 13, marginBottom: 14, background: 'rgba(59,130,246,0.05)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-calendar-event" style={{ fontSize: 15, color: '#3b82f6' }} /> Schedule with {lead.name || 'lead'}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text2)', marginBottom: 5, fontWeight: 600 }}>Purpose</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 9, flexWrap: 'wrap' }}>
                {[['followup', 'Follow-up', 'ti-flag', '#8b5cf6'], ['site_visit', 'Site Visit', 'ti-map-pin', '#f59e0b'], ['call', 'Call', 'ti-phone', '#22c55e']].map(([k, l, ic, c]) => {
                  const on = (meetingForm.kind || 'followup') === k
                  return <button key={k} onClick={() => setMeetingForm(m => ({ ...m, kind: k }))} style={{ flex: '1 1 90px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: on ? c + '1f' : 'transparent', color: on ? c : 'var(--text2)', border: `1px solid ${on ? c : 'var(--border)'}` }}><i className={'ti ' + ic} style={{ fontSize: 14 }} /> {l}</button>
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text2)', marginBottom: 4, fontWeight: 600 }}>Date & time</div>
                  <input type="datetime-local" value={meetingForm.start} onChange={e => setMeetingForm(m => ({ ...m, start: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', ...inputStyle, fontSize: 12.5, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text2)', marginBottom: 4, fontWeight: 600 }}>Remind before</div>
                  <select value={meetingForm.remind} onChange={e => setMeetingForm(m => ({ ...m, remind: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', ...selectStyle, fontSize: 12.5, boxSizing: 'border-box' }}>
                    <option value={0} style={optStyle}>No reminder</option>
                    <option value={15} style={optStyle}>15 min</option>
                    <option value={30} style={optStyle}>30 min</option>
                    <option value={60} style={optStyle}>1 hour</option>
                    <option value={1440} style={optStyle}>1 day</option>
                  </select>
                </div>
              </div>
              <input value={meetingForm.notes} onChange={e => setMeetingForm(m => ({ ...m, notes: e.target.value }))}
                placeholder="Notes (location / agenda)..." style={{ width: '100%', padding: '8px 10px', ...inputStyle, fontSize: 12.5, boxSizing: 'border-box', marginBottom: 9 }} />
              <div style={{ display: 'flex', gap: 7 }}>
                <button onClick={() => setMeetingForm(null)} style={{ flex: '0 0 auto', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => saveMeeting(lead)} disabled={meetingSaving}
                  style={{ flex: 1, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: meetingSaving ? 'default' : 'pointer', opacity: meetingSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <i className="ti ti-check" style={{ fontSize: 14 }} /> {meetingSaving ? 'Saving…' : 'Schedule + set reminder'}
                </button>
              </div>
            </div>
          )}

          {lead.isPlatform && (
            <div className="ld-card" style={PANEL}>
              <div style={SECT}>
                <i className="ti ti-messages" style={{ fontSize: 15, color: accent }} /> Chat with customer
                <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: 'rgba(0,153,204,0.12)', color: '#0099cc' }}>Quvera</span>
              </div>

              <div style={{ background: 'var(--bg2)', borderRadius: 9, padding: 11, maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {chatMsgs.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '14px 8px' }}>
                    No messages yet. When the customer messages you from Quvera, it appears here — reply to start the conversation.
                  </div>
                ) : chatMsgs.map(m => {
                  const mine = m.sender_type === 'company'
                  return (
                    <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                      <div style={{ background: mine ? '#0099cc' : 'var(--card)', color: mine ? '#fff' : 'var(--text)', border: mine ? 'none' : '0.5px solid var(--border)', padding: '8px 11px', borderRadius: mine ? '11px 11px 4px 11px' : '11px 11px 11px 4px', fontSize: 12.5, lineHeight: 1.5, wordBreak: 'break-word' }}>{m.body}</div>
                      <div style={{ fontSize: 9, color: 'var(--text3)', textAlign: mine ? 'right' : 'left', marginTop: 2 }}>{mine ? 'You' : (lead.name || 'Customer')} · {new Date(m.created_at).toLocaleTimeString('en-AE', { hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 7 }}>
                <button onClick={suggestChatReply} disabled={aiReplyLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: '0.5px solid rgba(0,153,204,0.4)', background: 'rgba(0,153,204,0.08)', color: '#0099cc', fontSize: 11.5, fontWeight: 600, cursor: aiReplyLoading ? 'default' : 'pointer', opacity: aiReplyLoading ? 0.65 : 1 }}>
                  <i className={'ti ' + (aiReplyLoading ? 'ti-loader-2' : 'ti-sparkles')} style={{ fontSize: 14 }} /> {aiReplyLoading ? 'Thinking…' : 'Suggest reply'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <input value={chatText} onChange={e => setChatText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChat() }}
                  placeholder="Type a reply to the customer..."
                  style={{ flex: 1, padding: '9px 12px', ...inputStyle, fontSize: 12.5, boxSizing: 'border-box' }} />
                <button onClick={sendChat} disabled={chatSending || !chatText.trim()}
                  style={{ padding: '0 16px', borderRadius: 8, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, opacity: (chatSending || !chatText.trim()) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-send" style={{ fontSize: 14 }} /> Send
                </button>
              </div>
            </div>
          )}

          {!lead.isPlatform && lead.phone && (
            <div className="ld-card" style={PANEL}>
              <div style={SECT}>
                <i className="ti ti-sparkles" style={{ fontSize: 15, color: accent }} /> AI suggested WhatsApp message
              </div>
              <div style={{ display: 'flex', gap: 13, marginBottom: 12, alignItems: 'center' }}>
                <div style={{ width: 58, height: 58, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #00D4FF, #8B5CF6)', boxShadow: '0 0 26px rgba(0,212,255,0.6)' }}><i className="ti ti-robot" style={{ fontSize: 30, color: '#fff' }} /></div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 }}>I'll draft a warm, personalised WhatsApp reply for <b style={{ color: 'var(--text)' }}>{lead.name || 'this lead'}</b>.</div>
              </div>
              {waDraft != null ? (
                <>
                  <textarea value={waDraft} onChange={e => setWaDraft(e.target.value)}
                    style={{ width: '100%', minHeight: 84, ...inputStyle, fontSize: 12.5, padding: '9px 12px', boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button onClick={() => { if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(waDraft); toast.success('Copied ✓') } }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 13px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <i className="ti ti-copy" style={{ fontSize: 14 }} /> Copy
                    </button>
                    <button onClick={() => window.open('https://wa.me/' + (lead.phone || '').replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(waDraft), '_blank')}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 13px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <i className="ti ti-brand-whatsapp" style={{ fontSize: 14 }} /> Open WhatsApp
                    </button>
                    <button onClick={() => suggestWhatsApp(lead)} disabled={waDraftLoading}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 13px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: waDraftLoading ? 'default' : 'pointer', opacity: waDraftLoading ? 0.65 : 1 }}>
                      <i className={'ti ' + (waDraftLoading ? 'ti-loader-2' : 'ti-refresh')} style={{ fontSize: 14 }} /> {waDraftLoading ? '…' : 'Regenerate'}
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={() => suggestWhatsApp(lead)} disabled={waDraftLoading}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '0.5px solid rgba(0,153,204,0.4)', background: 'rgba(0,153,204,0.08)', color: '#0099cc', fontSize: 12.5, fontWeight: 600, cursor: waDraftLoading ? 'default' : 'pointer', opacity: waDraftLoading ? 0.65 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <i className={'ti ' + (waDraftLoading ? 'ti-loader-2' : 'ti-sparkles')} style={{ fontSize: 15 }} /> {waDraftLoading ? 'Thinking…' : 'Suggest WhatsApp message'}
                </button>
              )}
            </div>
          )}

          {/* Log follow-up + Send templates — side by side */}
          <div style={{ display: mobile ? 'block' : 'grid', gridTemplateColumns: mobile ? undefined : '1fr 1fr', gap: 12, alignItems: 'start' }}>

          <div className="ld-card" style={PANEL}>
            <div style={SECT}><i className="ti ti-pencil-plus" style={{ fontSize: 14, color: accent }} /> Log follow-up</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 11 }}>
              {OUTCOMES.map(o => {
                const m = OUTCOME_META[o] || { c: accent, ic: 'ti-point' }
                const on = logOutcome === o
                return (
                  <button key={o} onClick={() => setLogOutcome(on ? '' : o)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, padding: '5px 10px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontWeight: on ? 700 : 600,
                      border: '1px solid ' + (on ? m.c : m.c + '44'),
                      background: on ? m.c + '33' : m.c + '14',
                      color: m.c }}>
                    <i className={'ti ' + m.ic} style={{ fontSize: 12 }} /> {o}
                  </button>
                )
              })}
            </div>
            <textarea value={logNote} onChange={e => setLogNote(e.target.value)} placeholder="Notes — what was discussed..."
              style={{ width: '100%', minHeight: 50, padding: '8px 10px', ...inputStyle, fontSize: 12, resize: 'vertical', marginBottom: 9, boxSizing: 'border-box' }} />
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 9, marginBottom: 9 }}>
              <div style={{ minWidth: 0 }}>
                <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Next action (date &amp; time)</label>
                <input type="datetime-local" value={logNext} onChange={e => setLogNext(e.target.value)} style={{ ...inputStyle, display: 'block', width: '100%', padding: '8px 9px', fontSize: 12, boxSizing: 'border-box', minWidth: 0, WebkitAppearance: 'none', appearance: 'none' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <label style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>Move to stage</label>
                <select value={logStage} onChange={e => setLogStage(e.target.value)} style={{ ...selectStyle, display: 'block', width: '100%', padding: '8px 9px', fontSize: 12, boxSizing: 'border-box', minWidth: 0 }}>
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

          <div className="ld-card" style={PANEL}>
            <div style={SECT}><i className="ti ti-message-2" style={{ fontSize: 14, color: '#0f7a52' }} /> Send follow-up message</div>
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
                  style={{ width: '100%', padding: '7px 10px', ...inputStyle, fontSize: 12, marginBottom: 7, boxSizing: 'border-box' }} />
                <textarea value={tplBody} onChange={e => setTplBody(e.target.value)} placeholder="Message text… use {name} for customer name, {req} for requirement"
                  style={{ width: '100%', minHeight: 44, padding: '7px 10px', ...inputStyle, fontSize: 12, resize: 'vertical', marginBottom: 4, boxSizing: 'border-box' }} />
                <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 8 }}>Tip: {'{name}'} = customer name, {'{req}'} = requirement (auto-filled when sending)</div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <button onClick={saveTemplate} style={{ flex: 1, padding: 8, borderRadius: 8, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Save template</button>
                  <button onClick={() => { setShowNewTpl(false); setTplName(''); setTplBody('') }} style={{ padding: '8px 14px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                </div>
              </div>
            )}
            <textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Tap a template above or write your message..."
              style={{ width: '100%', minHeight: 50, padding: '8px 10px', ...inputStyle, fontSize: 12, resize: 'vertical', marginBottom: 9, boxSizing: 'border-box' }} />
            <button onClick={sendWhatsApp} disabled={!lead.phone}
              style={{ width: '100%', padding: 9, borderRadius: 8, background: '#22c55e', color: '#fff', border: 'none', cursor: lead.phone ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600, opacity: lead.phone ? 1 : 0.5 }}>
              <i className="ti ti-brand-whatsapp" style={{ fontSize: 14 }} /> Send on WhatsApp
            </button>
          </div>

          </div>{/* /log+templates row */}

          </div>{/* /MAIN */}

          {/* RIGHT — history / timeline */}
          <div style={{ minWidth: 0, ...(mobile ? { marginTop: 4 } : {}) }}>

          <div className="ld-card" style={{ ...PANEL, marginBottom: 0 }}>
          <div style={SECT}><i className="ti ti-history" style={{ fontSize: 15, color: accent }} /> History &amp; timeline</div>
          {tlLoading ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: 10 }}>Loading...</div>
          ) : timeline.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: 10 }}>No activity yet — log your first follow-up.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15, paddingBottom: mobile ? `calc(4px + env(safe-area-inset-bottom))` : 0 }}>
              {timeline.map(t => {
                const meta = t.kind === 'stage_change' ? { ic: 'ti-arrow-right', c: '#00D4FF', title: 'Moved to ' + ((LEAD_STATUSES.find(s => s.value === t.new_stage) || {}).label || t.new_stage) }
                  : t.kind === 'follow_up' ? { ic: 'ti-phone-call', c: '#22c55e', title: t.outcome || 'Follow-up' }
                  : t.kind === 'created' ? { ic: 'ti-user-plus', c: '#8B5CF6', title: 'Lead created' }
                  : { ic: 'ti-pencil', c: '#f59e0b', title: 'Note added' }
                return (
                  <div key={t.id} style={{ display: 'flex', gap: 11 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: meta.c + '22', color: meta.c }}><i className={'ti ' + meta.ic} style={{ fontSize: 16 }} /></div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{meta.title}</div>
                      {(t.kind === 'note' ? t.note : t.note) && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1, wordBreak: 'break-word' }}>{t.note}</div>}
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{new Date(t.created_at).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })} · {new Date(t.created_at).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })}{t.actor_name ? ' · ' + t.actor_name : ''}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          </div>{/* /history panel */}

          </div>{/* /RIGHT column */}
          </div>{/* /body grid */}
        </div>
      </div>
    )
  }

  function Board() {
    if (['flow','galaxy','embedding'].includes(view)) {
      return <LeadVisualViews mode={view} leads={filtered} onOpenLead={openModal} mobile={mobile} />
    }
    if (baseLeads.length === 0) {
      return (
        <div style={{ ...card, textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px', background: 'var(--bg2)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className={'ti ' + (isTD ? 'ti-target-arrow' : 'ti-inbox')} style={{ fontSize: 30, color: 'var(--text3)' }} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>{isTD ? 'No Quvera leads yet' : 'No leads yet'}</h3>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
            {isTD ? 'Verified leads from the Quvera platform will appear here automatically.' : 'Add a lead manually, import a CSV, or connect your Meta ad account.'}
          </p>
          {!isTD && <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={openAdd}>+ Add Lead</button>
            <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>⬆ Import CSV</button>
          </div>}
        </div>
      )
    }
    if (quickFilter && filtered.length === 0) {
      const msg = quickFilter === 'due' ? "No follow-ups due today — you're all caught up!" : quickFilter === 'overdue' ? 'No overdue follow-ups — nicely done!' : quickFilter === 'belowbudget' ? 'No leads below your minimum budget. 👍' : 'No hot leads right now.'
      return (
        <div style={{ ...card, textAlign: 'center', padding: '50px 20px' }}>
          <i className="ti ti-circle-check" style={{ fontSize: 40, color: '#10b981', display: 'block', marginBottom: 12 }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{msg}</h3>
          <button onClick={() => setQuickFilter('')} className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Show all leads</button>
        </div>
      )
    }
    if (view === 'board') {
      const stages = [...PIPELINE, LOST]
      const selLeads = filtered.filter(l => l.status === mobileStage)
      const selStage = stages.find(s => s.stage === mobileStage) || stages[0]
      return (
        <div>
          {/* stage tabs — pick a stage; its cards fill the width below and wrap onto new rows.
              Drag a card onto a pill to move it to that stage. */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
            {stages.map(p => {
              const count = filtered.filter(l => l.status === p.stage).length
              const active = mobileStage === p.stage
              return (
                <button key={p.stage} onClick={() => setMobileStage(p.stage)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (dragId && dragId.status !== p.stage) updateLeadStage(dragId, p.stage); setDragId(null) }}
                  style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, padding: '8px 15px', borderRadius: 99, cursor: 'pointer',
                    border: `1px solid ${active ? p.color : 'var(--border)'}`, background: active ? p.color : 'var(--card)', color: active ? '#fff' : 'var(--text2)',
                    display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  {p.label}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: active ? 'rgba(255,255,255,0.25)' : 'var(--bg2)', color: active ? '#fff' : 'var(--text3)' }}>{count}</span>
                </button>
              )
            })}
          </div>
          {selLeads.length === 0
            ? <div style={{ ...card, textAlign: 'center', padding: '44px 20px', color: 'var(--text3)', fontSize: 13 }}>No leads in “{selStage.label}”.</div>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12, alignItems: 'start' }}>
                {selLeads.map(lead => <LeadCard key={lead.key} lead={lead} draggable={true} />)}
              </div>}
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
                const accent = lead.isPlatform ? '#0891b2' : mySourceBadge(lead).color
                return (
                  <tr key={lead.key} className="lead-row" onClick={() => openModal(lead)} style={{ borderTop: '0.5px solid var(--border)', cursor: 'pointer' }}>
                    <td style={{ padding: '10px 14px', borderLeft: '3px solid ' + accent }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: accent + '22', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(lead.name || 'A')[0].toUpperCase()}</div>
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
      ...(minBudget > 0 ? [{ key: 'belowbudget', label: 'Below budget', value: belowCount, color: '#f59e0b', icon: 'ti-cash-off', click: true }] : []),
      { key: 'won',     label: 'Won rate',  value: wonRate + '%', color: '#10b981', icon: 'ti-trophy', click: false },
    ]
    return (
      <>
        {baseLeads.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {STAT_CARDS.map(s => {
              const active = s.click && quickFilter === s.key
              return (
                <button key={s.key} onClick={s.click ? () => toggleQuick(s.key) : undefined}
                  style={{ flex: mobile ? '1 1 40%' : '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '7px 13px', borderRadius: 10, fontFamily: 'inherit', cursor: s.click ? 'pointer' : 'default',
                    background: active ? s.color + '14' : 'var(--card)', border: `1px solid ${active ? s.color : 'var(--border)'}` }}>
                  <i className={'ti ' + s.icon} style={{ fontSize: 14, color: s.color }} />
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text2)' }}>{s.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</span>
                  {active && <i className="ti ti-x" style={{ fontSize: 12, color: s.color }} />}
                </button>
              )
            })}
            <button onClick={promptMinBudget} title="Set a minimum budget — leads below it are flagged"
              style={{ flex: mobile ? '1 1 40%' : '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 13px', borderRadius: 10, fontFamily: 'inherit', cursor: 'pointer',
                background: minBudget > 0 ? 'rgba(245,158,11,0.10)' : 'var(--card)', border: `1px dashed ${minBudget > 0 ? '#f59e0b' : 'var(--border)'}` }}>
              <i className="ti ti-adjustments-dollar" style={{ fontSize: 14, color: minBudget > 0 ? '#f59e0b' : 'var(--text3)' }} />
              <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text2)' }}>{minBudget > 0 ? 'Min budget' : 'Set min budget'}</span>
              {minBudget > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>AED {minBudget.toLocaleString()}</span>}
            </button>
            {!isTD && myLeads.length > 0 && <span style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 2px' }} />}
            {!isTD && myLeads.length > 0 && SOURCE_CARDS.map(s => {
              const active = fSource === s.key
              return (
                <button key={s.key} onClick={() => toggleSource(s.key)}
                  style={{ flex: mobile ? '1 1 40%' : '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, fontFamily: 'inherit', cursor: 'pointer',
                    background: active ? s.color + '14' : 'var(--card)', border: `1px solid ${active ? s.color : 'var(--border)'}` }}>
                  <i className={'ti ' + s.icon} style={{ fontSize: 14, color: s.color }} />
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text2)' }}>{s.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: active ? s.color : 'var(--text)' }}>{mySrcCount(s.key)}</span>
                </button>
              )
            })}
          </div>
        )}

        {anyFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--bg2)', borderRadius: 8, padding: '8px 13px', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{filtered.length} {filtered.length === 1 ? 'lead' : 'leads'}</span>
            {quickFilter && <FilterChip label={QUICK_LABELS[quickFilter]} onClear={() => setQuickFilter('')} />}
            {!isTD && fSource !== 'all' && <FilterChip label={'Source: ' + (SOURCE_CARDS.find(s => s.key === fSource)?.label || fSource)} onClear={() => setFSource('all')} />}
            {fStatus !== 'all' && <FilterChip label={'Status: ' + (STATUS_FILTERS.find(s => s.key === fStatus)?.label || fStatus)} onClear={() => setFStatus('all')} />}
            {search.trim() && <FilterChip label={'“' + search.trim() + '”'} onClear={() => setSearch('')} />}
            <button onClick={clearAllFilters} style={{ marginLeft: 'auto', fontSize: 12, color: '#0099cc', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="ti ti-x" style={{ fontSize: 13 }} /> Clear all
            </button>
          </div>
        )}


        {baseLeads.length > 0 && (
          <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', flexWrap: mobile ? 'nowrap' : 'wrap', gap: 10, alignItems: mobile ? 'stretch' : 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '8px 12px', flex: mobile ? 'none' : '1 1 200px', minWidth: 0 }}>
              <i className="ti ti-search" style={{ fontSize: 14, color: 'var(--text3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, project, location..." style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', width: '100%', fontFamily: 'inherit' }} />
            </div>
            <select value={fStatus} onChange={e => setFStatus(e.target.value)} title="Filter by status"
              style={{ ...selectStyle, padding: '9px 30px 9px 12px', flex: mobile ? 'none' : '0 0 auto' }}>
              <option value="all" style={optStyle}>All statuses</option>
              {STATUS_FILTERS.map(s => <option key={s.key} value={s.key} style={optStyle}>{s.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 8, padding: 2, flex: mobile ? 1 : 'none', overflowX: 'auto' }}>
                {[['board','ti-layout-kanban','Board'],['list','ti-list','List'],['flow','ti-route','Flow'],['galaxy','ti-orbit','Galaxy'],['embedding','ti-chart-dots','AI Map']].map(([v,ic,lbl]) => (
                  <button key={v} onClick={() => setView(v)} style={{ flex: mobile ? 1 : 'none', justifyContent: 'center', padding: '7px 11px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, background: view === v ? 'var(--card)' : 'transparent', color: view === v ? 'var(--primary)' : 'var(--text3)' }}>
                    <i className={`ti ${ic}`} style={{ fontSize: 14 }} /> {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>

  return (
    <div className="animate-in" style={{ color: 'var(--text)' }}>
      {Modal()}
      {AddLeadModal()}
      {dupMatch && (
        <div onClick={() => setDupMatch(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--card)', borderRadius: 14, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,158,11,0.16)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="ti ti-alert-triangle" style={{ fontSize: 20 }} /></div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Possible duplicate</div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>This phone or email is already in your leads.</div>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ border: '0.5px solid var(--border)', borderRadius: 11, padding: '12px 13px', background: 'var(--bg2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{dupMatch.name || '—'}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(0,153,204,0.14)', color: '#0099cc' }}>{dupMatch.kind}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 7, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span><i className="ti ti-phone" style={{ fontSize: 13, verticalAlign: '-2px', marginRight: 6, color: 'var(--text3)' }} />{dupMatch.phone || '—'}</span>
                  {dupMatch.source && <span><i className="ti ti-target-arrow" style={{ fontSize: 13, verticalAlign: '-2px', marginRight: 6, color: 'var(--text3)' }} />{dupMatch.source}</span>}
                  <span><i className="ti ti-progress" style={{ fontSize: 13, verticalAlign: '-2px', marginRight: 6, color: 'var(--text3)' }} />{(LEAD_STATUSES.find(x => x.value === dupMatch.status) || {}).label || dupMatch.status || 'New'}{dupMatch.created_at ? ' · added ' + new Date(dupMatch.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px' }}>
              <button onClick={() => { setSearch(dupMatch.name || dupMatch.phone || ''); setMainTab(dupMatch.kind === 'Quvera lead' ? 'trustdubai' : 'mine'); setDupMatch(null); closeAdd() }} style={{ flex: 1, padding: 10, borderRadius: 9, border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>View existing</button>
              <button onClick={() => { setDupMatch(null); saveAddLead(true) }} style={{ flex: 1, padding: 10, borderRadius: 9, border: 'none', background: '#f59e0b', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Add anyway</button>
            </div>
          </div>
        </div>
      )}
      {lostFor && (
        <div onClick={() => { setLostFor(null); setLostNote('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--card)', borderRadius: 14, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '0.5px solid var(--border)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Close this lead?</div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Why are you closing {lostFor.name || 'this lead'}? Pick a reason — it's saved for your records.</div>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {LOST_REASONS.map(r => (
                  <button key={r} onClick={() => { closeAsLost(lostFor, r); setLostNote('') }} disabled={updatingStatus === lostFor.key}
                    style={{ fontSize: 12, fontWeight: 600, color: r === 'Budget too low' ? '#b45309' : 'var(--text)', border: '0.5px solid ' + (r === 'Budget too low' ? '#f59e0b' : 'var(--border)'), background: r === 'Budget too low' ? 'rgba(245,158,11,0.12)' : 'var(--bg2)', padding: '8px 12px', borderRadius: 9, cursor: 'pointer' }}>{r}</button>
                ))}
              </div>
              <input value={lostNote} onChange={e => setLostNote(e.target.value)} placeholder="Or type your own reason…"
                style={{ width: '100%', marginTop: 12, padding: '9px 11px', fontSize: 13, borderRadius: 9, border: '0.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px' }}>
              <button onClick={() => { setLostFor(null); setLostNote('') }} style={{ flex: 1, padding: 10, borderRadius: 9, border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { closeAsLost(lostFor, lostNote || 'Closed'); setLostNote('') }} disabled={updatingStatus === lostFor.key} style={{ flex: 1, padding: 10, borderRadius: 9, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Close lead</button>
            </div>
          </div>
        </div>
      )}
      <ShareModal />
      <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ display: 'inline-flex', gap: 3, maxWidth: '100%', background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 11, padding: 3, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {[
          { id: 'trustdubai', label: mobile ? 'Quvera' : 'Quvera Leads', count: tdLeads.length, icon: 'ti-shield-check' },
          { id: 'mine',       label: 'My Leads', count: myLeads.length, icon: 'ti-building-store' },
          { id: 'forms',      label: 'Forms',    count: forms.length,   icon: 'ti-forms' },
        ].map(t => {
          const on = mainTab === t.id
          return (
          <button key={t.id} onClick={() => { setMainTab(t.id); try { localStorage.setItem('lead_main_tab', t.id) } catch {} setFSource('all'); setFStatus('all'); setSearch(''); setQuickFilter(''); closeEditor() }} style={{
            padding: mobile ? '8px 11px' : '8px 16px', border: 'none', cursor: 'pointer', borderRadius: 8,
            fontSize: mobile ? 12.5 : 13.5, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
            background: on ? 'var(--card)' : 'transparent',
            color: on ? 'var(--primary-dark)' : 'var(--text2)',
            boxShadow: on ? 'var(--shadow-md)' : 'none', transition: 'background .15s, color .15s'
          }}>
            <i className={'ti ' + t.icon} style={{ fontSize: 15 }} /> {t.label}
            <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: on ? 'var(--primary-bg)' : 'var(--bg)', color: on ? 'var(--primary-dark)' : 'var(--text3)' }}>{t.count}</span>
          </button>
          )
        })}
      </div>
        {mainTab === 'mine' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap', padding: '8px 18px' }} onClick={openAdd}>+ Add Lead / Client</button>
            <button className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }} disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? '...' : '⬆ Import'}</button>
          </div>
        )}
      </div>

      {mainTab === 'trustdubai' && (
        <div>
          <div style={{ background: 'rgba(8,145,178,0.07)', border: '0.5px solid rgba(8,145,178,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 9 }}>
            <i className="ti ti-shield-check" style={{ fontSize: 18, color: '#0891b2' }} />
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Verified leads delivered to you by the <b style={{ color: '#0891b2' }}>Quvera</b> platform, ranked by match.</div>
          </div>
          {Toolbar()}
          {Board()}
        </div>
      )}

      {mainTab === 'mine' && (
        <div>
          <div style={{ background: 'rgba(139,92,246,0.07)', border: '0.5px solid rgba(139,92,246,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 9 }}>
            <i className="ti ti-building-store" style={{ fontSize: 18, color: '#7c3aed' }} />
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Your own leads — from Meta ads, WhatsApp, manual entry and CSV imports. <span style={{ color: 'var(--text3)' }}>Meta auto-sync coming soon.</span></div>
          </div>
          {Toolbar()}
          {Board()}
        </div>
      )}

      {mainTab === 'forms' && (
        <div>
          {!editingForm ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--text2)' }}>Create lead capture forms to share via link or QR — submissions land in My Leads.</p>
                <button className="btn btn-primary btn-sm" onClick={() => setShowNewForm(true)}>+ New Form</button>
              </div>

              {showNewForm && (
                <div style={{ ...card, marginBottom: 16 }}>
                  <div className="card-title" style={{ marginBottom: 12 }}>New Form</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input value={newFormTitle} onChange={e => setNewFormTitle(e.target.value)} placeholder="Form title e.g. Interior Design Inquiry"
                      style={{ flex: '1 1 200px', padding: '10px 14px', ...inputStyle, boxSizing: 'border-box' }} onKeyDown={e => e.key === 'Enter' && createForm()} />
                    <button className="btn btn-primary btn-sm" onClick={createForm}>Create</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowNewForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {forms.length === 0 ? (
                <div style={{ ...card, textAlign: 'center', padding: '60px 20px' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px', background: 'var(--bg2)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="ti ti-forms" style={{ fontSize: 30, color: 'var(--text3)' }} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>No forms yet</h3>
                  <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>Create your first lead form, then share its link or QR</p>
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
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => openShare(form)} style={{ padding: '7px 13px', background: '#0891b2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <i className="ti ti-qrcode" style={{ fontSize: 15 }} /> Share &amp; QR
                          </button>
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
                    <input value={editingForm.title} onChange={e => setEditingForm(prev => ({ ...prev, title: e.target.value }))} style={{ width: '100%', padding: '10px 14px', ...inputStyle, boxSizing: 'border-box' }} />
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
                            <input value={q.question} onChange={e => updateQuestion(q.id, 'question', e.target.value)} placeholder={'Question ' + (i + 1)} style={{ flex: 1, padding: '8px 12px', ...inputStyle, fontSize: 13, boxSizing: 'border-box' }} />
                            <select value={q.type} onChange={e => updateQuestion(q.id, 'type', e.target.value)} style={{ padding: '8px 26px 8px 10px', ...selectStyle, fontSize: 12 }}>
                              {QUESTION_TYPES.map(t => <option key={t.value} value={t.value} style={optStyle}>{t.label}</option>)}
                            </select>
                            <button onClick={() => deleteQuestion(q.id)} style={{ padding: '8px', border: 'none', background: 'rgba(239,68,68,0.14)', borderRadius: 6, cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
                          </div>
                          {(q.type === 'radio' || q.type === 'select') && (
                            <div style={{ paddingLeft: 8 }}>
                              {(q.options || []).map((opt, oi) => (
                                <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                  <input value={opt} onChange={e => updateOption(q.id, oi, e.target.value)} placeholder={'Option ' + (oi + 1)} style={{ flex: 1, padding: '6px 10px', ...inputStyle, fontSize: 12, boxSizing: 'border-box' }} />
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
                            {q.type === 'text' && <input disabled placeholder="Customer answer..." style={{ width: '100%', padding: '8px 10px', ...inputStyle, fontSize: 12, boxSizing: 'border-box' }} />}
                            {q.type === 'select' && <select disabled style={{ width: '100%', padding: '8px 10px', ...inputStyle, fontSize: 12, boxSizing: 'border-box' }}><option style={optStyle}>Select an option</option>{(q.options || []).map((o, i) => <option key={i} style={optStyle}>{o}</option>)}</select>}
                            {q.type === 'radio' && <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{(q.options || []).map((o, i) => <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}><input type="radio" disabled /> {o || 'Option ' + (i + 1)}</label>)}</div>}
                          </div>
                        ))}
                        <div style={{ background: 'var(--primary)', color: '#fff', textAlign: 'center', padding: '8px', borderRadius: 20, fontSize: 13, fontWeight: 500, marginTop: 8 }}>Submit — Get Quote</div>
                        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: 'var(--text3)' }}>Powered by Quvera</div>
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
