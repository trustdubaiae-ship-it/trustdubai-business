// Partner tiers — partner pays Quvera monthly; the tier sets their commission rate.
export const PARTNER_TIERS = {
  starter: { key: 'starter', label: 'Starter', fee: 99, commission: 5, blurb: 'Start referring' },
  growth: { key: 'growth', label: 'Growth', fee: 199, commission: 15, blurb: 'For active partners' },
  pro: { key: 'pro', label: 'Pro', fee: 299, commission: 25, blurb: 'Top earners' },
}
export const TIER_LIST = Object.values(PARTNER_TIERS)
export const tierOf = (k) => PARTNER_TIERS[k] || PARTNER_TIERS.starter
