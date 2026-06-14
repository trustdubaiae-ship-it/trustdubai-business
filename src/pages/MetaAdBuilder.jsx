import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

const STEPS = ['Objective', 'Audience', 'Budget', 'Creative', 'Lead form', 'Review']
const OBJECTIVES = [
  { key:'lead_generation', icon:'ti-user-plus', label:'Lead generation', desc:'Collect name & phone via instant form (recommended)' },
  { key:'traffic',         icon:'ti-click',     label:'Traffic',          desc:'Send people to your profile or website' },
  { key:'awareness',       icon:'ti-eye',       label:'Awareness',        desc:'Show your brand to as many people as possible' },
]
const DUBAI_AREAS = ['All Dubai','Downtown','Marina','Palm Jumeirah','JVC','Business Bay','Arabian Ranches','Dubai Hills','Jumeirah','Deira']
const INTERESTS = ['Home renovation','Interior design','New home','Real estate','Luxury living','Home improvement','Furniture']
const CTAS = ['Book Now','Get Quote','Learn More','Sign Up','Contact Us']
const FORM_FIELDS = ['Full name','Phone number','Email','Budget','Area','Project type']

export default function MetaAdBuilder({ onBack, onDone }) {
  const { company } = useAuth()
  const toast = useToast()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const [, forceUpdate] = useState(0)

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [objective, setObjective] = useState('lead_generation')
  const [areas, setAreas]   = useState(['All Dubai'])
  const [ageMin, setAgeMin] = useState(28)
  const [ageMax, setAgeMax] = useState(55)
  const [gender, setGender] = useState('all')
  const [interests, setInterests] = useState(['Home renovation','Interior design'])
  const [budget, setBudget] = useState(80)
  const [name, setName]     = useState('')
  const [headline, setHeadline] = useState('Free Interior Design Consultation')
  const [primaryText, setPrimaryText] = useState("Transform your home with Dubai's trusted fit-out experts. 10+ years, in-house team, free design. Book your free site visit today!")
  const [cta, setCta]       = useState('Book Now')
  const [formFields, setFormFields] = useState(['Full name','Phone number','Budget'])

  useEffect(() => {
    const ob = new MutationObserver(() => forceUpdate(n => n + 1))
    ob.observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] })
    return () => ob.disconnect()
  }, [])

  const text=isDark?'#f1f5f9':'#0f172a', textSub=isDark?'#94a3b8':'#64748b', textMuted=isDark?'#475569':'#94a3b8'
  const border=isDark?'rgba(255,255,255,0.08)':'#e2e8f0', cardBg=isDark?'#1e293b':'#ffffff'
  const subBg=isDark?'rgba(255,255,255,0.04)':'#f8fafc', inputBg=isDark?'#0f172a':'#fff'
  const accent='#0099cc', accentBg=isDark?'rgba(3,193,245,0.12)':'#e0f9ff'
  const inputStyle = { width:'100%', padding:'9px 11px', border:`1px solid ${border}`, borderRadius:8, fontSize:13, background:inputBg, color:text, outline:'none' }

  function toggleIn(arr, set, val) { set(arr.includes(val) ? arr.filter(x=>x!==val) : [...arr, val]) }

  // est CPL rough demo calc
  const estLeadsLow = Math.max(1, Math.round(budget/28))
  const estLeadsHigh = Math.max(2, Math.round(budget/16))

  async function launch(asDraft) {
    if (!name.trim()) { toast.error('Give your ad a name'); setStep(0); return }
    setSaving(true)
    const payload = {
      company_id: company.id,
      name: name.trim(),
      objective,
      status: asDraft ? 'draft' : 'active',
      daily_budget: Number(budget)||0,
      audience: { areas, ageMin, ageMax, gender, interests },
      creative: { headline, primaryText, cta },
      lead_form: { fields: formFields },
      spend:0, leads:0, clicks:0, impressions:0, conversions:0,
    }
    const { error } = await supabase.from('meta_campaigns').insert(payload)
    setSaving(false)
    if (error) { toast.error('Save failed: ' + error.message); return }
    toast.success(asDraft ? 'Ad saved as draft ✓' : 'Ad launched ✓')
    if (onDone) onDone()
  }

  function next() { if (step < STEPS.length-1) setStep(step+1) }
  function back() { if (step > 0) setStep(step-1); else onBack() }

  const pct = Math.round(((step+1)/STEPS.length)*100)

  return (
    <div style={{ maxWidth:680, width:'100%', margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <button onClick={back} style={{ width:34, height:34, borderRadius:8, border:`1px solid ${border}`, background:cardBg, color:textSub, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <i className="ti ti-arrow-left" style={{ fontSize:16 }}/>
        </button>
        <div style={{ flex:1 }}>
          <h1 style={{ fontSize:18, fontWeight:700, color:text, margin:0 }}>Create Lead Ad</h1>
          <div style={{ fontSize:12, color:textMuted }}>Step {step+1} of {STEPS.length} · {STEPS[step]}</div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ height:6, background:subBg, borderRadius:99, overflow:'hidden', marginBottom:18 }}>
        <div style={{ height:'100%', width:pct+'%', background:accent, borderRadius:99, transition:'width .3s' }}/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:18 }}>
        <div style={{ background:cardBg, border:`1px solid ${border}`, borderRadius:14, padding:18 }}>

          {/* STEP 0 — Objective */}
          {step===0 && (
            <>
              <div style={{ fontSize:15, fontWeight:700, color:text, marginBottom:4 }}>What's your goal?</div>
              <div style={{ fontSize:12, color:textSub, marginBottom:14 }}>For getting client enquiries, lead generation works best.</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {OBJECTIVES.map(o => (
                  <div key={o.key} onClick={()=>setObjective(o.key)}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 14px', border:`1.5px solid ${objective===o.key?accent:border}`, borderRadius:10, cursor:'pointer', background: objective===o.key?accentBg:'transparent' }}>
                    <i className={`ti ${o.icon}`} style={{ fontSize:22, color: objective===o.key?accent:textSub }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:text }}>{o.label}</div>
                      <div style={{ fontSize:12, color:textSub }}>{o.desc}</div>
                    </div>
                    {objective===o.key && <i className="ti ti-circle-check" style={{ fontSize:20, color:accent }}/>}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* STEP 1 — Audience */}
          {step===1 && (
            <>
              <div style={{ fontSize:15, fontWeight:700, color:text, marginBottom:14 }}>Who should see this ad?</div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:6 }}>Location (Dubai)</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:16 }}>
                {DUBAI_AREAS.map(a => (
                  <button key={a} onClick={()=>toggleIn(areas,setAreas,a)}
                    style={{ fontSize:12, padding:'6px 12px', borderRadius:99, cursor:'pointer', border:`1px solid ${areas.includes(a)?accent:border}`, background: areas.includes(a)?accentBg:'transparent', color: areas.includes(a)?accent:textSub }}>{a}</button>
                ))}
              </div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:6 }}>Age range</label>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <input type="number" value={ageMin} onChange={e=>setAgeMin(e.target.value)} style={{ ...inputStyle, width:80 }}/>
                <span style={{ color:textMuted }}>to</span>
                <input type="number" value={ageMax} onChange={e=>setAgeMax(e.target.value)} style={{ ...inputStyle, width:80 }}/>
              </div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:6 }}>Gender</label>
              <div style={{ display:'flex', gap:7, marginBottom:16 }}>
                {['all','male','female'].map(g => (
                  <button key={g} onClick={()=>setGender(g)}
                    style={{ flex:1, fontSize:12, padding:'8px', borderRadius:8, cursor:'pointer', textTransform:'capitalize', border:`1px solid ${gender===g?accent:border}`, background: gender===g?accentBg:'transparent', color: gender===g?accent:textSub }}>{g}</button>
                ))}
              </div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:6 }}>Interests</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
                {INTERESTS.map(it => (
                  <button key={it} onClick={()=>toggleIn(interests,setInterests,it)}
                    style={{ fontSize:12, padding:'6px 12px', borderRadius:99, cursor:'pointer', border:`1px solid ${interests.includes(it)?accent:border}`, background: interests.includes(it)?accentBg:'transparent', color: interests.includes(it)?accent:textSub }}>{it}</button>
                ))}
              </div>
            </>
          )}

          {/* STEP 2 — Budget */}
          {step===2 && (
            <>
              <div style={{ fontSize:15, fontWeight:700, color:text, marginBottom:14 }}>Daily budget</div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:6 }}>How much to spend per day?</label>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:14, color:textMuted }}>AED</span>
                <input type="number" value={budget} onChange={e=>setBudget(e.target.value)} style={{ ...inputStyle, width:130, fontSize:16, fontWeight:700 }}/>
                <span style={{ fontSize:13, color:textMuted }}>/ day</span>
              </div>
              <div style={{ display:'flex', gap:7, marginBottom:16, flexWrap:'wrap' }}>
                {[50,80,120,200].map(b => (
                  <button key={b} onClick={()=>setBudget(b)} style={{ fontSize:12, padding:'6px 14px', borderRadius:99, cursor:'pointer', border:`1px solid ${Number(budget)===b?accent:border}`, background:Number(budget)===b?accentBg:'transparent', color:Number(budget)===b?accent:textSub }}>AED {b}</button>
                ))}
              </div>
              <div style={{ background:subBg, borderRadius:10, padding:'13px 15px' }}>
                <div style={{ fontSize:12, color:textSub, marginBottom:6 }}>Estimated per day</div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'2px 0' }}><span style={{ color:textMuted }}>Reach</span><span style={{ fontWeight:600, color:text }}>{(budget*30).toLocaleString('en-AE')}–{(budget*80).toLocaleString('en-AE')}</span></div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'2px 0' }}><span style={{ color:textMuted }}>Leads</span><span style={{ fontWeight:600, color:text }}>{estLeadsLow}–{estLeadsHigh}</span></div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'2px 0' }}><span style={{ color:textMuted }}>Est. CPL</span><span style={{ fontWeight:600, color:'#0f6e56' }}>AED 16–28</span></div>
              </div>
            </>
          )}

          {/* STEP 3 — Creative */}
          {step===3 && (
            <>
              <div style={{ fontSize:15, fontWeight:700, color:text, marginBottom:14 }}>Ad creative</div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:5 }}>Image / video</label>
              <div style={{ border:`1px dashed ${border}`, borderRadius:8, padding:20, textAlign:'center', marginBottom:14 }}>
                <i className="ti ti-photo-up" style={{ fontSize:26, color:textMuted }}/>
                <div style={{ fontSize:12, color:textSub, marginTop:6 }}>Upload image (1080×1080) — coming with Meta connect</div>
              </div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:5 }}>Headline</label>
              <input value={headline} onChange={e=>setHeadline(e.target.value)} style={{ ...inputStyle, marginBottom:12 }}/>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:5 }}>Primary text</label>
              <textarea value={primaryText} onChange={e=>setPrimaryText(e.target.value)} style={{ ...inputStyle, minHeight:70, resize:'vertical', marginBottom:6 }}/>
              <div style={{ fontSize:11, color:'#0f6e56', marginBottom:14 }}><i className="ti ti-bulb" style={{ fontSize:13, verticalAlign:'-2px' }}/> Tip: Lead with the free offer — boosts response for fit-out ads.</div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:5 }}>Call to action</label>
              <select value={cta} onChange={e=>setCta(e.target.value)} style={inputStyle}>
                {CTAS.map(c => <option key={c} value={c} style={{ background:inputBg, color:text }}>{c}</option>)}
              </select>
            </>
          )}

          {/* STEP 4 — Lead form */}
          {step===4 && (
            <>
              <div style={{ fontSize:15, fontWeight:700, color:text, marginBottom:4 }}>Lead form fields</div>
              <div style={{ fontSize:12, color:textSub, marginBottom:14 }}>What info to collect? Fewer fields = more leads.</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {FORM_FIELDS.map(f => {
                  const on = formFields.includes(f)
                  const locked = f==='Full name' || f==='Phone number'
                  return (
                    <label key={f} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:`1px solid ${on?accent:border}`, borderRadius:8, cursor: locked?'default':'pointer', background: on?accentBg:'transparent' }}>
                      <input type="checkbox" checked={on} disabled={locked} onChange={()=>!locked && toggleIn(formFields,setFormFields,f)} style={{ width:'auto' }}/>
                      <span style={{ fontSize:13, color:text, flex:1 }}>{f}</span>
                      {locked && <span style={{ fontSize:10, color:textMuted }}>Required</span>}
                    </label>
                  )
                })}
              </div>
            </>
          )}

          {/* STEP 5 — Review */}
          {step===5 && (
            <>
              <div style={{ fontSize:15, fontWeight:700, color:text, marginBottom:14 }}>Review & launch</div>
              <label style={{ fontSize:12, color:textSub, display:'block', marginBottom:5 }}>Ad name (internal)</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Kitchen Reno — Dubai" style={{ ...inputStyle, marginBottom:16 }}/>
              <div style={{ background:subBg, borderRadius:10, padding:'14px 15px' }}>
                {[
                  ['Objective', OBJECTIVES.find(o=>o.key===objective)?.label],
                  ['Location', areas.join(', ')],
                  ['Age', `${ageMin}–${ageMax} · ${gender}`],
                  ['Interests', interests.join(', ')||'—'],
                  ['Budget', `AED ${budget} / day`],
                  ['Headline', headline],
                  ['CTA', cta],
                  ['Form fields', formFields.join(', ')],
                ].map(([k,v]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'6px 0', fontSize:12.5, borderBottom:`1px solid ${border}` }}>
                    <span style={{ color:textMuted, flexShrink:0 }}>{k}</span>
                    <span style={{ color:text, fontWeight:600, textAlign:'right' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:12, fontSize:11, color:textMuted, display:'flex', alignItems:'center', gap:5 }}>
                <i className="ti ti-info-circle" style={{ fontSize:13 }}/>
                Saved to your account now. Publishes to Meta once API access is approved.
              </div>
            </>
          )}

        </div>
      </div>

      {/* Nav buttons */}
      <div style={{ display:'flex', gap:8, marginTop:16, flexWrap:'wrap' }}>
        <button onClick={back} style={{ flex:1, minWidth:100, padding:'12px', borderRadius:9, border:`1px solid ${border}`, background:'transparent', color:textSub, fontSize:13, fontWeight:600, cursor:'pointer' }}>
          <i className="ti ti-arrow-left" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> Back
        </button>
        {step < STEPS.length-1 ? (
          <button onClick={next} style={{ flex:2, minWidth:120, padding:'12px', borderRadius:9, border:'none', background:accent, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Next — {STEPS[step+1]} <i className="ti ti-arrow-right" style={{ fontSize:14, verticalAlign:'-2px', marginLeft:4 }}/>
          </button>
        ) : (
          <>
            <button onClick={()=>launch(true)} disabled={saving} style={{ flex:1, minWidth:120, padding:'12px', borderRadius:9, border:`1px solid ${border}`, background:cardBg, color:text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
              {saving?'...':'Save draft'}
            </button>
            <button onClick={()=>launch(false)} disabled={saving} style={{ flex:1, minWidth:120, padding:'12px', borderRadius:9, border:'none', background:accent, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              <i className="ti ti-rocket" style={{ fontSize:14, verticalAlign:'-2px', marginRight:4 }}/> {saving?'...':'Launch'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
