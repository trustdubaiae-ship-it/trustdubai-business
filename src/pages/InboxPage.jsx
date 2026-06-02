// trustdubai-business/src/pages/InboxPage.jsx
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const BRAND = '#0099cc'

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
  open:     { label:'Open',     bg:'#dbeafe', fg:'#1d4ed8' },
  resolved: { label:'Resolved', bg:'#dcfce7', fg:'#15803d' },
  closed:   { label:'Closed',   bg:'#e5e7eb', fg:'#6b7280' },
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

  if (loading) return <div style={{ padding:32, color:'#94a3b8' }}>Loading inbox…</div>

  return (
    <div style={{ padding:24, maxWidth:860, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:0 }}>
          Inbox {unreadCount>0 && <span style={{ fontSize:13, color:BRAND }}>({unreadCount} unread)</span>}
        </h1>
        <button onClick={() => setShowCompose(true)}
          style={{ padding:'9px 16px', borderRadius:9, border:'none', color:'#fff', fontWeight:600, fontSize:13, background:BRAND, cursor:'pointer' }}>
          + Compose
        </button>
      </div>
      <p style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>
        Messages between {company?.name || 'your company'} and TrustDubai
      </p>

      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding:'6px 14px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer',
              border: filter===f.key ? 'none' : '1px solid #e2e8f0',
              background: filter===f.key ? BRAND : '#fff',
              color: filter===f.key ? '#fff' : '#64748b' }}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background:'#f8fafc', borderRadius:16, padding:48, textAlign:'center', color:'#94a3b8' }}>
          <i className="ti ti-mail-off" style={{ fontSize:32, display:'block', marginBottom:8 }}/>
          No messages {filter !== 'all' ? `in "${filter}"` : 'yet'}.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(t => {
            const m = t.root
            const sb = STATUS_BADGE[t.root.status] || STATUS_BADGE.open
            const fromAdmin = t.root.direction === 'to_company'
            const replyCount = t.all.length - 1
            return (
              <div key={t.rootId} onClick={() => openThread(t)}
                style={{ display:'flex', alignItems:'flex-start', gap:12, background:'#fff',
                  border: t.anyUnread ? `0.5px solid ${BRAND}` : '0.5px solid #e2e8f0',
                  borderRadius:12, padding:14, cursor:'pointer' }}>
                <div style={{ width:38, height:38, borderRadius:10, background: fromAdmin ? '#fff7ed' : '#e6f6fb',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className={`ti ${fromAdmin ? 'ti-speakerphone' : 'ti-send'}`}
                    style={{ fontSize:17, color: fromAdmin ? '#d97706' : BRAND }}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <span style={{ fontSize:14, fontWeight:t.anyUnread?700:600, color:'#0f172a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {m.subject}
                    </span>
                    <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background:sb.bg, color:sb.fg, whiteSpace:'nowrap' }}>{sb.label}</span>
                  </div>
                  {t.last.body && (
                    <p style={{ fontSize:12, color:'#64748b', margin:'3px 0 0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {t.last.body}
                    </p>
                  )}
                  <div style={{ fontSize:11, color:'#94a3b8', marginTop:4 }}>
                    {fromAdmin ? '📢 TrustDubai' : '🏢 Sent by you'}
                    {m.category && <span> · {CAT_LABEL[m.category] || m.category}</span>}
                    {replyCount > 0 && <span> · {replyCount} repl{replyCount>1?'ies':'y'}</span>}
                    {' · '}{new Date(t.last.created_at).toLocaleString('en-GB')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {openThreadData && (
        <ThreadModal thread={openThreadData} company={company} staff={staff}
          onClose={() => setActiveRoot(null)} onReplied={load} />
      )}

      {showCompose && (
        <ComposeModal company={company} staff={staff}
          onClose={() => setShowCompose(false)} onSent={() => { setShowCompose(false); load() }} />
      )}
    </div>
  )
}

/* ---------- Thread view + Reply ---------- */
function ThreadModal({ thread, company, staff, onClose, onReplied }) {
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  const root = thread.root
  const ordered = thread.all // already sorted asc

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
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:520, padding:20, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:4 }}>
          <h4 style={{ margin:0, fontSize:16, fontWeight:700, color:'#0f172a' }}>{root.subject}</h4>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, color:'#94a3b8', cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <p style={{ fontSize:11, color:'#94a3b8', margin:'0 0 16px' }}>
          {root.category ? (CAT_LABEL[root.category] || root.category) : 'Conversation'} · {ordered.length} message{ordered.length>1?'s':''}
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
          {ordered.map(m => {
            const fromAdmin = m.direction === 'to_company'
            return (
              <div key={m.id} style={{
                alignSelf: fromAdmin ? 'flex-start' : 'flex-end',
                maxWidth:'85%',
                background: fromAdmin ? '#f8fafc' : '#e6f6fb',
                border:'0.5px solid #e2e8f0', borderRadius:12, padding:'10px 12px' }}>
                <div style={{ fontSize:11, fontWeight:700, color: fromAdmin ? '#d97706' : BRAND, marginBottom:3 }}>
                  {fromAdmin ? '📢 TrustDubai' : (m.sender_type==='system' ? '⚙️ System' : '🏢 You')}
                </div>
                {m.body && <div style={{ fontSize:13, color:'#0f172a', whiteSpace:'pre-wrap' }}>{m.body}</div>}
                <div style={{ fontSize:10, color:'#94a3b8', marginTop:5 }}>{new Date(m.created_at).toLocaleString('en-GB')}</div>
              </div>
            )
          })}
        </div>

        <div style={{ borderTop:'1px solid #f1f5f9', paddingTop:14 }}>
          <label style={lbl}>Reply</label>
          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3}
            placeholder="Type your reply to TrustDubai…" style={{ ...inp, resize:'vertical' }} />
          {err && <p style={{ fontSize:12, color:'#dc2626', marginBottom:10 }}>{err}</p>}
          <button onClick={sendReply} disabled={sending}
            style={{ width:'100%', padding:'11px', borderRadius:9, border:'none', color:'#fff', fontWeight:600, background:BRAND, cursor:'pointer', opacity:sending?0.5:1 }}>
            {sending ? 'Sending…' : 'Send Reply'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Compose new message to TrustDubai ---------- */
function ComposeModal({ company, staff, onClose, onSent }) {
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
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:460, padding:20 }}>
        <h4 style={{ fontWeight:700, color:'#0f172a', marginTop:0, marginBottom:16 }}>Message TrustDubai</h4>

        <label style={lbl}>Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>

        <label style={lbl}>Subject</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief subject" style={inp} />

        <label style={lbl}>Message</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
          placeholder="Write your message…" style={{ ...inp, resize:'vertical' }} />

        {err && <p style={{ fontSize:12, color:'#dc2626', marginBottom:12 }}>{err}</p>}

        <button onClick={send} disabled={sending}
          style={{ width:'100%', padding:'11px', borderRadius:9, border:'none', color:'#fff', fontWeight:600, background:BRAND, cursor:'pointer', opacity:sending?0.5:1 }}>
          {sending ? 'Sending…' : 'Send to TrustDubai'}
        </button>
      </div>
    </div>
  )
}

const lbl = { fontSize:12, color:'#64748b', display:'block' }
const inp = { width:'100%', marginTop:4, marginBottom:14, border:'1px solid #e2e8f0', borderRadius:9, padding:'9px 12px', fontSize:13, boxSizing:'border-box' }
