# TRD — Wisemail

> **Status:** Draft v0.1, 2026-09-29
> **Related:** `PRD.md`, `UCD.md`, `DBD.md`, `FED.md`

---

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 (App Router)**, React 19, TypeScript (strict) | One codebase for UI, server actions, webhook ingest, and SSE. |
| Runtime / hosting | **Vercel**, Node.js 24 runtime (Fluid Compute) | Default 300 s function timeout covers syncs and SSE; no Edge runtime. |
| Styling | **Tailwind CSS v4** with CSS-variable design tokens (see `FED.md`) | Tokens drive light and warm-dark themes. |
| Components | **shadcn/ui** (Radix primitives), **lucide-react** icons | Owned source, easy to restyle to the warm/rounded look. |
| Motion | **Motion** (`motion/react`) with `LazyMotion` + `domAnimation` to keep the bundle small | Micro-interactions, Wizi animation, list arrivals; see `FED.md` §9. |
| Animated icons | **lucide-animated** (MIT, Motion-based Lucide icons, added per icon through the shadcn registry so the source lives in `components/icons/animated/`) | Same icon set as the rest of the UI, with hover animations and imperative start/stop for live events. |
| Animated numbers | **NumberFlow** (`@number-flow/react`) | Rolling KPI counters, badges, usage figures; respects reduced motion. |
| Product tour | **NextStepjs** (`nextstepjs`) with the Next.js App Router adapter | Built for App Router, tours can span several routes (`nextRoute` / `prevRoute`), custom card component for Wizi, Motion-based transitions, keyboard navigation, `onComplete` / `onSkip` callbacks. Alternative if it falls short: Driver.js (framework-agnostic, ~5 KB). |
| Charts | shadcn charts (**Recharts**) for sparklines and small multiples | Matches component system. |
| Editors | **TipTap** (rich text), **CodeMirror 6** (HTML), sandboxed iframe preview | CodeMirror is lighter than Monaco. |
| Forms / validation | **react-hook-form** + **Zod** (shared schemas client and server) | One schema per input. |
| Client data | **TanStack Query** for lists, infinite scroll, optimistic updates; Server Components for initial render | |
| Auth & tenancy | **Better Auth** with **MongoDB adapter** + **organization plugin** (orgs, members, invitations, custom access-control roles) | Self-owned; data stays in our database. |
| Database | **MongoDB Atlas** (replica set) + **Mongoose** | Referenced relationships (ObjectId refs, branded ID types), multi-document transactions, change streams for realtime. Convex was evaluated; see §2.12 for how we match its strengths. |
| Background jobs | **Inngest** (Vercel integration) | Durable steps, retries, cron, and **per-key throttling** (keyed by `connectionId`) to respect Resend's rate limit. |
| Realtime | **Server-Sent Events** + one MongoDB change stream per server instance on `realtime_events`, consumed by a `useLiveQuery` hook over TanStack Query | Every view live by default, replay on reconnect; see §2.6. |
| Object storage | **Cloudflare R2** (private bucket) via the S3 API: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | Raw inbound MIME, inbound and outbound attachments. No egress fees; presigned URLs let browsers upload and download directly, bypassing Vercel's 4.5 MB request/response body limit. See §2.13. |
| Resend | Official **`resend`** Node SDK, wrapped in one adapter module | Isolates API changes. |
| MIME / HTML | **mailparser** (parse raw inbound), **isomorphic-dompurify** (sanitize) | |
| AI | **`openai`** SDK against any OpenAI-compatible endpoint (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`) | Provider switch is an env change. |
| System email | Our own Resend account + **React Email** templates (invites, alerts, digests) | |
| Billing | **Stripe**: Better Auth Stripe plugin (organization as customer) for plan subscriptions; **Stripe SDK** directly for extra-connection quantity, metered overage (Billing Meters), and one-time AI credit packs | Plugin covers checkout, portal, and subscription sync; the rest needs direct API calls. See §2.10 and `PRICING.md`. |
| Observability | Sentry (errors), Vercel Observability (functions), Inngest dashboard (jobs) | |
| Testing | **Vitest** (unit/integration with `mongodb-memory-server`), **Playwright** (e2e) | |
| Tooling | pnpm, ESLint, Prettier, Husky + lint-staged | |

### Environment variables
```
MONGODB_URI
BETTER_AUTH_SECRET, BETTER_AUTH_URL
ENCRYPTION_KEK_CURRENT, ENCRYPTION_KEK_ID, ENCRYPTION_KEK_PREVIOUS (optional, rotation)
INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
(endpoint derived as https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com)
AI_BASE_URL, AI_API_KEY, AI_MODEL, AI_MODEL_FAST (optional, triage)
SYSTEM_RESEND_API_KEY, SYSTEM_FROM_EMAIL
APP_URL (public base URL used when registering webhooks)
STRIPE_SANDBOX (true = Stripe test mode keys required, false = live keys required)
STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY (optional), STRIPE_WEBHOOK_SECRET, STRIPE_BILLING_WEBHOOK_SECRET
STRIPE_PRICE_* (plan monthly/annual, extra connection, overage meters per tier, credit pack)
BILLING_ENABLED (false during beta: limits enforced, no payment)
SENTRY_DSN
```

### Environment validation at startup
- `lib/env.ts` parses `process.env` with a Zod schema once; the rest of the code imports typed values from it and never reads `process.env` directly.
- It runs in two places so a bad configuration never serves traffic:
  1. **Build / deploy:** `scripts/check-env.ts` runs as `prebuild`; a failure fails the build, so the deployment never goes live.
  2. **Server start:** `instrumentation.ts` `register()` imports `lib/env.ts` when the Node.js server (or a new function instance) boots. On failure it logs the message and calls `process.exit(1)`.
- **Stripe mode check** (when `BILLING_ENABLED=true`, `STRIPE_SANDBOX` is required and must be `true` or `false`):

  | `STRIPE_SANDBOX` | `STRIPE_SECRET_KEY` must start with | `STRIPE_PUBLISHABLE_KEY` (if set) must start with |
  |---|---|---|
  | `true` | `sk_test_` or `rk_test_` | `pk_test_` |
  | `false` | `sk_live_` or `rk_live_` | `pk_live_` |

  On conflict the process stops with a message that names the variables and the key *prefix* only, never the key:
  ```
  [env] Stripe mode conflict: STRIPE_SANDBOX=false expects a live key (sk_live_… or rk_live_…),
  but STRIPE_SECRET_KEY is a test key (sk_test_…). Set STRIPE_SANDBOX=true or use a live key. Shutting down.
  ```
- Webhook signing secrets (`whsec_…`) and price ids carry no mode prefix, so `check-env` also calls `stripe.prices.retrieve` for each `STRIPE_PRICE_*` at build time: a price from the other mode returns "No such price", which fails the build with the variable name.
- The same schema validates everything else (required variables present, `APP_URL` is https in production, KEK length), with one combined error list.
- **R2 check:** `check-env` calls `HeadBucket` on `R2_BUCKET` with the configured credentials; missing bucket or rejected credentials fail the build with the variable names. At server start only the presence and format of the R2 variables are checked (no network call).

## 2. Architecture

```
                 ┌──────────────────────────────────────────────────────────┐
 Browser ──RSC/Server Actions──▶  Next.js app (Vercel, Node runtime)         │
    ▲  └──TanStack Query (route handlers)──▶  services/ ──▶ repositories/ ──▶│──▶ MongoDB Atlas
    │                                         │                             │
    └────── SSE /api/stream ◀── change streams┘                             │
                                                                            │
 Resend account A ──webhook──▶ /api/ingest/resend/[connectionId] ──┐         │
 Resend account B ──webhook──▶        (verify, dedupe, store, 200) │         │
                                                                   ▼         │
                                                 Inngest events ──▶ /api/inngest (functions)
                                                   • process-event (timeline, rollups, notifications, alerts)
                                                   • fetch-inbound (raw MIME → R2, parse, thread)
                                                   • sync-connection (paged backfill)
                                                   • send-email / send-broadcast
                                                   • ai-triage, ai-draft
                                                   • cron: dns-check, silence-check, digest, retention, integrity-check,
                                                     purge-trash, cleanup-rules
                                                   • bulk-delete (chunked, background)
                                                   • billing: usage-thresholds, report-usage, trial-end,
                                                     apply-plan-change, retention-rewrite, backfill-storage
                 └──────────────────────────────────────────────────────────┘
 All outbound Resend calls ──▶ lib/resend/adapter (per-connection client, throttled via Inngest)
 AI calls ──▶ lib/ai/client (OpenAI SDK, base URL from env)
```

### 2.1 Webhook ingest (hot path)
1. `POST /api/ingest/resend/[connectionId]`: read raw body, load connection, decrypt its signing secret.
2. Verify Svix signature (`resend.webhooks.verify` with `svix-id`, `svix-timestamp`, `svix-signature`). Reject on failure (400), unknown connection (404).
3. Insert into `webhook_events` with unique index `(connectionId, svixId)`; duplicate key means already received, return 200.
4. Send Inngest event `resend/event.received` with the event id; return 200. Target under 300 ms; no Resend API calls on the hot path.
5. Inngest `process-event` does the rest idempotently: upsert the `emails` document status and timeline, increment `metric_rollups`, create notifications, evaluate alert rules, and for `email.received` enqueue `fetch-inbound`. If the email's Resend id has a `deletion_tombstones` record, rollups are still incremented (insights stay accurate) but the email is not recreated, no notification is sent, metering is skipped, and the event is marked `ignoredReason: deleted`.

Out-of-order events (e.g. `opened` before `delivered`) are handled by keeping `status` as the highest-ranked state and timeline entries sorted by `occurredAt`.

### 2.2 Connection onboarding
1. Validate key with a cheap full-access call (`GET /domains`). If it returns a permission error, reject the key as sending-only.
2. Encrypt and save key; create connection (`status: provisioning`).
3. `POST /webhooks` with `${APP_URL}/api/ingest/resend/${connectionId}` and all supported event types; store `webhookId` and encrypted `signing_secret`. If the account has no free webhook slot, surface the Resend error and keep the connection in `needs_attention`.
4. Enqueue `sync-connection` (domains → API keys → segments/topics/properties → templates → contacts → broadcasts → automations → sent emails → received emails), each resource paginated with cursor, checkpointed in `sync_runs` so a timeout resumes. Email backfill skips anything with a tombstone and anything older than the org's retention window.
5. Mark connection `active`; compute setup checklist.

### 2.3 Rate limiting against Resend
- Resend default: 10 requests/s per team. Each connection is one team.
- Every Inngest function that calls Resend declares `throttle: { key: "event.data.connectionId", limit: 8, period: "1s" }` (headroom for the user's own apps using the same account).
- Interactive calls (send now, toggle tracking) run inline in the server action but use a small per-connection token bucket in MongoDB (`connections.rateWindow`); on 429 they retry with `retry-after`.

### 2.4 Inbound processing (`fetch-inbound`)
1. `emails.receiving.get(emailId)` → metadata + `raw.download_url`.
2. Download the raw MIME and parse it with mailparser for text, html, and headers. **Paid plans and trial:** also store the raw MIME in R2 (`orgs/{orgId}/inbound/{emailId}/raw.eml`). **Free:** the raw MIME is parsed in memory and not stored.
3. `emails.receiving.attachments.list(emailId)` → one `attachments` document per file with Resend's attachment id, **exact original filename**, size, content type, `content_disposition`, and `content_id`. Attachment metadata always comes from this call, so both storage modes share the same records.
   - **Paid / trial (`storageMode: r2`):** each file is downloaded from its `download_url` and stored in R2 (`orgs/{orgId}/inbound/{emailId}/att/{attachmentId}`).
   - **Free (`storageMode: resend`):** no file is copied; the `download_url` and its `expires_at` are cached on the document (§2.13, "Serving files").
4. Sanitize HTML (DOMPurify: strip scripts, forms, event handlers, `<base>`, and `javascript:` URLs; keep inline styles). Embedded (CID) images are mapped to their attachment documents; remote `https` images are kept and load automatically; `http` images are upgraded to `https` or dropped (mixed content).
5. Thread: match `In-Reply-To` / `References` to existing `emails.messageId` in the org; else same normalized subject + participant within 14 days; else new thread.
6. Update thread counters, notify members, enqueue `ai-triage` if AI enabled.

### 2.5 Sending
- Compose → server action validates with Zod, resolves sender → domain → connection, checks role and project scope, then checks **sendability**: sender `status` is `active`, domain `status` is `verified`, connection `status` is `active`. Any failure blocks the send with a typed error (`sender_inactive`, `domain_unverified`, `connection_inactive`) before Resend is called.
- If Resend still rejects the send because of the domain (403 / validation error naming the domain), the adapter maps it to `resend_domain_rejected`; the service marks the domain and its senders `domain_unverified`, enqueues a domain sync for that connection, and returns the error to the UI.
- **Sender status job** (`recompute-sender-status`): runs on `domain.updated` / `domain.deleted` events, after domain syncs and DNS checks, and on connection status changes. Recomputes each affected sender's status; on a change to unusable, finds pending emails (`queued` / `scheduled`) and draft or scheduled broadcasts using that sender, notifies their authors and Admins, and lists them under "Needs attention". Scheduled sends re-run the sendability check when they fire.
- Scheduled or with attachments: Inngest `send-email`; immediate without attachments: inline.
- Resend call includes `idempotency_key` (our `emails._id`), tags `mw_org`, `mw_project`, and for replies `In-Reply-To` / `References` headers.
- Attachments: Vercel Functions accept at most 4.5 MB request bodies, so the browser uploads attachments directly to R2 with a presigned PUT URL (§2.13). At send time the job moves them under the email's key and passes Resend a presigned GET URL (1 hour) as the attachment `path`, so the file never passes through our function. To verify during implementation: that Resend fetches `path` when the request is made; if not, the job reads the object and sends its content instead. Resend's limit is 40 MB per email including attachments.
- Our `emails` document is created **before** the call (`status: queued`) so webhook events always find it; the Resend id is stored on success.

### 2.6 Realtime ("live by default")
Goal: every org-data view in the app updates by itself, the way a reactive backend (e.g. Convex) does, without each feature wiring its own realtime code.

**Write side — explicit invalidation events.**
- Every service that changes user-visible data calls `publish({ orgId, projectId?, userId?, topics, patch? })` (`lib/realtime/publish.ts`). It inserts one small document into `realtime_events` (`DBD.md` §4.9). When the write runs in a transaction, `publish` joins the same session, so an event exists only if the data change committed.
- Topics name what changed: `threads`, `thread:<id>`, `emails`, `email:<id>`, `notifications:<userId>`, `domains`, `connection:<id>`, `incidents`, `usage`, `broadcast:<id>`, … An optional `patch` carries small field updates (e.g. an email's new status and `firstOpenedAt`) so clients can update without refetching.

**Server fan-out — one change stream per instance.**
- `lib/realtime/hub.ts` keeps a single change stream on `realtime_events` (inserts only) per server instance, opened when the first SSE client connects and closed when the last disconnects. Fluid Compute serves many SSE connections per instance, so database cursors scale with instances, not users.
- The hub routes each event in memory to connected clients of that org, applying the member's project scope and user-specific topics.
- `GET /api/stream`: authenticated SSE; each message has `id: <realtime_events._id>`. On reconnect with `Last-Event-ID`, the route first replays missed events (`_id > lastId` for the org), then goes live. If the gap is older than the collection's 1-hour TTL, it sends `resync` and the client refetches everything visible.
- Heartbeat every 25 s; the stream closes before the function time limit and the client reconnects automatically.

**Client — `useLiveQuery`.**
- `useLiveQuery(key, fetcher, { topics })` wraps TanStack Query's `useQuery` and subscribes to topics. A matching event either applies `patch` to the cache (`setQueryData`) or invalidates the query; invalidations are batched every 100 ms.
- Server Components prefetch the first page and hydrate TanStack Query (`HydrationBoundary`), so pages render with data and then stay live.
- Mutations return the updated document and write it into the cache (read-your-writes). Frequent actions (read/unread, star, archive, label, assign, toggle tracking, mark notification read) use optimistic updates with rollback on error.
- Rule enforced in code review and a lint rule: org data on the client is read only through `useLiveQuery`.

A live dot in the UI shows the stream state (`FED.md` §9.3).

### 2.7 Insights
- Dashboards read `metric_rollups` (hourly buckets, `$inc` upserts at ingest), never scan raw events.
- Dimensions per bucket: `orgId, connectionId, domainId, projectId`, plus one breakdown (`stream` = transactional / broadcast / inbound, `tag`, `template`, `sender`, `mailbox_provider`), counters per event type. Daily buckets computed by cron from hourly for ranges > 30 days.
- Latency percentiles computed in `process-event` when `delivered` arrives (delta from `sent`), stored as a small histogram in the rollup.

### 2.8 Alerts
- Rules evaluated in `process-event` for event-driven rules (complaint, domain status) and every 5 minutes by cron for rate rules (bounce rate over window, silence).
- Each firing creates an `alert_incidents` document (dedup key per rule + window) and notifications; resolves automatically when the condition clears.

### 2.9 AI
- `lib/ai/client.ts` creates one `OpenAI` client with `baseURL: AI_BASE_URL`, `apiKey: AI_API_KEY`. All features use Chat Completions with JSON-schema structured output where needed, the most widely supported surface across OpenAI-compatible providers.
- Prompts live in `lib/ai/prompts/*.ts`, versioned; every call logs `ai_usage` (org, feature, tokens, model) and deducts credits.
- Inbound content is passed as delimited data with an instruction that it is untrusted (prompt-injection defence); AI never sends email or changes data by itself — outputs are suggestions the member accepts.
- Before each call, `lib/ai/credits.ts` checks the entitlement (`ai` feature on the plan and org AI setting) and reserves credits atomically (`findOneAndUpdate` on `org_settings.aiCredits` with a balance condition); after the call it settles the reservation. No reservation, no call. Free orgs get `ai_not_in_plan`; exhausted orgs get `ai_credits_exhausted`.

### 2.10 Plans, entitlements & billing
Implements `PRICING.md`.

**Plan catalog.** `lib/billing/plans.ts` is the single source of truth: for each tier, its limits (connections, members, projects, alert rules, tracked emails per month, retention days, AI credits), feature flags (`ai`, `inboxCollaboration`, `chatAlertChannels`, `digests`, `savedViews`, `projectScopedMembers`, `auditLog`), overage rate, and Stripe price ids. `org_settings` stores the current plan plus optional per-org overrides; it does not copy the catalog.

**Entitlements.** `getEntitlements(orgId)` merges catalog + overrides + state (trial, past due, extra connections) and is cached per request. Checks:
- `assertCanCreate(orgId, resource)` in server actions that create connections, projects, alert rules, and invitations; counts active documents and throws `plan_limit_reached` with the limit and the next tier.
- `assertFeature(orgId, feature)` in actions for gated features (assignment, labels, notes, Slack/Discord channels, digests, saved views, scoped members, audit log view); UI reads the same entitlements to render locks.
- Agency connection 16+: the action returns `confirmation_required` with the price; on confirm, the Stripe subscription's extra-connection item quantity is set to `max(0, connections − 15)` with proration, then the connection is created.

**Metering.** In `process-event`, the first `email.sent` or `email.received` for an email sets `emails.meteredAt` with a conditional update (`meteredAt` must not exist); only if that update matched does it `$inc` `usage_periods.emailsTracked.<stream>`. This keeps counting idempotent across duplicate and out-of-order events. The billing period is the org's Stripe period (calendar month during beta and on Free).

**Allowance and retention.** At write time, every `emails`, `email_contents`, `attachments`, `webhook_events`, and `threads` document gets `expireAt = now + retentionDays`. For Free orgs past allowance and grace, excess emails get `expireAt = now + 7 days` and `overAllowance: true`.

**Jobs (Inngest).**
- `usage-thresholds` (hourly): notifies Owners/Admins at 80% and 100% once per period (`usage_periods.thresholdsNotified`), starts the Free grace period.
- `report-usage` (daily and at period end): sends Stripe meter events for tracked emails above the allowance, per org, with an idempotency key per org + period + day.
- `trial-end` (daily): orgs whose app-side trial ended without an active subscription move to Free (the 14-day trial is ours, not a Stripe trial, so no card is needed).
- `apply-plan-change`: triggered by subscription webhooks; updates `org_settings.plan`, marks excess connections read-only on downgrade, schedules retention changes.
- `retention-rewrite`: on upgrade, extends `expireAt` on existing documents in batches; on downgrade, shortens it after the 14-day notice.

**Stripe integration.**
- Better Auth Stripe plugin with `organization: { enabled: true }`: plan checkout (`subscription.upgrade`), Customer Portal, subscription sync into its `subscription` collection, webhook at `/api/auth/stripe/webhook`. Lifecycle hooks (`onSubscriptionComplete`, `onSubscriptionUpdate`, `onSubscriptionCancel`, `onSubscriptionDeleted`) enqueue `apply-plan-change`.
- A second webhook route `/api/billing/stripe-webhook` handles what the plugin does not: `checkout.session.completed` for credit packs (adds to `aiCredits.packBalance`), `invoice.payment_failed` / `invoice.paid` (past-due state and banner).
- Subscription items per org: plan price (monthly or annual), extra-connection price (quantity, Agency only), overage metered price for the tier.
- `BILLING_ENABLED=false` during beta: entitlements and limits apply, checkout and metering reports are skipped.

### 2.11 Product tours
- **Library:** NextStepjs, mounted in the `(app)/[orgSlug]` layout (client component, loaded lazily) so marketing and auth pages don't ship it. Uses `useNextAdapter` for App Router navigation between steps and a custom `cardComponent` (`components/tour/tour-card.tsx`) that renders Wizi and our styles (`FED.md` §9A).
- **Definitions:** one file per tour in `lib/tours/*.ts`, typed as `{ id, version, trigger, audience, steps }`:
  - `trigger`: `auto_first_visit` (org overview with no connection), `auto_after_event` (e.g. first sync finished), `auto_first_page_visit` (first time on a page), or `manual` (Help menu only).
  - `audience`: allowed roles and required plan features; evaluated with the same permission and entitlement helpers as the rest of the app.
  - `steps`: selector, route, copy, Wizi pose, optional `action` (e.g. open the Connect dialog on the last step).
- **Tours at launch:**

  | Tour | Trigger | Steps (route) |
  |---|---|---|
  | `welcome` | First visit to an org with no connection | Greeting and Wizi → sidebar groups → "Connect your first Resend account" card → Help menu (overview); last step opens the Connect dialog |
  | `first-look` | First connection's initial sync finished | Setup checklist (overview) → Inbox and read-receipt chip (inbox) → Activity timeline (activity) → Insights KPIs (insights) → Notifications bell and live dot → ⌘K palette |
  | `inbox` | First visit to Inbox | Mailboxes → thread list with AI summary → read-receipt progression → Reply / AI draft |
  | `composer` | First time the composer opens | Sender picker → Rich / HTML / Template modes → HTML preview → Schedule |
  | `insights` | First visit to Insights | Filters → deliverability thresholds → estimated open rate note |
  | `alerts` | First visit to Alerts | Presets → channels → incidents |
  | `broadcasts` | First visit to Broadcasts | Segment picker → preview and test → post-send stats |
  | `usage-billing` | Owner's first visit to Usage | Usage meter split → projected overage → plan comparison |

- **Filtering before start:** steps whose target the member can't see (role, project scope) or whose feature is locked on the plan are removed; if fewer than two steps remain, the tour doesn't start.
- **Stable targets:** every target has a `data-tour="…"` attribute; tours never use CSS classes. If a target is still missing after NextStepjs's retry (`selectorRetryAttempts`), the step is skipped and a warning is logged to Sentry.
- **Scheduling:** at most one auto tour per page view; an auto tour waits until no dialog, sheet, or composer is open; auto tours never start during the first 2 s of a page load.
- **Progress:** stored server-side per user and org (`tour_progress`, `DBD.md` §4.9), so it follows the user across devices. `onComplete` / `onSkip` / `onStepChange` call a server action that records completion, skip, and last step. A tour whose `version` major number increases can auto-run again ("What's new" tours).
- **Replay:** Help menu → Tours lists tours available to this member with completion state; "Replay" starts it manually regardless of state.

### 2.12 Matching reactive-backend strengths on MongoDB
Convex was considered (`2026-09-29`) and MongoDB kept for predictable storage cost, native TTL, portability, and full Better Auth plugin support. These are the places Convex is strong and how this design matches each one:

| Convex strength | How we match it |
|---|---|
| Reactive queries, UI always current | §2.6: `publish` in every write path, per-instance change-stream hub, SSE with replay, `useLiveQuery` for all org data, cache patches for small updates. |
| Every mutation is a transaction | `withTransaction(fn)` in `lib/db/transaction.ts` (see below) used for every multi-document write; single-document atomic updates where they suffice. |
| Optimistic updates | TanStack Query `onMutate` with rollback on the frequent actions listed in §2.6. |
| Typed document references | Branded ID types and reference checks (see below). |
| Scheduler, cron, durable workflows | Inngest: durable steps, retries, `step.sleepUntil` for scheduled sends, cron, per-connection throttling (§2.3). |
| Transactional rate limiting | Inngest throttle for jobs; MongoDB token bucket updated atomically for interactive calls (§2.3). |
| Built-in file storage | Cloudflare R2 (private) with presigned uploads and an authorized download route (§2.13). |
| Built-in search | MongoDB text indexes, Atlas Search later (§7). |
| Aggregates / counters | `metric_rollups` with `$inc` upserts at ingest (§2.7). |
| End-to-end types | Shared Zod schemas for inputs, typed server-action results, `InferSchemaType` models, typed list endpoints (response schemas checked in development). |

**Transactions.** `withTransaction(fn)` starts a session with `readConcern: snapshot` and `writeConcern: majority`, retries on `TransientTransactionError` and `UnknownTransactionCommitResult`, and passes the session to repositories (every repository method accepts an optional session). Used for:
- limit check + create (connections, projects, alert rules, invitations);
- metering (`emails.meteredAt` + `usage_periods` increment);
- AI credit settle after a call (reservation itself is a single-document atomic update);
- sender status recompute + flagging pending sends;
- connection removal and plan-change cascades;
- any write plus its `publish` event.

**Concurrent edits.** User-edited documents (drafts, alert rules, templates, senders, projects) use Mongoose `optimisticConcurrency`; a stale save returns `conflict` and the UI offers to reload.

**Typed references.** `lib/db/ids.ts` defines `Id<"emails">`, `Id<"threads">`, … as branded `ObjectId` types (and branded strings on the client). Repositories accept and return these, so passing a thread id where an email id is expected fails to compile. MongoDB has no foreign keys, so:
- before inserting or updating a reference, services call `assertRefs` to check the referenced document exists in the same org;
- delete behavior per relationship (restrict, cascade, or set null) is defined in `DBD.md` §5 and implemented in the owning service;
- a nightly `integrity-check` job reports dangling references to Sentry.

### 2.13 Object storage (Cloudflare R2) and file serving
- **Storage mode by plan:**

  | Plan | Inbound raw MIME and attachments | Outbound attachments |
  |---|---|---|
  | Pro, Team, Agency, trial | Copied to R2 on receipt (`storageMode: r2`); kept for the plan's retention | Stored in R2 under the email; kept for the plan's retention |
  | Free | Not copied; served from Resend's short-lived `download_url` (`storageMode: resend`). Available as long as Resend keeps the email (30 days on Resend's free plan, matching our Free retention) | Uploaded to R2 only to send; deleted after Resend accepts the email. Sent view shows filename and size without download |

  - **Upgrade from Free:** `backfill-storage` job copies files of inbound emails still available at Resend into R2 and switches them to `storageMode: r2`.
  - **Downgrade to Free:** new mail uses `resend` mode; files already in R2 stay until their (shortened) retention ends.
- **Bucket:** one private bucket per environment (`wisemail-dev`, `wisemail-prod`). Public access and the `r2.dev` URL stay disabled. The API token is an R2 token scoped to that bucket with Object Read & Write only.
- **Client:** `lib/storage/r2.ts` creates an `S3Client` with `region: "auto"` and the account endpoint; `lib/storage/keys.ts` builds every key so no code concatenates paths by hand.
- **Key layout** (org id first, so an org can be purged by prefix):

  | Object | Key |
  |---|---|
  | Raw inbound message | `orgs/{orgId}/inbound/{emailId}/raw.eml` |
  | Inbound attachment | `orgs/{orgId}/inbound/{emailId}/att/{attachmentId}` |
  | Outbound attachment (after send) | `orgs/{orgId}/outbound/{emailId}/att/{attachmentId}` |
  | Draft upload (before send) | `drafts/{orgId}/{draftId}/{attachmentId}` |

- **Uploads (browser → R2):** server action `createUploadUrl({ draftId, filename, size, contentType })` checks permission, per-file and per-email size (40 MB total), and returns a presigned PUT URL valid 5 minutes with `Content-Length` and `Content-Type` signed. The browser uploads directly; then `confirmUpload` runs `HeadObject` to check size and type before creating the `attachments` document. Bucket CORS allows `PUT` only from `APP_URL` origins.
- **Serving files.** `lib/storage/file-url.ts` returns a URL for an attachment in one of two purposes, handling both storage modes:

  | Purpose | `storageMode: r2` | `storageMode: resend` |
  |---|---|---|
  | `inline` (embedded image) | Presigned R2 GET, 15 min, `Content-Disposition: inline` | Cached Resend `download_url` if more than 2 minutes from `expires_at`; otherwise `emails.receiving.attachments.get` (throttled per connection) and re-cache |
  | `download` (document or any file) | Presigned R2 GET, 5 min, `Content-Disposition: attachment; filename="<ASCII fallback>"; filename*=UTF-8''<percent-encoded original name>` and the original content type | Files ≤ 4 MB: streamed through our route with the same `Content-Disposition` header (same origin, so the exact name is guaranteed). Larger files: Resend `download_url`; the name and in-tab behavior then depend on Resend's download server and are not guaranteed |

- **Embedded images show on open.** When the thread view renders a message, the server replaces every `cid:` reference in the sanitized HTML with the `inline` URL of the matching attachment, already signed. The email iframe is sandboxed without same-origin, so it cannot send our session cookie; pre-signed URLs load without it. Inline images that the HTML never references are listed with the attachments instead, as thumbnails.
- **Documents download in the current tab.** Attachment chips link to `GET /api/files/[attachmentId]` (same origin, so the session cookie authorizes the member: org, role, project scope). The route responds with the file (Free, ≤ 4 MB) or a 302 to the `download` URL. Because the final response carries `Content-Disposition: attachment`, the browser saves the file under its original name and the page stays where it is: no new tab, no navigation. Filenames are taken as decoded by Resend/mailparser (RFC 2231 and encoded-word names included) and only stripped of path separators and control characters.
- **Expired at Resend (Free):** if Resend returns 404 for the email or attachment, the chip shows "No longer available at Resend" and the document is marked `unavailable`.
- **Sending:** draft uploads are copied (`CopyObject`) to the outbound key when the email is sent, then the draft object is deleted (Free: the outbound object is deleted once Resend accepts the email); Resend receives a presigned GET URL as the attachment `path` (§2.5).
- **Retention and deletion:** MongoDB TTL can delete documents but not R2 objects, so `attachments` and `email_contents` have `expireAt` without a TTL index. The daily `retention` job finds expired documents, deletes their objects with `DeleteObjects` (up to 1,000 keys per call), then deletes the documents. Connection history deletion and org purge delete by prefix (`ListObjectsV2` + `DeleteObjects`).
- **Backstop lifecycle rules** on the bucket: objects under `drafts/` expire after 30 days (abandoned uploads); objects under `orgs/` expire after 800 days (longest plan retention of 2 years, plus margin).
- **Cost:** R2 bills storage and operations, with no egress fees, so attachment downloads and Resend fetching `path` URLs cost nothing extra.

### 2.14 Delete, Trash & cleanup
Resend's API has no delete for sent or received emails (only cancel for scheduled emails), so deleting an email removes Wisemail's copy only. Resend objects that do have a delete endpoint are deleted in Resend too.

| Item | In Wisemail | In Resend |
|---|---|---|
| Inbox thread / message | Trash → permanent | Not possible; Resend keeps its copy until its retention ends |
| Sent email (Activity) | Trash → permanent | Not possible |
| Scheduled email | Delete | `POST /emails/:id/cancel` first; delete here only after Resend confirms |
| Draft | Delete immediately (with Undo) | — (drafts are ours) |
| Notification | Delete / clear all | — |
| Broadcast: draft or scheduled | Delete | `DELETE /broadcasts/:id` (also cancels a scheduled one) |
| Broadcast: sent | Remove from Wisemail | Not possible |
| Contact, segment, topic, template, domain, API key | Delete | Deleted through the matching Resend endpoint first; mirror removed after success |

**Trash.** `trash(items)` sets `trashedAt`, `trashedBy`, `purgeAt = now + 30 days` on the emails (and thread when the whole thread is chosen) in one transaction, recomputes thread counters, and publishes realtime events. All list queries filter `trashedAt: null`; the Trash view shows the rest. `restore(items)` clears the fields. The UI shows a 5-second Undo toast that calls `restore`.

**Permanent delete** (Owner/Admin; also the `purge-trash` job and `delete` cleanup rules). Per email, in a transaction: write a `deletion_tombstones` record (Resend id, hashed Message-ID), delete `email_contents`, `attachments`, `webhook_events` for that email, the email itself, and an emptied thread; after commit, delete its R2 objects (`DeleteObjects`, retried by the job if it fails). `metric_rollups` and `usage_periods` are not touched.

**Keeping deleted emails deleted.** Tombstones are checked by the webhook processor (§2.1), the sync backfill (§2.2), and threading (a new message whose `In-Reply-To` matches a deleted Message-ID starts a new thread).

**Bulk and filtered deletes.** Selections up to 100 items run inline. Larger selections, and "all matching this filter", start the `bulk-delete` Inngest job with the filter snapshot and a cap time (items that arrive later are not included); it works in batches of 500 with one transaction each, reports progress over realtime, and writes one audit entry with the count. Bulk permanent delete requires typing the number of items to confirm.

**Jobs.**
- `purge-trash` (daily): permanently deletes items whose `purgeAt` has passed.
- `cleanup-rules` (hourly, P1): applies enabled rules with `olderThanDays`; `block_sender` rules run on arrival inside `process-event` / `fetch-inbound`, putting matching inbound mail straight into Trash without a notification.

**Permissions.** Moving to Trash and restoring follow the member's existing inbox/activity access (Support and Developer included; Viewer cannot). Permanent delete, Empty trash, bulk permanent delete, and cleanup rules with the `delete` action: Owner and Admin only. Deleting Resend objects follows the existing permissions for those objects.

## 3. Security

- **Tenant isolation:** every tenant collection has `orgId`; repositories take `orgId` from the session (never from input) and add it to every filter. Compound indexes start with `orgId`. Project-scoped members get an additional `projectId ∈ allowed` filter. Integration tests assert cross-tenant reads fail.
- **Secrets:** Resend API keys and webhook signing secrets are encrypted with AES-256-GCM using a per-record data key wrapped by a KEK from env (`kekId` stored for rotation). Decryption happens only in server code; secrets are never serialized to the client; only `last4` is shown.
- **AuthZ:** Better Auth access control with permissions per resource (`connection:create`, `email:send`, `broadcast:send`, `apiKey:delete`, …) checked in each server action.
- **Webhooks:** Svix signature and timestamp tolerance verified; per-connection URL; body size limit.
- **Email rendering:** sanitized HTML inside `<iframe sandbox>` (no scripts, no same-origin, no forms, no top navigation; links open in a new tab via `allow-popups` with `rel="noopener noreferrer"`), strict CSP (`img-src https: data:`, no `script-src`). Remote images load automatically by product decision; this lets senders see when a message is opened and reveals the viewer's IP to them. The iframe uses `referrerpolicy="no-referrer"` so our URLs don't leak.
- **Attachments:** stored in a private R2 bucket; access only through an authorized route that issues 5-minute presigned URLs, with `Content-Disposition: attachment` for non-image types. Upload URLs are single-purpose (signed size and type, 5 minutes).
- **Audit log** for sensitive actions; **rate limiting** on auth and send endpoints.
- **Data deletion:** removing a connection deletes our webhook in Resend, the encrypted key, and (after confirmation) its synced data.

## 4. Project structure

```
wisemail/
├─ app/
│  ├─ (marketing)/                 # landing, pricing
│  ├─ (auth)/sign-in, sign-up, invite/[token]
│  ├─ (app)/[orgSlug]/
│  │  ├─ page.tsx                  # overview dashboard
│  │  ├─ inbox/[[...threadId]]/
│  │  ├─ compose/
│  │  ├─ activity/[emailId]/
│  │  ├─ scheduled/
│  │  ├─ insights/
│  │  ├─ audience/{contacts,segments,topics,properties}/
│  │  ├─ broadcasts/[id]/
│  │  ├─ templates/[id]/
│  │  ├─ automations/
│  │  ├─ domains/[id]/
│  │  ├─ api-keys/
│  │  ├─ alerts/{rules,incidents}/
│  │  ├─ notifications/
│  │  └─ settings/{general,members,projects,connections,senders,ai,usage,billing,audit-log}/
│  └─ api/
│     ├─ auth/[...all]/route.ts    # Better Auth
│     ├─ ingest/resend/[connectionId]/route.ts
│     ├─ inngest/route.ts
│     ├─ billing/stripe-webhook/route.ts  # credit packs, invoice events
│     ├─ stream/route.ts           # SSE
│     └─ files/[attachmentId]/route.ts  # authorize, redirect to presigned R2 URL
├─ components/{ui,app,charts,editor,inbox,mascot,tour}/
│  └─ icons/animated/              # lucide-animated icons (shadcn registry) + our own in the same pattern
├─ lib/
│  ├─ auth/{server,client,permissions}.ts
│  ├─ db/{connect,transaction,ids,refs,models/*}.ts  # withTransaction, branded ids, assertRefs
│  ├─ repositories/*.ts            # orgId-scoped data access
│  ├─ services/*.ts                # business logic used by actions and jobs
│  ├─ resend/{adapter,client-factory,events,types}.ts
│  ├─ ai/{client,prompts/*,credits}.ts
│  ├─ billing/{plans,entitlements,metering,stripe}.ts
│  ├─ env.ts                       # Zod-validated env, Stripe mode check
│  ├─ storage/{r2,keys,presign,file-url}.ts # R2 client, key builders, presigned URLs, per-mode file URLs
│  ├─ tours/*.ts                   # product tour definitions
│  ├─ deletion/{trash,purge,tombstones,rules}.ts # Trash, permanent delete, tombstone checks, cleanup rules
│  ├─ crypto/envelope.ts
│  ├─ mail/{parse,sanitize,thread}.ts
│  ├─ validation/*.ts              # Zod schemas
│  └─ realtime/{publish,hub,stream,use-live-query}.ts
├─ instrumentation.ts              # startup: env validation, exit on failure
├─ scripts/check-env.ts            # prebuild: env + Stripe price mode check
├─ inngest/{client,functions/*}.ts
├─ emails/                         # React Email system templates
├─ tests/{unit,integration,e2e}/
└─ docs: PRD.md TRD.md UCD.md DBD.md FED.md PRICING.md
```

## 5. API strategy

- **Server Actions** for all UI mutations (compose, send, create segment, toggle tracking, rules). Each action: authenticate → resolve org from session → authorize permission → Zod-validate → call service → return typed result `{ ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }`.
- **Route Handlers** only where HTTP semantics are required: webhook ingest, Inngest, SSE, file downloads, Better Auth, and paginated list endpoints consumed by TanStack Query (`/api/v1/...` internal, session-authenticated, cursor pagination `?cursor=&limit=`).
- **Services** are shared by actions, route handlers, and Inngest functions; they never read request objects.
- **Resend adapter** exposes typed methods (`listDomains`, `sendEmail`, `getReceivedEmail`, …), maps Resend errors to our error codes (`resend_rate_limited`, `resend_forbidden`, `resend_not_found`, `resend_validation`), and normalizes pagination.
- **Public API** (P2): versioned `/api/public/v1`, org API tokens, same services.

## 6. Performance targets

| Path | Target |
|---|---|
| Webhook ingest response | p95 < 300 ms |
| Event visible in UI (ingest → SSE) | p95 < 5 s |
| User's own change visible to other open sessions (write → SSE) | p95 < 1 s |
| Overview dashboard load (rollups) | p95 < 800 ms server time |
| Inbox thread list (50 rows) | p95 < 400 ms |
| Inbound body available after `email.received` | p95 < 20 s |

## 7. Decisions to revisit

- **Inngest vs. Vercel Queues:** Inngest chosen for per-key throttling and cron in one place; Vercel Queues (public beta) could replace it later.
- **Full-text search:** start with MongoDB text indexes; move to Atlas Search when inbox volume requires relevance ranking and fuzzy matching.
- **Convex:** kept MongoDB (§2.12). Revisit if the realtime layer becomes a maintenance burden; before switching, model Convex cost at Agency-scale event volume and confirm Better Auth organization and Stripe plugins work through Convex's Local Install.
