// tritova-business/src/pages/InboxPage.jsx
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import HeroActions from '../components/HeroActions'

const BRAND = '#0099cc'
const SAFE_TOP = 'env(safe-area-inset-top)'

const CATEGORIES = [
  { key:'support',        label:'Support' },
  { key:'document_query', label:'Document Query' },
  { key:'complaint',      label:'Complaint' },
  { key:'other',          label:'Other' },
]
const CAT_LABEL = {
  support:'Support', document_query:'Document Query', complaint:'Complaint', other:'Other',
  announcement:'Announcement', document:'Document', system:'System',
}
const STATUS_BADGE = {
  open:     { label:'Open',     bg:'rgba(59,130,246,0.14)',  fg:'#3b82f6' },
  resolved: { label:'Resolved', bg:'rgba(16,185,129,0.14)',  fg:'#10b981' },
  closed:   { label:'Closed',   bg:'rgba(100,116,139,0.16)', fg:'#64748b' },
}
const FILTERS = [
  { key:'all',    label:'All' },
  { key:'unread', label:'Unread' },
  { key:'sent',   label:'Sent' },
]

export default function InboxPage() {
  const { company, staff } = useAuth()
  const [messages, setMessages] = useState([])   // all rows for this company
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [activeRoot, setActiveRoot] = useState(null) // root id of open thread
  const [showCompose, setShowCompose] = useState(false)

  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const r = () => setVw(window.innerWidth)
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])
  const mobile = vw < 768

  const load = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('inbox_messages')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending:true })
    setMessages(data || [])
    setLoading(false)
  }, [company])

  useEffect(() => { load() }, [load])

  // group into threads: rootId -> { root, replies[], lastAt, anyUnread }
  const rootOf = (m) => m.parent_id || m.id
  const threadsMap = {}
  for (const m of messages) {
    const rid = rootOf(m)
    if (!threadsMap[rid]) threadsMap[rid] = { rootId:rid, all:[] }
    threadsMap[rid].all.push(m)
  }
  let threads = Object.values(threadsMap).map(t => {
    const all = t.all.slice().sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
    const root = all.find(m => !m.parent_id) || all[0]
    const last = all[all.length - 1]
    const anyUnread = all.some(m => m.direction === 'to_company' && !m.read_by_company)
    const isSent = root.direction === 'to_admin'
    return { rootId:t.rootId, root, last, all, anyUnread, isSent }
  })
  threads.sort((a,b) => new Date(b.last.created_at) - new Date(a.last.created_at))

  const unreadCount = threads.filter(t => t.anyUnread).length

  const filtered = threads.filter(t => {
    if (filter === 'unread') return t.anyUnread
    if (filter === 'sent')   return t.isSent
    return true
  })

  async function openThread(t) {
    setActiveRoot(t.rootId)
    // mark all incoming (to_company) unread messages in this thread as read
    const toMark = t.all.filter(m => m.direction === 'to_company' && !m.read_by_company)
    if (toMark.length > 0) {
      const ids = toMark.map(m => m.id)
      const nowIso = new Date().toISOString()
      await supabase.from('inbox_messages')
        .update({ read_by_company:true, company_read_at:nowIso })
        .in('id', ids)
      setMessages(p => p.map(m => ids.includes(m.id) ? { ...m, read_by_company:true, company_read_at:nowIso } : m))
    }
  }

  const openThreadData = activeRoot ? threads.find(t => t.rootId === activeRoot) : null

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'50vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:34, height:34, border:`3px solid ${BRAND}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize:13, color:'var(--text3)' }}>Loading inbox…</div>
    </div>
  )

  return (
    <div style={{ maxWidth:760, margin:'0 auto', color:'var(--text)' }}>

      <HeroActions>
        <button onClick={() => setShowCompose(true)}
          style={{ flexShrink:0, display:'inline-flex', alignItems:'center', gap:6, padding:mobile?'9px 13px':'10px 16px', borderRadius:10, border:'none', color:'#fff', fontWeight:600, fontSize:13, background:BRAND, cursor:'pointer', whiteSpace:'nowrap' }}>
          <i className="ti ti-pencil-plus" style={{ fontSize:16 }}/>{!mobile && ' Compose'}
        </button>
      </HeroActions>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, margin:'16px 0', flexWrap:'wrap' }}>
        {FILTERS.map(f => {
          const active = filter === f.key
          const badge = f.key === 'unread' && unreadCount > 0 ? unreadCount : null
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 15px', borderRadius:99, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                border: active ? 'none' : '0.5px solid var(--border)',
                background: active ? BRAND : 'var(--card)',
                color: active ? '#fff' : 'var(--text2)' }}>
              {f.label}
              {badge != null && <span style={{ fontSize:10, fontWeight:700, padding:'0 6px', borderRadius:99, background: active?'rgba(255,255,255,0.25)':'rgba(0,153,204,0.15)', color: active?'#fff':BRAND }}>{badge}</span>}
            </button>
          )
        })}
      </div>

      {/* Thread list */}
      {filtered.length === 0 ? (
        <div style={{ background:'var(--card)', border:'0.5px solid var(--border)', borderRadius:16, padding:'52px 24px', textAlign:'center' }}>
          <div style={{ width:60, height:60, borderRadius:16, background:'rgba(0,153,204,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            <i className="ti ti-mail-off" style={{ fontSize:28, color:BRAND }}/>
          </div>
          <div style={{ fontSize:15, fontWeight:600, color:'var(--text)', marginBottom:4 }}>No messages {filter !== 'all' ? `in "${filter}"` : 'yet'}</div>
          <p style={{ fontSize:13, color:'var(--text3)', margin:'0 0 18px' }}>Need help or have a question? Reach out to the Quvera team.</p>
          <button onClick={() => setShowCompose(true)}
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 18px', borderRadius:9, border:'none', color:'#fff', fontWeight:600, fontSize:13, background:BRAND, cursor:'pointer' }}>
            <i className="ti ti-pencil-plus" style={{ fontSize:15 }}/> New message
          </button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(t => {
            const m = t.root
            const sb = STATUS_BADGE[t.root.status] || STATUS_BADGE.open
            const fromAdmin = t.root.direction === 'to_company'
            const replyCount = t.all.length - 1
            const iconBg = fromAdmin ? 'rgba(217,119,6,0.14)' : 'rgba(0,153,204,0.14)'
            const iconFg = fromAdmin ? '#d97706' : BRAND
            return (
              <div key={t.rootId} onClick={() => openThread(t)}
                style={{ display:'flex', alignItems:'flex-start', gap:12, background:'var(--card)',
                  border: t.anyUnread ? `1px solid ${BRAND}` : '0.5px solid var(--border)',
                  boxShadow: t.anyUnread ? '0 1px 10px rgba(0,153,204,0.10)' : 'none',
                  borderRadius:14, padding:14, cursor:'pointer', transition:'transform .12s, border-color .15s' }}
                onMouseEnter={e => { if (!mobile) e.currentTarget.style.borderColor = BRAND }}
                onMouseLeave={e => { if (!mobile && !t.anyUnread) e.currentTarget.style.borderColor = 'var(--border)' }}>

                <div style={{ position:'relative', width:42, height:42, borderRadius:12, background:iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className={`ti ${fromAdmin ? 'ti-speakerphone' : 'ti-send'}`} style={{ fontSize:19, color:iconFg }}/>
                  {t.anyUnread && <span style={{ position:'absolute', top:-2, right:-2, width:11, height:11, borderRadius:'50%', background:BRAND, border:'2px solid var(--card)' }}/>}
                </div>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <span style={{ fontSize:14, fontWeight:t.anyUnread?700:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {m.subject}
                    </span>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 9px', borderRadius:99, background:sb.bg, color:sb.fg, whiteSpace:'nowrap', flexShrink:0 }}>{sb.label}</span>
                  </div>
                  {t.last.body && (
                    <p style={{ fontSize:12.5, color:'var(--text2)', margin:'4px 0 0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {t.last.body}
                    </p>
                  )}
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:6, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontWeight:600, color:iconFg }}>
                      <i className={`ti ${fromAdmin ? 'ti-speakerphone' : 'ti-building-store'}`} style={{ fontSize:12 }}/>
                      {fromAdmin ? 'Quvera' : 'Sent by you'}
                    </span>
                    {m.category && <span>· {CAT_LABEL[m.category] || m.category}</span>}
                    {replyCount > 0 && <span>· {replyCount} repl{replyCount>1?'ies':'y'}</span>}
                    <span>· {new Date(t.last.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {openThreadData && (
        <ThreadModal thread={openThreadData} company={company} staff={staff} mobile={mobile}
          onClose={() => setActiveRoot(null)} onReplied={load} />
      )}

      {showCompose && (
        <ComposeModal company={company} staff={staff} mobile={mobile}
          onClose={() => setShowCompose(false)} onSent={() => { setShowCompose(false); load() }} />
      )}
    </div>
  )
}

/* ---------- Thread view + Reply ---------- */
function ThreadModal({ thread, company, staff, mobile, onClose, onReplied }) {
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  const root = thread.root
  const ordered = thread.all // already sorted asc
  const sb = STATUS_BADGE[root.status] || STATUS_BADGE.open

  async function sendReply() {
    setErr('')
    if (!reply.trim()) { setErr('Reply cannot be empty.'); return }
    setSending(true)
    const subject = root.subject?.startsWith('Re: ') ? root.subject : `Re: ${root.subject}`
    const { error } = await supabase.from('inbox_messages').insert({
      company_id: company.id,
      direction: 'to_admin',
      sender_type: 'company',
      category: root.category && CAT_LABEL[root.category] ? root.category : 'other',
      subject,
      body: reply.trim(),
      parent_id: thread.rootId,
      sender_staff_id: staff?.id || null,
      status: 'open',
    })
    setSending(false)
    if (error) { setErr(error.message); return }
    setReply('')
    onReplied()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:mobile?'stretch':'center', justifyContent:'center', padding:mobile?0:16, overflowY:'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--card)', borderRadius:mobile?0:16, width:mobile?'100%':520, minHeight:mobile?'100%':'auto', maxHeight:mobile?'none':'90vh', display:'flex', flexDirection:'column', border:'0.5px solid var(--border)' }}>

        {/* Sticky header */}
        <div style={{ position:'sticky', top:0, zIndex:5, background:'var(--card)', padding:'14px 18px', paddingTop:mobile?`calc(14px + ${SAFE_TOP})`:14, borderBottom:'0.5px solid var(--border)', borderRadius:mobile?0:'16px 16px 0 0' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
            <div style={{ minWidth:0 }}>
              <h4 style={{ margin:0, fontSize:16, fontWeight:700, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{root.subject}</h4>
              <p style={{ fontSize:11, color:'var(--text3)', margin:'3px 0 0' }}>
                {root.category ? (CAT_LABEL[root.category] || root.category) : 'Conversation'} · {ordered.length} message{ordered.length>1?'s':''}
              </p>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 9px', borderRadius:99, background:sb.bg, color:sb.fg }}>{sb.label}</span>
              <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, color:'var(--text3)', cursor:'pointer', lineHeight:1 }}><i className="ti ti-x"/></button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:'auto', padding:18, display:'flex', flexDirection:'column', gap:10 }}>
          {ordered.map(m => {
            const fromAdmin = m.direction === 'to_company'
            return (
              <div key={m.id} style={{
                alignSelf: fromAdmin ? 'flex-start' : 'flex-end',
                maxWidth:'86%',
                background: fromAdmin ? 'var(--bg2)' : 'rgba(0,153,204,0.12)',
                border:'0.5px solid var(--border)', borderRadius:14, padding:'10px 13px' }}>
                <div style={{ fontSize:11, fontWeight:700, color: fromAdmin ? '#d97706' : BRAND, marginBottom:4, display:'flex', alignItems:'center', gap:5 }}>
                  <i className={`ti ${fromAdmin ? 'ti-speakerphone' : (m.sender_type==='system' ? 'ti-settings' : 'ti-building-store')}`} style={{ fontSize:12 }}/>
                  {fromAdmin ? 'Quvera' : (m.sender_type==='system' ? 'System' : 'You')}
                </div>
                {m.body && <div style={{ fontSize:13.5, color:'var(--text)', whiteSpace:'pre-wrap', lineHeight:1.5 }}>{m.body}</div>}
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:6 }}>{new Date(m.created_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
              </div>
            )
          })}
        </div>

        {/* Reply box */}
        <div style={{ borderTop:'0.5px solid var(--border)', padding:'14px 18px', paddingBottom:mobile?`calc(14px + env(safe-area-inset-bottom))`:14, background:'var(--card)', borderRadius:mobile?0:'0 0 16px 16px' }}>
          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2}
            placeholder="Type your reply to Quvera…"
            style={{ width:'100%', border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)', borderRadius:10, padding:'10px 12px', fontSize:13.5, boxSizing:'border-box', resize:'vertical', fontFamily:'inherit', outline:'none', marginBottom:err?6:10 }} />
          {err && <p style={{ fontSize:12, color:'#ef4444', margin:'0 0 10px' }}>{err}</p>}
          <button onClick={sendReply} disabled={sending}
            style={{ width:'100%', padding:'11px', borderRadius:10, border:'none', color:'#fff', fontWeight:600, fontSize:13, background:BRAND, cursor:'pointer', opacity:sending?0.6:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <i className="ti ti-send" style={{ fontSize:15 }}/> {sending ? 'Sending…' : 'Send Reply'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Compose new message to Quvera ---------- */
function ComposeModal({ company, staff, mobile, onClose, onSent }) {
  const [category, setCategory] = useState('support')
  const [subject, setSubject]   = useState('')
  const [body, setBody]         = useState('')
  const [sending, setSending]   = useState(false)
  const [err, setErr]           = useState('')

  async function send() {
    setErr('')
    if (!subject.trim()) { setErr('Subject is required.'); return }
    setSending(true)
    const { error } = await supabase.from('inbox_messages').insert({
      company_id: company.id,
      direction: 'to_admin',
      sender_type: 'company',
      category,
      subject: subject.trim(),
      body: body.trim() || null,
      parent_id: null,
      sender_staff_id: staff?.id || null,
      status: 'open',
    })
    setSending(false)
    if (error) { setErr(error.message); return }
    onSent()
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:mobile?'flex-start':'center', justifyContent:'center', padding:mobile?0:16, overflowY:'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--card)', borderRadius:mobile?0:16, width:mobile?'100%':460, minHeight:mobile?'100%':'auto', border:'0.5px solid var(--border)' }}>

        <div style={{ position:'sticky', top:0, zIndex:5, background:'var(--card)', padding:'14px 18px', paddingTop:mobile?`calc(14px + ${SAFE_TOP})`:14, borderBottom:'0.5px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', borderRadius:mobile?0:'16px 16px 0 0' }}>
          <h4 style={{ fontWeight:700, color:'var(--text)', margin:0, fontSize:16 }}>Message Quvera</h4>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, color:'var(--text3)', cursor:'pointer', lineHeight:1 }}><i className="ti ti-x"/></button>
        </div>

        <div style={{ padding:18, paddingBottom:mobile?`calc(18px + env(safe-area-inset-bottom))`:18 }}>
          <label style={lbl}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>

          <label style={lbl}>Subject</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief subject" style={inp} />

          <label style={lbl}>Message</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
            placeholder="Write your message…" style={{ ...inp, resize:'vertical' }} />

          {err && <p style={{ fontSize:12, color:'#ef4444', margin:'0 0 12px' }}>{err}</p>}

          <button onClick={send} disabled={sending}
            style={{ width:'100%', padding:'11px', borderRadius:10, border:'none', color:'#fff', fontWeight:600, fontSize:13, background:BRAND, cursor:'pointer', opacity:sending?0.6:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <i className="ti ti-send" style={{ fontSize:15 }}/> {sending ? 'Sending…' : 'Send to Quvera'}
          </button>
        </div>
      </div>
    </div>
  )
}

const lbl = { fontSize:12, color:'var(--text2)', display:'block', marginBottom:5, fontWeight:500 }
const inp = { width:'100%', marginBottom:14, border:'1px solid var(--border)', background:'var(--card)', color:'var(--text)', borderRadius:9, padding:'10px 12px', fontSize:13.5, boxSizing:'border-box', fontFamily:'inherit', outline:'none' }
