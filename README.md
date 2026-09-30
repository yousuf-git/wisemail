# Wisemail

Wiser insights and more control over your emails.

Wisemail is a multi-tenant SaaS dashboard on top of [Resend](https://resend.com). Teams connect one
or more Resend accounts with a full-access API key; Wisemail registers its own webhook on each
account, keeps every event and inbound message, and turns that into:

- an inbox with threads, attachments and read receipts on replies, and a composer that sends from
  any connected account, domain or sender (also scheduled and from templates);
- an activity log with a timeline per email, long-term history and search;
- insights, alerts and notifications (bounce and complaint rates, silence, domain and DNS drift);
- management of domains, API keys, contacts, segments, topics, templates and broadcasts;
- AI help (triage, reply drafts, compose tools, incident explanations), plans and metering, an
  audit log, and Trash with permanent deletion.

The product name is always "Wisemail". Product docs live in [`docs/`](docs).

## Stack

Next.js 16 (App Router) and React 19 on the Node.js runtime, TypeScript (strict), Tailwind CSS v4
with design tokens and shadcn/ui, Motion. MongoDB (replica set) with Mongoose, Better Auth
(organizations, invitations), Inngest for jobs, Server-Sent Events over a change stream for
realtime, Cloudflare R2 for files, Resend SDK behind one adapter, an OpenAI-compatible endpoint for
AI, Stripe for billing, Sentry for errors. Tests: Vitest and Playwright. See
[`docs/TRD.md`](docs/TRD.md) for the reasoning.

## Local setup

Requirements: Node.js 24 (`.nvmrc`), pnpm (version pinned in `package.json`), and a `mongod`
binary on `PATH` (or at `/opt/mongo/mongod`).

```bash
pnpm install
cp .env.example .env.local     # fill the "Core" block, see below
pnpm db:dev                    # single-node MongoDB replica set rs0 on 127.0.0.1:27017
pnpm dev                       # http://localhost:3000
```

Jobs (sync, sending, event processing, alerts) run on Inngest. Start its dev server next to the app
in another terminal; no keys are needed:

```bash
npx inngest-cli@latest dev
```

Without it the app still runs, but jobs are dropped with a warning in the server log.

### Environment

All variables are validated once by `lib/env.ts` (Zod, `lib/env-schema.ts`); code never reads
`process.env` directly. `pnpm build` runs `scripts/check-env.ts` first and the server refuses to
start on a bad configuration. In development only the core block is required:

| Variable | Notes |
|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/wisemail?replicaSet=rs0` (transactions need a replica set) |
| `BETTER_AUTH_SECRET` | 32+ characters, `openssl rand -base64 32` |
| `BETTER_AUTH_URL`, `APP_URL` | public base URL, `http://localhost:3000` locally, https in production |
| `ENCRYPTION_KEK_CURRENT`, `ENCRYPTION_KEK_ID` | base64 of 32 random bytes, and the id stored with each wrapped key |

Everything else (R2, AI, Stripe, Inngest keys, `SENTRY_DSN`, ...) is documented in
[`.env.example`](.env.example) and only needed in production or when you switch a service to live.

### Fake mode

External services run against in-memory or on-disk fakes by default in development and test, so
you can use the whole product offline:

| Variable | Default (dev/test) | Live |
|---|---|---|
| `RESEND_MODE` | `fake` | `live` |
| `STORAGE_MODE` | `fake` | `r2` |
| `AI_MODE` | `fake` | `live` |
| `INNGEST_DEV` | `true` (local dev server) | `false` with event and signing keys |
| `BILLING_ENABLED` | `false` (limits enforced, no payment) | `true` with Stripe keys |

Handy while developing:

- **Dev outbox** at `/dev/outbox`: system email (verification, invitations, alerts, digests) in
  fake mode lands there instead of a real inbox, with the link to click. It 404s in production.
- **Fake Resend keys**: `re_<team>[_<flag>...]`. The same `<team>` is the same Resend account (the
  duplicate-connect check). Examples: `re_acme_full` (healthy), `re_acme_allgood` (every domain
  verified, tracking and receiving on), `re_acme_sending` (rejected: sending-only),
  `re_acme_invalid`, `re_acme_ratelimit`, `re_acme_slotfull` (no free webhook slot),
  `re_acme_nodomains`. The full table is in [`AGENTS.md`](AGENTS.md).
- **Signed test events**: `pnpm webhook:test <connectionId> [--type email.opened]` posts a Svix
  signed sample event to a connection's ingest URL.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js (`build` checks the environment first) |
| `pnpm typecheck` | `next typegen` then `tsc --noEmit` |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test` / `pnpm test:watch` | Vitest (unit and integration) |
| `pnpm test:e2e` | Playwright end-to-end suite (starts everything it needs) |
| `pnpm perf` | Seeds a large dataset and measures the hot paths against the TRD §6 targets |
| `pnpm db:dev` | Start the local MongoDB replica set |
| `pnpm webhook:test` | Send a signed sample webhook to a connection |
| `pnpm mail:check` | Check system email rendering |

## Testing

- **Unit and integration** (`tests/unit`, `tests/integration`, `*.test.ts(x)` next to code): Vitest
  with `mongodb-memory-server`. It uses `/opt/mongo/mongod` when that file exists and downloads a
  binary otherwise. `*.test.tsx` runs in jsdom.
- **End to end** (`tests/e2e`): Playwright with Chromium. `pnpm test:e2e` (via
  `playwright.config.ts`) starts a local Inngest dev server and `next dev` on port 4200 with fake
  services and `E2E=true`, after `scripts/e2e-prepare.ts` made sure a MongoDB replica set is running
  (it reuses `scripts/dev-mongo.sh` for localhost) and dropped the `wisemail_e2e` database. Set
  `E2E_MONGODB_URI` to use another server and `PW_CHROMIUM_PATH` for a specific browser; run
  `pnpm exec playwright install chromium` once if Playwright has no browser yet. Specs create unique
  users and workspaces, so they run in parallel. The test-only seed route `/api/e2e/seed` answers
  404 unless `E2E=true` and `NODE_ENV` is not production (the environment parser also refuses
  `E2E=true` in production).
- **Performance** (`pnpm perf`): 50k emails, 5k threads and 100k events in one org plus noise orgs
  in the `wisemail_perf` database; prints p95 per scenario and the MongoDB plan of every query.
- **CI** (`.github/workflows/ci.yml`): typecheck, lint, test and build on every push and pull
  request, plus the Playwright job against a MongoDB replica set service.

Every change ends green on `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`.

## Observability

Errors go to Sentry when `SENTRY_DSN` is set and nowhere otherwise. Server (Node runtime only) and
browser are initialised in `instrumentation.ts` / `instrumentation-client.ts`; events are scrubbed
of email bodies, addresses, headers, cookies and keys before they leave (`lib/observability`), and
carry the org id (never names) and the release (`SENTRY_RELEASE`, else the Vercel commit). Source
maps upload only when `SENTRY_AUTH_TOKEN` (with `SENTRY_ORG` and `SENTRY_PROJECT`) is present at
build time.

## Project structure

```
app/            routes: (auth), (app)/[orgSlug]/..., api/ (auth, ingest, inngest, stream, v1, ...)
components/     ui (shadcn, mapped to tokens), app shell, and one folder per feature
lib/            services, db models, resend adapter, auth, billing, ai, realtime, storage, ...
inngest/        job client and functions
emails/         React Email templates for system email
scripts/        check-env, dev-mongo, webhook:test, e2e-prepare, perf
tests/          unit, integration, e2e
docs/           product and technical documents
```

The full tree is in [`docs/TRD.md`](docs/TRD.md) §4.

## Docs

| File | Contents |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Features |
| [`docs/UCD.md`](docs/UCD.md) | Use cases |
| [`docs/TRD.md`](docs/TRD.md) | Stack, architecture, security, project structure, performance targets |
| [`docs/DBD.md`](docs/DBD.md) | Data model and indexes |
| [`docs/FED.md`](docs/FED.md) | Design system: tokens, type, motion, Wizi |
| [`docs/PRICING.md`](docs/PRICING.md) | Plans and metering |
| [`docs/PLAN.md`](docs/PLAN.md) | Phased build checklist and decision log |
| [`AGENTS.md`](AGENTS.md) | Conventions for people and coding agents working in the repo |
