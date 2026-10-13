# Deploy configs

| Doc / file | Purpose |
|---|---|
| [`../DEPLOY-OCI.md`](../DEPLOY-OCI.md) | **Backend** on Oracle Cloud VM (Nginx + PM2 + Atlas) |
| [`../DEPLOY-VERCEL.md`](../DEPLOY-VERCEL.md) | **Frontend** SPA on Vercel |
| [`ecosystem.config.cjs`](./ecosystem.config.cjs) | PM2 process for `@wisemail/api` |
| [`nginx-wisemail.conf`](./nginx-wisemail.conf) | Nginx: TLS + `/api` → Fastify (no SPA) |

Typical prod hosts: `app.example.com` (Vercel) + `api.example.com` (OCI).
