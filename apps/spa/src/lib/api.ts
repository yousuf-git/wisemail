import type { ActionResult } from "@wisemail/shared/action-result";

/**
 * SPA fetch helpers. Same-origin `/api` (Vite proxy → Fastify in dev).
 * Keep paths literal for static analysis (`bundle-analyzable-paths`).
 */
function apiBase(): string {
  const vite = import.meta.env.VITE_API_URL;
  return typeof vite === "string" ? vite.replace(/\/$/, "") : "";
}

export async function callOrgAction<T>(
  id: string,
  orgSlug: string,
  input: unknown,
): Promise<ActionResult<T>> {
  const res = await fetch(`${apiBase()}/api/v1/actions/${encodeURIComponent(id)}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ orgSlug, input }),
  });
  return (await res.json()) as ActionResult<T>;
}

export async function getCatalog() {
  const res = await fetch(`${apiBase()}/api/v1/catalog`, {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return res.json() as Promise<unknown>;
}
