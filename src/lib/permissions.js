// tritova-business/src/lib/permissions.js
// purified permission set — har page/feature ka apna control
export const PERMISSIONS = [
  { key: 'view_dashboard',    label: 'Dashboard' },
  { key: 'view_reviews',      label: 'Reviews / Review Mgmt' },
  { key: 'view_leads',        label: 'Leads / Customer Feedback' },
  { key: 'view_sentiment',    label: 'Customer Sentiment' },
  { key: 'view_trust_score',  label: 'Trust Score' },
  { key: 'view_reputation',   label: 'Reputation Monitor' },
  { key: 'view_analytics',    label: 'Analytics' },
  { key: 'view_sponsored',    label: 'Sponsored Placement' },
  { key: 'view_promotions',   label: 'Promotions / Featured' },
  { key: 'view_profile',      label: 'Business Profile' },
  { key: 'view_portfolio',    label: 'Portfolio' },
  { key: 'view_verification', label: 'Verification Status' },
  { key: 'manage_staff',      label: 'Team / Staff' },
  { key: 'view_plans',        label: 'Plans & Billing' },
  { key: 'manage_settings',   label: 'Settings / Integrations' },
]
// built-in role presets (typical permissions)
export const ROLE_PRESETS = {
  manager: {
    view_dashboard:true, view_reviews:true, view_leads:true, view_sentiment:true,
    view_trust_score:true, view_reputation:true, view_analytics:true,
    view_profile:true, view_portfolio:true, view_verification:true,
  },
  sales: {
    view_dashboard:true, view_leads:true, view_reviews:true, view_sentiment:true,
  },
  engineer: {
    view_dashboard:true, view_leads:true, view_portfolio:true,
  },
  staff: {
    view_dashboard:true,
  },
}
export function presetForRole(role) {
  return { ...(ROLE_PRESETS[role] || ROLE_PRESETS.staff) }
}
export function allPermsTrue() {
  const o = {}; PERMISSIONS.forEach(p => { o[p.key] = true }); return o
}
export function allPermsFalse() {
  const o = {}; PERMISSIONS.forEach(p => { o[p.key] = false }); return o
}
// central access check — owner = sab. baaki = jo tick hai. (kuch forced nahi)
export function can(role, permissions, key) {
  if (role === 'owner') return true
  if (!permissions) return false
  return permissions[key] === true
}

// ============================================================
// PLAN FEATURE HELPERS (plan_features table se)
// planFeatures = { feature_key: { enabled, limit_value }, ... }  (auth.jsx load karta hai)
// ============================================================

// kya feature plan mein hai? (toggle)
export function hasFeature(planFeatures, key) {
  if (!planFeatures) return false
  return planFeatures[key]?.enabled === true
}

// limit value laao (portfolio_photos, team_members) — default 0
export function getLimit(planFeatures, key) {
  if (!planFeatures) return 0
  return planFeatures[key]?.limit_value || 0
}
