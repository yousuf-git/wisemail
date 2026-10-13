<div align="center">
  <img src="public/wizi.svg" alt="Wizi" width="100" height="105">
  <h1>Wisemail</h1>
  <p><strong>The control room for every Resend account, domain, and inbox you run.</strong></p>

  [![License](https://img.shields.io/badge/license-Proprietary-darkred?style=flat-square)](LICENSE)
  [![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
  [![Fastify](https://img.shields.io/badge/Fastify-API-000000?style=flat-square)](https://fastify.dev)
  [![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
  [![MongoDB](https://img.shields.io/badge/MongoDB-8.3-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com)
  [![Vercel](https://img.shields.io/badge/SPA-Vercel-black?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com)
  [![OCI](https://img.shields.io/badge/API-Oracle%20Cloud-F80000?style=flat-square)](https://www.oracle.com/cloud/)
</div>

---

## What it is

Most teams use Resend as nothing more than an API key and a `resend.emails.send()` call. Resend offers much more — inbound receiving, lifecycle webhooks, open/click tracking, broadcasts, contacts, automations, scheduled sends — but the features go unused, events are never kept, and multiple accounts have no unified view.

Wisemail connects to one or more Resend accounts with a full-access API key, auto-registers a webhook on each, stores every event and inbound message, and turns that into a team workspace:

- **Inbox** — threaded mail with attachments, read receipts on replies, and a composer across all accounts and domains (rich text, HTML with live preview, templates, schedule send)
- **Activity log** — searchable timeline per email, long-term history beyond Resend's 30-day window, per-recipient lookup
- **Insights and alerts** — bounce/complaint rates, deliverability trends, silence detection, DNS drift, and real-time notifications
- **Audience** — contacts, segments, topics, broadcasts, and templates across all connections, with analytics from stored events
- **AI assistance** — triage, reply drafts, compose helpers, and anomaly explanations (any OpenAI-compatible endpoint)
- **Housekeeping** — Trash, permanent delete, bulk cleanup rules, and a full audit log

All scoped to multi-tenant organizations, with roles (Owner / Admin / Developer / Support / Viewer) and project-level access for agencies.

## Tech stack

| Layer | Choice |
|---|---|
| UI | Vite + React 19 SPA (`apps/spa`), TanStack Router + Query, TypeScript (strict) |
| API | Fastify (`apps/api`) on Node 24 — auth, ingest, SSE, org actions, Inngest |
| Shared services | `apps/web` modules (Mongoose models, domain services); Next is an optional local UI fallback only |
| Styling | Tailwind CSS v4, CSS-variable design tokens (FED) |
| Auth | Better Auth with organization and invitation plugins |
| Database | MongoDB Atlas (replica set) via Mongoose |
| Jobs | Inngest — durable steps, retries, cron, per-connection throttle |
| Realtime | Server-Sent Events over a MongoDB change stream |
| Storage | Cloudflare R2 (private) — raw MIME, inbound and outbound attachments |
| Email | Resend SDK behind a single adapter module |
| AI | `openai` SDK against any OpenAI-compatible endpoint |
| Billing | Stripe (Better Auth plugin + direct SDK for metered overage and packs) |
| Hosting | **SPA → Vercel**, **API → OCI VM** (Nginx + PM2) + Atlas |
| Testing | Vitest (unit + integration), Playwright (e2e) |
| Errors | Sentry (optional) |

Full stack rationale in [`docs/TRD.md`](docs/TRD.md). Deploy: [`docs/DEPLOY-VERCEL.md`](docs/DEPLOY-VERCEL.md), [`docs/DEPLOY-OCI.md`](docs/DEPLOY-OCI.md).

## Architecture

```mermaid
flowchart TB
    Browser["Browser"]
    SPA["Vite SPA\n(Vercel)"]
    API["Fastify API\n(OCI VM)"]
    Mongo[("MongoDB Atlas")]
    Inngest["Inngest\nJob Functions"]
    R2[("Cloudflare R2")]
    AI["AI Provider"]
    ResendAccounts["Resend\nAccounts"]

    Browser --> SPA
    SPA <-->|"HTTPS + cookies\n/api/*"| API
    SPA <-->|"SSE /api/stream"| API
    API <-->|"Mongoose"| Mongo
    ResendAccounts -->|"signed webhook"| API
    API -->|"enqueue"| Inngest
    Inngest <-->|"services"| Mongo
    Inngest --> R2
    Inngest --> AI
```

**Key flows:**

- **Ingest hot path** — `POST /api/ingest/resend/[connectionId]` on the API verifies Svix, deduplicates, stores, enqueues to Inngest; returns 200 quickly with no Resend calls on the hot path.
- **Sync** — paged backfill of Resend resources, checkpointed in `sync_runs`.
- **Realtime** — services `publish()` into `realtime_events`; change streams fan out over SSE.
- **Split URLs** — `APP_URL` = SPA origin; `BETTER_AUTH_URL` = API origin (webhooks and auth).

## Getting started

Requirements: **Node.js 24** (see `.nvmrc`), **pnpm**, and a `mongod` binary on `PATH` (or at `/opt/mongo/mongod`).

```bash
pnpm install
cp .env.example .env.local     # fill the Core block
ln -sfn ../.env.local apps/web/.env.local
pnpm --filter @wisemail/shared build
pnpm db:dev                    # MongoDB replica set rs0 on 127.0.0.1:27017
pnpm dev:api                   # http://127.0.0.1:4000
pnpm dev:spa                   # http://localhost:5173 (proxies /api → API)
```

Platform admin is on the SPA at `/admin` (same `pnpm dev:spa` stack). Optional Next UI: `pnpm dev:web`.

#### Port 27017 already in use

If a system `mongod` (for example the `mongod` systemd service) already listens on 27017, it is usually a standalone instance without a replica set. `?replicaSet=rs0` then fails to connect, and `pnpm db:dev` skips starting because the port is busy. Run the project database on another port and point `.env.local` at it:

```bash
MONGO_PORT=27018 pnpm db:dev
# .env.local
MONGODB_URI=mongodb://127.0.0.1:27018/wisemail?replicaSet=rs0
```

Alternatively stop the system service (`sudo systemctl disable --now mongod`) and use the default port.

Jobs (sync, event processing, sending, alerts) run through Inngest. Start its dev server in a second terminal — no keys required:

```bash
npx inngest-cli@latest dev
```

Without it, jobs fall back to in-process execution in dev when the Inngest server is unreachable (`INNGEST_DEV=true`).

### Seed demo data

```bash
pnpm db:seed
```

Creates a platform admin and four demo workspaces (Free, Pro, Team, Agency) with users in every role, inbound mail, events, and 30 days of metrics. All accounts use password `wisemail-dev-123`. The script prints the full user table at the end. Safe to re-run; `--reset` drops the dev database first.

## Commands

| Command | Description |
|---|---|
| `pnpm dev:spa` / `pnpm dev:api` | Primary local stack (SPA + Fastify) |
| `pnpm dev` / `pnpm dev:web` | Next UI + API (admin / legacy) |
| `pnpm build` / `pnpm start` | Build shared+api+spa; start API only |
| `pnpm build:next` / `pnpm start:next` | Legacy Next build/start |
| `pnpm clean:next` | Remove `.next` build caches |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Workspace checks |
| `pnpm test` / `pnpm test:e2e` / `pnpm test:e2e:spa` | Vitest; Playwright (Next e2e / SPA smoke) |
| `pnpm db:dev` / `pnpm db:seed` | Local Mongo replica set; demo data |
| `pnpm webhook:test` / `pnpm mail:check` | Signed webhook sample; full mail fake-mode check |

Every change must pass `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.

## Configuration

Env is validated via `@wisemail/shared/env-schema` (`apps/web/lib/env.ts`). Code should not read `process.env` directly in app logic. See [`.env.example`](.env.example).

### Core (always required)

| Variable | Notes |
|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/wisemail?replicaSet=rs0` locally (transactions need a replica set) |
| `BETTER_AUTH_SECRET` | 32+ characters — `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public **API** origin (`http://localhost:4000` or `https://api…`) |
| `APP_URL` | Public **SPA** origin (`http://localhost:5173` or `https://app…`) |
| `COOKIE_DOMAIN` | Optional `.example.com` when SPA and API share a parent domain |
| `SPA_ORIGINS` | Optional comma-separated extra CORS / trusted origins (Vercel previews) |
| `ENCRYPTION_KEK_CURRENT`, `ENCRYPTION_KEK_ID` | AES-256-GCM KEK (`openssl rand -base64 32`) |
| `VITE_API_URL` | SPA only (Vercel): absolute API origin; empty in local Vite proxy mode |

### Service modes

All external services default to in-memory fakes in development and test:

| Variable | Dev default | Production |
|---|---|---|
| `RESEND_MODE` | `fake` | `live` + `SYSTEM_RESEND_API_KEY`, `SYSTEM_FROM_EMAIL` |
| `STORAGE_MODE` | `fake` | `r2` + R2 credentials |
| `AI_MODE` | `fake` | `live` + `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` |
| `INNGEST_DEV` | `true` (local dev server) | `false` + `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` |
| `BILLING_ENABLED` | `false` | `true` + Stripe keys and price ids |

See [`.env.example`](.env.example) for the full variable list with comments.

### Fake Resend keys

With `RESEND_MODE=fake`, keys follow `re_<team>[_<flag>]`. The same `<team>` slug is the same Resend account (used by the duplicate-connect check).

| Key | Behaviour |
|---|---|
| `re_acme_full` | Healthy full-access key, webhook registered, connection `active` |
| `re_acme_allgood` | All domains verified, tracking and receiving on — fully green checklist |
| `re_acme_sending` | Rejected: sending-only key |
| `re_acme_invalid` | Rejected by Resend |
| `re_acme_ratelimit` | Every call returns 429 |
| `re_acme_slotfull` | No free webhook slot; saves as `needs_attention` |
| `re_acme_manycontacts` | 230 contacts (pagination and checkpoint/resume testing) |

Dev outbox at `/dev/outbox`: system emails (verification links, invitations, digests) land there in fake mode instead of a real inbox.

## Testing

- **Unit and integration** (`tests/unit`, `tests/integration`): Vitest with `mongodb-memory-server`. Uses `/opt/mongo/mongod` when present. `*.test.tsx` runs in jsdom.
- **End-to-end** (`tests/e2e`): Playwright with Chromium. `pnpm test:e2e` starts a local Inngest server and Next.js on port 4200 with all services in fake mode. Specs create their own users and workspaces so they run in parallel.
- **Mail flow** (`pnpm mail:check`): runs the complete pipeline — sync, inbound MIME with attachments, reply, delivered/opened/clicked webhooks, read receipts — against in-memory services. No dev database needed.
- **CI** (`.github/workflows/ci.yml`): typecheck, lint, test, and build on every push and pull request; Playwright against a MongoDB replica set service.

## Platform admin

`/admin` is the operator panel, accessible only to Better Auth users with the `admin` role. Add your email to `PLATFORM_ADMIN_EMAILS` and sign in to gain access.

Features: user management (search, ban/unban, revoke sessions, impersonate), organization management (plan changes, limit overrides, trial controls, suspension), and read-only system health. Every write goes to `audit_logs` under `admin.*` events. Non-admins see a 404.

## Plans

| | Free | Pro ($12/mo) | Team ($39/mo) | Agency ($99/mo) |
|---|---|---|---|---|
| Event retention | 30 days | 180 days | 1 year | 2 years |
| Connections | 1 | 3 | 5 | 15 |
| Members | 3 | 10 | 25 | Unlimited |
| Alert rules | 3 | 20 | Unlimited | Unlimited |
| AI credits/month | — | 1,000 | 5,000 | 15,000 |
| Attachment storage | Resend-hosted | Cloudflare R2 | Cloudflare R2 | Cloudflare R2 |

Overage billed per extra tracked email. AI credit packs available ($5 / 1,000 credits). 14-day Pro trial — no card required. See [`docs/PRICING.md`](docs/PRICING.md) for the full metering and lifecycle rules.

## Project structure

```
app/          (auth), (app)/[orgSlug]/…, (admin)/admin, api/{auth,ingest,inngest,stream,v1,…}
components/   ui (shadcn + tokens), app shell, per-feature components
lib/          services, db models, Resend adapter, auth, billing, AI, realtime, storage, …
inngest/      job client and functions
emails/       React Email templates for system email
scripts/      check-env, dev-mongo, webhook:test, e2e-prepare, perf, seed
tests/        unit, integration, e2e
docs/         PRD, UCD, TRD, DBD, FED, PRICING, PLAN
```

Full tree with file descriptions in [`docs/TRD.md`](docs/TRD.md) §4.

## Docs

| File | Contents |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Features, personas, and product decisions |
| [`docs/TRD.md`](docs/TRD.md) | Stack, architecture, security, data flow, project structure |
| [`docs/DBD.md`](docs/DBD.md) | Data model, indexes, and migration notes |
| [`docs/FED.md`](docs/FED.md) | Design system: tokens, typography, motion, Wizi |
| [`docs/PRICING.md`](docs/PRICING.md) | Plans, metering, and lifecycle rules |
| [`docs/PLAN.md`](docs/PLAN.md) | Phased build checklist and decision log |
| [`docs/UCD.md`](docs/UCD.md) | Use cases per persona |

## License

Copyright © 2026 M. Yousuf — proprietary software. No reuse without permission. See [LICENSE](LICENSE).
