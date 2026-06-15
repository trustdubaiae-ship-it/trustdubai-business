// tritova-business/src/components/UpgradeLockModal.jsx
export default function UpgradeLockModal({ open, featureName, currentPlan, onClose, onUpgrade }) {
  if (!open) return null
  const planLabel = (currentPlan || 'free').charAt(0).toUpperCase() + (currentPlan || 'free').slice(1)

  return (
    <div onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:380, padding:'30px 26px', textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ width:64, height:64, borderRadius:16, background:'rgba(232,184,75,0.12)', border:'1px solid rgba(232,184,75,0.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:30 }}>🔒</div>
        <h3 style={{ fontSize:18, fontWeight:700, color:'#0f172a', marginBottom:8, fontFamily:"'Syne',sans-serif" }}>
          Feature Locked
        </h3>
        <p style={{ fontSize:13.5, color:'#64748b', lineHeight:1.6, marginBottom:6 }}>
          <b style={{ color:'#0f172a' }}>{featureName || 'This feature'}</b> is not available on your current <b style={{ color:'#d97706' }}>{planLabel}</b> plan.
        </p>
        <p style={{ fontSize:13, color:'#64748b', lineHeight:1.6, marginBottom:22 }}>
          Upgrade your plan to unlock this feature and grow your business on Quvera.
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button onClick={onUpgrade}
            style={{ padding:'12px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#e8b84b,#c9952a)', color:'#0d1117', fontWeight:700, fontSize:14, cursor:'pointer' }}>
            ⭐ Upgrade Plan
          </button>
          <button onClick={onClose}
            style={{ padding:'11px', borderRadius:10, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  )
}
