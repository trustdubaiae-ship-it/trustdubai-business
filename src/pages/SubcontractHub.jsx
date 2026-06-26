import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'

// Companies of these categories can be targeted when posting work to subcontract.
const CATEGORIES = [
  'Interior Design', 'Fit-Out', 'Renovation', 'Joinery & Carpentry', 'MEP',
  'Electrical', 'Plumbing', 'HVAC / AC', 'Painting', 'Flooring', 'False Ceiling',
  'Civil & Masonry', 'Waterproofing', 'Tiling', 'Gypsum & Partition', 'Cleaning',
  'Landscaping', 'Glass & Aluminium', 'Metal & Steel Works', 'Signage & Branding',
  'Furniture', 'Swimming Pool', 'Smart Home', 'Demolition',
]
const MAX_CATS = 5
const BLANK = { title: '', description: '', categories: [], budget_min: '', budget_max: '', location: '', timeline: '', contact_name: '', contact_phone: '' }
const AED = (n) => 'AED ' + Math.round(Number(n) || 0).toLocaleString('en-AE')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''

export default function SubcontractHub({ company }) {
  const toast = useToast()
  const plan = (company?.plan || 'free').toLowerCase()
  const isGold = plan === 'gold' || plan === 'platinum'

  const [view, setView] = useState('feed')      // 'feed' | 'mine'
  const [feed, setFeed] = useState([])
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPost, setShowPost] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (isGold && company?.id) load() }, [company?.id]) // eslint-disable-line

  async function load() {
    setLoading(true)
    try {
      const [f, m] = await Promise.all([
        supabase.rpc('subcontract_feed'),
        supabase.from('qv_subcontract_projects').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      ])
      setFeed(f.data || [])
      setMine(m.data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  function toggleCat(c) {
    setForm(s => {
      if (s.categories.includes(c)) return { ...s, categories: s.categories.filter(x => x !== c) }
      if (s.categories.length >= MAX_CATS) { toast.error(`Up to ${MAX_CATS} categories`); return s }
      return { ...s, categories: [...s.categories, c] }
    })
  }

  async function submit() {
    if (!form.title.trim()) { toast.error('Add a project title'); return }
    if (form.categories.length === 0) { toast.error('Pick at least 1 category that should see this'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('qv_subcontract_projects').insert({
        company_id: company.id, poster_name: company.name || '',
        title: form.title.trim(), description: form.description.trim() || null,
        categories: form.categories,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        location: form.location.trim() || null, timeline: form.timeline.trim() || null,
        contact_name: form.contact_name.trim() || null, contact_phone: form.contact_phone.trim() || null,
      })
      if (error) throw error
      toast.success('Project posted ✓')
      setShowPost(false); setForm(BLANK); setView('mine'); load()
    } catch (e) { toast.error('Could not post: ' + (e?.message || e)) } finally { setSaving(false) }
  }

  async function closePost(id) {
    if (!window.confirm('Close this project? It will no longer be shown to contractors.')) return
    await supabase.from('qv_subcontract_projects').update({ status: 'closed' }).eq('id', id)
    load()
  }
  async function reopenPost(id) { await supabase.from('qv_subcontract_projects').update({ status: 'open' }).eq('id', id); load() }
  async function del(id) {
    if (!window.confirm('Delete this project permanently?')) return
    await supabase.from('qv_subcontract_projects').delete().eq('id', id)
    load()
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
            {['Post projects to subcontract in minutes', 'Target the exact trades that should see it', 'See live jobs matched to your category', 'Connect directly — no middleman'].map((t, i) => (
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

  // ---------- GOLD: feed + my posts ----------
  const list = view === 'feed' ? feed : mine
  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }
  const chip = (txt, on, onClick) => (
    <button key={txt} type="button" onClick={onClick} style={{ padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border)'), background: on ? 'var(--primary-bg)' : 'transparent', color: on ? 'var(--primary-dark)' : 'var(--text2)' }}>{txt}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', gap: 4, background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {[['feed', 'Available jobs', 'ti-briefcase', feed.length], ['mine', 'My posts', 'ti-clipboard-list', mine.length]].map(([id, label, ic, n]) => (
            <button key={id} onClick={() => setView(id)} style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, background: view === id ? 'var(--card)' : 'transparent', color: view === id ? 'var(--primary-dark)' : 'var(--text2)', boxShadow: view === id ? 'var(--shadow-md)' : 'none' }}>
              <i className={'ti ' + ic} style={{ fontSize: 15 }} /> {label}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: view === id ? 'var(--primary-bg)' : 'var(--bg)', color: 'var(--text3)' }}>{n}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" style={{ padding: '9px 18px' }} onClick={() => { setForm(BLANK); setShowPost(true) }}>
          <i className="ti ti-plus" style={{ verticalAlign: '-2px', marginRight: 4 }} />Post a project
        </button>
      </div>

      {view === 'feed' && (
        <div style={{ background: 'rgba(232,184,75,0.08)', border: '0.5px solid rgba(232,184,75,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 9 }}>
          <i className="ti ti-crown" style={{ fontSize: 17, color: '#d97706' }} />
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>Projects posted by other companies, matched to <b>your category</b>{company?.category ? ` (${company.category})` : ''}.</div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: 'var(--text3)' }}><i className="ti ti-loader-2" style={{ fontSize: 24, animation: 'spin 1s linear infinite' }} /></div>
      ) : list.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
          <i className={'ti ' + (view === 'feed' ? 'ti-briefcase-off' : 'ti-clipboard-off')} style={{ fontSize: 34, display: 'block', marginBottom: 10 }} />
          <div style={{ fontSize: 14, color: 'var(--text2)', fontWeight: 600 }}>{view === 'feed' ? 'No matching jobs right now' : 'You haven\'t posted any project yet'}</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>{view === 'feed' ? 'New jobs in your category will appear here.' : 'Post your first project to find subcontractors.'}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
          {list.map(p => {
            const mineRow = view === 'mine'
            return (
              <div key={p.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 9, opacity: p.status === 'closed' ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{p.title}</div>
                    {!mineRow && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}><i className="ti ti-building" style={{ fontSize: 12, verticalAlign: '-1px' }} /> {p.poster_name || 'A Quvera company'}</div>}
                  </div>
                  {p.status === 'closed'
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', background: 'var(--bg2)', padding: '2px 8px', borderRadius: 99 }}>Closed</span>
                    : <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.12)', padding: '2px 8px', borderRadius: 99 }}>Open</span>}
                </div>
                {p.description && <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {(p.categories || []).map(c => <span key={c} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--primary-dark)', background: 'var(--primary-bg)', padding: '2px 8px', borderRadius: 99 }}>{c}</span>)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                  {(p.budget_min || p.budget_max) && <div><i className="ti ti-coin" style={{ fontSize: 13, verticalAlign: '-2px', color: 'var(--text3)' }} /> {p.budget_min && p.budget_max ? `${AED(p.budget_min)} – ${AED(p.budget_max)}` : AED(p.budget_min || p.budget_max)}</div>}
                  {p.location && <div><i className="ti ti-map-pin" style={{ fontSize: 13, verticalAlign: '-2px', color: 'var(--text3)' }} /> {p.location}</div>}
                  {p.timeline && <div><i className="ti ti-clock" style={{ fontSize: 13, verticalAlign: '-2px', color: 'var(--text3)' }} /> {p.timeline}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Posted {fmtDate(p.created_at)}</div>
                </div>
                <div style={{ display: 'flex', gap: 7, marginTop: 'auto', paddingTop: 6 }}>
                  {mineRow ? (
                    <>
                      {p.status === 'open'
                        ? <button onClick={() => closePost(p.id)} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>Close</button>
                        : <button onClick={() => reopenPost(p.id)} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>Re-open</button>}
                      <button onClick={() => del(p.id)} className="btn btn-secondary btn-sm" style={{ color: '#dc2626' }}><i className="ti ti-trash" /></button>
                    </>
                  ) : (
                    <>
                      {p.contact_phone && <a href={'https://wa.me/' + p.contact_phone.replace(/[^0-9]/g, '')} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ flex: 1, background: '#22c55e', color: '#fff', textAlign: 'center', textDecoration: 'none' }}><i className="ti ti-brand-whatsapp" style={{ verticalAlign: '-2px', marginRight: 4 }} />WhatsApp</a>}
                      {p.contact_phone && <a href={'tel:' + p.contact_phone} className="btn btn-secondary btn-sm"><i className="ti ti-phone" /></a>}
                      {!p.contact_phone && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>Contact via the company profile</span>}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ---------- POST FORM MODAL ---------- */}
      {showPost && (
        <div onClick={() => setShowPost(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 14px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 600, maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}><i className="ti ti-briefcase" style={{ verticalAlign: '-2px', marginRight: 6, color: 'var(--primary-dark)' }} />Post a project to subcontract</div>
              <button onClick={() => setShowPost(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
            </div>
            <div style={{ padding: 18, maxHeight: '70vh', overflowY: 'auto' }}>
              {fld('Project title', <input value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))} placeholder="e.g. False ceiling & gypsum for a 2BHK villa" style={inp} />)}
              {fld('Scope / description', <textarea value={form.description} onChange={e => setForm(s => ({ ...s, description: e.target.value }))} placeholder="Describe the work, size, finishes, what you need from the subcontractor…" rows={4} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />)}

              {fld(`Who should see this? (${form.categories.length}/${MAX_CATS} categories)`, (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {CATEGORIES.map(c => chip(c, form.categories.includes(c), () => toggleCat(c)))}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {fld('Contact person', <input value={form.contact_name} onChange={e => setForm(s => ({ ...s, contact_name: e.target.value }))} placeholder="Name" style={inp} />)}
                {fld('Contact phone (WhatsApp)', <input value={form.contact_phone} onChange={e => setForm(s => ({ ...s, contact_phone: e.target.value }))} placeholder="+971 50 ..." style={inp} />)}
              </div>
            </div>
            <div style={{ padding: '13px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPost(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={submit} disabled={saving} className="btn btn-primary">{saving ? 'Posting…' : 'Post project'}</button>
            </div>
          </div>
        </div>
      )}
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
