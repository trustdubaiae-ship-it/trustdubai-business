import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const AGENTS = [
  { key: 'marketing', name: 'Marketing Agent', icon: 'ti-speakerphone', color: '#ec4899', tag: 'Ads, social, offers & campaigns',
    starters: ['Write a Meta ad for kitchen renovations', '3 WhatsApp broadcast offers for a Ramadan promo', 'Instagram caption for a finished office fit-out'] },
  { key: 'estimator', name: 'Estimator Agent', icon: 'ti-calculator', color: '#0099cc', tag: 'Rough costs, scope & BOQ',
    starters: ['Estimate a 1200 sqft office fit-out in JVC', 'Scope of work for a villa kitchen renovation', 'Ballpark rate for gypsum false ceiling per sqft'] },
  { key: 'sales', name: 'Sales Agent', icon: 'ti-target-arrow', color: '#22c55e', tag: 'Follow-ups, objections & closing',
    starters: ['Follow-up for a lead who went quiet', 'Reply to "your quote is too expensive"', 'Message to book a free site visit'] },
  { key: 'content', name: 'Content Agent', icon: 'ti-pencil', color: '#8b5cf6', tag: 'Posts, captions & portfolio',
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

export default function AIAgents() {
  const { company } = useAuth()
  const toast = useToast()
  const [, force] = useState(0)
  useEffect(() => {
    const ob = new MutationObserver(() => force(n => n + 1))
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => ob.disconnect()
  }, [])

  const [active, setActive] = useState(null)        // selected agent
  const [msgs, setMsgs] = useState([])              // { role:'user'|'assistant', text }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  // knowledge + per-agent notes the agents use to stay specific to the business
  const [cfg, setCfg] = useState({ knowledge: '', notes: {} })
  const [showKnow, setShowKnow] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)

  useEffect(() => { if (company?.id) loadCfg() }, [company?.id])
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

  const text = 'var(--text)', textSub = 'var(--text2)', textMuted = 'var(--text3)'
  const card = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14 }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  function open(agent) { setActive(agent); setMsgs([]); setInput(''); setShowNote(false) }
  function back() { setActive(null); setMsgs([]); setInput(''); setShowNote(false) }

  async function send(textToSend) {
    const q = (textToSend ?? input).trim()
    if (!q || busy || !active) return
    const next = [...msgs, { role: 'user', text: q }]
    setMsgs(next); setInput(''); setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: {
          agent: active.key,
          companyName: company?.name || 'our company',
          companyCategory: company?.categories?.[0] || company?.category || '',
          messages: next,
          knowledge: cfg.knowledge || '',
          note: cfg.notes?.[active.key] || '',
        },
      })
      if (error) throw error
      if (data?.reply) setMsgs(m => [...m, { role: 'assistant', text: data.reply }])
      else { toast.error(data?.code === 'no_credit' ? 'AI credits exhausted' : 'AI could not respond'); setMsgs(m => m.slice(0, -1)) }
    } catch (e) {
      toast.error('Could not reach the AI agent'); setMsgs(m => m.slice(0, -1))
    } finally { setBusy(false) }
  }

  // ---------- Agent picker ----------
  if (!active) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: textMuted }}>Your AI team</div>
          <button onClick={() => setShowKnow(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: textSub, cursor: 'pointer' }}>
            <i className="ti ti-adjustments" /> Business knowledge {cfg.knowledge ? <span style={{ width: 7, height: 7, borderRadius: 99, background: '#16a34a' }} /> : null}
          </button>
        </div>
        {showKnow && (
          <div style={{ ...card, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 4 }}>Business knowledge</div>
            <div style={{ fontSize: 12, color: textMuted, marginBottom: 10, lineHeight: 1.6 }}>Tell the agents about your business — services, typical rates, USP, standard terms, target clients. <b>All agents</b> use this to give answers specific to you, not generic.</div>
            <textarea value={cfg.knowledge} onChange={e => setCfg(c => ({ ...c, knowledge: e.target.value }))}
              placeholder={'e.g. Fit-out & interior company in Dubai. We do villas, offices and cafes. Typical fit-out AED 250-450/sqft. Premium finishes. Standard payment 40/30/30. Service areas: JVC, Business Bay, Marina.'}
              style={{ width: '100%', minHeight: 130, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button onClick={() => saveCfg()} disabled={savingCfg} style={{ padding: '9px 18px', borderRadius: 9, background: '#0099cc', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: savingCfg ? 0.7 : 1 }}>{savingCfg ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setShowKnow(false)} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: textSub, cursor: 'pointer', fontSize: 13 }}>Close</button>
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 12 }}>
          {AGENTS.map(a => (
            <button key={a.key} onClick={() => open(a)} style={{ ...card, padding: 16, textAlign: 'left', cursor: 'pointer', color: text }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: a.color + '22', color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className={'ti ' + a.icon} style={{ fontSize: 22 }} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: textMuted }}>{a.tag}</div>
                </div>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: a.color }}>Chat with agent <i className="ti ti-arrow-right" style={{ fontSize: 14 }} /></div>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: textMuted, marginTop: 16, lineHeight: 1.6 }}>
          <i className="ti ti-sparkles" style={{ color: '#8b5cf6' }} /> Each agent knows it works for <b>{company?.name || 'your company'}</b> in Dubai. Ask in plain language — English or Hinglish.
        </div>
      </div>
    )
  }

  // ---------- Chat ----------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', minHeight: 460 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
        <button onClick={back} style={{ background: 'var(--bg2)', border: 'none', width: 34, height: 34, borderRadius: 9, cursor: 'pointer', color: textSub }}><i className="ti ti-arrow-left" /></button>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: active.color + '22', color: active.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className={'ti ' + active.icon} style={{ fontSize: 19 }} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{active.name}</div>
          <div style={{ fontSize: 11.5, color: textMuted }}>{active.tag}</div>
        </div>
        <button onClick={() => setShowNote(v => !v)} title="Customize this agent" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '7px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: textSub, cursor: 'pointer' }}>
          <i className="ti ti-settings" /> Customize {cfg.notes?.[active.key] ? <span style={{ width: 7, height: 7, borderRadius: 99, background: '#16a34a' }} /> : null}
        </button>
      </div>

      {showNote && (
        <div style={{ ...card, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: textMuted, marginBottom: 8, lineHeight: 1.5 }}>Custom instructions just for the <b>{active.name}</b> — e.g. tone, focus, what to always include. (Plus your Business knowledge.)</div>
          <textarea value={cfg.notes?.[active.key] || ''} onChange={e => setCfg(c => ({ ...c, notes: { ...c.notes, [active.key]: e.target.value } }))}
            placeholder={'e.g. Always keep a premium, confident tone and end with a clear call to action.'}
            style={{ width: '100%', minHeight: 70, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => { saveCfg(); setShowNote(false) }} disabled={savingCfg} style={{ padding: '8px 16px', borderRadius: 9, background: active.color, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, opacity: savingCfg ? 0.7 : 1 }}>{savingCfg ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setShowNote(false)} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: textSub, cursor: 'pointer', fontSize: 12.5 }}>Close</button>
          </div>
        </div>
      )}

      <div style={{ ...card, flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 460 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: active.color + '1f', color: active.color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><i className={'ti ' + active.icon} style={{ fontSize: 28 }} /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 4 }}>How can I help?</div>
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
            <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '10px 13px', borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              background: m.role === 'user' ? active.color : 'var(--bg2)', color: m.role === 'user' ? '#fff' : text, border: m.role === 'user' ? 'none' : '0.5px solid var(--border)' }}>{m.text}</div>
          </div>
        ))}
        {busy && <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: textMuted, padding: '8px 12px' }}><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> {active.name} is thinking…</div>}
        <div ref={endRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={'Ask the ' + active.name + '…'} disabled={busy}
          style={{ flex: 1, padding: '11px 14px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--card)', color: text, fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{ padding: '0 18px', borderRadius: 11, background: active.color, color: '#fff', border: 'none', cursor: (busy || !input.trim()) ? 'default' : 'pointer', fontSize: 14, fontWeight: 700, opacity: (busy || !input.trim()) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-send" style={{ fontSize: 16 }} />
        </button>
      </div>
    </div>
  )
}
