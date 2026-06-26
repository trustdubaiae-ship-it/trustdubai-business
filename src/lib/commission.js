// Marginal (progressive) partner commission by referral count — like tax brackets.
// slabs: [{ min_referrals, max_referrals(null = unlimited), commission_pct }]
// For a partner with `count` active paying referrals, referral #k earns the rate of
// the slab that #k falls into. sumPct = total of all those rates; blendedPct = average.
export function marginalCommission(count, slabs) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  const sorted = [...(slabs || [])].sort((a, b) => (a.min_referrals || 0) - (b.min_referrals || 0))
  let sumPct = 0
  const breakdown = []
  for (const s of sorted) {
    const lo = Number(s.min_referrals) || 0
    const hi = s.max_referrals == null ? Infinity : Number(s.max_referrals)
    if (n < lo) continue
    const inSlab = Math.max(0, Math.min(n, hi) - lo + 1)
    if (inSlab > 0) {
      breakdown.push({ min: lo, max: s.max_referrals, pct: Number(s.commission_pct) || 0, count: inSlab })
      sumPct += inSlab * (Number(s.commission_pct) || 0)
    }
  }
  const blendedPct = n > 0 ? sumPct / n : (sorted[0] ? Number(sorted[0].commission_pct) || 0 : 0)
  // rate the NEXT referral (rank n+1) would earn — for "reach the next slab" hints
  const nextRank = n + 1
  let nextPct = blendedPct
  for (const s of sorted) {
    const lo = Number(s.min_referrals) || 0
    const hi = s.max_referrals == null ? Infinity : Number(s.max_referrals)
    if (nextRank >= lo && nextRank <= hi) { nextPct = Number(s.commission_pct) || 0; break }
  }
  return { count: n, sumPct, blendedPct, nextPct, breakdown }
}
