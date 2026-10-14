import { z } from "zod";

import { userAction, ActionFailure } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import { getSessionFromHeaders } from "@/lib/dal-request";
import { getRequestHeaders } from "@/lib/request-context";
import { endImpersonation } from "@/lib/services/admin/users";

/**
 * Ends impersonation. Not behind the admin guard: while impersonating, the session belongs to
 * the target. Only works when `session.impersonatedBy` is set.
 */
const stop = userAction({ id: "impersonation.stop", input: z.object({}) }, async ({ user }) => {
  const session = await getSessionFromHeaders(await getRequestHeaders());
  const adminId = (session?.session as { impersonatedBy?: string | null } | undefined)
    ?.impersonatedBy;
  if (!session || !adminId) {
    throw new ActionFailure("forbidden", "You are not impersonating anyone.");
  }
  await endImpersonation({ adminId, targetUserId: user.id });
  return { targetUserId: user.id };
});

export async function stopImpersonationAction(): Promise<
  ActionResult<{ targetUserId: string }>
> {
  return stop({});
}
