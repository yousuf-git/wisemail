import type { ActionResult } from "@/lib/actions/result";

/**
 * Browser / SPA client for org mutations.
 * Defaults to same-origin `/api/v1/actions/:id` (Next or reverse-proxied Fastify).
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

export async function callOrgAction<T>(
  id: string,
  orgSlug: string,
  input: unknown,
  init?: RequestInit,
): Promise<ActionResult<T>> {
  const res = await fetch(`${apiBase()}/api/v1/actions/${encodeURIComponent(id)}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...init?.headers,
    },
    body: JSON.stringify({ orgSlug, input }),
    ...init,
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { code: "internal", message: "The server returned an invalid response." },
    };
  }
  return body as ActionResult<T>;
}
