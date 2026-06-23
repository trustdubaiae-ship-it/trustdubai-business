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

  const text = 'var(--text)', textSub = 'var(--text2)', textMuted = 'var(--text3)'
  const card = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 14 }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  function open(agent) { setActive(agent); setMsgs([]); setInput('') }
  function back() { setActive(null); setMsgs([]); setInput('') }

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
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: textMuted, marginBottom: 10 }}>Your AI team</div>
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
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{active.name}</div>
          <div style={{ fontSize: 11.5, color: textMuted }}>{active.tag}</div>
        </div>
      </div>

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
