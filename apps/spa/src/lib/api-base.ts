/** Public API origin from Vite (`VITE_API_URL`). Empty = same-origin (dev proxy). */
export function apiBase(): string {
  const vite = import.meta.env.VITE_API_URL;
  return typeof vite === "string" ? vite.replace(/\/$/, "") : "";
}

/** Prefix a path like `/api/...` with the API origin when split across hosts. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = apiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
