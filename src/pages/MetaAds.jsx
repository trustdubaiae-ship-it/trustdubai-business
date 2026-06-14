import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const DEMO_ADS = [
  { name:'Kitchen Reno — Dubai',      status:'active', daily_budget:80,  spend:1480, leads:82, clicks:2600, impressions:84000, conversions:11 },
  { name:'Full Home Interior — Palm', status:'active', daily_budget:120, spend:1610, leads:61, clicks:2350, impressions:90000, conversions:8  },
  { name:'Bathroom Upgrade — JVC',    status:'active', daily_budget:70,  spend:980,  leads:23, clicks:1300, impressions:72000, conversions:3  },
  { name:'TV Wall — Marina',          status:'active', daily_budget:60,  spend:730,  leads:9,  clicks:640,  impressions:71000, conversions:1  },
  { name:'Office Fit-out — Business Bay', status:'paused', daily_budget:50, spend:0, leads:0, clicks:0, impressions:0, conversions:0 },
]

export default function MetaAds({ onBack, onNewAd, onManageConnection }) {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [, forceUpdate] = useState(0)

  const [conn, setConn]     = useState(null)
  const [ads, setAds]       = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [targetCpl, setTargetCpl] = useState(30)
  const [savingTarget, setSavingTarget] = useState(false)

  useEffect(() => {
    if (company?.id) load()
    const ob = new MutationObserver(() => forceUpdate(n => n + 1))
    ob.observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] })
    return () => ob.disconnect()
  }, [company?.id])

  async function load() {
    setLoading(true)
    const { data: c } = await supabase.from('meta_connections').select('*').eq('company_id', company.id).maybeSingle()
    setConn(c || null)
    setTargetCpl(c?.target_cpl || 30)

    let { data: rows } = await supabase.from('meta_campaigns').select('*').eq('company_id', company.id).order('created_at', { ascending:true })
    // First time: seed demo ads so the manager isn't empty
    if ((!rows || rows.length === 0) && c?.connected) {
      const seed = DEMO_ADS.map(a => ({ ...a, company_id: company.id }))
      await supabase.from('meta_campaigns').insert(seed)
      const r2 = await supabase.from('meta_campaigns').select('*').eq('company_id', company.id).order('created_at', { ascending:true })
      rows = r2.data
    }
    setAds(rows || [])
    setLoading(false)
  }

  async function saveTarget() {
    if (!conn) return
    setSavingTarget(true)
    const { error } = await supabase.from('meta_connections').update({ target_cpl: Number(targetCpl)||0 }).eq('id', conn.id)
    setSavingTarget(false)
    if (error) { toast.error('Failed'); return }
    toast.success('Target CPL saved ✓')
    setConn({ ...conn, target_cpl: Number(targetCpl)||0 })
  }

  async function toggleStatus(ad) {
    const next = ad.status === 'active' ? 'paused' : 'active'
    setBusyId(ad.id)
    const { error } = await supabase.from('meta_campaigns').update({ status: next, updated_at:new Date().toISOString() }).eq('id', ad.id)
    setBusyId(null)
    if (error) { toast.error('Failed'); return }
    setAds(prev => prev.map(x => x.id===ad.id ? { ...x, status:next } : x))
    toast.success(next === 'active' ? 'Ad resumed' : 'Ad paused')
  }

  async function bumpBudget(ad) {
    const next = Math.round((Number(ad.daily_budget)||0) * 1.2)
    setBusyId(ad.id)
    const { error } = await supabase.from('meta_campaigns').update({ daily_budget: next, updated_at:new Date().toISOString() }).eq('id', ad.id)
    setBusyId(null)
    if (error) { toast.error('Failed'); return }
    setAds(prev => prev.map(x => x.id===ad.id ? { ...x, daily_budget:next } : x))
    toast.success(`Budget increased to AED ${next}/day`)
  }

  const text=isDark?'#f1f5f9':'#0f172a', textSub=isDark?'#94a3b8':'#64748b', textMuted=isDark?'#475569':'#94a3b8'
  const border=isDark?'rgba(255,255,255,0.08)':'#e2e8f0', cardBg=isDark?'#1e293b':'#ffffff'
  const subBg=isDark?'rgba(255,255,255,0.05)':'#f1f5f9'
  const subBorder=isDark?'rgba(255,255,255,0.07)':'#e2e8f0'
  const green='#0f6e56', greenBg=isDark?'rgba(34,197,94,0.15)':'#e1f5ee'
  const amber='#d97706', amberBg=isDark?'rgba(245,158,11,0.15)':'#fef9ed'
  const red='#dc2626',   redBg=isDark?'rgba(220,38,38,0.15)':'#fee2e2'

  function cpl(ad){ return ad.leads>0 ? Math.round(ad.spend/ad.leads) : 0 }

  // verdict per ad
  function verdict(ad){
    if (ad.status==='paused') return { key:'paused', label:'Paused', c:textSub, bg:subBg, bar:border }
    const c = cpl(ad)
    const t = Number(targetCpl)||30
    if (ad.leads===0 && ad.spend>0) return { key:'stop', label:'Stop preferable', c:red, bg:redBg, bar:red }
    if (c===0) return { key:'watch', label:'Watch', c:amber, bg:amberBg, bar:amber }
    if (c <= t) return { key:'keep', label:'Keep running', c:green, bg:greenBg, bar:green }
    if (c <= t*1.5) return { key:'watch', label:'Watch', c:amber, bg:amberBg, bar:amber }
    return { key:'stop', label:'Stop preferable', c:red, bg:redBg, bar:red }
  }

  const activeAds = ads.filter(a => a.status!=='paused')
  const totalSpend = ads.reduce((s,a)=>s+(a.spend||0),0)
  const totalLeads = ads.reduce((s,a)=>s+(a.leads||0),0)
  const avgCpl = totalLeads>0 ? Math.round(totalSpend/totalLeads) : 0

  // best ad (lowest cpl among active with leads) + worst (highest cpl above target)
  const withCpl = activeAds.filter(a=>a.leads>0).map(a=>({ a, c:cpl(a) }))
  const best = withCpl.length ? withCpl.reduce((m,x)=> x.c<m.c?x:m).a : null
  const worst = withCpl.length ? withCpl.reduce((m,x)=> x.c>m.c?x:m).a : null
  const worstBad = worst && cpl(worst) > (Number(targetCpl)||30)*1.5

  if (loading) return (
    <div style={{ textAlign:'center', padding:50 }}>
      <div style={{ width:34, height:34, border:'3px solid #0099cc', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const WEBHOOK_URL = company?.lead_webhook_token ? `https://ribdorraxxhfbfkjhpie.supabase.co/functions/v1/incoming-lead?token=${company.lead_webhook_token}` : ''
  const copyWebhook = () => { if (!WEBHOOK_URL) return; if (navigator.clipboard?.writeText) navigator.clipboard.writeText(WEBHOOK_URL).then(()=>toast.success('Copied ✓')).catch(()=>{}); else window.prompt('Copy this URL:', WEBHOOK_URL) }

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <button onClick={onBack} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
        </button>
        <div style={{ width:38, height:38, borderRadius:9, background:isDark?'rgba(3,193,245,0.12)':'#e0f9ff', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <i className="ti ti-brand-meta" style={{ fontSize:21, color:'#0099cc' }}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <h1 style={{ fontSize:18, fontWeight:700, color:text, margin:0 }}>Ad Performance</h1>
          <div onClick={onManageConnection} style={{ fontSize:12, color:green, display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
            <i className="ti ti-circle-filled" style={{ fontSize:8 }}/> Connected · {ads.length} ads
          </div>
        </div>
        <button onClick={onNewAd} style={{ padding:'9px 16px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          <i className="ti ti-plus" style={{ fontSize:15, verticalAlign:'-2px', marginRight:4 }}/> New Ad
        </button>
      </div>

      {/* Lead auto-capture (Meta → Zapier per-company webhook) */}
      {WEBHOOK_URL && (
        <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <i className="ti ti-webhook" style={{ fontSize:17, color:'#0099cc' }}/>
            <div style={{ fontSize:14, fontWeight:700, color:text }}>Auto-Capture Leads</div>
          </div>
          <div style={{ fontSize:12, color:textSub, marginBottom:11, lineHeight:1.5 }}>Send your Meta Lead Ads here (via Zapier) — new leads land in My Leads automatically. This URL is private to your business.</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10 }}>
            <div style={{ flex:1, minWidth:0, fontFamily:'monospace', fontSize:11, color:text, background:subBg, border:`1px solid ${border}`, borderRadius:8, padding:'9px 11px', overflowX:'auto', whiteSpace:'nowrap' }}>{WEBHOOK_URL}</div>
            <button onClick={copyWebhook} style={{ flexShrink:0, padding:'9px 14px', borderRadius:8, border:'none', background:'#0099cc', color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>Copy</button>
          </div>
          <div style={{ fontSize:11, color:textSub, lineHeight:1.6 }}>
            <b>Zapier:</b> Meta Lead Ads (New Lead) → Webhooks by Zapier (POST) → paste this URL → send <code>name, phone, email, external_id</code> + form answers.
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10, marginBottom:14 }}>
        {[['Spend (30d)','AED '+totalSpend.toLocaleString('en-AE')],['Leads',totalLeads],['Avg CPL', avgCpl?'AED '+avgCpl:'—'],['Active', activeAds.length+' / '+ads.length]].map(([k,v])=>(
          <div key={k} style={{ background:subBg, border:`1px solid ${subBorder}`, borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:textSub }}>{k}</div>
            <div style={{ fontSize:19, fontWeight:700, color:text, marginTop:3 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Target CPL */}
      <div style={{ display:'flex', alignItems:'center', gap:12, background:cardBg, border:`1px solid ${border}`, borderRadius:10, padding:'11px 14px', marginBottom:14, flexWrap:'wrap' }}>
        <i className="ti ti-target" style={{ fontSize:18, color:'#0099cc' }}/>
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontSize:13, fontWeight:600, color:text }}>Target cost per lead</div>
          <div style={{ fontSize:11, color:textMuted }}>Ads are graded against this. Above 1.5× → stop suggested.</div>
        </div>
        <span style={{ fontSize:13, color:textMuted }}>AED</span>
        <input type="number" value={targetCpl} onChange={e=>setTargetCpl(e.target.value)}
          style={{ width:80, padding:'8px 10px', border:`1px solid ${border}`, borderRadius:8, fontSize:13, background:isDark?'#0f172a':'#fff', color:text, outline:'none' }}/>
        <button onClick={saveTarget} disabled={savingTarget} style={{ padding:'8px 14px', borderRadius:8, border:'none', background:'#0099cc', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          {savingTarget?'...':'Save'}
        </button>
      </div>

      {/* Recommendation */}
      {worstBad && best && worst.id !== best.id && (
        <div style={{ background:isDark?'rgba(3,193,245,0.1)':'#e0f9ff', border:`1px solid ${isDark?'rgba(3,193,245,0.25)':'#b3e5fc'}`, borderRadius:12, padding:'13px 15px', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <i className="ti ti-bulb" style={{ fontSize:17, color:'#0077a3' }}/>
            <span style={{ fontSize:13, fontWeight:700, color:'#0077a3' }}>Recommendation</span>
          </div>
          <div style={{ fontSize:12, color:'#0077a3', lineHeight:1.6 }}>
            Pause <b>{worst.name}</b> (CPL AED {cpl(worst)}, above target). Move its budget to <b>{best.name}</b> — your best ad at AED {cpl(best)} per lead.
          </div>
        </div>
      )}

      {/* Ads list */}
      <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:textMuted, marginBottom:10 }}>Your ads · graded</div>

      {ads.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', background:cardBg, border:`1px solid ${border}`, borderRadius:14 }}>
          <i className="ti ti-ad-2" style={{ fontSize:30, color:textMuted }}/>
          <h3 style={{ fontSize:15, fontWeight:700, color:text, margin:'10px 0 5px' }}>No ads yet</h3>
          <p style={{ fontSize:13, color:textSub, margin:'0 0 16px' }}>Create your first lead ad to start getting leads.</p>
          <button onClick={onNewAd} style={{ padding:'10px 18px', borderRadius:9, border:'none', background:'#0099cc', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>+ New Ad</button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {ads.map(ad => {
            const v = verdict(ad)
            const isBest = best && ad.id===best.id && ad.status!=='paused'
            const c = cpl(ad)
            const t = Number(targetCpl)||30
            const paused = ad.status==='paused'
            return (
              <div key={ad.id} style={{ background:cardBg, border:`1px solid ${v.key==='stop'?'#fca5a5':border}`, borderLeft:`3px solid ${v.bar}`, borderRadius:10, padding:'13px 15px', opacity: paused?0.8:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: paused?0:11, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                      <span style={{ fontSize:14, fontWeight:600, color:text }}>{ad.name}</span>
                      {isBest && <span style={{ fontSize:10, fontWeight:700, background:greenBg, color:green, padding:'2px 8px', borderRadius:99 }}><i className="ti ti-star" style={{ fontSize:11, verticalAlign:'-1px' }}/> Top performer</span>}
                      {v.key==='stop' && !paused && <span style={{ fontSize:10, color:red }}><i className="ti ti-alert-triangle" style={{ fontSize:11, verticalAlign:'-1px' }}/> CPL {c>0?(c/t).toFixed(1)+'× target':'no leads'}</span>}
                    </div>
                    <div style={{ fontSize:11, color:textMuted, marginTop:2 }}>Daily AED {ad.daily_budget} · {paused?'Paused':'Running'}</div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:600, background:v.bg, color:v.c, padding:'4px 11px', borderRadius:99 }}>{v.label}</span>
                </div>

                {!paused && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(90px, 1fr))', gap:8, marginBottom:11 }}>
                    {[['Spend',ad.spend.toLocaleString('en-AE')],['Leads',ad.leads],['CPL',c?'AED '+c:'—'],['CTR',ad.impressions>0?((ad.clicks/ad.impressions)*100).toFixed(1)+'%':'—'],['Conv',ad.conversions]].map(([k,val],i)=>(
                      <div key={k} style={{ background:subBg, border:`1px solid ${subBorder}`, borderRadius:8, padding:'8px 10px' }}>
                        <div style={{ fontSize:10, color:textMuted }}>{k}</div>
                        <div style={{ fontSize:13, fontWeight:600, color: k==='CPL'?v.c:text, marginTop:2 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
                  {paused ? (
                    <button onClick={()=>toggleStatus(ad)} disabled={busyId===ad.id} style={{ flex:1, minWidth:120, justifyContent:'center', padding:'8px', borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      <i className="ti ti-player-play" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Resume
                    </button>
                  ) : v.key==='stop' ? (
                    <button onClick={()=>toggleStatus(ad)} disabled={busyId===ad.id} style={{ flex:1, minWidth:120, justifyContent:'center', padding:'8px', borderRadius:8, border:`1px solid #fca5a5`, background:redBg, color:red, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      <i className="ti ti-player-pause" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Pause now
                    </button>
                  ) : (
                    <button onClick={()=>bumpBudget(ad)} disabled={busyId===ad.id} style={{ flex:1, minWidth:120, justifyContent:'center', padding:'8px', borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      <i className="ti ti-trending-up" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Increase budget
                    </button>
                  )}
                  {!paused && v.key!=='stop' && (
                    <button onClick={()=>toggleStatus(ad)} disabled={busyId===ad.id} style={{ padding:'8px 14px', borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      Pause
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop:14, fontSize:11, color:textMuted, display:'flex', alignItems:'center', gap:5 }}>
        <i className="ti ti-info-circle" style={{ fontSize:13 }}/>
        Demo data. Live spend &amp; leads sync once Meta API access is approved.
      </div>
    </div>
  )
}
