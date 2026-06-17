# Prompt — generate a feature guide (HTML / PDF) for Quvera Business

> Give the whole block below to Claude (or any LLM) to produce a polished,
> client-ready HTML page / PDF that explains the portal.
>
> The feature content is the single source `src/lib/featureGuide.js` and the
> in-app **Help → "How it works"** page (which has its own **Export PDF**). If
> you change features, update `featureGuide.js`; then re-paste the refreshed
> content into the block below for a new external PDF.

---

You are a senior product designer + technical writer. Create a **beautiful,
branded, single-file HTML document** (works as a web page and prints cleanly to
A4 PDF) titled **"Quvera Business — How it works"**.

Design requirements:
- Clean modern look: a cyan (#0099cc) brand accent, generous white space, rounded
  cards, soft shadows, good typography. A cover header with the title + one-line
  subtitle, then a section per feature.
- Each feature = a card with a coloured icon tile, the feature name, a one-line
  intro, and the bullet steps. Use the colours given per section.
- Add a short table of contents at the top that links to each section.
- Fully self-contained (inline CSS, no external assets except Tabler icon font CDN
  if convenient; otherwise use simple emoji/SVG). Must print to PDF with no clipping
  (`@page { size:A4; margin:14mm }`, avoid page-break inside a card).
- Tone: plain English, friendly, explains *how the work flows from a lead to a
  finished, client-approved project.*

Subtitle: "A plain-English guide to every feature and how the work flows from a
lead to a finished, client-approved project."

Sections (title — intro — steps):

1. **Getting started** — Your company registers once and is reviewed by the Quvera team; until approved you can still set up profile, logo, portfolio and FAQ.
   - Register → status "Under review" until approved.
   - Meanwhile complete Business Profile, Portfolio, Verification docs and FAQ.
   - Owner invites staff (Manager/Sales/Engineer/Staff) with role-based access.
   - Reach any module via the App Launcher or sidebar; top bar has search, theme, notifications, meeting bell.

2. **Command Center** — Your home dashboard, business health at a glance.
   - Key numbers: leads, quotes, revenue, projects, follow-ups due.
   - Quick links to every module.

3. **Lead Hub — capture, track & close** — Every lead in one place: Quvera Leads (verified), My Leads (Meta/WhatsApp/manual/CSV), Forms.
   - Quvera leads arrive ranked with a response-time (SLA) ring — act fast.
   - My Leads: add manually, import CSV, or collect via a shareable Form (link + QR).
   - Board by stage (New → Contacted → Quoted → Won → Lost); drag a card onto a stage pill to move it.
   - Cards show temperature, source, score/SLA ring, project & budget, next action.
   - Open a lead to log follow-up, change stage, call or WhatsApp; set next action with date & time.

4. **Planner** — Meetings, site visits and follow-ups, synced with every lead.
   - Schedule meeting/call/site-visit with a reminder.
   - A lead's "next action" and its meeting are one record — no duplicates.
   - Day view: timed meetings in slots, date-only follow-ups as all-day.

5. **Quotations** — Build professional quotes and send for client approval.
   - Group items by trade; set rates, discount, VAT; per-quote payment terms, revision no., themes.
   - Share an approval link — client approves/rejects with a comment (no login).
   - Approved quote can auto-create a Project.

6. **Invoices** — Turn work into invoices and track payments (incl. milestone invoices, VAT). Outstanding vs received feeds the Ledger and project P&L.

7. **Purchases & Suppliers** — Log supplier bills (VAT, category), tag to a client/project; outstanding balances and input VAT flow into Ledger and project cost.

8. **Ledger** — Your complete money ledger + VAT return.
   - Manual income/expense (with VAT) alongside auto invoice payments and site expenses.
   - Money-in-hand split by method (cash/petty/bank/card) with per-account balances.
   - Transfers move money between accounts (not income/expense); opening balances; output − input VAT.

9. **Projects** — Run each job end to end with live profit/loss.
   - Created from an approved quote or manually.
   - Status: Planning → Designing → Production → Ready for delivery → Site installation → Snagging → Handover → Completed (+ On Hold/Cancelled).
   - Start date + "Committed (days)" → Target end auto-fills; progress ring + start→end timeline on the card.
   - Milestones with weights drive % complete; scope assigned to subcontractors; client payments, materials and site expenses roll into cost & P&L.

10. **Subcontractors — LPO + NDA** — Engage subcontractors with paperwork in one click.
    - Assign scope + amounts; track contract vs paid.
    - "Generate LPO + NDA" prints both: LPO (scope, total, project timeline, delay/liquidated-damages clause, coordination clause listing other contractors) + a strong Non-Disclosure & Non-Circumvention Agreement.
    - Subcontractor completion auto-set 15% of the schedule before project end.

11. **Project history & updates** — Date-stamped record of everything.
    - Log meetings, client requirements, material/timeline changes, decisions.
    - Mark updates "visible to client" and/or "needs client approval".
    - Timeline-change records old → new date and (once approved) moves the target end.
    - Export full communication to PDF.

12. **Client portal** — A live, private window for the client, with approvals.
    - Primary WhatsApp number locked to the client on record (no leaks); add extra numbers.
    - Share private link + 6-digit access code over WhatsApp (one tap).
    - Client enters the code (remembered on device), sees status & timeline rings, stages, shared updates.
    - Approve/Reject changes with a comment; client can message back; company gets a notification; either side can export to PDF.

13. **AI tools** — AI Quote Builder (draft a full quote from a brief) and AI Assistant (ask questions across your data).

14. **Reputation** — Trust Score (verification + reviews + activity) and Reviews (collect & reply).

15. **Your public profile** — Business Profile, Portfolio, Verification, Our Team, FAQ; shareable public link/QR.

16. **Growth** — Analytics (lead/quote/conversion trends) and Sponsored Placement (more visibility).

17. **Team & settings** — Staff & Access (roles/permissions) and Control Panel (company settings, verification status, plan).

Output the complete HTML in one code block.
