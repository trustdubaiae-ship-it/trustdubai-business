// Quvera Partner Program — Terms & Conditions. Shown as a modal from the partner
// signup page (must be accepted) and linked from the partner dashboard footer.
const SECTIONS = [
  ['1. The Partner Program', `The Quvera Partner Program lets approved partners ("you") refer businesses to Quvera and earn a recurring commission on the subscription fees those businesses pay. By joining, you agree to these terms.`],
  ['2. Eligibility & verification', `You must provide accurate details and upload valid KYC documents — a Emirates ID and a Trade License. Your account is reviewed by Quvera and becomes active only after (a) your plan subscription is paid, and (b) your documents are verified by our team. Quvera may decline or revoke an application at its discretion.`],
  ['3. Plans, fees & commission', `Partner plans are billed monthly in advance and your plan tier sets your commission rate (currently Starter AED 99/mo → 5%, Growth AED 199/mo → 15%, Pro AED 299/mo → 25%). You may upgrade or downgrade your plan at any time; changes to an active subscription are prorated. Monthly plan fees are non-refundable.`],
  ['4. Commission terms', `You earn your tier commission on the monthly subscription of each business that signs up through your referral link or code, for up to 12 months per referred business, while that business remains on a paid plan and your partner account stays active and paid. Commission is an estimate until confirmed at payout. Commission is not earned on free plans, taxes (VAT), refunds, chargebacks, or cancelled accounts. A referral is only valid when the business uses your code at sign-up and has not previously been a Quvera customer.`],
  ['5. Payouts', `Payouts are made by manual bank transfer to the account you save in your dashboard. Your bank account (name + IBAN) must be verified by Quvera before your first payout. Payouts are subject to a minimum payout amount and a limit on the number of claims per calendar month, as shown in your dashboard. Bank details can be set once; to change them you must request Quvera. You are responsible for any taxes due on your commission.`],
  ['6. Your responsibilities', `You will promote Quvera honestly and lawfully. You must not: send spam or unsolicited messages; make false or misleading claims about Quvera; bid on Quvera trademarks in paid ads; self-refer or create fake referrals; or use the program for any unlawful purpose. Quvera may withhold or reverse commission obtained through such activity.`],
  ['7. Suspension & termination', `Either party may end this arrangement at any time. Quvera may pause or terminate your account for breach of these terms, fraud, or non-payment of your plan. On termination, unpaid eligible commission already earned will be paid out subject to these terms; future commission stops.`],
  ['8. Changes', `Quvera may update the program, commission rates, fees, or these terms. Material changes take effect going forward and continued participation means you accept them.`],
  ['9. General', `You are an independent partner, not an employee, agent, or representative of Quvera, and may not enter into commitments on Quvera’s behalf. These terms are governed by the laws of the United Arab Emirates and the applicable Emirate of Dubai.`],
]

export default function PartnerTerms({ onClose }) {
  const T = { text: '#eaf0fb', text2: '#a6b6d4', text3: '#7286a8' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,8,18,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'clamp(12px,4vw,40px)', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, background: '#0d1326', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 'clamp(20px,4vw,32px)', boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'clamp(18px,4vw,22px)', fontWeight: 800, color: T.text }}>Partner <span style={{ background: 'linear-gradient(100deg,#00D4FF,#00FFCC 55%,#8B5CF6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Terms &amp; Conditions</span></div>
            <div style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>Quvera Partner Program · last updated June 2026</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: T.text2, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {SECTIONS.map(([h, body]) => (
            <div key={h}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, marginBottom: 5 }}>{h}</div>
              <div style={{ fontSize: 12.5, color: T.text2, lineHeight: 1.65 }}>{body}</div>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ width: '100%', marginTop: 22, padding: '13px', borderRadius: 10, border: 'none', background: 'linear-gradient(100deg,#00D4FF,#8B5CF6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Close</button>
      </div>
    </div>
  )
}
