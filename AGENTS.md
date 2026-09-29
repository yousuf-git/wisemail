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

