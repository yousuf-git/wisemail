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

/** Session-scoped mutation (onboarding, invite accept) — no org slug. */
export type UserActionFn = (
  input: unknown,
  headers?: Headers,
) => Promise<ActionResult<unknown>>;

/** Platform-admin mutation. */
export type AdminActionFn = (
  input: unknown,
  headers?: Headers,
) => Promise<ActionResult<unknown>>;

const orgActions = new Map<string, OrgActionFn>();
const userActions = new Map<string, UserActionFn>();
const adminActions = new Map<string, AdminActionFn>();

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

export function registerUserAction(id: string, fn: UserActionFn) {
  if (userActions.has(id)) {
    throw new Error(`[actions] duplicate user action id: ${id}`);
  }
  userActions.set(id, fn);
}

export function getUserAction(id: string): UserActionFn | undefined {
  return userActions.get(id);
}

export function listUserActionIds(): string[] {
  return [...userActions.keys()].sort();
}

export function registerAdminAction(id: string, fn: AdminActionFn) {
  if (adminActions.has(id)) {
    throw new Error(`[actions] duplicate admin action id: ${id}`);
  }
  adminActions.set(id, fn);
}

export function getAdminAction(id: string): AdminActionFn | undefined {
  return adminActions.get(id);
}

export function listAdminActionIds(): string[] {
  return [...adminActions.keys()].sort();
}
