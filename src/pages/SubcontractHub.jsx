import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { CATEGORIES } from '../lib/categories'

const MAX_CATS = 5
const AED = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
const wa = (phone) => 'https://wa.me/' + String(phone || '').replace(/[^0-9]/g, '')
const blankForm = (company) => ({
  title: '', description: '', categories: [], budget_min: '', budget_max: '', location: '', timeline: '',
  contact_name: company?.name || '', contact_phone: company?.phone || company?.whatsapp || '', contact_email: company?.email || company?.owner_email || '',
  show_name: true, show_phone: false, show_email: false,
})

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

  useEffect(() => { if (isGold && company?.id) load() }, [company?.id]) // eslint-disable-line

  async function load() {
    setLoading(true)
    try {
      const [f, m, mi] = await Promise.all([
        supabase.rpc('subcontract_feed'),
        supabase.from('qv_subcontract_projects').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
        supabase.from('qv_subcontract_interests').select('project_id').eq('company_id', company.id),
      ])
      setFeed(f.data || [])
      setMyPosts(m.data || [])
      setMyInterestIds(new Set((mi.data || []).map(r => r.project_id)))
      const ids = (m.data || []).map(p => p.id)
      if (ids.length) {
        const { data: ints } = await supabase.from('qv_subcontract_interests').select('*').in('project_id', ids).order('created_at', { ascending: false })
        const map = {}; (ints || []).forEach(i => { (map[i.project_id] = map[i.project_id] || []).push(i) }); setInterestsByProject(map)
      } else setInterestsByProject({})
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
      contact_name: p.contact_name || '', contact_phone: p.contact_phone || '', contact_email: p.contact_email || '',
      show_name: !!p.show_name, show_phone: !!p.show_phone, show_email: !!p.show_email,
    })
    setShowPost(true)
  }

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
        contact_name: form.contact_name.trim(), contact_phone: form.contact_phone.trim(), contact_email: form.contact_email.trim(),
        show_name: form.show_name, show_phone: form.show_phone, show_email: form.show_email,
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
      const patch = { status }
      if (status === 'under_discussion') { patch.awarded_to = awarded?.name || null; patch.awarded_company_id = awarded?.id || null }
      else { patch.awarded_to = null; patch.awarded_company_id = null }
      await supabase.from('qv_subcontract_projects').update(patch).eq('id', p.id)
      setAwardFor(null); setAwardPick(''); load()
    } catch (e) { toast.error('Failed: ' + (e?.message || e)) } finally { setBusy('') }
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
            {feedList.map(p => {
              const taken = p.status === 'under_discussion'
              const interested = myInterestIds.has(p.id)
              return (
                <div key={p.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 9, opacity: taken ? 0.55 : 1, position: 'relative' }}>
                  {taken && <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 10, fontWeight: 800, color: '#92400e', background: '#fef3c7', padding: '3px 9px', borderRadius: 99 }}>Under discussion</div>}
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3, paddingRight: taken ? 110 : 0 }}>{p.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)' }}><i className="ti ti-building" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {p.poster_name || 'A Quvera company'}</div>
                  {p.description && <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {(p.categories || []).map(c => <span key={c} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--primary-dark)', background: 'var(--primary-bg)', padding: '2px 8px', borderRadius: 99 }}>{c}</span>)}
                  </div>
                  {metaRows(p)}
                  {!taken && (
                    <div style={{ display: 'flex', gap: 7, marginTop: 'auto', paddingTop: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => expressInterest(p)} disabled={interested || busy === 'int-' + p.id} className="btn btn-sm" style={{ flex: 1, minWidth: 120, background: interested ? 'var(--bg2)' : 'linear-gradient(135deg,#e8b84b,#c9952a)', color: interested ? 'var(--text2)' : '#1a1207', border: 'none', fontWeight: 700 }}>
                        <i className={'ti ' + (interested ? 'ti-check' : 'ti-hand-click')} style={{ verticalAlign: '-2px', marginRight: 4 }} />{interested ? 'Interested ✓' : "I'm interested"}
                      </button>
                      {p.contact_phone && <a href={wa(p.contact_phone)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#22c55e', color: '#fff', textDecoration: 'none' }}><i className="ti ti-brand-whatsapp" /></a>}
                      {p.contact_phone && <a href={'tel:' + p.contact_phone} className="btn btn-secondary btn-sm"><i className="ti ti-phone" /></a>}
                      {p.contact_email && <a href={'mailto:' + p.contact_email} className="btn btn-secondary btn-sm"><i className="ti ti-mail" /></a>}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {myPosts.map(p => {
              const ints = interestsByProject[p.id] || []
              const taken = p.status === 'under_discussion'
              const open = expanded === p.id
              return (
                <div key={p.id} style={{ ...card }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{p.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Posted {fmtDate(p.created_at)} · {(p.categories || []).join(', ')}</div>
                      {taken && <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}><i className="ti ti-lock" style={{ fontSize: 13, verticalAlign: '-2px' }} /> Under discussion{p.awarded_to ? ` with ${p.awarded_to}` : ''}</div>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: taken ? '#fef3c7' : 'rgba(22,163,74,0.12)', color: taken ? '#92400e' : '#16a34a' }}>{taken ? 'Under discussion' : 'Open'}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                    <button onClick={() => openEdit(p)} className="btn btn-secondary btn-sm"><i className="ti ti-edit" style={{ verticalAlign: '-2px', marginRight: 3 }} />Edit</button>
                    {ints.length > 0 && <button onClick={() => setExpanded(open ? null : p.id)} className="btn btn-secondary btn-sm"><i className="ti ti-users" style={{ verticalAlign: '-2px', marginRight: 3 }} />Interested ({ints.length})</button>}
                    {!taken
                      ? <button onClick={() => { setAwardFor(p.id); setAwardPick(''); setExpanded(ints.length ? p.id : expanded) }} className="btn btn-primary btn-sm"><i className="ti ti-award" style={{ verticalAlign: '-2px', marginRight: 3 }} />Award work</button>
                      : <button onClick={() => setStatus(p, 'open')} disabled={busy === 'st-' + p.id} className="btn btn-secondary btn-sm"><i className="ti ti-rotate" style={{ verticalAlign: '-2px', marginRight: 3 }} />Re-open</button>}
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
                          if (awardPick === '__other') { const nm = window.prompt('Company name awarded the work?'); if (nm) setStatus(p, 'under_discussion', { name: nm.trim() }); return }
                          const sel = ints.find(i => i.id === awardPick)
                          setStatus(p, 'under_discussion', sel ? { name: sel.company_name, id: sel.company_id } : { name: null })
                        }} disabled={busy === 'st-' + p.id} className="btn btn-primary btn-sm">Confirm</button>
                        <button onClick={() => setAwardFor(null)} className="btn btn-secondary btn-sm">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* interested list */}
                  {open && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ints.map(i => (
                        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{i.company_name || 'A company'}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{[i.contact_phone, i.contact_email].filter(Boolean).join(' · ') || 'No contact'}</div>
                          </div>
                          {i.contact_phone && <a href={wa(i.contact_phone)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#22c55e', color: '#fff', textDecoration: 'none' }}><i className="ti ti-brand-whatsapp" /></a>}
                          {i.contact_phone && <a href={'tel:' + i.contact_phone} className="btn btn-secondary btn-sm"><i className="ti ti-phone" /></a>}
                          {i.contact_email && <a href={'mailto:' + i.contact_email} className="btn btn-secondary btn-sm"><i className="ti ti-mail" /></a>}
                          {!taken && <button onClick={() => setStatus(p, 'under_discussion', { name: i.company_name, id: i.company_id })} disabled={busy === 'st-' + p.id} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}><i className="ti ti-award" style={{ verticalAlign: '-2px', marginRight: 3 }} />Award</button>}
                        </div>
                      ))}
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
