// trustdubai-business/src/components/VoiceAssistant.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/* =========================================================================
   Quvera Voice Assistant — activated from the AI Core.
   Listens (Web Speech API) → asks Claude via the "quvera-assistant" Edge
   Function → speaks the reply. Falls back to a text box if speech isn't
   available. Theme-aware (light/dark via the repo's CSS variables).
   ========================================================================= */

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
const speechSupported = !!SR

export default function VoiceAssistant({ open, onClose, theme }) {
  const [state, setState] = useState('idle')      // idle | listening | thinking | speaking | error
  const [heard, setHeard] = useState('')          // what the user said
  const [reply, setReply] = useState('')          // assistant reply (text)
  const [muted, setMuted] = useState(false)
  const [typed, setTyped] = useState('')          // text fallback input
  const [micDenied, setMicDenied] = useState(false)
  const recRef = useRef(null)
  const mutedRef = useRef(false)
  useEffect(() => { mutedRef.current = muted }, [muted])

  // ---- ask Claude via the edge function ----
  const ask = useCallback(async (question) => {
    const q = (question || '').trim()
    if (!q) return
    setHeard(q); setReply(''); setState('thinking')
    try {
      const { data, error } = await supabase.functions.invoke('quvera-assistant', { body: { question: q } })
      let text = ''
      if (error) { try { text = (await error.context.json())?.error } catch { text = error.message } }
      else text = data?.reply || data?.error || ''
      if (!text) text = "Sorry, I couldn't get a response. Please try again."
      setReply(text)
      speak(text)
    } catch (e) {
      setReply('Something went wrong. Please try again.')
      setState('error')
    }
  }, []) // eslint-disable-line

  // ---- speak the reply ----
  function speak(text) {
    if (!synth || mutedRef.current) { setState('idle'); return }
    try {
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1.02; u.pitch = 1; u.lang = 'en-US'
      u.onstart = () => setState('speaking')
      u.onend = () => setState('idle')
      u.onerror = () => setState('idle')
      setState('speaking')
      synth.speak(u)
    } catch { setState('idle') }
  }
  function stopSpeaking() { try { synth && synth.cancel() } catch {} ; setState('idle') }

  // ---- start listening ----
  const startListening = useCallback(() => {
    if (!SR) return
    stopSpeaking()
    try {
      const rec = new SR()
      rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1
      let finalText = ''
      rec.onstart = () => { setHeard(''); setReply(''); setMicDenied(false); setState('listening') }
      rec.onresult = (e) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) finalText += t; else interim += t
        }
        setHeard((finalText + interim).trim())
      }
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMicDenied(true)
        setState('idle')
      }
      rec.onend = () => { const q = finalText.trim(); if (q) ask(q); else setState(s => s === 'listening' ? 'idle' : s) }
      recRef.current = rec
      rec.start()
    } catch { setState('idle') }
  }, [ask])

  function stopListening() { try { recRef.current && recRef.current.stop() } catch {} }

  // auto-start listening when opened (if supported)
  useEffect(() => {
    if (open && speechSupported) startListening()
    return () => { try { recRef.current && recRef.current.abort() } catch {}; try { synth && synth.cancel() } catch {} }
  }, [open]) // eslint-disable-line

  // close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open]) // eslint-disable-line

  function handleClose() { try { recRef.current && recRef.current.abort() } catch {}; stopSpeaking(); setHeard(''); setReply(''); setState('idle'); onClose && onClose() }

  if (!open) return null

  const label = { idle: 'Tap the orb and ask', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', error: 'Something went wrong' }[state]
  const orbActive = state === 'listening' || state === 'speaking' || state === 'thinking'

  return (
    <div onClick={handleClose} style={S.overlay}>
      <style>{CSS}</style>
      <div onClick={(e) => e.stopPropagation()} className="qva-card" style={S.card}>
        {/* header */}
        <div style={S.head}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={S.brandDot} />
            <span style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--text)', letterSpacing: '.2px' }}>Quvera Assistant</span>
            <span style={S.beta}>BETA</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { const m = !muted; setMuted(m); if (m) stopSpeaking() }} title={muted ? 'Unmute reply' : 'Mute reply'} style={S.iconBtn}>
              <i className={'ti ' + (muted ? 'ti-volume-off' : 'ti-volume')} />
            </button>
            <button onClick={handleClose} title="Close" style={S.iconBtn}><i className="ti ti-x" /></button>
          </div>
        </div>

        {/* orb */}
        <div style={S.orbWrap}>
          <button
            onClick={() => { if (!speechSupported) return; state === 'listening' ? stopListening() : (state === 'speaking' ? stopSpeaking() : startListening()) }}
            className={'qva-orb' + (orbActive ? ' on' : '')}
            style={S.orb}
            title={speechSupported ? 'Tap to talk' : 'Voice not supported — type below'}
          >
            <i className={'ti ' + (state === 'speaking' ? 'ti-volume' : state === 'thinking' ? 'ti-loader-2' : 'ti-microphone')}
               style={{ fontSize: 34, color: '#04101e', animation: state === 'thinking' ? 'qva-spin 1s linear infinite' : 'none' }} />
          </button>
          <div style={S.stateLabel}>{label}</div>
        </div>

        {/* transcript */}
        <div style={S.body}>
          {heard && <div style={S.heard}><span style={S.tag}>You</span> {heard}</div>}
          {reply && <div style={S.reply}><span style={{ ...S.tag, ...S.tagAcc }}>Quvera</span> {reply}</div>}
          {!heard && !reply && (
            <div style={S.hint}>
              {speechSupported
                ? 'Ask me anything about using Quvera — leads, quotations, projects, invoices, payments or your Trust Score.'
                : 'Voice isn’t supported in this browser — type your question below.'}
            </div>
          )}
          {micDenied && <div style={S.warn}><i className="ti ti-microphone-off" style={{ marginRight: 5 }} />Microphone blocked. Allow mic access, or type your question below.</div>}
        </div>

        {/* text fallback / always-available input */}
        <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { ask(typed); setTyped('') } }} style={S.inputRow}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type a question instead…" style={S.input} />
          <button type="submit" disabled={!typed.trim() || state === 'thinking'} style={{ ...S.send, opacity: (!typed.trim() || state === 'thinking') ? 0.5 : 1 }}><i className="ti ti-send" /></button>
        </form>
      </div>
    </div>
  )
}

/* ---- styles (CSS variables → light/dark aware) ---- */
const BRAND = 'linear-gradient(135deg,#00D4FF,#8B5CF6)'
const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,8,18,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px,4vw,28px)' },
  card: { width: '100%', maxWidth: 440, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: '0 30px 80px -24px rgba(0,0,0,0.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '92vh' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid var(--border)' },
  brandDot: { width: 22, height: 22, borderRadius: 7, background: BRAND, boxShadow: '0 0 14px -2px rgba(0,212,255,0.7)', flexShrink: 0 },
  beta: { fontSize: 9, fontWeight: 800, letterSpacing: '.5px', color: '#8B5CF6', background: 'rgba(139,92,246,0.14)', padding: '2px 7px', borderRadius: 99 },
  iconBtn: { width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  orbWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '26px 16px 18px' },
  orb: { width: 116, height: 116, borderRadius: '50%', border: 'none', cursor: 'pointer', background: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 0 rgba(0,212,255,0.45)', transition: 'transform .2s' },
  stateLabel: { fontSize: 13, fontWeight: 700, color: 'var(--text2)', letterSpacing: '.3px' },
  body: { padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 9, overflowY: 'auto', minHeight: 0 },
  heard: { fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.55 },
  reply: { fontSize: 14, color: 'var(--text)', lineHeight: 1.6, fontWeight: 500 },
  tag: { display: 'inline-block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--text3)', background: 'var(--bg2)', padding: '2px 7px', borderRadius: 6, marginRight: 7, verticalAlign: '1px' },
  tagAcc: { color: '#0e7490', background: 'rgba(8,145,178,0.14)' },
  hint: { fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.6, textAlign: 'center', padding: '0 6px' },
  warn: { fontSize: 12, color: '#d97706', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 9, padding: '8px 11px', lineHeight: 1.5 },
  inputRow: { display: 'flex', gap: 8, padding: 14 },
  input: { flex: 1, minWidth: 0, padding: '11px 13px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none' },
  send: { width: 44, flexShrink: 0, borderRadius: 11, border: 'none', background: BRAND, color: '#04101e', cursor: 'pointer', fontSize: 17, fontWeight: 700 },
}
const CSS = `
@keyframes qva-spin{to{transform:rotate(360deg)}}
@keyframes qva-pulse{0%{box-shadow:0 0 0 0 rgba(0,212,255,0.45)}70%{box-shadow:0 0 0 22px rgba(0,212,255,0)}100%{box-shadow:0 0 0 0 rgba(0,212,255,0)}}
.qva-orb:hover{transform:scale(1.04)}
.qva-orb.on{animation:qva-pulse 1.6s ease-out infinite}
.qva-card{animation:qva-in .22s ease}
@keyframes qva-in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.qva-orb.on{animation:none}.qva-card{animation:none}}
`
// trustdubai-business/src/components/VoiceAssistant.jsx
