# PRD — Mailwise

> **Tagline:** Wiser insights and more control over your emails.
> **Positioning line:** The control room for every Resend account, domain, and inbox you run.
> **Nature:** Multi-tenant hosted SaaS — dashboard and control panel for email operations on top of Resend.
> **Status:** Draft v0.2, 2026-09-29
> **Related:** `TRD.md` (tech), `UCD.md` (use cases), `DBD.md` (data), `FED.md` (design), `PRICING.md` (pricing proposal)

---

## 1. Problem

Most teams use Resend as nothing more than an API key in `.env` and a `resend.emails.send()` call. Resend offers much more — inbound receiving, lifecycle webhooks, open/click tracking, broadcasts, contacts/segments/topics, templates, automations, scheduled sends, scoped API keys — but:

1. **Features go unused.** Open tracking, receiving, and webhooks need setup nobody gets to. Most developers do not know `email.opened` exists.
2. **Webhook events are not kept anywhere.** Resend pushes events to *your* endpoint. Unless each project builds a handler and a store, the lifecycle of an email is only visible inside Resend, and only for its retention window (30 days on the free plan).
3. **Everything is siloed per account.** Freelancers, agencies, and multi-product companies juggle multiple Resend accounts, many domains, many API keys, with no single view of health or volume.
4. **Insights are shallow.** Resend's dashboard shows logs, not answers: "Which domain's bounce rate is climbing?", "Which template gets opened?", "Did the customer read my reply?"
5. **Inbound is raw.** `email.received` delivers metadata only; body and attachments must be fetched separately. There is no inbox experience with threads, read state, and replies.

## 2. Solution

Mailwise connects to one or more Resend accounts with a full-access API key, **auto-registers a webhook on each account** (via `POST /webhooks`), stores every event and inbound message, and turns that into:

- a unified **sender + composer** across all accounts and domains,
- a real **inbox** with threads, attachments, and **read receipts on your replies**,
- a searchable **activity log** with per-email timelines and long-term history,
- **insights and alerts** Resend's dashboard does not provide,
- one place to manage **domains, API keys, contacts, segments, topics, broadcasts, templates, and automations** across accounts,
- **AI assistance** for triage, drafting, and explaining anomalies.

## 3. Target users

| Persona | Situation | Job-to-be-done |
|---|---|---|
| **Indie developer / freelancer** | 3–15 side projects, 1–3 Resend accounts, many domains | "See every project's email health in one place; stop writing webhook handlers." |
| **Agency / studio** | One Resend account per client | "Run clients' email ops from one login; give each client access to their project only." |
| **Startup product engineer** | One product, transactional + marketing | "Know deliverability is degrading before customers complain; debug one user's email fast." |
| **Founder / product owner / support** | Non-developer who owns customer conversations | "Reply to inbound mail from the product domain and know whether the customer read it." |

## 4. Core concepts

- **Organization (tenant):** Isolation and billing boundary. All data is organization-scoped.
- **Member:** A user in an organization with a role (Owner, Admin, Developer, Support, Viewer), optionally limited to specific projects.
- **Connection:** A linked Resend account (one full-access API key). An organization can have several.
- **Project:** User-defined grouping of domains and senders across connections (e.g. "Acme SaaS", "Client: Bakery"). Used for filtering insights and scoping member access.
- **Sender:** A saved from-identity (`Acme Support <support@acme.com>`) on a verified domain.
- **Event:** One Resend webhook payload, stored immutably.
- **Thread:** A conversation grouping inbound messages and our replies by RFC 5322 headers.

## 5. Features

Priority: **P0** = MVP, **P1** = v1.0, **P2** = later.

### 5.1 Connections & onboarding (P0)
- Add a Resend account by pasting a **full-access** API key. The key is validated, encrypted at rest, and never returned to the browser. Sending-only keys are rejected with an explanation: they cannot read domains, register webhooks, or list emails.
- On connect, the app registers `https://<app>/api/ingest/resend/<connectionId>` for all event types and stores the returned signing secret (encrypted). Users never configure webhooks manually.
- Notice shown on connect: our webhook uses one of the account's webhook endpoint slots (Resend Pro: 5, Scale: 10).
- Initial sync: domains, API keys (metadata), webhooks, contacts, segments, topics, contact properties, templates, broadcasts, automations, and sent/received email history via list endpoints (paced to the rate limit).
- **Setup checklist** per connection, each item with a one-click fix where the API allows:
  - Our webhook exists and receives events
  - Open tracking enabled per domain (needed for read receipts)
  - Click tracking enabled per domain
  - Receiving enabled (MX record verified; subdomain recommended)
  - SPF / DKIM verified; DMARC record present
- Connection health: last event received, last sync, key validity. If events stop, we check and re-register the webhook.

### 5.2 Senders & compose (P0)
- Multiple senders per verified domain (`no-reply@`, `support@`, `billing@`) with display name, default reply-to, signature. Only domains synced from a connected account (full-access key) and verified in Resend can be picked.
- **Sender health:** each sender tracks whether it can still send. If its domain is deleted or unverified in Resend, or its connection needs attention, the sender is blocked in the composer with the reason, pending scheduled emails and broadcasts using it are flagged, and the author is notified. It recovers automatically when the domain is verified again. Senders whose domain can't receive mail show that replies won't reach the inbox.
- Composer: choose sender, to/cc/bcc, subject; body in **Rich text**, **HTML**, or **Template** (Resend template + variables).
- HTML mode: **live side-by-side preview**, desktop/mobile width toggle, light/dark preview.
- Attachments, tags, custom headers, **schedule send**, automatic idempotency key.
- Scheduled queue: list, reschedule, cancel.
- Send test to self.
- Drafts autosaved.

### 5.3 Inbox (P0)
- Requires receiving enabled on the domain; the checklist guides MX setup.
- On `email.received`, metadata is stored at once; a background job fetches the full message (raw MIME via `download_url`) and attachments, and stores them in our storage.
- Mail-client UI: mailboxes by project / connection / address, unread, starred, archived, labels, full-text search.
- Sanitized HTML in a sandboxed iframe, plain-text fallback, inline (CID) images, attachment preview/download.
- **Threads** grouped by `Message-ID` / `In-Reply-To` / `References`, with subject fallback.
- **Reply / reply-all / forward** from any sender, with correct threading headers.
- **Read receipts ("Seen")** on outbound messages in a thread: *Sent → Delivered → Opened (first time, count) → Clicked*, from `email.opened` / `email.clicked`. Notification: "Jane opened your reply".
- Local read/unread state for inbound mail, per member.
- Assignment of a thread to a member; internal notes on threads (P1).
- Routing rules (P1): auto-label, auto-assign, auto-reply, forward to address, based on to/from/subject match.

### 5.4 Activity log (P0)
- Every sent email with its timeline: `scheduled → sent → delivered | delivery_delayed | bounced | failed | suppressed → opened → clicked | complained`.
- Event stream with filters: connection, project, domain, event type, tag, template, recipient, date.
- **Recipient lookup:** everything sent to or received from `jane@x.com` across all accounts.
- Raw payload viewer.
- History outlives Resend's retention window (retention per plan; see `PRICING.md`).

### 5.5 Insights (P0 core, P1 advanced)
Micro-visualizations (sparklines, small multiples, compact bars) over giant charts.
- **P0 Overview:** sent, delivered %, open %, click %, bounce %, complaint % — by organization, connection, project, domain; period-over-period delta.
- **P0 Deliverability:** bounce and complaint rates vs. thresholds (bounce < 4%, complaints < 0.08%), hard vs. soft bounce, suppressed count.
- **P0 Inbound:** received volume, unanswered threads, median first-response time.
- **P1 Latency:** sent → delivered p50/p95; `delivery_delayed` by recipient mailbox provider.
- **P1 Engagement:** open/click by tag, template, sender; hour × weekday heatmap; top clicked links.
- **P1 Mailbox provider breakdown** (Gmail, Outlook, Yahoo, iCloud, other) from recipient domain.
- **P1 Plan usage:** per connection, transactional emails this month vs. the Resend transactional quota, and contact count vs. the Resend marketing contact quota (both entered by the user; Resend's API exposes neither). Also shows this org's tracked emails (transactional, broadcast, inbound) against its Mailwise allowance.
- Open rates are pixel-based and inflated by Apple Mail Privacy Protection and image proxies. The UI labels them as estimates.

### 5.6 Alerts & notifications (P0)
- In-app notification center, real-time: new inbound, reply opened, bounce, complaint, domain status change, connection silent.
- Rule-based alerts, with presets and custom rules: "bounce rate > 3% over 1h on domain X", "no events from connection in 24h", "domain unverified", "any complaint".
- Channels: in-app, email (sent via the organization's chosen sender or our system sender), Slack / Discord incoming webhook (Pro+). Number of rules per plan: Free 3, Pro 20, Team and Agency unlimited.
- Per-member notification preferences; quiet hours.
- Daily or weekly digest email (P1).

### 5.7 Domains (P0 view + tracking toggles, P1 full management)
- All domains across connections: status, region, DNS records, tracking settings, receiving status.
- Scheduled DNS re-check (SPF, DKIM, DMARC, MX, return-path) with drift alerts.
- Toggle open/click tracking. Add and verify domain (P1).

### 5.8 API keys (P1)
- Inventory across connections: name, permission (`full_access` / `sending_access`), restricted domain, created date.
- Create scoped sending keys per project (shown once), delete, guided rotation checklist.
- Flags: full-access keys older than N days.

### 5.9 Audience & marketing (P0)
- **Contacts** across connections: properties, segment membership, topic subscriptions, unsubscribe status, and per-contact engagement from our events. CSV import.
- **Segments** and **Topics** CRUD; **contact properties** schema.
- **Broadcasts:** create (HTML / rich text / template), preview, send test, schedule, send; post-send analytics from events.
- **Templates:** list, preview with sample variables, edit, duplicate across connections.
- **Automations (P1):** view Resend automations (trigger event → steps), enable/disable, see run outcomes from events. Visual editing is P2.

### 5.10 AI assist (P0 core set)
All AI features call an **OpenAI-compatible** endpoint configured by env (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`), so switching provider means changing env only.
- **Inbox triage:** summary line and category (support, sales, billing, spam-ish, auto-reply) for each inbound thread.
- **Reply drafts:** draft a reply from thread context in the member's chosen tone; never auto-sent.
- **Compose helpers:** subject-line suggestions, rewrite/shorten, HTML-to-plain-text.
- **Anomaly explanation:** on an alert, a short explanation grounded in our event data ("78% of bounces are to one recipient domain").
- **Paid plans only.** On Free, AI buttons are visible but locked with an upgrade prompt. Usage is metered per organization in AI credits (monthly allowance + purchasable packs; see `PRICING.md`). Admins can turn AI off per organization.
- P2: natural-language questions over insights ("which template had the best open rate last month?").

### 5.11 Team & tenancy (P0)
- Organizations, invitations, roles: **Owner, Admin, Developer, Support, Viewer**.
- Project-level scoping for members (an agency's client sees only their project). Team and Agency plans.
- Audit log of sensitive actions (connection added/removed, key created/deleted, email/broadcast sent, rule changed, member changes, plan and billing changes). Team and Agency plans.

### 5.12 Plans, usage & billing (P0 limits and metering; Stripe billing at public launch)
Implements `PRICING.md`: tiers Free / Pro $12 / Team $39 / Agency $99.
- **Metering:** every tracked email is counted once per month (transactional send, broadcast recipient, inbound message), split into the three streams.
- **Usage page** (Settings → Usage): tracked emails vs. allowance with the transactional / broadcast / inbound split, daily chart, projected month-end total and projected overage cost; AI credits used by feature and member; connections, members, projects, and alert rules vs. plan limits.
- **Limits enforced** at creation: connections, projects, alert rules, members (invites). Hitting a limit shows what the next tier offers and an upgrade button; nothing existing is deleted.
- **Feature gates:** AI (paid), assignment / labels / internal notes (Pro+), Slack/Discord alert channels (Pro+), digests and saved views (Pro+), project-scoped members and audit log (Team+). Gated features stay visible with a lock and a one-line explanation.
- **Allowance thresholds:** notifications at 80% and 100%; banner from 100%; paid plans bill overage at period end; Free gets a 7-day grace period, then 7-day retention for the excess.
- **Retention by plan:** 30 days / 180 days / 1 year / 2 years, applied to events, inbound content, and attachments.
- **Agency extra connections:** 15 included; adding more asks for confirmation of +$5/month each.
- **AI credit packs:** $5 per 1,000 credits, one-time purchase.
- **Billing (Owner only):** Stripe Checkout for upgrades and packs, Stripe Customer Portal for payment method, invoices, and cancellation; monthly or annual interval; 14-day Pro trial without a card (AI capped at 200 credits during trial).
- **Lifecycle rules** for trial end, downgrade, payment failure, and cancellation follow `PRICING.md` §6.

### 5.13 Product tour & onboarding (P0)
- **Guided tours** for new users, hosted by Wizi: a `welcome` tour on the first visit (leads to connecting a Resend account), a `first-look` tour after the first account finishes syncing (checklist, inbox and read receipts, activity, insights, notifications, ⌘K), and short 2–4 step tours the first time someone opens Inbox, the composer, Insights, Alerts, Broadcasts, and (Owners) Usage.
- Tours adapt to the member: steps for pages their role or project scope can't see, or features their plan doesn't include, are left out.
- Skip at any time; progress saved per user, across devices; replay any tour from the Help menu.
- Tours never interrupt: at most one starts automatically per page, and only when no dialog or composer is open.
- When the UI changes significantly, a new tour version can run once for existing users ("What's new").

### 5.14 Live feel (P0)
- The interface responds with micro-animations: icons animate on hover and focus, Wizi blinks, waves, and reacts to sends and opens, numbers roll when they change, new data slides in, and a live dot shows the realtime connection. Details in `FED.md` §9; everything respects reduced-motion settings.

### 5.15 Productivity (P1–P2)
- Command palette (⌘K): navigate, search emails/contacts, "compose from support@".
- Saved views and filters.
- P2: public API for our unified data; status page per project.

## 6. Success metrics

| Metric | Target (6 months after launch) |
|---|---|
| Activation: connection added and first event ingested within 10 min of signup | ≥ 60% of signups |
| Webhook ingestion success (2xx under 5 s) | ≥ 99.9% |
| Event-to-dashboard latency (p95) | < 5 s |
| Organizations with ≥ 2 connections or ≥ 3 domains | ≥ 35% of active orgs |
| Weekly inbox use (orgs with receiving enabled) | ≥ 50% |
| Orgs enabling open tracking through the checklist | ≥ 40% |
| Weekly active / monthly active organizations | ≥ 0.5 |
| AI reply drafts sent (edited or not) / drafts generated | ≥ 30% |
| Alerts not dismissed as noise | ≥ 80% |
| Free → paid conversion | ≥ 4% |
| `welcome` tour completion (not skipped) | ≥ 55% |
| Activation among users who completed `welcome` vs. skipped | Higher by ≥ 15 points (validates the tour) |

## 7. Scope

### MVP (P0)
Auth, organizations, roles, projects; connections with auto-webhook and sync; setup checklist; senders; composer with HTML preview and scheduling; inbox with threads, replies, and read receipts; activity log; core insights; alerts and notifications; domains view with tracking toggles; contacts, segments, topics, broadcasts, templates; AI triage, drafts, compose helpers, anomaly explanation; audit log; plan limits, feature gates, usage metering and usage page; product tours; micro-animations. Stripe billing (checkout, portal, overage, credit packs, trial) ships with public launch; during beta all orgs run on plan limits without payment.

### Not planned
- **Webhook relay / forwarding to downstream endpoints.** Resend already supports multiple endpoints per account with retries; the remaining benefit (per-domain filtering, replay) is too niche to justify.
- Sending through anything but the user's own Resend account; other providers (SES, Postmark). The data model keeps a `provider` field to allow this later.
- Drag-and-drop email builder (HTML, rich text, and Resend templates are supported).
- Native mobile apps (responsive web only).

## 8. Constraints & risks

- **Rate limit:** Resend allows 10 requests/s per team by default. All calls per connection pass through a shared rate limiter; syncs are paced and resumable.
- **Webhook slots:** Our webhook consumes one of the account's endpoint slots; on a full account, connecting fails with a clear message.
- **Webhook removal:** If a user deletes our webhook in Resend, events stop. Silence detection re-registers it and notifies.
- **Custody of full-access keys:** Keys can delete domains. Mitigations: envelope encryption, keys never sent to the client, role-gated destructive actions, audit log.
- **Open-tracking accuracy:** pixel-based; privacy proxies inflate opens. Presented as estimates.
- **Resend API change:** (e.g. Audiences → Segments already happened). All Resend calls go through one adapter module.
- **AI cost and privacy:** email content goes to the configured AI provider. Organization-level opt-out; no content used for training (provider setting); credits cap spend.

## 9. Open questions

1. ~~Pricing model~~ — decided: see `PRICING.md` §7 (prices accepted for now, AI paid-only, Agency 15 connections + $5 each).
2. ~~Mascot~~ — decided: **Wizi, the envelope character** (see `FED.md`).
