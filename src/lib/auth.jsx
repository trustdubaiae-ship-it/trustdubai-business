import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchCompany(session.user.email)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchCompany(session.user.email)
      else { setCompany(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchCompany(email) {
    try {
      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_email', email)
        .single()
      setCompany(data || null)
    } catch (e) {
      setCompany(null)
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
    if (user) await fetchCompany(user.email)
  }

  return (
    <AuthContext.Provider value={{ user, company, loading, signInWithGoogle, signOut, refreshCompany }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
