<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Wisemail

Multi-tenant SaaS dashboard on top of Resend. Product name is always "Wisemail".

## Docs map

- `docs/PRD.md` features, `docs/UCD.md` use cases, `docs/TRD.md` stack, architecture and project structure (§4)
- `docs/DBD.md` data model, `docs/FED.md` design system (tokens, type, motion), `docs/PRICING.md` plans
- `docs/PLAN.md` phased build checklist; update it as work lands

## Commands

- `pnpm dev` / `pnpm build` (runs `scripts/check-env.ts` first) / `pnpm start`
- `pnpm typecheck` (runs `next typegen` first), `pnpm lint`, `pnpm test`, `pnpm test:watch`, `pnpm format`
- `pnpm db:dev` starts a single-node MongoDB replica set `rs0` on 127.0.0.1:27017 (data in `.data/mongo`)
- Every phase ends green on typecheck, lint, test and build.

## Conventions

- Check `node_modules/next/dist/docs/` for Next.js APIs before using them (nextjs.org may be unreachable).
- Read env only through `lib/env.ts` (`env`, `parseEnv`); never `process.env` directly. New variables go in the schema and `.env.example`.
- Use semantic design tokens from `app/globals.css` (`bg-canvas`, `text-ink`, `text-muted`, `bg-accent`, `bg-success-soft`, ...), never raw hex. Theme is `data-theme` on `<html>` (light/dark, absent = system).
- shadcn/ui components live in `components/ui` and are already mapped to the tokens (`accent` is the brand color, hover surfaces use `canvas-sunken`). Add new ones by hand or from the shadcn registry, then restyle.
- Tests: `tests/unit`, `tests/integration` (Vitest; `*.test.tsx` runs in jsdom), `tests/e2e` (Playwright).

## Fake-mode services

External services run against in-memory fakes unless switched on (default fake in dev/test, live in production):
`RESEND_MODE=live|fake`, `STORAGE_MODE=r2|fake`, `AI_MODE=live|fake`, `INNGEST_DEV=true` (local dev server, no keys), `BILLING_ENABLED=false` (no Stripe checks).

## MongoDB

- Dev/test binary: `/opt/mongo/mongod` (mongod 8.3). `mongodb-memory-server` cannot download binaries here; Vitest sets `MONGOMS_SYSTEM_BINARY=/opt/mongo/mongod` in `vitest.config.mts`.
- Transactions need a replica set: use `pnpm db:dev` for the dev database.

## Connections, ingest and jobs (Phase 2)

- Secrets: `lib/crypto/envelope.ts` (AES-256-GCM, per-record DEK wrapped by `ENCRYPTION_KEK_CURRENT`, `kekId` stored). During rotation set `ENCRYPTION_KEK_PREVIOUS` + `ENCRYPTION_KEK_PREVIOUS_ID`; `rewrap()` moves records to the current KEK. Ciphertexts carry AAD `connections:<id>:<field>`, so use `keyAad`/`secretAad` from `lib/services/webhook-secret.ts`. Never return ciphertext to the client; DTOs carry `last4` only.
- Resend goes through `lib/resend/adapter.ts` (`getResendAdapter(key)` from `client-factory.ts`); errors are `ResendError` with `resend_*` codes. Team fingerprint = HMAC of the team's oldest domain (else oldest API key) id, see `lib/resend/fingerprint.ts`.
- Ingest is `POST /api/ingest/resend/[connectionId]` (raw body, Svix verify, dedupe `(connectionId, svixId)`, enqueue). Jobs are enqueued only via `lib/jobs/send.ts` (in tests recorded in `sentJobs`; in dev a missing Inngest dev server only logs a warning). Run the dev server with `npx inngest-cli@latest dev` to process them.
- `pnpm webhook:test <connectionId> [--type email.opened]` posts a signed sample event to a connection's ingest URL.

### Fake Resend keys (`RESEND_MODE=fake`)

Key format `re_<team>[_<flag>...]`. Same `<team>` = same Resend account (duplicate-connect check); flags:

| Key example | Behaviour |
|---|---|
| `re_acme_full` (any key without a flag) | Healthy full-access key; webhook registered, connection `active` |
| `re_acme_sending` | Sending-only key: rejected ("This key can only send email...") |
| `re_acme_invalid` | Resend rejects the key ("Resend rejected this key...") |
| `re_acme_ratelimit` | Every call answers 429 ("Resend is asking us to slow down") |
| `re_acme_slotfull` | No free webhook slot: connection saved as `needs_attention` / `webhook_slot_unavailable`, Retry keeps failing |
| `re_acme_nodomains` | Team without domains (identity comes from its API keys) |
| a 6th webhook on one team | Also "no slot" (fake limit is 5, like Resend Pro); deleting one and pressing Retry succeeds |

The fake store lives in memory (per server process): restarting the dev server forgets fake webhooks, but stored connections and their signing secrets stay valid.

## Sync, mirrors and checklist (Phase 3)

- Mirror models (`domains`, `api_keys`, `templates`, `automations`, `contacts`, `segments`, `topics`, `contact_properties`, `broadcasts`) share `mirrorFields` from `lib/db/models/mirror.ts`; every sync upsert is keyed `(orgId, connectionId, resendId)` and stamps `syncedAt` with the run's `startedAt`. Sync never writes fields owned elsewhere (`domains.projectId`, `dnsCheck`, `contacts.engagement`, `broadcasts.stats`). Resend's list endpoints do not return API key permission/domain or topic visibility, so those stay unset.
- `lib/services/sync.ts`: stages in `STAGES` (order = TRD §2.2.4; add Phase 4 email stages to `EMAIL_STAGES` and their keys to `lib/dto/sync.ts`). `syncNextPage(runId)` does exactly one page and checkpoints in `sync_runs.resources` (`name` = stage, `cursor`, `count`, `removed`); removal of mirrors missing in Resend happens only when a stage finished its pass. `startOrResumeRun` continues a `running` run, or a `failed` one younger than 1 h (so Retry resumes at the failed stage).
- `inngest/functions/sync-connection.ts`: `runSyncLoop` = one `step.run` per page, `step.sleep` on `rate_limited`, hands over via `step.sendEvent` after 400 pages; throttle/concurrency keyed by `connectionId`.
- Requesting a sync: `requestSync` / `syncNow` (connection:update) create the run first, then enqueue. Dev fallback: if the job was not delivered (no Inngest dev server), `INNGEST_DEV` is on and `NODE_ENV !== "production"`, the sync runs inline in the server process (`shouldRunInline`). With a reachable Inngest server nothing runs inline.
- Checklist: pure `computeChecklist` in `lib/services/checklist.ts`, stored on `connections.checklist` after every sync and fix. Fixes in `lib/services/checklist-fixes.ts` (`enableTracking` needs domain:update, `reregisterWebhook` needs connection:update). Interactive Resend calls use `withRateLimitRetry`.
- Pagination: `lib/resend/pagination.ts` (`toPage`, `iteratePages`, `collectAll`).

### Extra fake-Resend behaviour

Seeded per team on first use: 3 domains (verified without open tracking + receiving; verified without receiving; pending DNS), 3 API keys, 3 segments, 2 topics, 2 contact properties, 3 templates, 12 contacts, 2 broadcasts, 2 automations. Additional key flags (set when the team is first used):

| Flag | Behaviour |
|---|---|
| `allgood` | All domains verified, tracking on, receiving on: fully green checklist |
| `manycontacts` | 230 contacts instead of 12 (pagination, checkpoint/resume) |
| `ratelimitsync` | First `templates` list call answers 429 once (sync backoff) |


## Mail core (Phase 4, backend)

- Services (all take `OrgContext`, return DTOs from `lib/dto/mail.ts`, apply `projectFilter`): `emails.ts` (`listThreads` for inbox|sent|scheduled|trash with keyset cursors, `getThread`, `listActivity`, `getEmailTimeline`, `retryInboundFetch`), `threads.ts` (read/unread per member, `trashItems`/`restoreItems`, threading + cache maintenance), `senders.ts` (status derivation and `recomputeSenderStatuses`), `drafts.ts`, `sending.ts` (`sendEmail`, `deliverEmail`, cancel/reschedule), `inbound.ts`, `events-processing.ts` (`process-event`), `attachments.ts` (authorized file access). Jobs: `inngest/functions/{process-event,fetch-inbound,send-email}.ts`; enqueue only through `lib/jobs/send.ts`.
- Object storage (`lib/storage`): `STORAGE_MODE=r2` uses Cloudflare R2 (`R2_*`, endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`); `fake` (dev/test default) stores files under `.data/storage` (tests: a temp dir) and "presigns" with HMAC tokens served by `/api/dev-storage/[token]` (404 in production or when R2 is active). Build keys only with `storageKeys`; get URLs through `presign.ts` / `file-url.ts`; never expose keys to clients. Files download through `/api/files/[attachmentId]` (authorized, then a 5-minute presigned redirect).
- Plan decides file handling (`lib/services/mail-settings.ts`): Free keeps inbound files at Resend (`storageMode: resend`, metadata only), Pro and up and trial copy raw MIME and attachments into storage (`r2`). Set `org_settings.plan` in dev to try each.
- Outbound emails carry the tag `mw_email=<emails._id>`; webhooks find app-sent emails by it. `process-event` is exactly-once (claim, upsert, rollups and realtime in one transaction); reprocessing is a no-op.
- Sending runs inline for immediate emails without attachments, otherwise through the `send-email` job (in dev without an Inngest server it runs in-process). Ingest likewise processes events in-process in dev when no Inngest server is reachable.
- `pnpm mail:check` runs the whole mail flow against in-memory MongoDB, fake Resend and fake storage (sync, sender, inbound with attachment, reply, delivered/opened webhooks, receipts). It needs no dev database.
- Fake Resend additions: `sendEmail` records what it accepts (`fakeSentEmails(key)`), refuses a `from` domain the fake team has not verified with `resend_domain_rejected`, honours idempotency keys, supports cancel/reschedule of scheduled emails; `createFakeReceivedEmail(key, {...})` creates a received email (raw MIME with attachments, `In-Reply-To`/`References`) and returns the `email.received` event data to post through ingest; `expireFakeReceivedEmail` makes Resend forget it (404s).
- Tests: `tests/integration/mail-*.test.ts` share `mail-helpers.ts` (`seedOrg`, `ctxFor`, `storeEvent`).

## System email, auth, alerts and notifications (Phase 5)

- System email goes through `lib/services/system-email.ts` (React Email templates in `emails/`, literal hex tokens in `emails/tokens.ts`). `RESEND_MODE=fake`: messages land in an in-memory outbox (`getOutbox`, `findOutbox`, `clearOutbox` in tests) and, in development, in `.data/outbox/*.html` and the `/dev/outbox` page, with a log line carrying the link.
- Email verification is required: sign-up creates no session; tests create users with `signUpVerified(auth, ...)` from `tests/integration/helpers.ts`. Invite links are `/invite/<random token>` (only its SHA-256 is stored); never build them from the invitation id.
- Alerts: `lib/services/alerts.ts` (CRUD, limits) and `alert-evaluation.ts` (engine, reads hourly rollups). Notifications: `notifications.ts` (fan-out by permission, project scope, preferences; email outbox), `mail-notifications.ts` (wording and audience per event). Call these from inside the caller's transaction with `{ session }`; emails are sent after commit by `sendPendingNotificationEmails`.
- Realtime topics for the bell and incidents: `topics.notifications(orgId, userId)` and `topics.incidents(orgId)`.

## AI (Phase 7)

- One door: `lib/ai/client.ts` (`getAiClient()`; tests inject with `setAiClient`). Features never call the SDK; they call `runAi` (`lib/ai/run.ts`): plan gate + org opt-out (`access.ts`) → `reserveCredits` → model → `commitCredits` (+ `ai_usage` row) or `releaseCredits`. Add a feature by adding a prompt in `lib/ai/prompts/`, a cost in `AI_CREDIT_COST`, a flag in `org_settings.ai.features`, and a service under `lib/services/ai-*.ts`.
- Privacy rules live in `lib/ai/prompts/text.ts`: strip quoted history and signatures, truncate, no attachments, wrap third-party text with `untrusted()`. Never put addresses or bodies into the anomaly facts.
- Errors are `AiError` (`ai_not_in_plan`, `ai_disabled`, `ai_feature_disabled`, `ai_credits_exhausted`, `ai_unavailable`, `ai_bad_output`, `ai_no_content`) with friendly copy; `orgRoute`/`orgAction` already surface them.
- Client code reads availability from `components/ai/use-ai-status.ts` (fetches `/api/v1/ai/status`, shared cache) and calls `/api/v1/ai/{draft,compose,explain}` with JSON; none of it imports server actions, so composer/inbox tests need no mocks.
- `AI_MODE=fake` (dev/test default) uses `lib/ai/fake.ts`: deterministic outputs (keyword rules for triage, tone openers for drafts); `[[ai-fail]]` in the input makes a call fail. AI is on by default for paid orgs and inert on Free: set `org_settings.plan` to `pro` in dev to try it. Credits: Pro 1,000, Team 5,000, Agency 15,000 per month (200 during the trial), from the plan catalog.
- Triage runs as the `ai-triage` job (in dev without an Inngest server it runs in-process). Tests: `tests/unit/ai-*.test.ts`, `tests/integration/ai.test.ts`, `components/ai/__tests__`.

## Billing and Stripe (Phase 8a)

- Only active with `BILLING_ENABLED=true`; beta behaviour is unchanged otherwise. `STRIPE_MODE=live|fake` (fake by default in dev/test unless `STRIPE_SECRET_KEY` is set; not allowed in production with billing on). Services call `getStripe()` from `lib/billing/stripe.ts`, never `new Stripe`; the fake (`lib/billing/stripe-fake.ts`) implements the SDK subset used by the app and the Better Auth Stripe plugin.
- Two webhook endpoints: the plugin's `/api/auth/stripe/webhook` (`STRIPE_WEBHOOK_SECRET`: subscriptions) and `/api/billing/stripe-webhook` (`STRIPE_BILLING_WEBHOOK_SECRET`: credit packs, invoices). Subscription state is only ever derived from Stripe through `syncSubscription` (`lib/services/billing.ts`); nothing else writes `org_settings.plan` when billing is on. Webhook handlers must stay idempotent (billing events are recorded in `stripe_events`).
- Prices: one env var per price, `STRIPE_PRICE_<KEY>` (keys in `lib/billing/stripe-price-keys.ts`); fake mode falls back to `price_fake_<key>`. The trial is app-side, not a Stripe trial.
- Fake mode in the browser: with `BILLING_ENABLED=true STRIPE_MODE=fake`, checkout and the portal redirect to `/dev/stripe/checkout|portal/<id>` (pay, cancel, fail a payment). `pnpm stripe:simulate <orgSlug> past_due|paid|cancel|resume|deleted` sends signed events to the running dev server.
- Tests: `tests/integration/stripe-billing.test.ts` runs the whole flow (plugin, webhooks, fake Stripe) with `vi.stubEnv("BILLING_ENABLED", "true")`; set env stubs before any import of `lib/env`.

## Platform admin panel (`/admin`)

- Platform admin = Better Auth user role `admin` (the `admin` plugin, `lib/admin/plugin.ts`). `PLATFORM_ADMIN_EMAILS` (comma-separated, case-insensitive) promotes verified addresses when a session is created for them (sign-in or verification), so the first admin needs no database edit. Everyone else: no role change, ever, from the app.
- Guard: `lib/admin/guard.ts` (`server-only`). `requirePlatformAdmin()` in every admin layout/page and `adminAction()` (`lib/admin/action.ts`) in every admin server action answer **404 / `not_found`** to non-admins, visitors, banned users and impersonation sessions (the proxy lets `/admin` through without a session cookie so a visitor cannot tell it exists). Admin writes never take permissions from input.
- Code: `app/(admin)/admin/**` (pages + `actions.ts`), `components/admin/**`, `lib/services/admin/{overview,users,orgs,health,audit}.ts`, `lib/dto/admin.ts`. Features: overview counters, users (search, keyset cursor, ban/unban, revoke sessions, resend verification, impersonate), organizations (plan via `applyPlanChange`, per-limit overrides, trial start/extend, suspend), read-only system health.
- Audit: every write goes to `audit_logs` as `admin.*` with the admin as actor, the target and a `reason` (required for destructive ones). Org-scoped actions are recorded under that org (its Owners/Admins see them); user-scoped ones under the platform scope `PLATFORM_SCOPE_ID` (`000000000000000000000000`), which no tenant can read. Impersonation start/stop is also written under each of the user's workspaces.
- Impersonation: Better Auth `impersonateUser` swaps the session cookie for a one-hour session of the target (`session.impersonatedBy` = admin); admins cannot impersonate admins (plugin default, also checked in the service). `ImpersonationBanner` ("Viewing as X" + Stop) is rendered by `app/(app)/layout.tsx` and the onboarding page; Stop (`components/admin/impersonation-actions.ts`) is deliberately not behind the admin guard because the session belongs to the target.
- Suspension: `org_settings.suspended = { at, by, reason }`. `getOrgContext` answers `{ status: "suspended" }`; `requireOrg` redirects to `/suspended/<slug>`, `orgAction`/`orgRoute`/`/api/stream` refuse (`workspace_suspended`). Ingest and sync keep running (nothing is lost); it blocks people, not data. Lift it from the org's admin page.
- Limit overrides write `org_settings.limitOverrides` (the keys in `lib/admin/limits.ts`); clearing a field falls back to the plan. They apply through `getEntitlements`.
- Tests: `tests/integration/admin.test.ts` (guard, allowlist, ban, impersonation, overrides, plan/trial, suspension, audit).

## Seed data (`pnpm db:seed`)

- `pnpm db:seed` creates a platform admin and four demo workspaces (free, pro, team, agency) through the real services and Better Auth, against the fake Resend/storage/AI (`scripts/seed.ts`, ~40-60 s, needs `pnpm db:dev`). Idempotent: finished workspaces are skipped (marker in `seed_meta`); a workspace whose seed was interrupted needs `--reset`.
- `--reset` drops **only** a database named `wisemail` (and `.data/storage`); it refuses any other name. The script never runs with `NODE_ENV=production`, and refuses a `MONGODB_URI` host other than localhost / 127.0.0.1 unless `--force-remote`.
- All users share the password `wisemail-dev-123` (printed with the table at the end): `admin@wisemail.test` (platform admin, `/admin`); `free.owner@`, `free.viewer@`; `pro.owner@`, `pro.developer@`, `pro.support@`, `pro.viewer@` (+ pending invite `invitee.pro@`); `team.owner@`, `team.admin@`, `team.developer@`, `team.support@`, `team.viewer@`, `team.scoped@` (support, only project Marketing; + pending invite `team.invitee@`); `agency.owner@`, `agency.admin@`, `agency.developer@` (+ `team.admin@` also a developer here). All `@wisemail.test`.
- Workspaces: Side Hustle Co (free, `side-hustle`), Pixel Post (pro), Northwind Labs (team, projects Marketing/Product, 230 contacts), Brightside Agency (agency, one healthy and one `needs_attention` connection). Paid ones have senders, inbound threads with attachments, replies, sent mail with delivered/opened/clicked/bounced events, a scheduled email, a trashed thread, a bounce-rate rule with an open incident, notifications and ~30 days of rollups. Fake Resend state lives in the seed process only; the dev server recreates teams lazily, stored mail is in MongoDB and `.data/storage`.

