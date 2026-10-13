/**
 * PM2 process file for Wisemail API on a single OCI (or any) VM.
 *
 * Usage (from repo root):
 *   pm2 start docs/deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * Expects:
 *   - Node 24+, pnpm-installed monorepo (default path /var/www/wisemail — edit `cwd` if different)
 *   - Production env in <repo>/.env (loaded by apps/api loadRootEnv)
 *   - Fastify on 127.0.0.1:4000 (Nginx proxies /api + /health)
 *   - SPA is NOT served here — deploy apps/spa on Vercel (see docs/DEPLOY-VERCEL.md)
 *
 * Logs go to PM2's default ~/.pm2/logs (no extra mkdir).
 */
module.exports = {
  apps: [
    {
      name: "wisemail-api",
      cwd: "/var/www/wisemail/apps/api",
      // package.json "start": "tsx src/index.ts"
      script: "pnpm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      time: true,
    },
  ],
};
