import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import MetaConnect from './MetaConnect'
import MetaAds from './MetaAds'
import MetaAdBuilder from './MetaAdBuilder'
import WhatsAppConnect from './WhatsAppConnect'
import WhatsAppBot from './WhatsAppBot'
import HeroActions from '../components/HeroActions'

const SOURCES = [
  { key:'trustdubai', icon:'ti-shield-check',   name:'Quvera Leads', sub:'Platform verified leads',
    desc:'Receive verified leads from Quvera distribution.', status:'active', action:'Active' },
  { key:'meta',       icon:'ti-brand-meta',      name:'Meta Ads',         sub:'Facebook & Instagram',
    desc:'Connect your Meta account to design, launch & auto-optimize lead ads — all from here.', status:'connect', action:'Connect Meta Account' },
  { key:'whatsapp',   icon:'ti-brand-whatsapp',  name:'WhatsApp',         sub:'Direct enquiries',
    desc:'Capture leads straight from your WhatsApp Business number.', status:'connect', action:'Connect WhatsApp' },
  { key:'website',    icon:'ti-world-www',       name:'Website Form',     sub:'Embed on your site',
    desc:'Get an embed code for your own website — leads flow here.', status:'soon', action:'Coming soon' },
  { key:'google',     icon:'ti-brand-google',    name:'Google Ads',       sub:'Search & forms',
    desc:'Run Google lead-form campaigns and import results here.', status:'soon', action:'Coming soon' },
  { key:'manual',     icon:'ti-upload',          name:'Manual / CSV',     sub:'Add or import',
    desc:'Add leads by hand or bulk import via CSV file.', status:'active', action:'Add in Lead Hub' },
]

export default function LeadEngine() {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [, forceUpdate] = useState(0)

  // sub-view: home | meta-connect | meta-ads | meta-builder
  const [view, setView] = useState('home')
  const [metaConnected, setMetaConnected] = useState(false)
  const [whatsappConnected, setWhatsappConnected] = useState(false)

  const [minValue, setMinValue] = useState('')
  const [savedMin, setSavedMin] = useState('')
  const [saving, setSaving]     = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (company?.id) load()
    const ob = new MutationObserver(() => forceUpdate(n => n + 1))
    ob.observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] })
    return () => ob.disconnect()
  }, [company?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('companies').select('min_job_value').eq('id', company.id).maybeSingle()
    const v = data?.min_job_value ? String(data.min_job_value) : ''
    setMinValue(v); setSavedMin(v)
    const { data: conn } = await supabase.from('meta_connections').select('connected').eq('company_id', company.id).maybeSingle()
    setMetaConnected(!!conn?.connected)
    const { data: wa } = await supabase.from('whatsapp_accounts').select('id').eq('company_id', company.id).maybeSingle()
    setWhatsappConnected(!!wa?.id)
    setLoading(false)
  }

  async function saveMin() {
    setSaving(true)
    const num = minValue === '' ? 0 : Number(minValue)
    const { error } = await supabase.from('companies').update({ min_job_value: num }).eq('id', company.id)
    setSaving(false)
    if (error) { toast.error('Save failed'); return }
    setSavedMin(minValue)
    toast.success('Minimum job value saved ✓')
  }

  function handleSource(s) {
    if (s.key === 'meta') {
      setView(metaConnected ? 'meta-ads' : 'meta-connect')
      return
    }
    if (s.key === 'whatsapp') { setView('whatsapp-connect'); return }
    if (s.status === 'soon') { toast.info(s.name + ' is coming soon'); return }
    if (s.key === 'manual')  { toast.info('Use Leads → Add Lead / Import CSV'); return }
    if (s.key === 'trustdubai') { toast.info('Quvera leads are already active'); return }
  }

  // ===== Meta sub-views =====
  if (view === 'meta-connect') return (
    <MetaConnect
      onBack={() => { setView('home'); load() }}
      onConnected={() => { setMetaConnected(true); setView('meta-ads') }}
    />
  )
  if (view === 'meta-ads') return (
    <MetaAds
      onBack={() => { setView('home'); load() }}
      onNewAd={() => setView('meta-builder')}
      onManageConnection={() => setView('meta-connect')}
    />
  )
  if (view === 'meta-builder') return (
    <MetaAdBuilder
      onBack={() => setView('meta-ads')}
      onDone={() => setView('meta-ads')}
    />
  )
  if (view === 'whatsapp-connect') return (
    <WhatsAppConnect
      onBack={() => { setView('home'); load() }}
      onConnected={() => setWhatsappConnected(true)}
      onConfigureBot={() => setView('whatsapp-bot')}
    />
  )
  if (view === 'whatsapp-bot') return (
    <WhatsAppBot onBack={() => setView('whatsapp-connect')} />
  )

  const text=isDark?'#f1f5f9':'#0f172a', textSub=isDark?'#94a3b8':'#64748b', textMuted=isDark?'#475569':'#94a3b8'
  const border=isDark?'rgba(255,255,255,0.08)':'#e2e8f0', cardBg=isDark?'#1e293b':'#ffffff'
  const subBg=isDark?'rgba(255,255,255,0.04)':'#f8fafc'

  const statusPill = (st, key) => {
    if (key === 'meta' && metaConnected) return <span style={{ fontSize:10, fontWeight:700, color:'#0f6e56', background:isDark?'rgba(34,197,94,0.15)':'#e1f5ee', padding:'3px 9px', borderRadius:99 }}>CONNECTED</span>
    if (key === 'whatsapp' && whatsappConnected) return <span style={{ fontSize:10, fontWeight:700, color:'#0f6e56', background:isDark?'rgba(34,197,94,0.15)':'#e1f5ee', padding:'3px 9px', borderRadius:99 }}>CONNECTED</span>
    const map = {
      active:  { t:'Active',        c:'#0f6e56', b:isDark?'rgba(34,197,94,0.15)':'#e1f5ee' },
      connect: { t:'Not connected', c:textSub,   b:subBg },
      soon:    { t:'Soon',          c:textSub,   b:subBg },
    }
    const s = map[st] || map.soon
    return <span style={{ fontSize:10, fontWeight:700, color:s.c, background:s.b, padding:'3px 9px', borderRadius:99 }}>{s.t.toUpperCase()}</span>
  }

  const dirty = minValue !== savedMin
  const activeCount = 2 + (metaConnected ? 1 : 0)

  if (loading) return (
    <div style={{ textAlign:'center', padding:50 }}>
      <div style={{ width:34, height:34, border:'3px solid #0099cc', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div>
      {/* Title + description now live in the global OS hero. Primary status pill is
          teleported into the hero's actions slot. */}
      <HeroActions>
        <div style={{ display:'flex', gap:8, alignItems:'center', background:subBg, padding:'7px 12px', borderRadius:8 }}>
          <i className="ti ti-bolt" style={{ fontSize:16, color:'#d97706' }}/>
          <span style={{ fontSize:12, color:textSub }}>{activeCount} active sources</span>
        </div>
      </HeroActions>

      {/* Source cards */}
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:textMuted, marginBottom:10 }}>Lead sources</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))', gap:12, marginBottom:22 }}>
        {SOURCES.map(s => {
          const highlight = s.key === 'meta'
          const metaOn = s.key === 'meta' && metaConnected
          const waOn = s.key === 'whatsapp' && whatsappConnected
          return (
            <div key={s.key} style={{ background:cardBg, border:`${highlight?2:1}px solid ${highlight?'#0099cc':border}`, borderRadius:14, padding:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:10 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:subBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize:20, color: highlight?'#0099cc': s.status==='active'?'#0f6e56':textSub }}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:text }}>{s.name}</div>
                  <div style={{ fontSize:11, color:textMuted }}>{s.sub}</div>
                </div>
                {statusPill(s.status, s.key)}
              </div>
              <div style={{ fontSize:12, color:textSub, lineHeight:1.6, marginBottom:12, minHeight:38 }}>{s.desc}</div>
              <button onClick={()=>handleSource(s)} disabled={s.status==='soon'}
                style={{ width:'100%', padding:'9px', borderRadius:9, fontSize:13, fontWeight:600, cursor: s.status==='soon'?'not-allowed':'pointer',
                  border: highlight?'none':`1px solid ${border}`,
                  background: highlight?'#0099cc': s.status==='soon'?subBg:cardBg,
                  color: highlight?'#fff': s.status==='soon'?textMuted:text,
                  opacity: s.status==='soon'?0.7:1 }}>
                {highlight && <i className={`ti ${metaOn?'ti-settings':'ti-plug'}`} style={{ fontSize:14, verticalAlign:'-2px', marginRight:5 }}/>}
                {metaOn ? 'Open Ads Manager' : waOn ? 'Manage WhatsApp' : s.action}
              </button>
            </div>
          )
        })}
      </div>

      {/* Minimum job value */}
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:textMuted, marginBottom:10 }}>Lead intake settings</div>
      <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:14, padding:16, marginBottom:22 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ width:40, height:40, borderRadius:10, background:isDark?'rgba(232,184,75,0.12)':'#fffbeb', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <i className="ti ti-coin" style={{ fontSize:20, color:'#d97706' }}/>
          </div>
          <div style={{ flex:1, minWidth:160 }}>
            <div style={{ fontSize:14, fontWeight:600, color:text }}>Minimum job value</div>
            <div style={{ fontSize:12, color:textSub }}>Don't receive leads below this budget. Set 0 to accept all.</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:13, color:textMuted }}>AED</span>
            <input type="number" value={minValue} onChange={e=>setMinValue(e.target.value)} placeholder="0"
              style={{ width:120, padding:'9px 11px', border:`1px solid ${border}`, borderRadius:8, fontSize:13, background:isDark?'#0f172a':'#fff', color:text, outline:'none' }}/>
            <button onClick={saveMin} disabled={!dirty || saving}
              style={{ padding:'9px 16px', borderRadius:8, border:'none', fontSize:13, fontWeight:600,
                background: dirty?'#0099cc':subBg, color: dirty?'#fff':textMuted, cursor: dirty?'pointer':'default' }}>
              {saving?'Saving...':'Save'}
            </button>
          </div>
        </div>
        <div style={{ fontSize:11, color:textMuted, marginTop:10, display:'flex', alignItems:'center', gap:5 }}>
          <i className="ti ti-info-circle" style={{ fontSize:13 }}/>
          Applies when the admin distribution rule for minimum value is enabled. Leads with unknown budget are not blocked.
        </div>
      </div>

      {/* Smart Ad Builder teaser (only when Meta not connected) */}
      {!metaConnected && (
        <div style={{ background:subBg, borderRadius:14, padding:18 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <i className="ti ti-wand" style={{ fontSize:18, color:'#0099cc' }}/>
            <span style={{ fontSize:14, fontWeight:600, color:text }}>Connect Meta: Smart Ad Builder</span>
          </div>
          <div style={{ fontSize:12, color:textSub, lineHeight:1.7, marginBottom:12 }}>
            Once Meta is connected, design a high-converting lead ad in guided steps — audience, budget, creative &amp; lead form. Enable/disable any ad, watch live CPL, and let auto-rules pause weak ads &amp; scale winners.
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {['Guided ad builder','Enable / disable ads','Live CPL analytics','Auto-optimize rules'].map(t => (
              <span key={t} style={{ fontSize:11, background:cardBg, border:`1px solid ${border}`, padding:'5px 11px', borderRadius:99, color:textSub }}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
