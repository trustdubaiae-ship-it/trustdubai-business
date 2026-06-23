import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const AGENTS = [
  { key: 'marketing', name: 'Marketing Agent', icon: 'ti-speakerphone', color: '#ec4899', tag: 'Ads, social, offers & campaigns',
    starters: ['Write a Meta ad for kitchen renovations', '3 WhatsApp broadcast offers for a Ramadan promo', 'Instagram caption for a finished office fit-out'] },
  { key: 'estimator', name: 'Estimator Agent', icon: 'ti-calculator', color: '#0099cc', tag: 'Rough costs, scope & BOQ', photo: true,
    starters: ['Estimate a 1200 sqft office fit-out in JVC', 'Scope of work for a villa kitchen renovation', 'Upload a site photo + details for an estimate'] },
  { key: 'sales', name: 'Sales Agent', icon: 'ti-target-arrow', color: '#22c55e', tag: 'Follow-ups, objections & closing',
    starters: ['Follow-up for a lead who went quiet', 'Reply to "your quote is too expensive"', 'Message to book a free site visit'] },
  { key: 'content', name: 'Content Agent', icon: 'ti-pencil', color: '#8b5cf6', tag: 'Posts, captions & portfolio', photo: true,
    starters: ['Before/after caption for a living room', 'Portfolio description for a cafe fit-out', '8 hashtags for Dubai interior design'] },
  { key: 'advisor', name: 'Business Advisor', icon: 'ti-bulb', color: '#f59e0b', tag: 'Pricing, growth & operations',
    starters: ['How should I price my fit-out quotes?', 'How do I get more repeat clients?', 'Should I hire an in-house carpenter?'] },
  { key: 'project_manager', name: 'Project Manager', icon: 'ti-stack-2', color: '#06b6d4', tag: 'Schedules, milestones & coordination',
    starters: ['Make a milestone plan for a 3-month villa fit-out', 'Checklist before site handover', 'How to sequence MEP and joinery work'] },
  { key: 'tender', name: 'Tender / Proposal', icon: 'ti-file-text', color: '#6366f1', tag: 'Proposals, bids & company profile',
    starters: ['Write a proposal for an office fit-out tender', 'Company profile intro paragraph', 'Cover letter for a hotel renovation bid'] },
  { key: 'hr', name: 'HR Agent', icon: 'ti-users', color: '#14b8a6', tag: 'Hiring, letters & team',
    starters: ['Job post for a site supervisor', 'Offer letter for a carpenter', '5 interview questions for a foreman'] },
]

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e6))
const makeTitle = (s) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t ? (t.length > 42 ? t.slice(0, 42) + '…' : t) : 'New chat' }

export default function AIAgents() {
  const { company } = useAuth()
  const toast = useToast()
  const [, force] = useState(0)
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const mobile = vw < 768

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    const ob = new MutationObserver(() => force(n => n + 1))
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { window.removeEventListener('resize', onResize); ob.disconnect() }
  }, [])

  const [active, setActive] = useState(null)        // current agent
  const [entered, setEntered] = useState(false)     // false = grid dashboard, true = chat workspace
  const [threads, setThreads] = useState([])        // this agent's conversations
  const [threadId, setThreadId] = useState(null)    // active thread (null = a new, unsaved chat)
  const [msgs, setMsgs] = useState([])              // current thread messages
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [img, setImg] = useState(null)
  const [mobilePane, setMobilePane] = useState('list')   // mobile: 'list' | 'chat'
  const endRef = useRef(null)
  const fileRef = useRef(null)

  const [cfg, setCfg] = useState({ knowledge: '', notes: {} })
  const [showKnow, setShowKnow] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)

  const text = 'var(--text)', textSub = 'var(--text2)', textMuted = 'var(--text3)'

  // ---- threads storage (per company + agent, on this device) ----
  const tkey = (k) => `qv_aithreads_${company?.id || 'x'}_${k}`
  const loadThreads = (k) => { try { const a = JSON.parse(localStorage.getItem(tkey(k)) || '[]'); return Array.isArray(a) ? a : [] } catch { return [] } }
  const saveThreads = (k, list) => { try { localStorage.setItem(tkey(k), JSON.stringify(list.slice(0, 50))) } catch {} }

  useEffect(() => { if (company?.id) loadCfg() }, [company?.id])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  async function loadCfg() {
    const { data } = await supabase.from('ai_agent_config').select('knowledge, notes').eq('company_id', company.id).maybeSingle()
    if (data) setCfg({ knowledge: data.knowledge || '', notes: data.notes || {} })
  }
  async function saveCfg(next) {
    const merged = next || cfg
    setSavingCfg(true)
    try {
      const { error } = await supabase.from('ai_agent_config').upsert(
        { company_id: company.id, knowledge: merged.knowledge || null, notes: merged.notes || {}, updated_at: new Date().toISOString() },
        { onConflict: 'company_id' })
      if (error) throw error
      toast.success('Saved ✓')
    } catch (e) { toast.error('Could not save: ' + (e?.message || e)) } finally { setSavingCfg(false) }
  }

  function openAgent(agent) {
    setActive(agent); setEntered(true)
    setThreads(loadThreads(agent.key))
    newChat(); setMobilePane('list')
  }
  function exitDash() { setEntered(false); setActive(null); setImg(null); setShowNote(false) }
  function newChat() { setThreadId(null); setMsgs([]); setInput(''); setImg(null); setShowNote(false); setMobilePane('chat') }
  function selectThread(t) { setThreadId(t.id); setMsgs(t.msgs || []); setInput(''); setImg(null); setMobilePane('chat') }
  function deleteThread(e, t) {
    e.stopPropagation()
    if (!window.confirm('Delete this chat?')) return
    const nextT = threads.filter(x => x.id !== t.id)
    setThreads(nextT); saveThreads(active.key, nextT)
    if (threadId === t.id) newChat()
  }

  function pickImage(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (!file.type?.startsWith('image/')) { toast.error('Please choose an image'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image too large (max 5 MB)'); return }
    const reader = new FileReader()
    reader.onload = () => { const url = reader.result; setImg({ data: String(url).split(',')[1], media_type: file.type, preview: url }) }
    reader.readAsDataURL(file)
  }

  function persistThread(agentKey, tid, list, maybeTitle) {
    const stored = list.slice(-40).map(m => ({ role: m.role, text: m.text || (m.image ? '📷 Photo' : '') }))
    setThreads(prev => {
      const exists = prev.some(t => t.id === tid)
      let nextT = exists
        ? prev.map(t => t.id === tid ? { ...t, msgs: stored, updatedAt: Date.now() } : t)
        : [{ id: tid, title: maybeTitle || makeTitle(stored.find(m => m.role === 'user')?.text), msgs: stored, updatedAt: Date.now() }, ...prev]
      nextT = [...nextT].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      saveThreads(agentKey, nextT)
      return nextT
    })
  }

  async function send(textToSend) {
    const q = (textToSend ?? input).trim()
    if ((!q && !img) || busy || !active) return
    const userMsg = { role: 'user', text: q, ...(img ? { image: { data: img.data, media_type: img.media_type }, preview: img.preview } : {}) }
    const next = [...msgs, userMsg]
    setMsgs(next); setInput(''); setImg(null); setBusy(true)
    let tid = threadId, title = ''
    if (!tid) { tid = newId(); title = makeTitle(q || 'Photo estimate'); setThreadId(tid) }
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: {
          agent: active.key,
          companyName: company?.name || 'our company',
          companyCategory: company?.categories?.[0] || company?.category || '',
          messages: next.map(m => ({ role: m.role, text: m.text, ...(m.image ? { image: m.image } : {}) })),
          knowledge: cfg.knowledge || '',
          note: cfg.notes?.[active.key] || '',
        },
      })
      if (error) throw error
      if (data?.reply) {
        const withReply = [...next, { role: 'assistant', text: data.reply }]
        setMsgs(withReply); persistThread(active.key, tid, withReply, title)
      } else { toast.error(data?.code === 'no_credit' ? 'AI credits exhausted' : 'AI could not respond'); setMsgs(msgs) }
    } catch (e) { toast.error('Could not reach the AI agent'); setMsgs(msgs) }
    finally { setBusy(false) }
  }

  // ---------- Landing: agent grid ----------
  const dashboard = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: textMuted }}>Your AI team</div>
        <button onClick={() => setShowKnow(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: textSub, cursor: 'pointer' }}>
          <i className="ti ti-adjustments" /> Business knowledge {cfg.knowledge ? <span style={{ width: 7, height: 7, borderRadius: 99, background: '#16a34a' }} /> : null}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 12 }}>
        {AGENTS.map(a => (
          <button key={a.key} onClick={() => openAgent(a)} style={{ background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 16, textAlign: 'left', cursor: 'pointer', color: text }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: a.color + '22', color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={'ti ' + a.icon} style={{ fontSize: 22 }} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontSize: 11.5, color: textMuted }}>{a.tag}</div>
              </div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: a.color }}>Open agent <i className="ti ti-arrow-right" style={{ fontSize: 14 }} /></div>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: textMuted, marginTop: 16, lineHeight: 1.6 }}>
        <i className="ti ti-sparkles" style={{ color: '#8b5cf6' }} /> Each agent knows it works for <b>{company?.name || 'your company'}</b> in Dubai. Ask in plain language — English or Hinglish.
      </div>
    </div>
  )

  // ---------- Threads sidebar (for the open agent) ----------
  const threadList = active && (
    <div style={{ width: mobile ? '100%' : 290, flexShrink: 0, borderRight: mobile ? 'none' : '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--card)' }}>
      <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 9 }}>
        <button onClick={exitDash} title="All agents" style={{ background: 'var(--bg2)', border: 'none', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', color: textSub, flexShrink: 0 }}><i className="ti ti-layout-grid" /></button>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: active.color + '22', color: active.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={'ti ' + active.icon} style={{ fontSize: 17 }} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{active.name}</div></div>
        <button onClick={() => setShowKnow(true)} title="Business knowledge" style={{ background: 'var(--bg2)', border: 'none', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', color: cfg.knowledge ? '#16a34a' : textSub, flexShrink: 0 }}><i className="ti ti-adjustments" /></button>
      </div>
      <div style={{ padding: 10 }}>
        <button onClick={newChat} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', borderRadius: 10, background: active.color, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}><i className="ti ti-plus" style={{ fontSize: 16 }} /> New chat</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: textMuted, textTransform: 'uppercase', letterSpacing: '.5px', padding: '6px 8px' }}>History</div>
        {threads.length === 0 && <div style={{ fontSize: 12, color: textMuted, padding: '6px 8px' }}>No chats yet. Start a new one above.</div>}
        {threads.map(t => {
          const on = threadId === t.id
          return (
            <button key={t.id} onClick={() => selectThread(t)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 9, border: 'none', background: on ? active.color + '1f' : 'transparent', cursor: 'pointer', textAlign: 'left', marginBottom: 2 }}>
              <i className="ti ti-message-2" style={{ fontSize: 15, color: on ? active.color : textMuted, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: on ? 700 : 500, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
              <i className="ti ti-x" onClick={(e) => deleteThread(e, t)} style={{ fontSize: 13, color: textMuted, flexShrink: 0, opacity: 0.7 }} />
            </button>
          )
        })}
      </div>
    </div>
  )

  // ---------- Chat pane ----------
  const chatPane = active && (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--card)' }}>
        {mobile && <button onClick={() => setMobilePane('list')} style={{ background: 'var(--bg2)', border: 'none', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', color: textSub }}><i className="ti ti-arrow-left" /></button>}
        <div style={{ width: 36, height: 36, borderRadius: 10, background: active.color + '22', color: active.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className={'ti ' + active.icon} style={{ fontSize: 18 }} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: text }}>{active.name}</div>
          <div style={{ fontSize: 11, color: textMuted }}>{active.tag}</div>
        </div>
        <button onClick={() => setShowNote(v => !v)} title="Customize this agent" style={{ background: 'var(--bg2)', border: 'none', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', color: cfg.notes?.[active.key] ? '#16a34a' : textSub }}><i className="ti ti-settings" /></button>
      </div>

      {showNote && (
        <div style={{ padding: 14, borderBottom: '0.5px solid var(--border)', background: 'var(--card)' }}>
          <div style={{ fontSize: 12, color: textMuted, marginBottom: 8, lineHeight: 1.5 }}>Custom instructions just for the <b>{active.name}</b> (tone, focus, what to always include).</div>
          <textarea value={cfg.notes?.[active.key] || ''} onChange={e => setCfg(c => ({ ...c, notes: { ...c.notes, [active.key]: e.target.value } }))}
            placeholder="e.g. Always keep a premium, confident tone and end with a clear call to action."
            style={{ width: '100%', minHeight: 64, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => { saveCfg(); setShowNote(false) }} disabled={savingCfg} style={{ padding: '8px 16px', borderRadius: 9, background: active.color, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, opacity: savingCfg ? 0.7 : 1 }}>{savingCfg ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setShowNote(false)} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: textSub, cursor: 'pointer', fontSize: 12.5 }}>Close</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 460 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: active.color + '1f', color: active.color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><i className={'ti ' + active.icon} style={{ fontSize: 28 }} /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 4 }}>New chat with {active.name}</div>
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 14 }}>Try one of these, or type your own:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {active.starters.map((s, i) => (
                <button key={i} onClick={() => send(s)} style={{ fontSize: 12, padding: '7px 12px', borderRadius: 99, border: '1px solid var(--border)', background: 'var(--bg2)', color: textSub, cursor: 'pointer' }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
            {m.preview && <img src={m.preview} alt="" style={{ display: 'block', maxWidth: 200, borderRadius: 10, marginBottom: 4, marginLeft: 'auto' }} />}
            {m.text && <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '10px 13px', borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px', background: m.role === 'user' ? active.color : 'var(--card)', color: m.role === 'user' ? '#fff' : text, border: m.role === 'user' ? 'none' : '0.5px solid var(--border)' }}>{m.text}</div>}
          </div>
        ))}
        {busy && <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: textMuted, padding: '8px 12px' }}><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> {active.name} is thinking…</div>}
        <div ref={endRef} />
      </div>

      {img && (
        <div style={{ padding: '8px 16px', borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)' }}>
          <img src={img.preview} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
          <div style={{ fontSize: 12, color: textMuted, flex: 1 }}>Photo attached — add details (size, finish, location) and send.</div>
          <button onClick={() => setImg(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18 }}><i className="ti ti-x" /></button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '0.5px solid var(--border)', background: 'var(--card)' }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} title="Attach a photo" style={{ width: 42, flexShrink: 0, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg2)', color: textSub, cursor: 'pointer', fontSize: 18 }}><i className="ti ti-photo" /></button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={'Ask the ' + active.name + '…'} disabled={busy}
          style={{ flex: 1, padding: '11px 14px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg2)', color: text, fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <button onClick={() => send()} disabled={busy || (!input.trim() && !img)} style={{ padding: '0 18px', borderRadius: 11, background: active.color, color: '#fff', border: 'none', cursor: (busy || (!input.trim() && !img)) ? 'default' : 'pointer', fontSize: 16, fontWeight: 700, opacity: (busy || (!input.trim() && !img)) ? 0.6 : 1 }}>
          <i className="ti ti-send" />
        </button>
      </div>
    </div>
  )

  return (
    <>
      {!entered ? dashboard : (
        <div style={{ display: 'flex', height: 'calc(100vh - 150px)', minHeight: 520, border: '0.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {(!mobile || mobilePane === 'list') && threadList}
          {(!mobile || mobilePane === 'chat') && chatPane}
        </div>
      )}

      {showKnow && (
        <div onClick={() => setShowKnow(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '100%', background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: text, marginBottom: 4 }}>Business knowledge</div>
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 12, lineHeight: 1.6 }}>Tell the agents about your business — services, typical rates, USP, standard terms, target clients. <b>All agents</b> use this to give answers specific to you, not generic.</div>
            <textarea value={cfg.knowledge} onChange={e => setCfg(c => ({ ...c, knowledge: e.target.value }))}
              placeholder={'e.g. Fit-out & interior company in Dubai. We do villas, offices and cafes. Typical fit-out AED 250-450/sqft. Premium finishes. Standard payment 40/30/30. Service areas: JVC, Business Bay, Marina.'}
              style={{ width: '100%', minHeight: 160, padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={() => { saveCfg(); setShowKnow(false) }} disabled={savingCfg} style={{ padding: '10px 20px', borderRadius: 9, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: savingCfg ? 0.7 : 1 }}>{savingCfg ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setShowKnow(false)} style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: textSub, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
