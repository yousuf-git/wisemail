/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Fastify origin in production (e.g. https://api.example.com). Empty = same-origin / Vite proxy. */
  readonly VITE_API_URL?: string;
  /** Dev-only: Vite proxy target (default http://127.0.0.1:4000). */
  readonly VITE_API_PROXY?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_RELEASE?: string;
  readonly SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
