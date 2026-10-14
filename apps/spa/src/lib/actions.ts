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
    templateId?: string;
    templateVariables?: Record<string, string | number>;
    scheduledAt?: string;
    inReplyToEmailId?: string;
    attachmentIds?: string[];
    draftId?: string;
  },
): Promise<ActionResult<{ emailId: string } | { id: string } | unknown>> {
  return callOrgAction("compose.send", orgSlug, {
    ...input,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    attachmentIds: input.attachmentIds ?? [],
  });
}

export function saveDraft(
  orgSlug: string,
  input: {
    id?: string;
    version?: number;
    senderId?: string | null;
    to?: string[];
    subject?: string;
    bodyHtml?: string;
    bodyText?: string;
    mode?: "rich" | "html" | "template";
  },
) {
  return callOrgAction<{ id: string; version: number }>("compose.save", orgSlug, input);
}

export function startAttachmentUpload(
  orgSlug: string,
  input: { draftId: string; filename: string; size: number; contentType: string },
) {
  return callOrgAction<{
    attachmentId: string;
    uploadUrl: string;
    headers: Record<string, string>;
  }>("compose.startUpload", orgSlug, input);
}

export function confirmAttachmentUpload(
  orgSlug: string,
  input: { draftId: string; attachmentId: string },
) {
  return callOrgAction<{ id: string; filename: string }>("compose.confirmUpload", orgSlug, input);
}

export function removeDraftAttachment(
  orgSlug: string,
  input: { draftId: string; attachmentId: string },
) {
  return callOrgAction<{ id: string }>("compose.removeAttachment", orgSlug, input);
}

export function markNotificationsRead(orgSlug: string, ids: string[]) {
  return callOrgAction<{ updated: number; unreadCount: number }>(
    "notifications.markRead",
    orgSlug,
    { ids },
  );
}

export function markAllNotificationsRead(orgSlug: string) {
  return callOrgAction<{ updated: number; unreadCount: number }>(
    "notifications.markAll",
    orgSlug,
    {},
  );
}

export function trashThreads(orgSlug: string, threadIds: string[]) {
  return callOrgAction<{ threads: number; emails: number }>("inbox.trash", orgSlug, {
    threadIds,
  });
}

export function restoreThreads(orgSlug: string, threadIds: string[]) {
  return callOrgAction<{ threads: number; emails: number }>("inbox.restore", orgSlug, {
    threadIds,
  });
}

export function markThreadRead(orgSlug: string, threadId: string) {
  return callOrgAction<{ threadId: string; unread: boolean }>("inbox.read", orgSlug, {
    threadId,
  });
}

export function markThreadUnread(orgSlug: string, threadId: string) {
  return callOrgAction<{ threadId: string; unread: boolean }>("inbox.unread", orgSlug, {
    threadId,
  });
}

export function addConnection(
  orgSlug: string,
  input: { name: string; apiKey: string; confirmExtraCost?: boolean },
) {
  return callOrgAction("settings.connections.add", orgSlug, input);
}

export function setAlertRuleEnabled(orgSlug: string, id: string, enabled: boolean) {
  return callOrgAction("alerts.enable", orgSlug, { id, enabled });
}

export function deleteAlertRule(orgSlug: string, id: string) {
  return callOrgAction("alerts.remove", orgSlug, { id });
}

export function setDefaultSender(orgSlug: string, senderId: string, version: number) {
  return callOrgAction("settings.senders.update", orgSlug, {
    id: senderId,
    version,
    isDefault: true,
  });
}

export function syncConnection(orgSlug: string, connectionId: string) {
  return callOrgAction("settings.connections.sync", orgSlug, { connectionId });
}

export function retryConnection(orgSlug: string, connectionId: string) {
  return callOrgAction("settings.connections.retry", orgSlug, { connectionId });
}

export function renameConnection(orgSlug: string, connectionId: string, name: string) {
  return callOrgAction("settings.connections.rename", orgSlug, { connectionId, name });
}

export function removeConnection(
  orgSlug: string,
  connectionId: string,
  confirmName: string,
  opts?: { deleteSyncedData?: boolean; confirmDelete?: string },
) {
  return callOrgAction("settings.connections.remove", orgSlug, {
    connectionId,
    confirmName,
    ...opts,
  });
}

export function reregisterWebhook(orgSlug: string, connectionId: string) {
  return callOrgAction("settings.connections.webhook", orgSlug, { connectionId });
}

export function enableConnectionTracking(
  orgSlug: string,
  connectionId: string,
  kind: "open" | "click",
) {
  return callOrgAction("settings.connections.tracking", orgSlug, { connectionId, kind });
}

export function inviteMember(
  orgSlug: string,
  input: { email: string; role: string; projectIds?: string[] },
) {
  return callOrgAction("settings.members.invite", orgSlug, {
    email: input.email,
    role: input.role,
    projectIds: input.projectIds ?? [],
  });
}

export function cancelInvitation(orgSlug: string, invitationId: string) {
  return callOrgAction("settings.members.cancel", orgSlug, { invitationId });
}

export function resendInvitation(orgSlug: string, invitationId: string) {
  return callOrgAction("settings.members.resend", orgSlug, { invitationId });
}

export function acknowledgeIncident(orgSlug: string, incidentId: string) {
  return callOrgAction("alerts.acknowledge", orgSlug, { incidentId });
}

export function createAlertRule(
  orgSlug: string,
  input: {
    name: string;
    kind: string;
    condition: {
      operator: "gt" | "lt";
      threshold: number;
      windowMinutes: number;
      minVolume: number;
    };
  },
) {
  return callOrgAction("alerts.create", orgSlug, {
    name: input.name,
    kind: input.kind,
    scope: { connectionIds: [], projectIds: [], domainIds: [] },
    condition: input.condition,
    channels: { inApp: true, emailMembers: true, email: [] },
    enabled: true,
  });
}

export function startBillingCheckout(
  orgSlug: string,
  input: { plan: "pro" | "team" | "agency"; interval: "month" | "year" },
) {
  return callOrgAction<{ url: string }>("settings.billing.checkout", orgSlug, input);
}

export function openBillingPortal(orgSlug: string) {
  return callOrgAction<{ url: string }>("settings.billing.portal", orgSlug, {});
}

export function startBillingTrial(orgSlug: string) {
  return callOrgAction<{ started: true }>("settings.billing.trial", orgSlug, {});
}

export function recordTourEvent(
  orgSlug: string,
  input: {
    tourId: string;
    event: "start" | "step" | "complete" | "skip";
    step?: number;
    trigger?: "auto" | "manual";
  },
) {
  return callOrgAction("tour.record", orgSlug, input);
}

export function setCleanupRuleEnabled(orgSlug: string, id: string, enabled: boolean) {
  return callOrgAction("settings.cleanup.toggle", orgSlug, { id, enabled });
}

export function removeCleanupRule(orgSlug: string, id: string) {
  return callOrgAction("settings.cleanup.remove", orgSlug, { id });
}

export function createCleanupRule(
  orgSlug: string,
  input: {
    name: string;
    kind: "rule" | "block_sender";
    action: "archive" | "trash" | "delete";
    enabled?: boolean;
    match?: {
      fromAddress?: string;
      fromDomain?: string;
      subjectContains?: string;
      olderThanDays?: number;
      direction?: "inbound" | "outbound";
    };
  },
) {
  return callOrgAction("settings.cleanup.create", orgSlug, {
    name: input.name,
    kind: input.kind,
    action: input.action,
    enabled: input.enabled ?? true,
    scope: { connectionIds: [], projectIds: [], mailboxAddresses: [] },
    match: input.match ?? {},
  });
}
