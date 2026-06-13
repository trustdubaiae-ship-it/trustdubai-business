// tritova-business/src/lib/auth.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { hasFeature as _hasFeature, getLimit as _getLimit } from './permissions'

const AuthContext = createContext(null)

// ── Launch Plan defaults (used only if platform_settings can't be read) ──────
const LP_DEFAULTS = { enabled: false, days: 30, tier: 'platinum' }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [company, setCompany] = useState(null)
  const [staff, setStaff] = useState(null)
  const [role, setRole] = useState(null)
  const [planFeatures, setPlanFeatures] = useState(null) // { feature_key: {enabled, limit_value} }
  const [launchPlan, setLaunchPlan] = useState(LP_DEFAULTS) // master switch + config
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load the Launch Plan master switch once (cheap, single row).
    loadLaunchPlanSettings()
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

  async function loadLaunchPlanSettings() {
    try {
      const { data } = await supabase
        .from('platform_settings')
        .select('launch_plan_enabled, launch_plan_days, launch_plan_tier')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        setLaunchPlan({
          enabled: data.launch_plan_enabled === true,
          days: Number(data.launch_plan_days) || 30,
          tier: (data.launch_plan_tier || 'platinum').toLowerCase(),
        })
      }
    } catch (e) {
      // settings unreadable → keep Launch Plan OFF (safe fallback)
      setLaunchPlan(LP_DEFAULTS)
    }
  }

  // ── Trial helpers ──────────────────────────────────────────────────────────
  // A company is "in trial" only while the master switch is ON and its
  // trial_expires_at is in the future. The real company.plan is never changed.
  function trialActiveFor(co, lp) {
    if (!co || !lp?.enabled) return false
    if (!co.trial_expires_at) return false
    return new Date(co.trial_expires_at).getTime() > Date.now()
  }
  // EFFECTIVE plan = the trial tier while in trial, else the real plan.
  function effectivePlanFor(co, lp) {
    return trialActiveFor(co, lp) ? (lp.tier || 'platinum') : ((co?.plan || 'free').toLowerCase())
  }

  // company ke (effective) plan ke features load
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
    // make sure we have the latest switch before computing effective plan
    let lp = launchPlan
    try {
      const { data: ps } = await supabase
        .from('platform_settings')
        .select('launch_plan_enabled, launch_plan_days, launch_plan_tier')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ps) {
        lp = { enabled: ps.launch_plan_enabled === true, days: Number(ps.launch_plan_days) || 30, tier: (ps.launch_plan_tier || 'platinum').toLowerCase() }
        setLaunchPlan(lp)
      }
    } catch (e) { /* keep current lp */ }

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
        await loadPlanFeatures(effectivePlanFor(ownerCompany, lp))
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
        if (staffCompany) await loadPlanFeatures(effectivePlanFor(staffCompany, lp))
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

  // ── derived trial state (consumed by Sidebar / banners) ──────────────────────
  const isTrial = trialActiveFor(company, launchPlan)
  const effectivePlan = effectivePlanFor(company, launchPlan)
  const trialDaysLeft = (isTrial && company?.trial_expires_at)
    ? Math.max(0, Math.ceil((new Date(company.trial_expires_at).getTime() - Date.now()) / 864e5))
    : 0

  // plan feature helpers (component se seedha use)
  // During trial, every feature is unlocked (planFeatures already loaded from the
  // trial tier). hasFeature stays driven by planFeatures, so turning the master
  // switch OFF instantly reverts behaviour with no code change.
  function hasFeature(key) {
    if (isTrial) return true
    return _hasFeature(planFeatures, key)
  }
  function getLimit(key)   { return _getLimit(planFeatures, key) }

  // add-on helper — companies.addons jsonb se padhe.
  // During trial, all add-ons are also unlocked (full access for 30 days).
  function hasAddon(key) {
    if (!key) return false
    if (isTrial) return true
    const a = company?.addons
    if (!a || typeof a !== 'object') return false
    return a[key] === true
  }

  return (
    <AuthContext.Provider value={{
      user, company, staff, role, planFeatures, loading,
      signInWithGoogle, signOut, refreshCompany,
      hasFeature, getLimit, hasAddon,
      // Launch Plan / trial
      isTrial, effectivePlan, trialDaysLeft, launchPlan,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
