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

export function trashItems(
  orgSlug: string,
  input: { threadIds?: string[]; emailIds?: string[] },
) {
  return callOrgAction<{ threads: number; emails: number }>("inbox.trash", orgSlug, input);
}

export function trashThreads(orgSlug: string, threadIds: string[]) {
  return trashItems(orgSlug, { threadIds });
}

export function restoreItems(
  orgSlug: string,
  input: { threadIds?: string[]; emailIds?: string[] },
) {
  return callOrgAction<{ threads: number; emails: number }>("inbox.restore", orgSlug, input);
}

export function restoreThreads(orgSlug: string, threadIds: string[]) {
  return restoreItems(orgSlug, { threadIds });
}

export function retryInbound(orgSlug: string, emailId: string) {
  return callOrgAction<{ emailId: string }>("inbox.retry", orgSlug, { emailId });
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

export function createSender(
  orgSlug: string,
  input: {
    domainId: string;
    localPart: string;
    displayName?: string;
    replyTo?: string[];
    signatureHtml?: string;
    isDefault?: boolean;
  },
) {
  return callOrgAction<import("@/lib/api").Sender>("settings.senders.create", orgSlug, input);
}

export function updateSender(
  orgSlug: string,
  input: {
    id: string;
    version: number;
    displayName?: string;
    replyTo?: string[];
    signatureHtml?: string;
    isDefault?: boolean;
  },
) {
  return callOrgAction<import("@/lib/api").Sender>("settings.senders.update", orgSlug, input);
}

export function setSenderDisabled(orgSlug: string, id: string, disabled: boolean) {
  return callOrgAction<import("@/lib/api").Sender>("settings.senders.disable", orgSlug, {
    id,
    disabled,
  });
}

export function deleteSender(orgSlug: string, id: string) {
  return callOrgAction<{ id: string }>("settings.senders.remove", orgSlug, { id });
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
  return callOrgAction<{
    id: string;
    email: string;
    role: string;
    link: string | null;
    emailSent: boolean | null;
    expiresInDays: number;
    projectIds: string[];
  }>("settings.members.invite", orgSlug, {
    email: input.email,
    role: input.role,
    projectIds: input.projectIds ?? [],
  });
}

export function cancelInvitation(orgSlug: string, invitationId: string) {
  return callOrgAction("settings.members.cancel", orgSlug, { invitationId });
}

export function resendInvitation(orgSlug: string, invitationId: string) {
  return callOrgAction<{
    id: string;
    email: string;
    link: string | null;
    emailSent: boolean | null;
  }>("settings.members.resend", orgSlug, { invitationId });
}

export function changeMemberRole(orgSlug: string, memberId: string, role: string) {
  return callOrgAction("settings.members.changeRole", orgSlug, { memberId, role });
}

export function removeMember(orgSlug: string, memberId: string) {
  return callOrgAction("settings.members.remove", orgSlug, { memberId });
}

export function setMemberScope(orgSlug: string, memberId: string, projectIds: string[]) {
  return callOrgAction("settings.members.scope", orgSlug, { memberId, projectIds });
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

export function previewPlanChange(orgSlug: string, plan: string) {
  return callOrgAction<import("@/lib/api").PlanChangePreview>("settings.billing.preview", orgSlug, {
    plan,
  });
}

export function changeBillingPlan(orgSlug: string, plan: string) {
  return callOrgAction<{
    status: "applied" | "scheduled" | "cancelled_pending";
    plan: string;
    effectiveAt: string | null;
  }>("settings.billing.change", orgSlug, { plan });
}

export function cancelPendingPlanChange(orgSlug: string) {
  return callOrgAction<{ cancelled: true }>("settings.billing.cancel", orgSlug, {});
}

export function buyCreditPack(orgSlug: string, quantity = 1) {
  return callOrgAction<{ url: string }>("settings.billing.pack", orgSlug, { quantity });
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
  input: import("@/lib/api").CleanupRuleInput,
) {
  return callOrgAction("settings.cleanup.create", orgSlug, {
    name: input.name,
    kind: input.kind,
    action: input.action,
    enabled: input.enabled ?? true,
    scope: {
      connectionIds: input.scope?.connectionIds ?? [],
      projectIds: input.scope?.projectIds ?? [],
      mailboxAddresses: input.scope?.mailboxAddresses ?? [],
    },
    match: input.match ?? {},
  });
}

export function updateCleanupRule(
  orgSlug: string,
  id: string,
  rule: import("@/lib/api").CleanupRuleInput,
) {
  return callOrgAction("settings.cleanup.update", orgSlug, { id, rule });
}

export function previewCleanupRule(
  orgSlug: string,
  input: import("@/lib/api").CleanupRuleInput,
) {
  return callOrgAction<{ count: number }>("settings.cleanup.preview", orgSlug, {
    name: input.name,
    kind: input.kind,
    action: input.action,
    enabled: input.enabled ?? true,
    scope: {
      connectionIds: input.scope?.connectionIds ?? [],
      projectIds: input.scope?.projectIds ?? [],
      mailboxAddresses: input.scope?.mailboxAddresses ?? [],
    },
    match: input.match ?? {},
  });
}

export function createContact(
  orgSlug: string,
  input: {
    connectionId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    unsubscribed?: boolean;
  },
) {
  return callOrgAction("audience.create", orgSlug, input);
}

export function updateContact(
  orgSlug: string,
  input: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    unsubscribed?: boolean;
    properties?: Record<string, string | number | null>;
  },
) {
  return callOrgAction("audience.update", orgSlug, input);
}

export function deleteContact(orgSlug: string, id: string) {
  return callOrgAction<{ id: string }>("audience.removeContact", orgSlug, { id });
}

export function setContactSegments(orgSlug: string, id: string, segmentIds: string[]) {
  return callOrgAction("audience.segmentsOf", orgSlug, { id, segmentIds });
}

export function setContactTopics(
  orgSlug: string,
  id: string,
  topicSubscriptions: { topicId: string; subscription: "opt_in" | "opt_out" }[],
) {
  return callOrgAction("audience.topicsOf", orgSlug, { id, topicSubscriptions });
}

export function createSegment(orgSlug: string, input: { connectionId: string; name: string }) {
  return callOrgAction("audience.segCreate", orgSlug, input);
}

export function renameSegment(orgSlug: string, id: string, name: string) {
  return callOrgAction("audience.segRename", orgSlug, { id, name });
}

export function deleteSegment(orgSlug: string, id: string) {
  return callOrgAction<{ id: string }>("audience.segDelete", orgSlug, { id });
}

export function createTopic(
  orgSlug: string,
  input: {
    connectionId: string;
    name: string;
    description?: string;
    defaultSubscription?: "opt_in" | "opt_out";
  },
) {
  return callOrgAction("audience.topCreate", orgSlug, input);
}

export function updateTopic(
  orgSlug: string,
  input: { id: string; name?: string; description?: string },
) {
  return callOrgAction("audience.topUpdate", orgSlug, input);
}

export function deleteTopic(orgSlug: string, id: string) {
  return callOrgAction<{ id: string }>("audience.topDelete", orgSlug, { id });
}

export function createProperty(
  orgSlug: string,
  input: {
    connectionId: string;
    key: string;
    type: "string" | "number";
    fallbackValue?: string | number | null;
  },
) {
  return callOrgAction("audience.propCreate", orgSlug, input);
}

export function updateProperty(
  orgSlug: string,
  id: string,
  fallbackValue: string | number | null,
) {
  return callOrgAction("audience.propUpdate", orgSlug, { id, fallbackValue });
}

export function deleteProperty(orgSlug: string, id: string) {
  return callOrgAction<{ id: string }>("audience.propDelete", orgSlug, { id });
}

export function createBroadcast(
  orgSlug: string,
  input: {
    connectionId: string;
    name: string;
    segmentId: string;
    senderId: string;
    subject: string;
    previewText?: string;
    topicId?: string | null;
    html: string;
    templateId?: string | null;
  },
) {
  return callOrgAction("broadcasts.create", orgSlug, input);
}

export function updateBroadcast(
  orgSlug: string,
  input: {
    id: string;
    version: number;
    name: string;
    segmentId: string;
    senderId: string;
    subject: string;
    previewText?: string;
    topicId?: string | null;
    html: string;
    templateId?: string | null;
  },
) {
  return callOrgAction("broadcasts.update", orgSlug, input);
}

export function sendBroadcast(orgSlug: string, id: string, scheduledAt?: string) {
  return callOrgAction("broadcasts.send", orgSlug, {
    id,
    ...(scheduledAt ? { scheduledAt } : {}),
  });
}

export function cancelBroadcast(orgSlug: string, id: string) {
  return callOrgAction("broadcasts.cancel", orgSlug, { id });
}

export function deleteBroadcast(orgSlug: string, id: string) {
  return callOrgAction("broadcasts.remove", orgSlug, { id });
}

export function sendBroadcastTest(orgSlug: string, id: string, to?: string) {
  return callOrgAction("broadcasts.test", orgSlug, { id, to });
}

export function refreshBroadcast(orgSlug: string, id: string) {
  return callOrgAction("broadcasts.refresh", orgSlug, { id });
}

export function createTemplate(
  orgSlug: string,
  input: {
    connectionId: string;
    name: string;
    alias?: string;
    subject?: string;
    from?: string;
    html: string;
    text?: string;
    variables?: { key: string; type: "string" | "number"; fallback?: string | number | null }[];
  },
) {
  return callOrgAction("templates.create", orgSlug, input);
}

export function updateTemplate(
  orgSlug: string,
  input: {
    id: string;
    version: number;
    name: string;
    alias?: string;
    subject?: string;
    from?: string;
    html: string;
    text?: string;
    variables?: { key: string; type: "string" | "number"; fallback?: string | number | null }[];
    publish?: boolean;
  },
) {
  return callOrgAction("templates.update", orgSlug, input);
}

export function duplicateTemplate(orgSlug: string, id: string, connectionId?: string) {
  return callOrgAction("templates.duplicate", orgSlug, { id, connectionId });
}

export function deleteTemplate(orgSlug: string, id: string) {
  return callOrgAction<{ id: string }>("templates.remove", orgSlug, { id });
}

export function createDomain(
  orgSlug: string,
  input: {
    connectionId: string;
    name: string;
    region?: string;
    projectId?: string | null;
  },
) {
  return callOrgAction("domains.create", orgSlug, input);
}

export function setDomainTracking(
  orgSlug: string,
  input: { domainId: string; openTracking?: boolean; clickTracking?: boolean },
) {
  return callOrgAction("domains.tracking", orgSlug, input);
}

export function assignDomainProject(
  orgSlug: string,
  input: { domainId: string; projectId: string | null },
) {
  return callOrgAction("domains.assign", orgSlug, input);
}

export function verifyDomain(orgSlug: string, domainId: string) {
  return callOrgAction("domains.verify", orgSlug, { domainId });
}

export function checkDomainDns(orgSlug: string, domainId: string) {
  return callOrgAction("domains.check", orgSlug, { domainId });
}

export function deleteDomain(orgSlug: string, domainId: string, confirmName: string) {
  return callOrgAction("domains.remove", orgSlug, { domainId, confirmName });
}

export function createApiKey(
  orgSlug: string,
  input: {
    connectionId: string;
    name: string;
    permission: "full_access" | "sending_access";
    domainId?: string | null;
  },
) {
  return callOrgAction<{
    key: {
      id: string;
      name: string;
      connectionName: string;
      permission: "full_access" | "sending_access" | null;
    };
    secret: string;
  }>("api-keys.create", orgSlug, input);
}

export function deleteApiKey(
  orgSlug: string,
  input: { apiKeyId: string; confirmName: string; acknowledgeInUse?: boolean },
) {
  return callOrgAction<{ id: string; name: string }>("api-keys.remove", orgSlug, input);
}

export function createProject(
  orgSlug: string,
  input: { name: string; color: string; description?: string },
) {
  return callOrgAction<{ id: string; name: string }>("settings.projects.create", orgSlug, input);
}

export function updateProject(
  orgSlug: string,
  input: { projectId: string; name: string; color: string; description?: string },
) {
  return callOrgAction<{ id: string; name: string }>("settings.projects.update", orgSlug, input);
}

export function deleteProject(orgSlug: string, projectId: string) {
  return callOrgAction<{ id: string }>("settings.projects.remove", orgSlug, { projectId });
}
