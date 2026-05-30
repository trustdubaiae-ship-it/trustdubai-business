// trustdubai-business/src/lib/auth.js
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [staff, setStaff] = useState(null)   // staff record (null = owner ya no access)
  const [role, setRole] = useState(null)     // 'owner' | 'manager' | 'sales' | 'engineer' | 'staff'
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

      // 2) STAFF check
      const { data: staffRow } = await supabase
        .from('business_staff')
        .select('*')
        .ilike('email', email)
        .eq('active', true)
        .maybeSingle()

      if (staffRow) {
        // pehli baar login -> invite ko active karo + user_id link (3c core)
        if (staffRow.status === 'invited' || !staffRow.user_id) {
          const { data: updated } = await supabase
            .from('business_staff')
            .update({ status: 'active', user_id: authUser.id })
            .eq('id', staffRow.id)
            .select('*')
            .maybeSingle()
          if (updated) Object.assign(staffRow, updated)
        }

        // staff ki company laao
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

      // 3) kuch nahi
      setCompany(null)
      setStaff(null)
      setRole(null)
    } catch (e) {
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
