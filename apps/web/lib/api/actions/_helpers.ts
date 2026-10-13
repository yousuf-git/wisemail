/**
 * Tiny factories for HTTP action clients. Keep free of `server-only`.
 * Prefer importing from domain modules (`@/lib/api/actions/settings-connections`), not a barrel.
 */
import { callAdminAction, callOrgAction, callUserAction } from "@/lib/api/client";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const org = <T = unknown>(id: string) =>
  (orgSlug: string, input: unknown) => callOrgAction<T>(id, orgSlug, input);

export const user = <T = unknown>(id: string) =>
  (input: unknown) => callUserAction<T>(id, input);

export const admin = <T = unknown>(id: string) =>
  (input: unknown) => callAdminAction<T>(id, input);

export { callAdminAction, callOrgAction, callUserAction };
