import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

export default function MetaConnect({ onBack, onConnected }) {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [, forceUpdate] = useState(0)

  const [conn, setConn]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    if (company?.id) load()
    const ob = new MutationObserver(() => forceUpdate(n => n + 1))
    ob.observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] })
    return () => ob.disconnect()
  }, [company?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('meta_connections').select('*').eq('company_id', company.id).maybeSingle()
    setConn(data || null); setLoading(false)
  }

  // DEMO connect — real Facebook OAuth Phase 2 me yahaan lagega
  async function connectMeta() {
    setBusy(true)
    const payload = {
      company_id: company.id,
      connected: true,
      ad_account_id: 'act_demo_' + company.id.slice(0,8),
      ad_account_name: (company.name || 'Business') + ' Ad Account',
      page_id: 'page_demo',
      page_name: company.name || 'Business Page',
      ig_username: '@' + (company.slug || 'business'),
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    let res
    if (conn) res = await supabase.from('meta_connections').update(payload).eq('id', conn.id)
    else      res = await supabase.from('meta_connections').insert(payload)
    setBusy(false)
    if (res.error) { toast.error('Connect failed: ' + res.error.message); return }
    toast.success('Meta account connected ✓')
    await load()
    if (onConnected) onConnected()
  }

  async function disconnect() {
    if (!conn) return
    if (!window.confirm('Disconnect Meta account? Your ads data stays saved.')) return
    setBusy(true)
    const { error } = await supabase.from('meta_connections').update({ connected:false, updated_at:new Date().toISOString() }).eq('id', conn.id)
    setBusy(false)
    if (error) { toast.error('Failed'); return }
    toast.success('Meta disconnected')
    load()
  }

  const text=isDark?'#f1f5f9':'#0f172a', textSub=isDark?'#94a3b8':'#64748b', textMuted=isDark?'#475569':'#94a3b8'
  const border=isDark?'rgba(255,255,255,0.08)':'#e2e8f0', cardBg=isDark?'#1e293b':'#ffffff'
  const subBg=isDark?'rgba(255,255,255,0.04)':'#f8fafc'

  if (loading) return (
    <div style={{ textAlign:'center', padding:50 }}>
      <div style={{ width:34, height:34, border:'3px solid #0099cc', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const isConnected = conn?.connected

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
        <button onClick={onBack} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
        </button>
        <div style={{ width:38, height:38, borderRadius:9, background:isDark?'rgba(3,193,245,0.12)':'#e0f9ff', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <i className="ti ti-brand-meta" style={{ fontSize:21, color:'#0099cc' }}/>
        </div>
        <div style={{ flex:1 }}>
          <h1 style={{ fontSize:18, fontWeight:700, color:text, margin:0 }}>Meta Ads</h1>
          <div style={{ fontSize:12, color:isConnected?'#0f6e56':textSub }}>
            {isConnected ? 'Connected' : 'Not connected'}
          </div>
        </div>
      </div>

      {isConnected ? (
        /* CONNECTED STATE */
        <>
          <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:14, padding:18, marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <div style={{ width:42, height:42, borderRadius:10, background:isDark?'rgba(34,197,94,0.15)':'#e1f5ee', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="ti ti-circle-check" style={{ fontSize:22, color:'#0f6e56' }}/>
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:text }}>Account connected</div>
                <div style={{ fontSize:12, color:textSub }}>You can now create and manage ads from here.</div>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:1, borderTop:`1px solid ${border}`, paddingTop:12 }}>
              {[
                ['Ad account', conn.ad_account_name],
                ['Facebook page', conn.page_name],
                ['Instagram', conn.ig_username],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'7px 0', fontSize:13 }}>
                  <span style={{ color:textSub, flexShrink:0 }}>{k}</span>
                  <span style={{ color:text, fontWeight:600, textAlign:'right', wordBreak:'break-word', minWidth:0 }}>{v||'—'}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button onClick={onConnected} style={{ flex:1, minWidth:180, padding:'12px', borderRadius:10, border:'none', background:'#0099cc', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }}>
              <i className="ti ti-arrow-right" style={{ fontSize:15, verticalAlign:'-2px', marginRight:5 }}/> Go to Ads Manager
            </button>
            <button onClick={disconnect} disabled={busy} style={{ padding:'12px 18px', borderRadius:10, border:`1px solid #fca5a5`, background:cardBg, color:'#dc2626', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              Disconnect
            </button>
          </div>

          <div style={{ marginTop:14, fontSize:11, color:textMuted, display:'flex', alignItems:'center', gap:5 }}>
            <i className="ti ti-info-circle" style={{ fontSize:13 }}/>
            Demo connection. Live Meta sign-in activates once API access is approved.
          </div>
        </>
      ) : (
        /* NOT CONNECTED STATE */
        <>
          <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:14, padding:'22px 20px', marginBottom:14, textAlign:'center' }}>
            <div style={{ width:60, height:60, borderRadius:16, background:isDark?'rgba(3,193,245,0.12)':'#e0f9ff', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <i className="ti ti-brand-meta" style={{ fontSize:30, color:'#0099cc' }}/>
            </div>
            <h2 style={{ fontSize:18, fontWeight:700, color:text, margin:'0 0 6px' }}>Connect your Meta account</h2>
            <p style={{ fontSize:13, color:textSub, margin:'0 0 20px', lineHeight:1.6, maxWidth:380, marginLeft:'auto', marginRight:'auto' }}>
              Link your Facebook &amp; Instagram ad account to design, launch and manage lead ads — all from your Tritova dashboard.
            </p>
            <button onClick={connectMeta} disabled={busy} style={{ padding:'13px 26px', borderRadius:10, border:'none', background:'#0099cc', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }}>
              <i className="ti ti-plug" style={{ fontSize:16, verticalAlign:'-2px', marginRight:6 }}/>
              {busy ? 'Connecting...' : 'Connect Meta Account'}
            </button>
          </div>

          {/* Steps */}
          <div style={{ background:subBg, borderRadius:14, padding:18 }}>
            <div style={{ fontSize:12, fontWeight:700, color:textSub, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:14 }}>How it works</div>
            {[
              ['ti-login', 'Sign in with Facebook', 'Securely authorize Tritova to manage ads on your behalf.'],
              ['ti-briefcase', 'Choose ad account & page', 'Pick which Meta ad account and Facebook/Instagram page to use.'],
              ['ti-wand', 'Build & launch ads', 'Create lead ads in guided steps and publish straight to Meta.'],
              ['ti-chart-line', 'Track & optimize', 'See live CPL, pause weak ads, scale the winners.'],
            ].map(([icon,title,desc], i) => (
              <div key={i} style={{ display:'flex', gap:12, marginBottom: i<3?16:0 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:cardBg, border:`1px solid ${border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <i className={`ti ${icon}`} style={{ fontSize:17, color:'#0099cc' }}/>
                </div>
                <div>
                  <div style={{ fontSize:13.5, fontWeight:600, color:text }}>{i+1}. {title}</div>
                  <div style={{ fontSize:12, color:textSub, lineHeight:1.5 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
