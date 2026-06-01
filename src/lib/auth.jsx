// trustdubai-business/src/lib/auth.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { hasFeature as _hasFeature, getLimit as _getLimit } from './permissions'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [staff, setStaff] = useState(null)
  const [role, setRole] = useState(null)
  const [planFeatures, setPlanFeatures] = useState(null) // { feature_key: {enabled, limit_value} }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) resolveAccess(session.user)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) resolveAccess(session.user)
      else { setCompany(null); setStaff(null); setRole(null); setPlanFeatures(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  // company ke plan ke features load
  async function loadPlanFeatures(planName) {
    const plan = (planName || 'free').toLowerCase()
    const { data } = await supabase
      .from('plan_features')
      .select('feature_key, enabled, limit_value')
      .eq('plan_name', plan)
    const map = {}
    ;(data || []).forEach(r => { map[r.feature_key] = { enabled: r.enabled, limit_value: r.limit_value } })
    setPlanFeatures(map)
  }

  // owner pehle, phir staff
  async function resolveAccess(authUser) {
    setLoading(true)
    const email = authUser.email
    try {
      // 1) OWNER check
      const { data: ownerCompany } = await supabase
        .from('companies')
        .select('*')
        .ilike('owner_email', email)
        .maybeSingle()
      if (ownerCompany) {
        setCompany(ownerCompany)
        setStaff(null)
        setRole('owner')
        await loadPlanFeatures(ownerCompany.plan)
        return
      }
      // 2) STAFF check
      const { data: staffRow, error: staffErr } = await supabase.rpc('claim_staff_invite')
      if (staffErr) console.error('claim_staff_invite error:', staffErr)
      if (staffRow && staffRow.id) {
        const { data: staffCompany } = await supabase
          .from('companies')
          .select('*')
          .eq('id', staffRow.company_id)
          .maybeSingle()
        setCompany(staffCompany || null)
        setStaff(staffRow)
        setRole(staffRow.role || 'staff')
        if (staffCompany) await loadPlanFeatures(staffCompany.plan)
        return
      }
      // 3) kuch nahi mila
      setCompany(null)
      setStaff(null)
      setRole(null)
      setPlanFeatures(null)
    } catch (e) {
      console.error('resolveAccess error:', e)
      setCompany(null)
      setStaff(null)
      setRole(null)
      setPlanFeatures(null)
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshCompany() {
    if (user) await resolveAccess(user)
  }

  // plan feature helpers (component se seedha use)
  function hasFeature(key) { return _hasFeature(planFeatures, key) }
  function getLimit(key)   { return _getLimit(planFeatures, key) }

  return (
    <AuthContext.Provider value={{ user, company, staff, role, planFeatures, loading, signInWithGoogle, signOut, refreshCompany, hasFeature, getLimit }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
