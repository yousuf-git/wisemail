"use server";

import { userAction } from "@/lib/actions/action";
import type { ActionResult } from "@/lib/actions/result";
import { acceptInvitation } from "@/lib/services/members";
import { acceptInvitationSchema } from "@/lib/validation/member";

const accept = userAction({ input: acceptInvitationSchema }, ({ input, user }) =>
  acceptInvitation(user, input),
);

/** Accepts the invitation as the signed-in user; returns the org slug to go to. */
export async function acceptInvitationAction(
  token: string,
): Promise<ActionResult<{ orgSlug: string }>> {
  const result = await accept({ token });
  return result.ok ? { ok: true, data: { orgSlug: result.data.orgSlug } } : result;
}
