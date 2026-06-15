// tritova-business/src/components/PolicyAgree.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BRAND = '#0099cc'

export default function PolicyAgree({ checked, onChange, context = 'submitting this form' }) {
  const [open, setOpen] = useState(false)
  const [terms, setTerms] = useState([])
  const [loading, setLoading] = useState(false)

  async function openPolicy() {
    setOpen(true)
    if (terms.length === 0) {
      setLoading(true)
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'trustdubai.policy').maybeSingle()
      setTerms(data?.value?.terms || [])
      setLoading(false)
    }
  }

  return (
    <>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
          style={{ accentColor: BRAND, width: 16, height: 16, marginTop: 1, flexShrink: 0 }} />
        <span>
          I confirm all information and documents are genuine, and I agree with the{' '}
          <span onClick={(e) => { e.preventDefault(); openPolicy() }} style={{ color: BRAND, fontWeight: 700, textDecoration: 'underline' }}>
            Quvera Policy
          </span>.
        </span>
      </label>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '85vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Quvera Policy</h3>
              <button onClick={() => setOpen(false)} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: 'var(--bg2)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 17 }}>✕</button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0, marginBottom: 18 }}>Terms & Verification Policy</p>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 30 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
            ) : terms.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No policy terms available.</p>
            ) : (
              terms.map((t, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: BRAND, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{t.title}</span>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 0 30px' }}>{t.text}</p>
                </div>
              ))
            )}

            <button onClick={() => setOpen(false)} style={{ width: '100%', marginTop: 8, padding: 12, background: BRAND, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
