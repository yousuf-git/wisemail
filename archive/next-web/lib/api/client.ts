import type { ActionResult } from "@/lib/actions/result";

/**
 * Browser / SPA client for mutations.
 * Defaults to same-origin `/api/v1/...` (Next or reverse-proxied Fastify).
 * Override with `NEXT_PUBLIC_API_URL` / `VITE_API_URL` when the API is on another origin.
 */
function apiBase(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof import.meta !== "undefined") {
    const vite = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env
      ?.VITE_API_URL;
    if (vite) return vite.replace(/\/$/, "");
  }
  return "";
}

async function postAction<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<ActionResult<T>> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...init?.headers,
    },
    body: JSON.stringify(body),
    ...init,
  });
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return {
      ok: false,
      error: { code: "internal", message: "The server returned an invalid response." },
    };
  }
  return parsed as ActionResult<T>;
}

export async function callOrgAction<T>(
  id: string,
  orgSlug: string,
  input: unknown,
  init?: RequestInit,
): Promise<ActionResult<T>> {
  return postAction<T>(`/api/v1/actions/${encodeURIComponent(id)}`, { orgSlug, input }, init);
}

export async function callUserAction<T>(
  id: string,
  input: unknown,
  init?: RequestInit,
): Promise<ActionResult<T>> {
  return postAction<T>(`/api/v1/user-actions/${encodeURIComponent(id)}`, { input }, init);
}

export async function callAdminAction<T>(
  id: string,
  input: unknown,
  init?: RequestInit,
): Promise<ActionResult<T>> {
  return postAction<T>(`/api/v1/admin-actions/${encodeURIComponent(id)}`, { input }, init);
}
