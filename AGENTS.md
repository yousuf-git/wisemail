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
