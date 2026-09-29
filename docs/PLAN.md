# PLAN — Wisemail build checklist

> Living checklist. Updated as work lands. Source of truth for scope: `PRD.md` (features), `TRD.md` (stack/architecture), `DBD.md` (data), `UCD.md` (use cases), `FED.md` (design), `PRICING.md` (plans).
> Design direction reference: FED.md tokens + the "Wisemail Design Direction" board.

Legend: `[x]` done · `[~]` in progress / partial · `[ ]` not started

## Working agreements

- External services run **locally or mocked** until real credentials are added to the environment:
  MongoDB → Docker `mongo` replica set / `mongodb-memory-server` in tests; Resend, Inngest, R2, AI, Stripe → adapters with in-memory fakes selected by env (`*_MODE=fake`).
- Every env var is still declared in `lib/env.ts`; plugging in real creds must need no code change.
- Each phase ends green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

---

## Phase 1 — Foundation

- [x] Next.js 16 (App Router) + React 19 + TypeScript strict, pnpm
- [x] Tailwind v4 with CSS-variable tokens from `FED.md` §11 (light default + warm dark, `data-theme` override + system)
- [x] Fonts: Plus Jakarta Sans + Geist Mono
- [x] shadcn/ui base components restyled (button, input, card, dialog, dropdown, badge/chip, tooltip, toast/sonner)
- [x] `lib/env.ts` Zod env schema (fake modes, Stripe mode check) + `scripts/check-env.ts` prebuild + `instrumentation.ts`
- [x] Tooling: ESLint, Prettier, Vitest (+ `mongodb-memory-server`), Playwright skeleton
- [x] Mongo: `lib/db/connect`, `withTransaction`, branded `Id<"...">` types, `assertRefs`
- [x] Better Auth (MongoDB adapter + organization plugin, roles owner/admin/developer/support/viewer, permissions)
- [x] Auth pages: sign-in, sign-up; org creation onboarding; `(app)/[orgSlug]` guard + active org
- [x] `org_settings` created with org (free plan, UTC)
- [x] App shell: sidebar dock (nav groups Mail / Audience / Health), topbar (breadcrumb, search ⌘K placeholder, notifications), usage tile, theme toggle
- [x] Wizi mascot component (moods: idle, wave, wow, think, sleep, sad) with reduced-motion support
- [x] Overview dashboard layout (greeting, KPI cards, empty states) — data from rollups later
- [x] Marketing placeholder landing page

## Phase 2 — Connections & webhook ingest

- [x] `lib/crypto/envelope.ts` AES-256-GCM envelope encryption (per-record DEK wrapped by KEK, `kekId`, rotation; AAD-bound; `rewrap`)
- [x] `lib/resend/adapter.ts` typed methods + error mapping (`resend_rate_limited|forbidden|not_found|validation|unauthorized|unknown`); fake client for dev/tests (methods so far: `listDomains`, `listApiKeys`, `createWebhook`, `deleteWebhook`; the rest arrive with the phases that need them)
- [x] Models: `connections`, `webhook_events`, `realtime_events`, `audit_logs`, `sync_runs`
- [x] Connection onboarding service (TRD §2.2): validate full-access key, reject sending-only, team fingerprint dedupe, encrypt, register webhook, store signing secret, `needs_attention` on no slot
- [x] Server actions: add / rename / remove connection (+ retry setup) (removal deletes our webhook in Resend), permission-checked, audited
- [x] Settings → Connections page (list, add dialog with slot notice, status chips, last4 only)
- [x] `POST /api/ingest/resend/[connectionId]`: raw body, Svix verify, dedupe `(connectionId, svixId)`, enqueue `resend/event.received`, 200
- [x] Inngest client + `/api/inngest` route; `process-event` + `sync-connection` stubs (local dev server / fake)
- [x] Tests: envelope crypto, adapter error mapping, onboarding service, ingest route (valid, bad sig, dup, unknown connection), tenant isolation

Phase 2 follow-ups (not blocking): synced-data deletion choice on remove, key rotation (UC-06 "Rotate"), Agency 16th-connection confirmation (Phase 7), live `useLiveQuery` refresh of the connections list (Phase 5), email verification via system email.

## Phase 3 — Sync & mirrors
- [x] `sync-connection` paged + checkpointed (domains → api keys → audience → templates → broadcasts → automations; emails stage is a hook, lands in Phase 4)
- [x] Models: domains, api_keys, templates, automations, contacts, segments, topics, contact_properties, broadcasts
- [x] Setup checklist per connection with one-click fixes (tracking toggles, webhook re-register; DNS/MX guidance only)
- [x] Projects CRUD + member scopes: `projects` / `member_scopes` models, `lib/services/projects.ts` (plan limit, uniqueness, soft delete cascade), `member-scopes.ts`, `project-scope.ts` (`projectFilter`, `OrgContext.projectScope`), Settings → Projects and Members (invite link, roles, scope editor), `/invite/[token]` acceptance
- [x] Sidebar usage tile wired to real data (`lib/services/usage.ts`: plan, connection health/limit, allowance; tracked emails stay 0 until Phase 4)

## Phase 4 — Mail core
Backend (services, jobs, storage; no UI yet):
- [x] Models: emails, email_contents, attachments, threads, thread_member_states, labels, deletion_tombstones, senders, drafts, metric_rollups (orgId-first indexes, compound text index for search, trash fields, `expireAt` without TTL on documents that own R2 objects)
- [x] `lib/storage`: R2 (S3 client, endpoint derived from `R2_ACCOUNT_ID`), key builders, presigned GET (5 min, `attachment` with exact filename; inline only for safe image types) / PUT (signed size and type), local fake store (`.data/storage`) with HMAC-token URLs served by `/api/dev-storage/[token]`, `file-url.ts` for both storage modes
- [x] `lib/mail`: `parse` (mailparser), `sanitize` (DOMPurify config per TRD §3), `thread` (Message-ID / References, subject + participant fallback in 14 days, tombstone-aware, deterministic), status ranking
- [x] `process-event`: one transaction per event (claim `processedAt`, upsert email, `metric_rollups` hour and day, realtime), status ranking + timeline via `webhook_events`, tombstones (`ignoredReason: deleted`), adopts app-sent emails by `mw_email` tag, `email.received` -> `fetch-inbound`, `domain.*` -> sender recompute
- [x] `fetch-inbound`: raw MIME (paid: to R2), mailparser, sanitize, attachments (paid: to R2, Free: Resend URLs), threading, thread caches, unread, realtime
- [x] Senders service + status derivation (`active | domain_unverified | connection_inactive | disabled`), recompute on `domain.*` events, domain sync, connection status changes and Resend domain rejections
- [x] Drafts (optimistic concurrency, presigned attachment uploads with confirm) and sending service (sendability check, `email:send`, reply headers, tags, idempotency key, inline vs `send-email` job, scheduled + cancel + reschedule, needs attention list)
- [x] UI-facing services: `listThreads` (inbox / sent / scheduled / trash, keyset cursor, search, unread, `projectFilter`), `getThread` (sanitized HTML with signed images, attachments, read receipts), read/unread per member, trash/restore, `listActivity`, `getEmailTimeline`
- [x] `GET /api/files/[attachmentId]` (session + org + role + project scope, 302 to a 5-minute presigned URL, small Free-plan files streamed)
- [x] Tests (threading, sanitizing, ranking, idempotency, tombstones, fetch-inbound end to end, sending, files route, project scope) and `pnpm mail:check`
UI (next agent):
- [ ] Composer (TipTap rich, CodeMirror HTML, template mode, sandboxed preview, scheduling, attachments via presigned upload)
- [ ] Inbox (threads, read state, replies, read receipts), Activity log + email timeline, Scheduled, Sent
- [ ] Senders management UI

## Phase 5 — Live, insights, alerts
- [ ] Realtime: `realtime_events` change stream → SSE `/api/stream` → `useLiveQuery`
- [ ] `metric_rollups` + Insights page (Recharts)
- [ ] Alert rules/incidents, notifications feed + preferences, digest emails (React Email)

## Phase 6 — Audience, domains, API keys
- [ ] Domains view + tracking toggles, DNS check job
- [ ] Contacts, segments, topics, properties, broadcasts, templates UI
- [ ] API keys (P1)

## Phase 7 — AI, plans, tours, cleanup
- [ ] AI client + credits: triage, drafts, compose helpers, anomaly explanation
- [ ] Plan catalog, entitlements, metering, usage page (billing disabled in beta)
- [ ] Product tours (NextStepjs + Wizi card)
- [ ] Trash, permanent delete, bulk delete, purge + retention jobs
- [ ] Audit log page

## Phase 8 — Launch
- [ ] Stripe billing (checkout, portal, overage meters, credit packs, trial)
- [ ] Sentry, e2e suite, performance targets (TRD §6)

---

## Log

- 2026-09-29 — Phase 4 backend landed (mail core services, no UI). Decisions: emails get an `mw_email` tag so webhooks find app-sent emails before Resend's id is stored (an id-less stub is folded into our document if an event still wins the race); Message-ID of our own sends comes from Resend (the `email.sent` event's `message_id`, the fake reports it at send) since we do not send our own `Message-ID` header; scheduled sends use Resend's native `scheduled_at` (the `send-email` job runs at once), so the sendability re-check runs when the job runs, not at fire time; `process-event` is exactly-once because the claim, upsert, rollups and realtime event share one transaction; `processedAt` claim + `ignoredReason` on webhook events; rollups keep `hour` and `day` buckets for `dimension all` and `stream`; `replied` is counted when an inbound message threads by Message-ID into a conversation with an outbound reply; storage mode follows the plan (Free: files stay at Resend; Pro and up and trial: R2). Follow-ups: sync backfill of sent/received emails (emails stage hook in `sync.ts`), permanent delete + `deletion_tombstones` writes + `purge-trash`/`retention` jobs (Phase 7), notifications and alert rules in `process-event` (Phase 5), metering into `usage_periods` (Phase 7), labels/assignee/star/archive actions, block_sender rules, `backfill-storage` on upgrade, R2 presign verified only offline (needs a live bucket check).

- 2026-09-29 — Phase 3 done (232 tests). **Launch blocker:** invites accept on email match while email verification is off and invite tokens are Better Auth ObjectIds (partly predictable) — require verified email + random tokens before launch. Follow-ups: contacts sync is N+1 (2 extra calls/contact); per-connection rate-limit bucket in Mongo (TRD §2.3) not built, sync paces in-process; topbar crowds at ~1100px (breadcrumb truncates, search wraps); connection removal keeps mirrors; `projectFilter` must be applied to mail/domain reads as they land.

- 2026-09-29 — Phase 3 (projects + members): scoped members are gated to Team+ (PRICING §3), invites carry `projectIds` on the Better Auth invitation doc and an `afterAcceptInvitation` hook applies them; invitation email is not sent (link is shown for copying); plan catalog now has members/projects/emails limits. Follow-ups: invitation emails (system email), realtime "access" topic consumers (Phase 5), `projectFilter` adoption in mail/domain queries as they land, an empty scope removes the restriction without the Owner confirmation DBD §5 mentions.

- 2026-09-29 — Phase 2 done (116 tests). Follow-ups: sidebar usage tile not wired to real data; duplicate-team error lacks link to existing connection; remove-connection data choice; live list refresh (Phase 5); live Resend "no webhook slot" wording unverified.

- 2026-09-29 — Phase 2 done. Team fingerprint: HMAC of the team's oldest domain id (else oldest API key id), because Resend has no team-id endpoint. Fake Resend keys are documented in AGENTS.md. Inngest v4 uses `eventType()` + `triggers: [...]` (no `EventSchemas`). Webhook signing secrets are AAD-bound to their connection.
- 2026-09-29 — Phase 1 done. Auth via Better Auth client (rate limits apply only through /api/auth); org_settings provisioned in `afterCreateOrganization` + self-heal. Follow-ups: `/sign-out` route, email verification (needs system email, Phase 2), move render-time writes in `getOrgContext` out of render, invite page.

- 2026-09-29 — Phase 1 scaffold landed: Node 24 LTS, Next 16.3, React 19.2, TS 5.9, Tailwind 4.3, Vitest 5. `lib/env.ts` is `server-only`; pure parser in `lib/env-schema.ts`. nextjs.org / ui.shadcn.com blocked → Next docs read from `node_modules/next/dist/docs`, shadcn sources pulled from GitHub.
- 2026-09-29 — Product renamed Mailwise → **Wisemail** across docs. Plan created. Session scope: Phases 1–2.
