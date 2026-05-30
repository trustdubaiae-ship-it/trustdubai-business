// trustdubai-business/src/lib/permissions.js

// saare permission keys (tick boxes)
export const PERMISSIONS = [
  { key: 'view_dashboard', label: 'Dashboard' },
  { key: 'view_leads',     label: 'Leads / Customer Feedback' },
  { key: 'view_reviews',   label: 'Reviews' },
  { key: 'view_analytics', label: 'Analytics' },
  { key: 'view_sponsored', label: 'Marketing / Sponsored' },
  { key: 'manage_staff',   label: 'Manage Team / Staff' },
  { key: 'view_plans',     label: 'Plans & Billing' },
  { key: 'manage_settings',label: 'Settings' },
]

// role-based default permissions (jab staff add ho)
export const ROLE_DEFAULTS = {
  manager:  { view_dashboard:true, view_leads:true, view_reviews:true },
  sales:    { view_dashboard:true, view_leads:true, view_reviews:true },
  engineer: { view_dashboard:true, view_leads:true, view_reviews:true },
  staff:    { view_dashboard:true, view_leads:true, view_reviews:true },
}

export function defaultPermsForRole(role) {
  return { ...(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.staff) }
}

// central access check
// owner = hamesha sab true. baaki = permissions jsonb se.
export function can(role, permissions, key) {
  if (role === 'owner') return true
  if (!permissions) return false
  return permissions[key] === true
}
