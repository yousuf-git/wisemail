# Pricing proposal — Mailwise

> **Status:** v0.3, 2026-09-29. Tier structure and the decisions in §7 are accepted; numbers will be revisited after 3 months of paid data.
> **Related:** `PRD.md`, `DBD.md` (`org_settings.limits`, `usage_periods`, `connections.planQuota`)

---

## 1. Context: what customers already pay Resend

Resend sells two separate products, each with its own plan (resend.com/pricing, as of 2026-09):

**Transactional** — emails sent through the `/emails` API (password resets, receipts, notifications). Priced by **emails sent per month**; can go to any address.

| Plan | Price | Includes | Webhook endpoints | Data retention |
|---|---|---|---|---|
| Free | $0 | 3,000 emails/mo, 100/day, 3 domains | not stated | 30 days |
| Pro | $20–35 | 50k–100k emails/mo, 10 domains | 5 | not stated |
| Scale | $90–1,150 | 100k–2.5M emails/mo, 1,000 domains | 10 | not stated |
| Enterprise | custom | custom | custom | custom |

**Marketing** — broadcasts sent through `/broadcasts` or the dashboard, only to existing contacts. Priced by **number of contacts**; sending volume is unlimited ("Marketing plans are not limited by the number of emails sent — only by the number of contacts"). Broadcasts do not count against transactional limits.

| Plan | Price | Contacts | Webhook endpoints |
|---|---|---|---|
| Free | $0 | 1,000 | not stated |
| Pro Marketing | $40–650 | 5k–150k | 5 |
| Enterprise | custom | custom | custom |

Implications:
- Customers are already paying Resend; we are an add-on. **Our price should sit below what a customer pays Resend**, so the question is "is this worth a fraction of my email bill?" rather than "is this another $20 tool?".
- A large share of the market is on Resend Free (side projects). A generous free tier matches that and drives the multi-account use case.
- Resend Free keeps 30 days of data. **Longer history is a clean paid differentiator.**
- **Marketing volume is decoupled from the Resend bill.** A marketing customer can send hundreds of thousands of broadcast emails for a flat contact-based price. Our cost (events stored and processed) grows with those emails regardless, so we cannot copy Resend's contact-based model for marketing.
- Webhook slots are limited (5 on Pro). Using one slot is acceptable.

## 2. What drives our cost

| Driver | Why | Scales with |
|---|---|---|
| Emails tracked | Each email produces roughly 3–5 webhook events (sent, delivered, opened, clicked…); broadcasts usually have tracking on, so they sit at the high end | Transactional sends + broadcast recipients + inbound |
| Retention | Storage of events, inbound bodies, attachments | Days kept × volume |
| Inbound mail | Raw MIME + attachments in Cloudflare R2 for paid plans (storage and operations billed; no egress fees). Free stores no files | Received volume on paid plans |
| AI | Tokens per triage/draft/explanation | Usage, not volume |
| Connections | Sync jobs, DNS checks, silence checks | Number of Resend accounts |
| Contacts | Mirrored contact records | Small; negligible next to emails |

Seats cost us almost nothing, and per-seat pricing punishes the support use case (many inbox users). **Seats are not the main value metric.**

## 3. Recommended model: one plan covering both Resend products, metered by emails tracked

- **Value metric: emails tracked per month.** One tracked email is any email whose lifecycle we record:
  - each transactional email sent (from our composer or from the customer's own apps),
  - each broadcast recipient (a broadcast to 10,000 contacts = 10,000 emails),
  - each inbound email received.
  All events for a tracked email (delivered, opened ×N, clicked ×N, bounced…) are included. Customers can compare this number directly with their Resend usage, and our cost per tracked email is stable enough to price on.
- **One plan for both products.** A customer on Resend Transactional, Marketing, or both buys one Mailwise plan. Splitting our pricing the way Resend does would make customers who use both products pay twice, and our features (inbox, insights, alerts, audience) serve both.
- **Broadcasts count, and we say so.** The pricing page states that broadcast recipients count as tracked emails even though Resend meters marketing by contacts. The usage page shows transactional, broadcast, and inbound counts separately.
- **Contacts are not limited per tier.** Mirroring even 150k contacts is cheap. Revisit only if data shows a need.
- **Tier gates:** number of connected Resend accounts, retention length, team features.
- **Extra connections on Agency:** 15 Resend connections are included; each additional connection is **$5/month**, billed as a subscription quantity. Pro and Team upgrade to the next tier instead.
- **AI on paid plans only:** Free has no AI; AI buttons show an upgrade prompt. Paid tiers get a monthly credit allowance plus credit packs; not unlimited, because cost depends on the provider configured.
- **Never drop data:** when an org exceeds its allowance we keep ingesting, show a banner, and after a 7-day grace period either bill overage (paid tiers) or cap retention to 7 days for the excess (free tier). Losing events would break the product's core promise.

### Proposed tiers

| | **Free** | **Pro** | **Team** | **Agency** |
|---|---|---|---|---|
| Price (monthly) | $0 | **$12** | **$39** | **$99** |
| Price (annual, per month) | $0 | $10 | $32 | $82 |
| Built for | Side projects | Indie dev, several products | Startup team with support inbox and newsletters | Agency managing client accounts |
| Resend connections | 1 | 3 | 10 | 15 included, then $5/month each |
| Emails tracked / month | 5k (≈ Resend Free 3k transactional + a few broadcasts to 1k contacts) | 75k (≈ Resend Pro 50k + regular broadcasts) | 500k | 2M |
| Overage | — (retention cap) | $1 per extra 10k | $0.75 per extra 10k | $0.50 per extra 10k |
| History retention | 30 days | 180 days | 1 year | 2 years |
| Email files (attachments, embedded images) | Served from Resend while Resend keeps them; not stored by us | Stored by us for the retention period | Stored | Stored |
| Members | 2 | 5 | 20 | Unlimited |
| Inbox & read receipts | ✓ | ✓ | ✓ | ✓ |
| Audience & broadcasts | ✓ | ✓ | ✓ | ✓ |
| Assignment, labels, internal notes | — | ✓ | ✓ | ✓ |
| Alert rules | 3, in-app + email | 20, + Slack/Discord | Unlimited | Unlimited |
| Projects | 1 | 5 | Unlimited | Unlimited |
| Project-scoped members (client access) | — | — | ✓ | ✓ |
| Audit log | — | — | 90 days | 1 year |
| AI credits / month | — (paid plans only) | 1,000 | 5,000 | 15,000 |
| Digests, saved views | — | ✓ | ✓ | ✓ |
| Support | Community | Email | Priority email | Priority + onboarding call |

### Check against Resend spend

| Customer | Resend bill | Emails tracked / month | Our bill | Share of Resend bill |
|---|---|---|---|---|
| Side project on Resend Free (both products) | $0 | ~4k | $0 (Free) | — |
| Indie SaaS, Resend Pro 50k, no broadcasts | $20 | ~45k | $12 (Pro) | 60% |
| Resend Pro 50k + Marketing Pro 5k contacts, 4 broadcasts/mo | $60 | ~65k | $12 (Pro) | 20% |
| Newsletter-heavy: Marketing Pro 25k contacts, 8 broadcasts/mo | $180 | 200k | $24.50 (Pro + overage) or $39 (Team) | 14–22% |
| Scale 500k + Marketing Pro 50k contacts, 4 broadcasts/mo | $600 | 700k | $54 (Team + overage) | 9% |
| Extreme: Marketing 150k contacts, daily broadcasts | $650 | 4.5M | $224 (Agency + overage) | 34% |

Pro alone is the only case above 50% of the Resend bill, and only against Resend's cheapest paid plan. It is still $12 for the whole product.

### AI credits

| Action | Credits |
|---|---|
| Inbound triage (summary + category) | 1 |
| Compose helper (subject, rewrite, shorten) | 2 |
| Reply draft | 5 |
| Incident explanation | 5 |

Credit packs: **$5 per 1,000 credits**, never expire while subscribed. Credit costs assume a small model for triage and a mid-size model for drafts; set final numbers after measuring token usage with the chosen provider, targeting at least 70% gross margin on AI.

## 4. Alternatives considered

| Model | Why not (as primary) |
|---|---|
| Separate transactional and marketing plans (mirroring Resend) | Customers using both would pay twice; our features are shared across both; more pricing surface to explain. |
| Contact-based pricing for marketing | Our cost scales with emails, not contacts; a customer mailing 150k contacts daily would cost us far more than the price. |
| Webhook events as the metric (v0.1 of this doc) | Accurate for our cost, but customers can't compare "events" with anything on their Resend bill, and the event-per-email ratio differs between transactional and marketing. |
| Per seat | Punishes support/inbox use; our cost is volume-driven. |
| Per connection only | A 2M-email account would cost us 100× a hobby account at the same price. Kept as a tier gate. |
| Percentage of Resend spend | We cannot verify a customer's Resend plan via the API; feels like a tax. |
| Usage-only (pay per email) | Unpredictable bills; developers prefer a flat plan with a clear limit. Kept only as overage. |
| Flat lifetime deal | Cash early, but ongoing storage and AI costs make it loss-making at scale. |

## 5. Rollout

1. **MVP / beta:** everything free; limits enforced in code from `org_settings.limits` so they can be tuned without a migration; collect `usage_periods` data split by transactional, broadcast, and inbound.
2. **Launch billing:** Stripe via the Better Auth Stripe plugin with the organization as customer; 14-day Pro trial without a card on signup.
3. **After 3 months of paid data:** revisit allowances against measured cost per tracked email (separately for transactional and broadcast), AI credit costs, and conversion by tier.

## 6. Plan rules (for implementation)

These are proposed defaults that the product must implement; see `PRD.md` §5.12, `TRD.md` §2.10, `DBD.md` §4.1, `UCD.md` UC-28 to UC-33.

| Situation | Rule |
|---|---|
| **Trial** | New orgs get Pro for 14 days, no card. AI during trial is capped at 200 credits to limit abuse. At trial end without a payment method, the org moves to Free. |
| **Usage thresholds** | Owners and Admins are notified at 80% and 100% of the monthly tracked-email allowance; a banner shows from 100%. |
| **Over allowance, paid plan** | Ingest continues. Overage is billed at the end of the billing period at the tier's rate, rounded up to the next 10k. Annual plans are billed overage monthly. |
| **Over allowance, Free** | Ingest continues. After a 7-day grace period, emails beyond the allowance get 7-day retention instead of 30. |
| **Plan limits (connections, projects, alert rules, members)** | Creating beyond the limit is blocked with an upgrade prompt. Nothing existing is deleted automatically. |
| **Agency extra connections** | Adding a 16th or later connection asks for confirmation of +$5/month; the subscription quantity is updated with proration. Removing one lowers the quantity from the next period. |
| **AI credits** | Monthly allowance resets each billing period and does not roll over. Purchased packs are used after the allowance and do not expire while the org is on a paid plan. On Free, AI features are hidden behind an upgrade prompt and remaining pack credits are kept for 90 days in case the org resubscribes. |
| **Downgrade** | Takes effect at period end. Excess connections become read-only: events keep flowing in, but sending and management are disabled until the Owner removes connections or upgrades. Excess members keep access; new invitations are blocked. Features not in the new tier become read-only (e.g. existing Slack alert channels stop sending, audit log stops recording). |
| **Retention change** | Upgrade: existing data gets the longer retention right away. Downgrade: the shorter retention applies after a 14-day notice. |
| **Payment failure** | Stripe retries (smart retries). The org is `past_due` with a banner for Owners; after 14 days unpaid it moves to Free under the downgrade rules. |
| **Cancel** | Access continues until period end, then the org moves to Free. |

## 7. Decisions

| # | Question | Decision (2026-09-29) |
|---|---|---|
| 1 | Price points $12 / $39 / $99 | Accepted for now; revisit after paid data. |
| 2 | AI on the Free tier | No. AI is available on paid plans only. |
| 3 | Agency pricing for connections | 15 Resend connections included; $5/month for each additional connection. |
