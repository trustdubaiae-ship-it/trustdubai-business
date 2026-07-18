import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { CATEGORIES } from '../lib/categories'

const MAX_CATS = 5
const AED = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
const wa = (phone) => 'https://wa.me/' + String(phone || '').replace(/[^0-9]/g, '')
const blankForm = (company, pre = {}) => ({
  title: pre.title || '', description: '', categories: [], budget_min: '', budget_max: '', location: pre.location || '', timeline: '',
  scope: [], project_type: '', urgency: '',
  contact_name: company?.name || '', contact_phone: company?.phone || company?.whatsapp || '', contact_email: company?.email || company?.owner_email || '',
  show_name: true, show_phone: false, show_email: false,
  images: [],
  project_id: pre.projectId || null, project_title: pre.title || '',
})

const PROJECT_TYPES = ['New build', 'Renovation', 'Fit-out', 'Maintenance', 'Repair', 'Supply only']
const URGENCY = [
  { id: 'urgent',     label: 'Urgent',     color: '#dc2626', icon: 'ti-flame' },
  { id: 'this_month', label: 'This month', color: '#d97706', icon: 'ti-calendar-event' },
  { id: 'flexible',   label: 'Flexible',   color: '#16a34a', icon: 'ti-clock' },
]
const urgencyOf = (id) => URGENCY.find(u => u.id === id) || null
// deal pipeline for a posted project
const STAGES = [
  { id: 'open',        label: 'Open',        color: '#0891b2', icon: 'ti-circle-dot' },
  { id: 'contacted',   label: 'Contacted',   color: '#6366f1', icon: 'ti-phone-check' },
  { id: 'quoted',      label: 'Quoted',      color: '#8b5cf6', icon: 'ti-file-invoice' },
  { id: 'negotiation', label: 'Negotiation', color: '#d97706', icon: 'ti-messages' },
  { id: 'awarded',     label: 'Awarded',     color: '#16a34a', icon: 'ti-award' },
]
const stageOf = (id) => STAGES.find(s => s.id === id) || STAGES[0]
const isLocked = (p) => (p.stage === 'awarded') || (p.status === 'under_discussion')
// trust tiers (mirrors TrustScorePage)
const TIERS = {
  top_rated: { label: 'Top Rated', color: '#8b5cf6', icon: 'ti-crown' },
  trusted:   { label: 'Trusted',   color: '#0891b2', icon: 'ti-shield-check' },
  verified:  { label: 'Verified',  color: '#16a34a', icon: 'ti-rosette-discount-check' },
  listed:    { label: 'Listed',    color: '#94a3b8', icon: 'ti-building-store' },
}
const num = (v) => Number(v) || 0

// ---- reusable trust atoms ----
function Stars({ rating, size = 12 }) {
  const r = num(rating)
  return (
    <span style={{ display: 'inline-flex', gap: 1, verticalAlign: '-1px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <i key={i} className={'ti ' + (r >= i ? 'ti-star-filled' : (r >= i - 0.5 ? 'ti-star-half-filled' : 'ti-star'))}
          style={{ fontSize: size, color: r >= i - 0.5 ? '#f59e0b' : 'var(--text3)' }} />
      ))}
    </span>
  )
}
// compact company trust chip — verified tick + tier + score
function TrustBadge({ c, size = 'sm' }) {
  if (!c) return null
  const tier = TIERS[c.trust_tier] || (c.is_verified ? TIERS.verified : TIERS.listed)
  const score = c.trust_score != null ? Math.round(num(c.trust_score)) : null
  const pad = size === 'lg' ? '4px 11px' : '2px 8px'
  const fs = size === 'lg' ? 12 : 10.5
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: fs, fontWeight: 700, padding: pad, borderRadius: 99, color: tier.color, background: tier.color + '1e' }}>
        <i className={'ti ' + tier.icon} style={{ fontSize: fs + 2 }} /> {tier.label}
      </span>
      {score != null && <span style={{ fontSize: fs, fontWeight: 700, padding: pad, borderRadius: 99, color: 'var(--text2)', background: 'var(--bg2)' }}>Trust {score}</span>}
    </span>
  )
}

export default function SubcontractHub({ company }) {
  const toast = useToast()
  const plan = (company?.plan || 'free').toLowerCase()
  const isGold = plan === 'gold' || plan === 'platinum'

  const [view, setView] = useState('feed')              // 'feed' | 'mine'
  const [feed, setFeed] = useState([])
  const [myPosts, setMyPosts] = useState([])
  const [myInterestIds, setMyInterestIds] = useState(new Set())
  const [interestsByProject, setInterestsByProject] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  const [showPost, setShowPost] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(blankForm(company))
  const [saving, setSaving] = useState(false)

  const [fCat, setFCat] = useState('all')
  const [fSearch, setFSearch] = useState('')
  const [awardFor, setAwardFor] = useState(null)        // project id being awarded
  const [awardPick, setAwardPick] = useState('')
  const [expanded, setExpanded] = useState(null)        // my-post id whose interests are open
  const [projects, setProjects] = useState([])          // ops_projects for the subcontractor link
  const [addSub, setAddSub] = useState(null)            // { post, name, phone, email, projectId } after an award
  const [addingSub, setAddingSub] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [detail, setDetail] = useState(null)            // a feed post opened in full-detail view
  const [lightbox, setLightbox] = useState(null)        // image url opened full-screen
  const [companiesById, setCompaniesById] = useState({}) // trust info for companies that replied
  const [profileCard, setProfileCard] = useState(null)   // company shown in the in-portal profile modal

  useEffect(() => { if (isGold && company?.id) load() }, [company?.id]) // eslint-disable-line
  // Posted from a project ("Find on Marketplace") → open the form pre-filled + linked.
  useEffect(() => {
    if (!isGold) return
    try {
      const raw = localStorage.getItem('qv_mkt_prefill')
      if (raw) { localStorage.removeItem('qv_mkt_prefill'); const pre = JSON.parse(raw); setEditId(null); setForm(blankForm(company, pre)); setView('mine'); setShowPost(true) }
    } catch { /* ignore */ }
  }, []) // eslint-disable-line

  async function load() {
    setLoading(true)
    try {
      const [f, m, mi, pr] = await Promise.all([
        supabase.rpc('subcontract_feed'),
        supabase.from('qv_subcontract_projects').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
        supabase.from('qv_subcontract_interests').select('project_id').eq('company_id', company.id),
        supabase.from('ops_projects').select('id,name').eq('company_id', company.id).order('created_at', { ascending: false }),
      ])
      setFeed(f.data || [])
      setMyPosts(m.data || [])
      setProjects(pr.data || [])
      setMyInterestIds(new Set((mi.data || []).map(r => r.project_id)))
      const ids = (m.data || []).map(p => p.id)
      if (ids.length) {
        const { data: ints } = await supabase.from('qv_subcontract_interests').select('*').in('project_id', ids).order('created_at', { ascending: false })
        const map = {}; (ints || []).forEach(i => { (map[i.project_id] = map[i.project_id] || []).push(i) }); setInterestsByProject(map)
        // pull trust info for every company that replied → badge + profile card
        const cids = [...new Set((ints || []).map(i => i.company_id).filter(Boolean))]
        if (cids.length) {
          const { data: comps } = await supabase.from('companies')
            .select('id,name,slug,logo_url,trust_score,trust_tier,is_verified,avg_rating,total_reviews,categories,category,description,phone')
            .in('id', cids)
          const cmap = {}; (comps || []).forEach(c => { cmap[c.id] = c }); setCompaniesById(cmap)
        } else setCompaniesById({})
      } else { setInterestsByProject({}); setCompaniesById({}) }
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  function toggleCat(c) {
    setForm(s => {
      if (s.categories.includes(c)) return { ...s, categories: s.categories.filter(x => x !== c) }
      if (s.categories.length >= MAX_CATS) { toast.error(`Up to ${MAX_CATS} categories`); return s }
      return { ...s, categories: [...s.categories, c] }
    })
  }

  function openNew() { setEditId(null); setForm(blankForm(company)); setShowPost(true) }
  function openEdit(p) {
    setEditId(p.id)
    setForm({
      title: p.title || '', description: p.description || '', categories: p.categories || [],
      budget_min: p.budget_min ?? '', budget_max: p.budget_max ?? '', location: p.location || '', timeline: p.timeline || '',
      scope: p.scope || [], project_type: p.project_type || '', urgency: p.urgency || '',
      contact_name: p.contact_name || '', contact_phone: p.contact_phone || '', contact_email: p.contact_email || '',
      show_name: !!p.show_name, show_phone: !!p.show_phone, show_email: !!p.show_email,
      images: p.images || [],
    })
    setShowPost(true)
  }

  // Upload one or more photos to storage; push their public URLs onto the form.
  async function uploadImages(files) {
    const list = Array.from(files || []).filter(f => f.type.startsWith('image/'))
    if (!list.length) return
    if (form.images.length + list.length > 8) { toast.error('Up to 8 photos'); return }
    setUploading(true)
    try {
      for (const file of list) {
        if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name} is over 8MB`); continue }
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `subcontract/${company.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('company-assets').upload(path, file)
        if (error) { toast.error(`Failed to upload ${file.name}`); continue }
        const { data: { publicUrl } } = supabase.storage.from('company-assets').getPublicUrl(path)
        setForm(s => ({ ...s, images: [...s.images, publicUrl] }))
      }
    } finally { setUploading(false) }
  }
  function removeImage(url) { setForm(s => ({ ...s, images: s.images.filter(u => u !== url) })) }

  async function submit() {
    if (!form.title.trim()) { toast.error('Add a project title'); return }
    if (form.categories.length === 0) { toast.error('Pick at least 1 category that should see this'); return }
    if (!form.contact_name.trim() || !form.contact_phone.trim() || !form.contact_email.trim()) { toast.error('Contact name, phone and email are required'); return }
    setSaving(true)
    try {
      const payload = {
        company_id: company.id, poster_name: company.name || '',
        title: form.title.trim(), description: form.description.trim() || null,
        categories: form.categories,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        location: form.location.trim() || null, timeline: form.timeline.trim() || null,
        scope: (form.scope || []).map(s => String(s).trim()).filter(Boolean),
        project_type: form.project_type || null, urgency: form.urgency || null,
        contact_name: form.contact_name.trim(), contact_phone: form.contact_phone.trim(), contact_email: form.contact_email.trim(),
        show_name: form.show_name, show_phone: form.show_phone, show_email: form.show_email,
        images: form.images || [],
        ...(form.project_id ? { project_id: form.project_id } : {}),
      }
      let error
      if (editId) ({ error } = await supabase.from('qv_subcontract_projects').update(payload).eq('id', editId))
      else ({ error } = await supabase.from('qv_subcontract_projects').insert(payload))
      if (error) throw error
      toast.success(editId ? 'Project updated ✓' : 'Project posted ✓')
      setShowPost(false); setEditId(null); setView('mine'); load()
    } catch (e) { toast.error('Could not save: ' + (e?.message || e)) } finally { setSaving(false) }
  }

  async function expressInterest(p) {
    if (myInterestIds.has(p.id) || busy) return
    setBusy('int-' + p.id)
    try {
      const { error } = await supabase.from('qv_subcontract_interests').insert({
        project_id: p.id, company_id: company.id, company_name: company.name || '',
        contact_phone: company.phone || company.whatsapp || '', contact_email: company.email || company.owner_email || '',
      })
      if (error) { if (error.code === '23505') { setMyInterestIds(s => new Set([...s, p.id])); toast.info('You already expressed interest') } else throw error; return }
      setMyInterestIds(s => new Set([...s, p.id]))
      toast.success("Interest sent — the company will reach out to you")
    } catch (e) { toast.error('Could not send: ' + (e?.message || e)) } finally { setBusy('') }
  }

  async function setStatus(p, status, awarded) {
    setBusy('st-' + p.id)
    try {
      const patch = { status, stage: status === 'under_discussion' ? 'awarded' : 'open' }
      if (status === 'under_discussion') { patch.awarded_to = awarded?.name || null; patch.awarded_company_id = awarded?.id || null }
      else { patch.awarded_to = null; patch.awarded_company_id = null }
      await supabase.from('qv_subcontract_projects').update(patch).eq('id', p.id)
      setAwardFor(null); setAwardPick(''); load()
    } catch (e) { toast.error('Failed: ' + (e?.message || e)) } finally { setBusy('') }
  }
  // advance/rewind a project's deal pipeline (awarding is handled via the picker)
  async function setStage(p, stage) {
    if (stage === (p.stage || 'open') || busy) return
    setBusy('st-' + p.id)
    try {
      const patch = { stage }
      if (stage === 'open') { patch.status = 'open'; patch.awarded_to = null; patch.awarded_company_id = null }
      else if (stage !== 'awarded') { patch.status = 'open' }   // contacted/quoted/negotiation stay live in the feed
      await supabase.from('qv_subcontract_projects').update(patch).eq('id', p.id)
      load()
    } catch (e) { toast.error('Failed: ' + (e?.message || e)) } finally { setBusy('') }
  }
  // Award the work → mark under discussion, then offer to add the company as a
  // subcontractor in a project (auto-targets the linked project if posted from one).
  async function award(p, awarded) {
    await setStatus(p, 'under_discussion', awarded)
    setAddSub({ post: p, name: awarded?.name || '', phone: awarded?.phone || '', email: awarded?.email || '', projectId: p.project_id || '', subCompanyId: awarded?.id || null })
  }
  async function confirmAddSub() {
    if (!addSub?.projectId) { toast.error('Pick a project'); return }
    setAddingSub(true)
    try {
      const { error } = await supabase.from('project_subcontractors').insert({
        company_id: company.id, project_id: addSub.projectId, name: addSub.name || 'Subcontractor',
        phone: addSub.phone || null, contact_person: addSub.name || null, owner_mobile: addSub.phone || null,
        status: 'ongoing', notes: 'Added from Marketplace' + (addSub.post?.title ? ' — ' + addSub.post.title : ''),
        apply_vat: true, payment_days: 30, payment_schedule: [], sub_company_id: addSub.subCompanyId || null,
      })
      if (error) throw error
      toast.success('Added as subcontractor ✓ — set the contract amount in Projects')
      setAddSub(null)
    } catch (e) { toast.error('Could not add: ' + (e?.message || e)) } finally { setAddingSub(false) }
  }

  // ---------- GOLD GATE ----------
  if (!isGold) {
    return (
      <div style={{ maxWidth: 620, margin: '20px auto', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 'clamp(26px,5vw,44px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(420px 200px at 50% -10%, rgba(232,184,75,0.18), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ width: 66, height: 66, borderRadius: 18, background: 'linear-gradient(135deg,#e8b84b,#c9952a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 10px 30px -8px rgba(232,184,75,0.6)' }}>
            <i className="ti ti-crown" style={{ fontSize: 32, color: '#1a1207' }} />
          </div>
          <h2 style={{ fontSize: 'clamp(20px,3.4vw,26px)', fontWeight: 800, color: 'var(--text)', margin: 0 }}>Marketplace — a Gold feature</h2>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, margin: '12px auto 0', maxWidth: 460 }}>
            Got more work than you can handle? Post it here and let your trusted Quvera contractors take it on — and discover subcontract jobs posted by other companies in your trade.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, margin: '20px auto', maxWidth: 380, textAlign: 'left' }}>
            {['Post projects to subcontract in minutes', 'Target the exact trades that should see it', 'See live jobs matched to your category', 'Connect directly — no spam, no middleman'].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--text2)' }}>
                <i className="ti ti-circle-check-filled" style={{ fontSize: 18, color: '#e8b84b' }} /> {t}
              </div>
            ))}
          </div>
          <button onClick={() => { window.location.hash = 'plans' }} style={{ padding: '13px 26px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 14.5, fontWeight: 700, color: '#1a1207', background: 'linear-gradient(135deg,#e8b84b,#c9952a)', boxShadow: '0 10px 26px -8px rgba(232,184,75,0.6)' }}>
            <i className="ti ti-crown" style={{ verticalAlign: '-2px', marginRight: 6 }} />Subscribe for Gold to avail this page
          </button>
        </div>
      </div>
    )
  }

  // ---------- GOLD ----------
  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }
  let feedList = feed.filter(p => fCat === 'all' || (p.categories || []).includes(fCat))
  if (fSearch.trim()) { const q = fSearch.toLowerCase(); feedList = feedList.filter(p => (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.poster_name || '').toLowerCase().includes(q)) }

  return (
    <div>
      <style>{`.mkt-kard{transition:transform .15s ease,box-shadow .2s ease,border-color .2s ease}.mkt-kard:hover{transform:translateY(-2px);border-color:var(--primary-border)}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', gap: 4, background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {[['feed', 'Available jobs', 'ti-briefcase', feedList.length], ['mine', 'My posts', 'ti-clipboard-list', myPosts.length]].map(([id, label, ic, n]) => (
            <button key={id} onClick={() => setView(id)} style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, background: view === id ? 'var(--card)' : 'transparent', color: view === id ? 'var(--primary-dark)' : 'var(--text2)', boxShadow: view === id ? 'var(--shadow-md)' : 'none' }}>
              <i className={'ti ' + ic} style={{ fontSize: 15 }} /> {label}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: view === id ? 'var(--primary-bg)' : 'var(--bg)', color: 'var(--text3)' }}>{n}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" style={{ padding: '9px 18px' }} onClick={openNew}>
          <i className="ti ti-plus" style={{ verticalAlign: '-2px', marginRight: 4 }} />Post a project
        </button>
      </div>

      {view === 'feed' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={fSearch} onChange={e => setFSearch(e.target.value)} placeholder="Search jobs…" style={{ ...inp, flex: '1 1 200px', maxWidth: 320 }} />
            <select value={fCat} onChange={e => setFCat(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 170 }}>
              <option value="all">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ background: 'rgba(232,184,75,0.08)', border: '0.5px solid rgba(232,184,75,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 9 }}>
            <i className="ti ti-crown" style={{ fontSize: 17, color: '#d97706' }} />
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Jobs matched to <b>your category</b>. Tap <b>I'm interested</b> — the poster gets your contact and reaches out.</div>
          </div>
        </>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: 'var(--text3)' }}><i className="ti ti-loader-2" style={{ fontSize: 24, animation: 'spin 1s linear infinite' }} /></div>
      ) : view === 'feed' ? (
        feedList.length === 0 ? emptyState('feed') : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14, alignItems: 'start' }}>
            {feedList.map(p => {
              const taken = isLocked(p)
              const interested = myInterestIds.has(p.id)
              const tint = taken ? '#94a3b8' : '#0891b2'
              return (
                <div key={p.id} onClick={() => setDetail(p)} className="mkt-kard" style={{ cursor: 'pointer', position: 'relative', display: 'flex', flexDirection: 'column', background: `radial-gradient(135% 90% at 50% -14%, ${tint}1f, transparent 55%), var(--card)`, border: '1px solid var(--border)', borderRadius: 18, padding: 16, boxShadow: 'var(--shadow-md)', opacity: taken ? 0.62 : 1 }}>
                  {taken && <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}><i className="ti ti-lock" style={{ fontSize: 15, color: 'var(--text3)' }} title="Awarded — locked" /></div>}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 11px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.4px', display: 'inline-flex', alignItems: 'center', gap: 5, background: taken ? 'var(--bg2)' : 'rgba(8,145,178,0.16)', color: taken ? 'var(--text3)' : '#0e7490' }}>
                      <i className={'ti ' + (taken ? 'ti-lock' : 'ti-circle-dot')} style={{ fontSize: 12 }} /> {taken ? 'Awarded' : 'Open'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(p.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: tint + '22', color: tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-briefcase" style={{ fontSize: 22 }} /></div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--text)', lineHeight: 1.25, letterSpacing: '-.2px', wordBreak: 'break-word' }}>{p.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}><i className="ti ti-building" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {p.poster_name || 'A Quvera company'}</div>
                      {(p.poster_trust_tier || p.poster_is_verified || p.poster_trust_score != null) && (
                        <div style={{ marginTop: 6 }}><TrustBadge c={{ trust_tier: p.poster_trust_tier, trust_score: p.poster_trust_score, is_verified: p.poster_is_verified }} /></div>
                      )}
                    </div>
                  </div>
                  {(p.project_type || p.urgency) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
                      {p.project_type && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 5 }}><i className="ti ti-category" style={{ fontSize: 12 }} />{p.project_type}</span>}
                      {urgencyOf(p.urgency) && <span style={{ fontSize: 11, fontWeight: 700, color: urgencyOf(p.urgency).color, background: urgencyOf(p.urgency).color + '18', padding: '3px 10px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 5 }}><i className={'ti ' + urgencyOf(p.urgency).icon} style={{ fontSize: 12 }} />{urgencyOf(p.urgency).label}</span>}
                    </div>
                  )}
                  {(p.images || []).length > 0 && (
                    <div style={{ position: 'relative', marginTop: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '16 / 9', background: 'var(--bg2)' }}>
                      <img src={p.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {p.images.length > 1 && <span style={{ position: 'absolute', bottom: 7, right: 7, fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '2px 9px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 4 }}><i className="ti ti-photo" style={{ fontSize: 12 }} />{p.images.length}</span>}
                    </div>
                  )}
                  {p.description && <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginTop: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</div>}
                  {(p.categories || []).length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>{(p.categories || []).map(c => <span key={c} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--primary-dark)', background: 'var(--primary-bg)', padding: '2px 9px', borderRadius: 99 }}>{c}</span>)}</div>}
                  <div style={{ marginTop: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {[
                      (p.budget_min || p.budget_max) && ['ti-coin', '#16a34a', 'Budget', p.budget_min && p.budget_max ? `${AED(p.budget_min)} – ${AED(p.budget_max)}` : AED(p.budget_min || p.budget_max)],
                      p.location && ['ti-map-pin', '#0891b2', 'Location', p.location],
                      p.timeline && ['ti-clock', '#8b5cf6', 'Timeline', p.timeline],
                      p.contact_name && ['ti-user', '#d97706', 'Contact', p.contact_name],
                    ].filter(Boolean).map((r, i) => (
                      <div key={r[2]} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                        <i className={'ti ' + r[0]} style={{ fontSize: 15, color: r[1], flexShrink: 0 }} />
                        <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{r[2]}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--text)', textAlign: 'right', wordBreak: 'break-word' }}>{r[3]}</span>
                      </div>
                    ))}
                  </div>
                  {!taken && (
                    <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
                      <button onClick={e => { e.stopPropagation(); expressInterest(p) }} disabled={interested || busy === 'int-' + p.id} className="btn btn-sm" style={{ flex: 1, minWidth: 120, background: interested ? 'var(--bg2)' : 'linear-gradient(135deg,#e8b84b,#c9952a)', color: interested ? 'var(--text2)' : '#1a1207', border: 'none', fontWeight: 700 }}>
                        <i className={'ti ' + (interested ? 'ti-check' : 'ti-hand-click')} style={{ verticalAlign: '-2px', marginRight: 4 }} />{interested ? 'Interested ✓' : "I'm interested"}
                      </button>
                      {p.contact_phone && <a onClick={e => e.stopPropagation()} href={wa(p.contact_phone)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#22c55e', color: '#fff', textDecoration: 'none' }}><i className="ti ti-brand-whatsapp" /></a>}
                      {p.contact_phone && <a onClick={e => e.stopPropagation()} href={'tel:' + p.contact_phone} className="btn btn-secondary btn-sm"><i className="ti ti-phone" /></a>}
                      {p.contact_email && <a onClick={e => e.stopPropagation()} href={'mailto:' + p.contact_email} className="btn btn-secondary btn-sm"><i className="ti ti-mail" /></a>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : (
        // ---------- MY POSTS ----------
        myPosts.length === 0 ? emptyState('mine') : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 14, alignItems: 'start' }}>
            {myPosts.map(p => {
              const ints = interestsByProject[p.id] || []
              const taken = isLocked(p)
              const cur = stageOf(p.stage || 'open')
              const open = expanded === p.id
              return (
                <div key={p.id} className="mkt-kard" style={{ position: 'relative', background: `radial-gradient(135% 90% at 50% -14%, ${cur.color}1f, transparent 55%), var(--card)`, border: '1px solid var(--border)', borderRadius: 18, padding: 16, boxShadow: 'var(--shadow-md)' }}>
                  {/* top bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 11px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.4px', display: 'inline-flex', alignItems: 'center', gap: 5, background: cur.color + '1e', color: cur.color }}>
                      <i className={'ti ' + (taken ? 'ti-lock' : cur.icon)} style={{ fontSize: 12 }} /> {cur.label}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(p.created_at)}</span>
                  </div>
                  {/* title */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: (taken ? '#f59e0b' : '#22c55e') + '22', color: taken ? '#d97706' : '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-briefcase" style={{ fontSize: 22 }} /></div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--text)', lineHeight: 1.25, letterSpacing: '-.2px', wordBreak: 'break-word' }}>{p.title}</div>
                      {taken && p.awarded_to && <div style={{ fontSize: 12, color: '#b45309', marginTop: 3, fontWeight: 600 }}><i className="ti ti-award" style={{ fontSize: 13, verticalAlign: '-2px' }} /> Awarded to {p.awarded_to}</div>}
                    </div>
                  </div>
                  {(p.images || []).length > 0 && (
                    <div style={{ position: 'relative', marginTop: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '16 / 9', background: 'var(--bg2)' }}>
                      <img src={p.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {p.images.length > 1 && <span style={{ position: 'absolute', bottom: 7, right: 7, fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '2px 9px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 4 }}><i className="ti ti-photo" style={{ fontSize: 12 }} />{p.images.length}</span>}
                    </div>
                  )}
                  {p.description && <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginTop: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</div>}
                  {(p.categories || []).length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>{(p.categories || []).map(c => <span key={c} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--primary-dark)', background: 'var(--primary-bg)', padding: '2px 9px', borderRadius: 99 }}>{c}</span>)}</div>}
                  {/* info rows */}
                  <div style={{ marginTop: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    {[
                      (p.budget_min || p.budget_max) && ['ti-coin', '#16a34a', 'Budget', p.budget_min && p.budget_max ? `${AED(p.budget_min)} – ${AED(p.budget_max)}` : AED(p.budget_min || p.budget_max)],
                      p.location && ['ti-map-pin', '#0891b2', 'Location', p.location],
                      p.timeline && ['ti-clock', '#8b5cf6', 'Timeline', p.timeline],
                      ['ti-users', '#d97706', 'Interested', `${ints.length} compan${ints.length === 1 ? 'y' : 'ies'}`],
                    ].filter(Boolean).map((r, i) => (
                      <div key={r[2]} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                        <i className={'ti ' + r[0]} style={{ fontSize: 15, color: r[1], flexShrink: 0 }} />
                        <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{r[2]}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>{r[3]}</span>
                      </div>
                    ))}
                  </div>

                  {/* deal pipeline — advance the project through its stages */}
                  <div style={{ marginTop: 13 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 7 }}>Deal pipeline</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {STAGES.map((s, idx) => {
                        const curIdx = STAGES.findIndex(x => x.id === (p.stage || 'open'))
                        const done = idx <= curIdx, isCur = idx === curIdx
                        return (
                          <button key={s.id} disabled={busy === 'st-' + p.id}
                            onClick={() => { if (s.id === 'awarded') { setAwardFor(p.id); setAwardPick(''); setExpanded(ints.length ? p.id : expanded) } else setStage(p, s.id) }}
                            title={s.id === 'awarded' ? 'Award to a company' : 'Set stage: ' + s.label}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 99, cursor: busy === 'st-' + p.id ? 'wait' : 'pointer', fontSize: 11.5, fontWeight: 700,
                              border: '1px solid ' + (isCur ? s.color : (done ? s.color + '55' : 'var(--border)')),
                              background: isCur ? s.color : (done ? s.color + '1e' : 'transparent'),
                              color: isCur ? '#fff' : (done ? s.color : 'var(--text3)') }}>
                            <i className={'ti ' + (done && !isCur ? 'ti-check' : s.icon)} style={{ fontSize: 13 }} /> {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                    <button onClick={() => openEdit(p)} className="btn btn-secondary btn-sm"><i className="ti ti-edit" style={{ verticalAlign: '-2px', marginRight: 3 }} />Edit</button>
                    {ints.length > 0 && <button onClick={() => setExpanded(open ? null : p.id)} className="btn btn-secondary btn-sm"><i className="ti ti-users" style={{ verticalAlign: '-2px', marginRight: 3 }} />Interested ({ints.length})</button>}
                  </div>

                  {/* award picker */}
                  {awardFor === p.id && !taken && (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Who is the work going to?</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <select value={awardPick} onChange={e => setAwardPick(e.target.value)} style={{ ...inp, flex: '1 1 200px' }}>
                          <option value="">{ints.length ? 'Select from interested companies…' : 'No interested companies yet'}</option>
                          {ints.map(i => <option key={i.id} value={i.id}>{i.company_name || 'A company'}</option>)}
                          <option value="__other">Someone else (type name)</option>
                        </select>
                        <button onClick={() => {
                          if (awardPick === '__other') { const nm = window.prompt('Company name awarded the work?'); if (nm) award(p, { name: nm.trim() }); return }
                          const sel = ints.find(i => i.id === awardPick)
                          award(p, sel ? { name: sel.company_name, id: sel.company_id, phone: sel.contact_phone, email: sel.contact_email } : { name: null })
                        }} disabled={busy === 'st-' + p.id} className="btn btn-primary btn-sm">Confirm</button>
                        <button onClick={() => setAwardFor(null)} className="btn btn-secondary btn-sm">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* interested list */}
                  {open && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ints.map(i => {
                        const c = companiesById[i.company_id]
                        return (
                          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                            <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, overflow: 'hidden', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {c?.logo_url ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontWeight: 800, color: 'var(--primary-dark)', fontSize: 16 }}>{(i.company_name || c?.name || '?').charAt(0).toUpperCase()}</span>}
                            </div>
                            <div style={{ flex: 1, minWidth: 150 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                {i.company_name || c?.name || 'A company'}
                                {c?.is_verified && <i className="ti ti-rosette-discount-check-filled" style={{ fontSize: 15, color: '#16a34a' }} title="Verified" />}
                              </div>
                              {c ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                                  <TrustBadge c={c} />
                                  {num(c.total_reviews) > 0 && <span style={{ fontSize: 11.5, color: 'var(--text3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Stars rating={c.avg_rating} /> {num(c.avg_rating).toFixed(1)} ({c.total_reviews})</span>}
                                </div>
                              ) : (
                                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>{[i.contact_phone, i.contact_email].filter(Boolean).join(' · ') || 'No contact'}</div>
                              )}
                            </div>
                            <button onClick={() => setProfileCard(c || { name: i.company_name, phone: i.contact_phone, _fallback: true })} className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }}><i className="ti ti-user-circle" style={{ verticalAlign: '-2px', marginRight: 3 }} />Profile</button>
                            {i.contact_phone && <a href={wa(i.contact_phone)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#22c55e', color: '#fff', textDecoration: 'none' }}><i className="ti ti-brand-whatsapp" /></a>}
                            {i.contact_phone && <a href={'tel:' + i.contact_phone} className="btn btn-secondary btn-sm"><i className="ti ti-phone" /></a>}
                            {i.contact_email && <a href={'mailto:' + i.contact_email} className="btn btn-secondary btn-sm"><i className="ti ti-mail" /></a>}
                            {!taken && <button onClick={() => award(p, { name: i.company_name, id: i.company_id, phone: i.contact_phone, email: i.contact_email })} disabled={busy === 'st-' + p.id} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}><i className="ti ti-award" style={{ verticalAlign: '-2px', marginRight: 3 }} />Award</button>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ---------- POST / EDIT MODAL ---------- */}
      {showPost && (
        <div onClick={() => setShowPost(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 14px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 600, maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}><i className="ti ti-briefcase" style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--primary-dark)' }} />{editId ? 'Edit project' : 'Post a project to subcontract'}</div>
              <button onClick={() => setShowPost(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
            </div>
            <div style={{ padding: 18, maxHeight: '70vh', overflowY: 'auto' }}>
              {form.project_id && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--primary-bg)', border: '1px solid var(--primary-border)', marginBottom: 14, fontSize: 12, color: 'var(--primary-dark)' }}><i className="ti ti-link" /> Finding a subcontractor for your project{form.project_title ? `: ${form.project_title}` : ''}. The company you award will be added as its subcontractor.</div>}
              {fld('Project title', <input value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))} placeholder="e.g. False ceiling & gypsum for a 2BHK villa" style={inp} />)}
              {fld('Scope / description', <textarea value={form.description} onChange={e => setForm(s => ({ ...s, description: e.target.value }))} placeholder="Describe the work, size, finishes, what you need from the subcontractor…" rows={4} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />)}
              {fld(`Who should see this? (${form.categories.length}/${MAX_CATS} categories)`, (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {CATEGORIES.map(c => (
                    <button key={c} type="button" onClick={() => toggleCat(c)} style={{ padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: '1px solid ' + (form.categories.includes(c) ? 'var(--primary)' : 'var(--border)'), background: form.categories.includes(c) ? 'var(--primary-bg)' : 'transparent', color: form.categories.includes(c) ? 'var(--primary-dark)' : 'var(--text2)' }}>{c}</button>
                  ))}
                </div>
              ), 'Only companies of these categories will see your post.')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {fld('Budget from (AED)', <input type="number" value={form.budget_min} onChange={e => setForm(s => ({ ...s, budget_min: e.target.value }))} placeholder="Optional" style={inp} />)}
                {fld('Budget to (AED)', <input type="number" value={form.budget_max} onChange={e => setForm(s => ({ ...s, budget_max: e.target.value }))} placeholder="Optional" style={inp} />)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {fld('Location / area', <input value={form.location} onChange={e => setForm(s => ({ ...s, location: e.target.value }))} placeholder="e.g. JVC, Dubai" style={inp} />)}
                {fld('Timeline', <input value={form.timeline} onChange={e => setForm(s => ({ ...s, timeline: e.target.value }))} placeholder="e.g. Start in 1 week · 10 days" style={inp} />)}
              </div>

              {fld('Project type', (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {PROJECT_TYPES.map(t => {
                    const on = form.project_type === t
                    return <button key={t} type="button" onClick={() => setForm(s => ({ ...s, project_type: on ? '' : t }))} style={{ padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border)'), background: on ? 'var(--primary-bg)' : 'transparent', color: on ? 'var(--primary-dark)' : 'var(--text2)' }}>{t}</button>
                  })}
                </div>
              ))}
              {fld('Urgency', (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {URGENCY.map(u => {
                    const on = form.urgency === u.id
                    return <button key={u.id} type="button" onClick={() => setForm(s => ({ ...s, urgency: on ? '' : u.id }))} style={{ padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid ' + (on ? u.color : 'var(--border)'), background: on ? u.color + '1e' : 'transparent', color: on ? u.color : 'var(--text2)' }}><i className={'ti ' + u.icon} style={{ fontSize: 14 }} />{u.label}</button>
                  })}
                </div>
              ))}
              {fld('Scope of work / requirements', (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(form.scope || []).map((it, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <i className="ti ti-point-filled" style={{ fontSize: 14, color: 'var(--primary-dark)', flexShrink: 0 }} />
                      <input value={it} onChange={e => setForm(s => { const sc = [...s.scope]; sc[idx] = e.target.value; return { ...s, scope: sc } })} placeholder={'Requirement ' + (idx + 1)} style={{ ...inp, flex: 1 }} />
                      <button type="button" onClick={() => setForm(s => ({ ...s, scope: s.scope.filter((_, i) => i !== idx) }))} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: '#dc2626', cursor: 'pointer', flexShrink: 0, fontSize: 16 }}>×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setForm(s => ((s.scope || []).length >= 12 ? s : { ...s, scope: [...(s.scope || []), ''] }))} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}><i className="ti ti-plus" style={{ verticalAlign: '-2px', marginRight: 3 }} />Add requirement</button>
                </div>
              ), 'List the specific things you need — materials, finishes, deliverables, site conditions.')}

              {fld('Photos', (
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                    {form.images.map(url => (
                      <div key={url} style={{ position: 'relative', width: 84, height: 84, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        <button type="button" onClick={() => removeImage(url)} title="Remove" style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 7, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                    {form.images.length < 8 && (
                      <label style={{ width: 84, height: 84, borderRadius: 10, border: '1.5px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: uploading ? 'wait' : 'pointer', color: 'var(--text3)', background: 'var(--card)' }}>
                        <i className={'ti ' + (uploading ? 'ti-loader-2' : 'ti-camera-plus')} style={{ fontSize: 22, animation: uploading ? 'spin 1s linear infinite' : 'none' }} />
                        <span style={{ fontSize: 10.5, fontWeight: 600 }}>{uploading ? 'Uploading…' : 'Add'}</span>
                        <input type="file" accept="image/*" multiple disabled={uploading} onChange={e => { uploadImages(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
                      </label>
                    )}
                  </div>
                </div>
              ), 'Add photos of the work, drawings or the site (up to 8). They show on your post.')}

              <div style={{ marginTop: 6, padding: '12px 13px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Your contact <span style={{ color: '#dc2626' }}>*</span></div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>All required. Use the toggle to choose what shows publicly on the post. Anything you hide stays private — interested companies use <b>“I'm interested”</b> and you reach out to them.</div>
                {contactRow('Name', 'contact_name', 'show_name')}
                {contactRow('Phone (WhatsApp)', 'contact_phone', 'show_phone')}
                {contactRow('Email', 'contact_email', 'show_email')}
              </div>
            </div>
            <div style={{ padding: '13px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPost(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={submit} disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : (editId ? 'Save changes' : 'Post project')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- FEED POST: full detail ---------- */}
      {detail && (() => {
        const p = detail
        const taken = isLocked(p)
        const interested = myInterestIds.has(p.id)
        return (
          <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 205, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 14px', overflowY: 'auto' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 620, maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 11px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.4px', display: 'inline-flex', alignItems: 'center', gap: 5, background: taken ? 'var(--bg2)' : 'rgba(8,145,178,0.16)', color: taken ? 'var(--text3)' : '#0e7490' }}>
                  <i className={'ti ' + (taken ? 'ti-lock' : 'ti-circle-dot')} style={{ fontSize: 12 }} /> {taken ? 'Awarded — locked' : 'Open'}
                </span>
                <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
              </div>
              <div style={{ padding: 18, maxHeight: '74vh', overflowY: 'auto' }}>
                {(p.images || []).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: p.images.length === 1 ? '1fr' : 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginBottom: 16 }}>
                    {p.images.map(url => (
                      <div key={url} onClick={() => setLightbox(url)} style={{ cursor: 'zoom-in', borderRadius: 11, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '4 / 3', background: 'var(--bg2)' }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--text)', lineHeight: 1.25, letterSpacing: '-.3px' }}>{p.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 6 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text3)' }}><i className="ti ti-building" style={{ fontSize: 13, verticalAlign: '-1px' }} /> {p.poster_name || 'A Quvera company'} · {fmtDate(p.created_at)}</span>
                  {(p.poster_trust_tier || p.poster_is_verified || p.poster_trust_score != null) && <TrustBadge c={{ trust_tier: p.poster_trust_tier, trust_score: p.poster_trust_score, is_verified: p.poster_is_verified }} />}
                </div>
                {(p.project_type || p.urgency) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                    {p.project_type && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '4px 11px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 5 }}><i className="ti ti-category" style={{ fontSize: 13 }} />{p.project_type}</span>}
                    {urgencyOf(p.urgency) && <span style={{ fontSize: 11.5, fontWeight: 700, color: urgencyOf(p.urgency).color, background: urgencyOf(p.urgency).color + '18', padding: '4px 11px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 5 }}><i className={'ti ' + urgencyOf(p.urgency).icon} style={{ fontSize: 13 }} />{urgencyOf(p.urgency).label}</span>}
                  </div>
                )}
                {p.description && <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.65, marginTop: 14, whiteSpace: 'pre-wrap' }}>{p.description}</div>}
                {(p.scope || []).length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text2)', marginBottom: 9, textTransform: 'uppercase', letterSpacing: '.5px' }}>Scope of work</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {p.scope.map((s, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.45 }}>
                          <i className="ti ti-circle-check-filled" style={{ fontSize: 17, color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(p.categories || []).length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>{p.categories.map(c => <span key={c} style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary-dark)', background: 'var(--primary-bg)', padding: '3px 11px', borderRadius: 99 }}>{c}</span>)}</div>}
                <div style={{ marginTop: 16, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  {[
                    (p.budget_min || p.budget_max) && ['ti-coin', '#16a34a', 'Budget', p.budget_min && p.budget_max ? `${AED(p.budget_min)} – ${AED(p.budget_max)}` : AED(p.budget_min || p.budget_max)],
                    p.location && ['ti-map-pin', '#0891b2', 'Location', p.location],
                    p.timeline && ['ti-clock', '#8b5cf6', 'Timeline', p.timeline],
                    p.contact_name && ['ti-user', '#d97706', 'Contact', p.contact_name],
                    p.contact_phone && ['ti-phone', '#22c55e', 'Phone', p.contact_phone],
                    p.contact_email && ['ti-mail', '#6366f1', 'Email', p.contact_email],
                  ].filter(Boolean).map((r, i) => (
                    <div key={r[2]} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                      <i className={'ti ' + r[0]} style={{ fontSize: 16, color: r[1], flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>{r[2]}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--text)', textAlign: 'right', wordBreak: 'break-word' }}>{r[3]}</span>
                    </div>
                  ))}
                </div>
              </div>
              {!taken && (
                <div style={{ padding: '13px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                  <button onClick={() => expressInterest(p)} disabled={interested || busy === 'int-' + p.id} className="btn" style={{ flex: 1, minWidth: 140, background: interested ? 'var(--bg2)' : 'linear-gradient(135deg,#e8b84b,#c9952a)', color: interested ? 'var(--text2)' : '#1a1207', border: 'none', fontWeight: 700 }}>
                    <i className={'ti ' + (interested ? 'ti-check' : 'ti-hand-click')} style={{ verticalAlign: '-2px', marginRight: 4 }} />{interested ? 'Interested ✓' : "I'm interested"}
                  </button>
                  {p.contact_phone && <a href={wa(p.contact_phone)} target="_blank" rel="noreferrer" className="btn" style={{ background: '#22c55e', color: '#fff', textDecoration: 'none' }}><i className="ti ti-brand-whatsapp" style={{ verticalAlign: '-2px', marginRight: 4 }} />WhatsApp</a>}
                  {p.contact_phone && <a href={'tel:' + p.contact_phone} className="btn btn-secondary"><i className="ti ti-phone" /></a>}
                  {p.contact_email && <a href={'mailto:' + p.contact_email} className="btn btn-secondary"><i className="ti ti-mail" /></a>}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ---------- IMAGE LIGHTBOX ---------- */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}

      {/* ---------- IN-PORTAL COMPANY PROFILE CARD ---------- */}
      {profileCard && <CompanyProfileCard c={profileCard} onClose={() => setProfileCard(null)} />}

      {/* ---------- AFTER AWARD: add as subcontractor to a project ---------- */}
      {addSub && (
        <div onClick={() => setAddSub(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}><i className="ti ti-award" style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--primary-dark)' }} />Awarded to {addSub.name || 'the company'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14 }}>Add them as a <b>subcontractor</b> in a project? You can then track the contract amount and payments there.</div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Project</label>
            <select value={addSub.projectId} onChange={e => setAddSub(s => ({ ...s, projectId: e.target.value }))} style={{ ...inp, marginBottom: 16 }}>
              <option value="">Select a project…</option>
              {projects.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setAddSub(null)} className="btn btn-secondary">Skip</button>
              <button onClick={confirmAddSub} disabled={addingSub} className="btn btn-primary">{addingSub ? 'Adding…' : 'Add as subcontractor'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // helpers that close over state
  function contactRow(label, field, showField) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <input value={form[field]} onChange={e => setForm(s => ({ ...s, [field]: e.target.value }))} placeholder={label} style={{ ...inp, flex: '1 1 200px' }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={form[showField]} onChange={e => setForm(s => ({ ...s, [showField]: e.target.checked }))} style={{ width: 'auto' }} />
          Show on post
        </label>
      </div>
    )
  }
  function emptyState(which) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
        <i className={'ti ' + (which === 'feed' ? 'ti-briefcase-off' : 'ti-clipboard-off')} style={{ fontSize: 34, display: 'block', marginBottom: 10 }} />
        <div style={{ fontSize: 14, color: 'var(--text2)', fontWeight: 600 }}>{which === 'feed' ? 'No matching jobs right now' : "You haven't posted any project yet"}</div>
        <div style={{ fontSize: 12.5, marginTop: 4 }}>{which === 'feed' ? 'New jobs in your category will appear here.' : 'Post your first project to find subcontractors.'}</div>
      </div>
    )
  }
}

// In-portal quick profile of a company that replied — trust badge, score, rating,
// categories, and a link to the full public profile.
function CompanyProfileCard({ c, onClose }) {
  const tier = TIERS[c.trust_tier] || (c.is_verified ? TIERS.verified : TIERS.listed)
  const score = c.trust_score != null ? Math.round(num(c.trust_score)) : null
  const cats = c.categories && c.categories.length ? c.categories : (c.category ? [c.category] : [])
  const publicUrl = c.slug ? `https://quvera.ae/${c.slug}` : null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ position: 'relative', padding: '24px 20px 18px', background: `radial-gradient(120% 100% at 50% -20%, ${tier.color}26, transparent 60%), var(--card)`, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
          <div style={{ width: 74, height: 74, borderRadius: 20, margin: '0 auto 12px', overflow: 'hidden', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--border)' }}>
            {c.logo_url ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontWeight: 800, fontSize: 30, color: 'var(--primary-dark)' }}>{(c.name || '?').charAt(0).toUpperCase()}</span>}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {c.name || 'Company'}
            {c.is_verified && <i className="ti ti-rosette-discount-check-filled" style={{ fontSize: 18, color: '#16a34a' }} title="Verified" />}
          </div>
          <div style={{ marginTop: 10 }}><TrustBadge c={c} size="lg" /></div>
        </div>
        <div style={{ padding: 18 }}>
          {c._fallback ? (
            <div style={{ fontSize: 12.5, color: 'var(--text3)', textAlign: 'center', padding: '6px 0 12px' }}>This company's full Quvera profile isn't available yet.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: tier.color, lineHeight: 1 }}>{score ?? '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Trust score</div>
              </div>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{num(c.avg_rating).toFixed(1)} <i className="ti ti-star-filled" style={{ fontSize: 15, color: '#f59e0b' }} /></div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{num(c.total_reviews)} review{num(c.total_reviews) === 1 ? '' : 's'}</div>
              </div>
            </div>
          )}
          {cats.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, justifyContent: 'center' }}>{cats.slice(0, 6).map(cat => <span key={cat} style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary-dark)', background: 'var(--primary-bg)', padding: '3px 10px', borderRadius: 99 }}>{cat}</span>)}</div>}
          {c.description && <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14, textAlign: 'center' }}>{c.description}</div>}
          {publicUrl
            ? <a href={publicUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ width: '100%', textDecoration: 'none', display: 'flex', justifyContent: 'center' }}><i className="ti ti-external-link" style={{ verticalAlign: '-2px', marginRight: 6 }} />View full profile</a>
            : <button onClick={onClose} className="btn btn-secondary" style={{ width: '100%' }}>Close</button>}
        </div>
      </div>
    </div>
  )
}

const inp = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }
function fld(label, control, hint) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</label>
      {control}
      {hint && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>{hint}</div>}
    </div>
  )
}
function metaRows(p) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
      {(p.budget_min || p.budget_max) && <div><i className="ti ti-coin" style={{ fontSize: 13, verticalAlign: '-2px', color: 'var(--text3)' }} /> {p.budget_min && p.budget_max ? `${AED(p.budget_min)} – ${AED(p.budget_max)}` : AED(p.budget_min || p.budget_max)}</div>}
      {p.location && <div><i className="ti ti-map-pin" style={{ fontSize: 13, verticalAlign: '-2px', color: 'var(--text3)' }} /> {p.location}</div>}
      {p.timeline && <div><i className="ti ti-clock" style={{ fontSize: 13, verticalAlign: '-2px', color: 'var(--text3)' }} /> {p.timeline}</div>}
      {p.contact_name && <div><i className="ti ti-user" style={{ fontSize: 13, verticalAlign: '-2px', color: 'var(--text3)' }} /> {p.contact_name}</div>}
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>Posted {fmtDate(p.created_at)}</div>
    </div>
  )
}
