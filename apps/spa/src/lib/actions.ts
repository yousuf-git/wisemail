import { callOrgAction } from "@/lib/api";
import type { ActionResult } from "@wisemail/shared/action-result";
import type { GeneralSettings } from "@/lib/api";

/** Domain-scoped HTTP mutations (no barrel — import from this module only). */

export function updateGeneralSettings(
  orgSlug: string,
  input: { name: string; slug: string; timezone: string },
) {
  return callOrgAction<GeneralSettings>("settings.general.update", orgSlug, input);
}

export function sendEmail(
  orgSlug: string,
  input: {
    senderId: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    html?: string;
    text?: string;
  },
): Promise<ActionResult<{ emailId: string } | { id: string } | unknown>> {
  return callOrgAction("compose.send", orgSlug, {
    ...input,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    attachmentIds: [],
  });
}

export function setDefaultSender(orgSlug: string, senderId: string, version: number) {
  return callOrgAction("settings.senders.update", orgSlug, {
    id: senderId,
    version,
    isDefault: true,
  });
}
