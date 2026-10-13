/** HTTP action clients — import from this file, not a barrel. */
import { user, callUserAction } from "@/lib/api/actions/_helpers";
import type { ActionResult } from "@/lib/actions/result";

export type { ActionResult };

export const createOrganization = user<{ slug: string }>("onboarding.createOrg");
export const checkSlug = user<{ available: boolean }>("onboarding.checkSlug");
export const acceptInvitationAction = (token: string) =>
  callUserAction<{ orgSlug: string }>("invite.accept", { token });
