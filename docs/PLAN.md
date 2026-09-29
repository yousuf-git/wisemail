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

- [ ] Next.js 16 (App Router) + React 19 + TypeScript strict, pnpm
- [ ] Tailwind v4 with CSS-variable tokens from `FED.md` §11 (light default + warm dark, `data-theme` override + system)
- [ ] Fonts: Plus Jakarta Sans + Geist Mono
- [ ] shadcn/ui base components restyled (button, input, card, dialog, dropdown, badge/chip, tooltip, toast/sonner)
- [ ] `lib/env.ts` Zod env schema (fake modes, Stripe mode check) + `scripts/check-env.ts` prebuild + `instrumentation.ts`
- [ ] Tooling: ESLint, Prettier, Vitest (+ `mongodb-memory-server`), Playwright skeleton
- [ ] Mongo: `lib/db/connect`, `withTransaction`, branded `Id<"...">` types, `assertRefs`
- [ ] Better Auth (MongoDB adapter + organization plugin, roles owner/admin/developer/support/viewer, permissions)
- [ ] Auth pages: sign-in, sign-up; org creation onboarding; `(app)/[orgSlug]` guard + active org
- [ ] `org_settings` created with org (free plan, UTC)
- [ ] App shell: sidebar dock (nav groups Mail / Audience / Health), topbar (breadcrumb, search ⌘K placeholder, notifications), usage tile, theme toggle
- [ ] Wizi mascot component (moods: idle, wave, wow, think, sleep, sad) with reduced-motion support
- [ ] Overview dashboard layout (greeting, KPI cards, empty states) — data from rollups later
- [ ] Marketing placeholder landing page

## Phase 2 — Connections & webhook ingest

- [ ] `lib/crypto/envelope.ts` AES-256-GCM envelope encryption (per-record DEK wrapped by KEK, `kekId`, rotation)
- [ ] `lib/resend/adapter.ts` typed methods + error mapping (`resend_rate_limited|forbidden|not_found|validation`); fake client for dev/tests
- [ ] Models: `connections`, `webhook_events`, `realtime_events`, `audit_logs`, `sync_runs`
- [ ] Connection onboarding service (TRD §2.2): validate full-access key, reject sending-only, team fingerprint dedupe, encrypt, register webhook, store signing secret, `needs_attention` on no slot
- [ ] Server actions: add / rename / remove connection (removal deletes our webhook in Resend), permission-checked, audited
- [ ] Settings → Connections page (list, add dialog with slot notice, status chips, last4 only)
- [ ] `POST /api/ingest/resend/[connectionId]`: raw body, Svix verify, dedupe `(connectionId, svixId)`, enqueue `resend/event.received`, 200
- [ ] Inngest client + `/api/inngest` route; `process-event` + `sync-connection` stubs (local dev server / fake)
- [ ] Tests: envelope crypto, adapter error mapping, onboarding service, ingest route (valid, bad sig, dup, unknown connection), tenant isolation

## Phase 3 — Sync & mirrors
- [ ] `sync-connection` paged + checkpointed (domains → api keys → audience → templates → broadcasts → automations → emails)
- [ ] Models: domains, api_keys, templates, automations, contacts, segments, topics, contact_properties, broadcasts
- [ ] Setup checklist per connection with one-click fixes
- [ ] Projects CRUD + member scopes

## Phase 4 — Mail core
- [ ] Models: emails, email_contents, attachments, threads, thread_member_states, labels, deletion_tombstones
- [ ] `process-event`: status ranking, timeline, rollups, tombstone handling
- [ ] `fetch-inbound`: raw MIME → R2, mailparser, sanitize, threading
- [ ] Senders + status derivation
- [ ] Composer (TipTap rich, CodeMirror HTML, template mode, sandboxed preview, scheduling, attachments via presigned R2)
- [ ] Inbox (threads, read state, replies, read receipts), Activity log + email timeline, Scheduled

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

- 2026-09-29 — Product renamed Mailwise → **Wisemail** across docs. Plan created. Session scope: Phases 1–2.
