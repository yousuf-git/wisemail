# Deploy Wisemail **SPA** on Vercel

Frontend-only. The API stays on OCI — see [`DEPLOY-OCI.md`](./DEPLOY-OCI.md).

| Host | Service |
|---|---|
| `https://app.example.com` | This SPA (Vercel) → set as `APP_URL` on the API |
| `https://api.example.com` | Fastify (OCI) → set as `VITE_API_URL` here and `BETTER_AUTH_URL` on the API |

---

## 1. One-time: Vercel project

1. [vercel.com](https://vercel.com) → **Add New Project** → import this Git repo.
2. **Root Directory:** `apps/spa` (important for the monorepo).
3. Framework: **Vite** (auto from `vercel.json`).
4. Install / build / output are already in [`apps/spa/vercel.json`](../apps/spa/vercel.json):
   - install from repo root with pnpm
   - build `@wisemail/shared` then `@wisemail/spa`
   - publish `dist`
5. SPA client routes are rewritten to `index.html` (TanStack Router).

Do **not** set Root Directory to the repo root unless you change `vercel.json` paths.

---

## 2. Environment variables (Vercel → Settings → Environment Variables)

| Name | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `https://api.example.com` | **No trailing slash.** Baked in at **build** time. |
| `VITE_SENTRY_DSN` | optional | Only if `@sentry/browser` is installed in the SPA |

Redeploy after changing any `VITE_*` variable (Vite inlines them at build).

---

## 3. Match the API env (OCI `.env`)

On the API VM, production must include:

```bash
APP_URL=https://app.example.com
BETTER_AUTH_URL=https://api.example.com
COOKIE_DOMAIN=.example.com
# SPA_ORIGINS=https://your-preview.vercel.app   # optional previews
```

Then `pm2 restart wisemail-api`.

- **`COOKIE_DOMAIN`** — leading-dot parent domain so `app` and `api` share the session cookie (like sharing cookies across subdomains behind CloudFront + API Gateway).
- **`SPA_ORIGINS`** — extra allowed CORS / Better Auth origins (Vercel preview URLs).

Without these, the browser will load the SPA but sign-in cookies will not stick on API calls.

---

## 4. Custom domain

1. Vercel project → **Domains** → add `app.example.com`.
2. At your DNS provider, add the `CNAME` (or A) Vercel shows.
3. Wait for HTTPS (automatic).

Production branch (usually `main` / `react-migration`) deploys to that domain; other branches get `*.vercel.app` previews — add those preview URLs to `SPA_ORIGINS` if you need logged-in previews.

---

## 5. Local vs production

| Mode | How `/api` works |
|---|---|
| **Local** `pnpm dev:spa` | Leave `VITE_API_URL` empty; Vite proxies `/api` → `http://127.0.0.1:4000` |
| **Vercel** | Set `VITE_API_URL=https://api.example.com`; browser calls the API directly with cookies |

Auth client and SSE already use `VITE_API_URL` via `apps/spa/src/lib/api-base.ts`.

---

## 6. Checklist

- [ ] OCI API healthy: `curl https://api.example.com/health`
- [ ] Vercel `VITE_API_URL` = that API origin
- [ ] API `APP_URL` = Vercel SPA origin
- [ ] API `COOKIE_DOMAIN=.example.com`
- [ ] Sign-in on `app.example.com` sets a cookie and loads inbox
- [ ] Resend / Inngest / Stripe still point at **`api.example.com`**, not `app.`

---

## 7. Deploy updates

Push to the connected Git branch. Vercel rebuilds the SPA only.

API code changes still need `git pull` + `pm2 restart` on the OCI VM ([OCI guide §9](./DEPLOY-OCI.md)).
