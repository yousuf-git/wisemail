import "server-only";

import type { ActionResult } from "@/lib/actions/result";

/**
 * Org-scoped mutation callable from Next server actions or HTTP (`Headers` from the request).
 * When `headers` is omitted, the Next.js `dal` path (`headers()` / React cache) is used.
 */
export type OrgActionFn = (
  orgSlug: string,
  input: unknown,
  headers?: Headers,
) => Promise<ActionResult<unknown>>;

const orgActions = new Map<string, OrgActionFn>();

export function registerOrgAction(id: string, fn: OrgActionFn) {
  if (orgActions.has(id)) {
    throw new Error(`[actions] duplicate org action id: ${id}`);
  }
  orgActions.set(id, fn);
}

export function getOrgAction(id: string): OrgActionFn | undefined {
  return orgActions.get(id);
}

export function listOrgActionIds(): string[] {
  return [...orgActions.keys()].sort();
}
