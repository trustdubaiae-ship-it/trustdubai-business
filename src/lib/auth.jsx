// trustdubai-business/src/lib/auth.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [staff, setStaff] = useState(null)
  const [role, setRole] = useState(null)
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
      else { setCompany(null); setStaff(null); setRole(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])
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
        return
      }
      // 2) STAFF check — secure function se (RLS-safe, apna invite khud claim)
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
        return
      }
      // 3) kuch nahi mila
      setCompany(null)
      setStaff(null)
      setRole(null)
    } catch (e) {
      console.error('resolveAccess error:', e)
      setCompany(null)
      setStaff(null)
      setRole(null)
    } finally {
      setLoading(false)
    }
  }
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`
      }
    })
    if (error) throw error
  }
  async function signOut() {
    await supabase.auth.signOut()
  }
  async function refreshCompany() {
    if (user) await resolveAccess(user)
  }
  return (
    <AuthContext.Provider value={{ user, company, staff, role, loading, signInWithGoogle, signOut, refreshCompany }}>
      {children}
    </AuthContext.Provider>
  )
}
export function useAuth() {
  return useContext(AuthContext)
}
