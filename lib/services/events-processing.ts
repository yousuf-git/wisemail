import "server-only";

import { Types, type ClientSession } from "mongoose";

import { meterEmail } from "@/lib/billing/metering";
import { connectDb } from "@/lib/db/connect";
import { parseId } from "@/lib/db/ids";
import { BroadcastModel } from "@/lib/db/models/broadcasts";
import { ConnectionModel } from "@/lib/db/models/connections";
import { DeletionTombstoneModel } from "@/lib/db/models/deletion-tombstones";
import { DOMAIN_STATUSES, DomainModel } from "@/lib/db/models/domains";
import { EmailModel, type EmailStatus } from "@/lib/db/models/emails";
import type { RollupCounter } from "@/lib/db/models/metric-rollups";
import { TemplateModel } from "@/lib/db/models/templates";
import { WebhookEventModel } from "@/lib/db/models/webhook-events";
import { withTransaction } from "@/lib/db/transaction";
import { parseAddress, parseAddressList, uniqueAddresses } from "@/lib/mail/address";
import { EVENT_STATUS, nextStatus } from "@/lib/mail/status";
import { publish } from "@/lib/realtime/publish";
import type { DomainEventData, EmailEventData, ReceivedEmailEventData } from "@/lib/resend/types";
import { env } from "@/lib/env";
import { dispatchFetchInbound } from "./inbound";
import { expireAtFrom, getMailSettings } from "./mail-settings";
import { resolveDomain } from "./mail-shared";
import { incrementRollups, type RollupStream } from "./rollups";
import { recomputeSenderStatuses } from "./senders";
import { notifyDomainChanged, notifyForEmailEvent } from "./mail-notifications";
import { AlertRuleModel } from "@/lib/db/models/alert-rules";

/**
 * `process-event` (TRD §2.1 step 5). Runs after ingest has stored a `webhook_events` document.
 *
 * Idempotent and exactly-once: everything (claim of `processedAt`, email upsert, rollup
 * increments, realtime event) happens in one transaction, so a crash rolls back to "unprocessed"
 * and a retry or duplicate delivery finds `processedAt` set and does nothing. Side effects
 * outside the database (enqueueing `fetch-inbound`) are returned to the caller, which runs them
 * as a separate durable step.
 */

export type FetchInboundRequest = { emailId: string; orgId: string; connectionId: string };

export type ProcessOutcome = {
  found: boolean;
  type?: string;
  /** The event had already been processed (retry or redelivery); nothing was done. */
  alreadyProcessed?: boolean;
  /** Why the event changed no email: `deleted` (tombstone) or `connection_gone`. */
  ignoredReason?: string;
  emailId?: string;
  /** Set for `email.received`: the caller must enqueue `fetch-inbound` for it. */
  fetchInbound?: FetchInboundRequest | null;
  /** Org whose alert rules should be re-evaluated (it has enabled rules and the event counted). */
  alertOrgId?: string;
};

/* ------------------------------------------------------------------------------------------ */
/* Applying one event to an email's state (pure)                                               */
/* ------------------------------------------------------------------------------------------ */

export type EmailState = {
  status: EmailStatus;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  firstOpenedAt?: Date | null;
  lastOpenedAt?: Date | null;
  firstClickedAt?: Date | null;
  bouncedAt?: Date | null;
  complainedAt?: Date | null;
  receivedAt?: Date | null;
  openCount: number;
  clickCount: number;
  likelyAutomatedOpen: boolean;
  messageId?: string | null;
  bounce?: { type: "hard" | "soft"; subType?: string | null; message?: string | null } | null;
  sendError?: { code?: string | null; message?: string | null } | null;
};

export type AppliedEvent = {
  counters: Partial<Record<RollupCounter, number>>;
  latencyMs?: number;
};

const earliest = (a: Date | null | undefined, b: Date) => (!a || b < a ? b : a);
const latest = (a: Date | null | undefined, b: Date) => (!a || b > a ? b : a);

/** Opens within this long of delivery look like a mail-provider prefetch (PRD §5.5). */
export const AUTOMATED_OPEN_WINDOW_MS = 10_000;

/**
 * Applies `type` at `occurredAt` to `state` in place. The status only moves up in rank, so events
 * arriving out of order (an open before its delivery) never lower it; lifecycle timestamps keep
 * the earliest (or latest) value regardless of arrival order.
 */
export function applyEmailEvent(
  state: EmailState,
  event: { type: string; occurredAt: Date; data: Record<string, unknown> },
): AppliedEvent {
  const { type, occurredAt: at, data } = event;
  const counters: AppliedEvent["counters"] = {};
  let latencyMs: number | undefined;

  const implied = EVENT_STATUS[type];
  if (implied) state.status = nextStatus(state.status, implied);

  const messageId = (data as { message_id?: string }).message_id;
  if (messageId && state.status !== "received") state.messageId = messageId;

  switch (type) {
    case "email.sent": {
      const firstSent = !state.sentAt;
      state.sentAt = earliest(state.sentAt, at);
      counters.sent = 1;
      if (firstSent && state.deliveredAt) latencyMs = state.deliveredAt.getTime() - at.getTime();
      break;
    }
    case "email.delivered": {
      const firstDelivered = !state.deliveredAt;
      state.deliveredAt = earliest(state.deliveredAt, at);
      counters.delivered = 1;
      if (firstDelivered && state.sentAt) latencyMs = at.getTime() - state.sentAt.getTime();
      break;
    }
    case "email.delivery_delayed":
      counters.delivery_delayed = 1;
      break;
    case "email.opened": {
      const first = state.openCount === 0;
      state.openCount += 1;
      state.firstOpenedAt = earliest(state.firstOpenedAt, at);
      state.lastOpenedAt = latest(state.lastOpenedAt, at);
      if (
        first &&
        state.deliveredAt &&
        at.getTime() - state.deliveredAt.getTime() <= AUTOMATED_OPEN_WINDOW_MS
      ) {
        state.likelyAutomatedOpen = true;
      }
      counters.opened_total = 1;
      if (first) counters.opened_unique = 1;
      break;
    }
    case "email.clicked": {
      const first = state.clickCount === 0;
      state.clickCount += 1;
      state.firstClickedAt = earliest(state.firstClickedAt, at);
      counters.clicked_total = 1;
      if (first) counters.clicked_unique = 1;
      break;
    }
    case "email.bounced": {
      const bounce = (data as { bounce?: { type?: string; subType?: string; message?: string } })
        .bounce;
      const hard = /perm|hard/i.test(bounce?.type ?? "");
      state.bouncedAt = earliest(state.bouncedAt, at);
      state.bounce = {
        type: hard ? "hard" : "soft",
        subType: bounce?.subType,
        message: bounce?.message,
      };
      counters[hard ? "bounced_hard" : "bounced_soft"] = 1;
      break;
    }
    case "email.complained":
      state.complainedAt = earliest(state.complainedAt, at);
      counters.complained = 1;
      break;
    case "email.failed":
      state.sendError = {
        code: "failed",
        message: (data as { failed?: { reason?: string } }).failed?.reason ?? "Sending failed.",
      };
      counters.failed = 1;
      break;
    case "email.suppressed":
      state.sendError = {
        code: "suppressed",
        message:
          (data as { suppressed?: { message?: string } }).suppressed?.message ??
          "The recipient is on the suppression list.",
      };
      counters.suppressed = 1;
      break;
    case "email.received":
      state.receivedAt = earliest(state.receivedAt, at);
      counters.received = 1;
      break;
    default:
      break;
  }
  return { counters, latencyMs: latencyMs !== undefined && latencyMs >= 0 ? latencyMs : undefined };
}

/* ------------------------------------------------------------------------------------------ */
/* Processing                                                                                  */
/* ------------------------------------------------------------------------------------------ */

/** Tag carrying our `emails._id` on messages sent from the app, so events find them at once. */
export const EMAIL_TAG = "mw_email";

const tagsToArray = (tags: unknown): { name: string; value: string }[] =>
  tags && typeof tags === "object"
    ? Object.entries(tags as Record<string, unknown>).map(([name, value]) => ({
        name,
        value: String(value),
      }))
    : [];

async function lookupByResendId(
  connectionId: Types.ObjectId,
  resendId: string,
  session: ClientSession,
) {
  return EmailModel.findOne({ connectionId, resendId }, null, { session });
}

/**
 * An outbound email created by the app is found by its `mw_email` tag even when the event beats
 * the moment we stored Resend's id (the id is adopted right here).
 */
async function adoptByTag(
  orgId: Types.ObjectId,
  connectionId: Types.ObjectId,
  resendId: string,
  tags: unknown,
  session: ClientSession,
) {
  const raw = (tags as Record<string, string> | undefined)?.[EMAIL_TAG];
  const id = raw ? parseId("emails", raw) : null;
  if (!id) return null;
  return EmailModel.findOneAndUpdate(
    { _id: id, orgId, connectionId, direction: "outbound", resendId: null },
    { $set: { resendId } },
    { session, returnDocument: "after" },
  );
}

async function lookupRef(
  model: typeof BroadcastModel | typeof TemplateModel,
  connectionId: Types.ObjectId,
  resendId: string | undefined,
  session: ClientSession,
): Promise<Types.ObjectId | null> {
  if (!resendId) return null;
  const doc = await (model as typeof BroadcastModel)
    .findOne({ connectionId, resendId }, { _id: 1 }, { session })
    .lean();
  return doc?._id ?? null;
}

async function processEmailEvent(
  event: {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    connectionId: Types.ObjectId;
    type: string;
    occurredAt: Date;
    payload: unknown;
  },
  session: ClientSession,
): Promise<ProcessOutcome> {
  const { orgId, connectionId, type, occurredAt } = event;
  const data = event.payload as Record<string, unknown>;
  const resendId = String((data as { email_id?: string }).email_id ?? "");
  const inbound = type === "email.received";
  const base: ProcessOutcome = { found: true, type };

  if (!resendId) {
    await WebhookEventModel.updateOne(
      { _id: event._id },
      { $set: { ignoredReason: "no_email_id" } },
      { session },
    );
    return { ...base, ignoredReason: "no_email_id" };
  }

  let email = await lookupByResendId(connectionId, resendId, session);
  if (!email && !inbound) {
    email = await adoptByTag(orgId, connectionId, resendId, (data as EmailEventData).tags, session);
  }

  // Tombstone: counted in insights, never recreated (TRD §2.1 step 5).
  const tombstoned = !email
    ? await DeletionTombstoneModel.exists({
        connectionId,
        kind: inbound ? "received_email" : "sent_email",
        resendId,
      }).session(session)
    : null;

  const fromAddress = parseAddress(String((data as { from?: string }).from ?? ""));
  const domainAddress = inbound
    ? ((data as ReceivedEmailEventData).received_for?.[0] ??
      (data as ReceivedEmailEventData).to?.[0] ??
      "")
    : (fromAddress?.address ?? "");
  const resolvedAddress = parseAddress(domainAddress)?.address;
  const domain =
    email?.domainId || !resolvedAddress
      ? null
      : await resolveDomain(orgId, connectionId, resolvedAddress, { session });

  const scope = {
    orgId,
    connectionId,
    domainId: email?.domainId ?? domain?._id ?? null,
    projectId: email?.projectId ?? domain?.projectId ?? null,
  };
  const stream: RollupStream = inbound
    ? "inbound"
    : email?.origin === "broadcast" || (data as EmailEventData).broadcast_id
      ? "broadcast"
      : "transactional";

  if (tombstoned) {
    const counters = applyEmailEvent(
      { status: "sent", openCount: 1, clickCount: 1, likelyAutomatedOpen: false },
      { type, occurredAt, data },
    ).counters;
    // The email is gone, so uniqueness cannot be told: count only the totals for opens/clicks.
    delete counters.opened_unique;
    delete counters.clicked_unique;
    await incrementRollups(scope, { at: occurredAt, stream, counters }, { session });
    await WebhookEventModel.updateOne(
      { _id: event._id },
      { $set: { ignoredReason: "deleted" } },
      { session },
    );
    return { ...base, ignoredReason: "deleted" };
  }

  let created = false;
  if (!email) {
    created = true;
    const settings = await getMailSettings(orgId, { session });
    const to = parseAddressList((data as { to?: string[] }).to);
    const cc = parseAddressList((data as ReceivedEmailEventData).cc);
    const bcc = parseAddressList((data as ReceivedEmailEventData).bcc);
    const tags = tagsToArray((data as EmailEventData).tags);
    const broadcastId = await lookupRef(
      BroadcastModel,
      connectionId,
      (data as EmailEventData).broadcast_id,
      session,
    );
    const templateId = await lookupRef(
      TemplateModel,
      connectionId,
      (data as EmailEventData).template_id,
      session,
    );
    const attachments = (data as ReceivedEmailEventData).attachments ?? [];
    const [doc] = await EmailModel.create(
      [
        {
          orgId,
          connectionId,
          resendId,
          direction: inbound ? "inbound" : "outbound",
          origin: inbound ? "external" : broadcastId ? "broadcast" : "external",
          domainId: domain?._id ?? null,
          projectId: domain?.projectId ?? null,
          broadcastId,
          templateId,
          messageId: (data as { message_id?: string }).message_id,
          from: fromAddress ?? { address: "unknown@unknown.invalid" },
          to,
          cc,
          bcc,
          recipientAddresses: uniqueAddresses([to, cc, bcc]),
          subject: String((data as { subject?: string }).subject ?? ""),
          tags,
          hasAttachments: attachments.length > 0,
          status: inbound ? "received" : "queued",
          ...(inbound ? { contentStatus: "pending" } : {}),
          expireAt: expireAtFrom(occurredAt, settings.retentionDays),
          createdAt: new Date((data as { created_at?: string }).created_at ?? occurredAt),
        },
      ],
      { session, timestamps: true },
    );
    email = doc!;
  }

  const state: EmailState = email.toObject();
  const applied = applyEmailEvent(state, { type, occurredAt, data });
  email.set({
    status: state.status,
    sentAt: state.sentAt ?? undefined,
    deliveredAt: state.deliveredAt ?? undefined,
    firstOpenedAt: state.firstOpenedAt ?? undefined,
    lastOpenedAt: state.lastOpenedAt ?? undefined,
    firstClickedAt: state.firstClickedAt ?? undefined,
    bouncedAt: state.bouncedAt ?? undefined,
    complainedAt: state.complainedAt ?? undefined,
    receivedAt: state.receivedAt ?? undefined,
    openCount: state.openCount,
    clickCount: state.clickCount,
    likelyAutomatedOpen: state.likelyAutomatedOpen,
    ...(state.messageId ? { messageId: state.messageId } : {}),
    ...(state.bounce ? { bounce: state.bounce } : {}),
    ...(state.sendError ? { sendError: state.sendError } : {}),
  });
  await email.save({ session });

  await incrementRollups(
    {
      ...scope,
      domainId: email.domainId ?? scope.domainId,
      projectId: email.projectId ?? scope.projectId,
    },
    { at: occurredAt, stream, counters: applied.counters, latencyMs: applied.latencyMs },
    { session },
  );

  await WebhookEventModel.updateOne(
    { _id: event._id },
    { $set: { emailId: email._id } },
    { session },
  );

  // Count it once toward the plan allowance (idempotent via `emails.meteredAt`, same transaction).
  await meterEmail({ orgId, emailId: email._id, stream }, { session });
  // Notifications for bounces, complaints and opened replies (tombstoned emails returned above;
  // `inbound_received` is sent by `fetch-inbound` once the message is threaded). Alert
  // evaluation is requested by the caller after the transaction (`alertOrgId`).
  await notifyForEmailEvent(type, email, { session });

  const threadId = email.threadId?.toHexString();
  await publish(
    {
      orgId,
      projectId: email.projectId ?? null,
      topics: [
        "emails",
        `email:${email._id.toHexString()}`,
        ...(threadId ? ["threads", `thread:${threadId}`] : []),
      ],
      patch: {
        emailId: email._id.toHexString(),
        status: email.status,
        openCount: email.openCount,
        clickCount: email.clickCount,
        ...(email.firstOpenedAt ? { firstOpenedAt: email.firstOpenedAt.toISOString() } : {}),
      },
    },
    { session },
  );

  const wantsFetch =
    inbound && (email.contentStatus === "pending" || email.contentStatus === "failed");
  return {
    ...base,
    emailId: email._id.toHexString(),
    fetchInbound:
      wantsFetch || (inbound && created)
        ? {
            emailId: email._id.toHexString(),
            orgId: orgId.toHexString(),
            connectionId: connectionId.toHexString(),
          }
        : null,
  };
}

async function processDomainEvent(
  event: {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    connectionId: Types.ObjectId;
    type: string;
    payload: unknown;
  },
  session: ClientSession,
): Promise<ProcessOutcome> {
  const { orgId, connectionId, type } = event;
  const eventId = event._id.toHexString();
  const data = event.payload as DomainEventData;
  const domain = await DomainModel.findOne({ orgId, connectionId, resendId: data.id }, null, {
    session,
  });
  if (domain) {
    const previousStatus = domain.status;
    if (type === "domain.deleted") {
      // Mirror removed; senders keep their reference and turn `domain_unverified` (DBD §5).
      await DomainModel.deleteOne({ _id: domain._id, orgId }, { session });
    } else if ((DOMAIN_STATUSES as readonly string[]).includes(data.status)) {
      await DomainModel.updateOne(
        { _id: domain._id, orgId },
        { $set: { status: data.status } },
        { session },
      );
    }
    await recomputeSenderStatuses(orgId, { domainId: domain._id }, { session });
    const nextStatus = type === "domain.deleted" ? "deleted" : data.status;
    if (nextStatus !== previousStatus) {
      await notifyDomainChanged(
        {
          orgId,
          connectionId,
          domainId: domain._id,
          projectId: domain.projectId ?? null,
          name: domain.name,
          status: nextStatus,
          dedupKey: `domain:${domain._id}:${eventId}`,
        },
        { session },
      );
    }
    await publish(
      { orgId, topics: ["domains", "senders"], patch: { domain: data.id, status: data.status } },
      { session },
    );
  }
  return { found: true, type };
}

/**
 * Processes one stored event. Safe to call any number of times: only the first call changes
 * anything. Returns what the caller still has to do outside the database.
 */
export async function processWebhookEvent(eventId: string): Promise<ProcessOutcome> {
  await connectDb();
  const id = parseId("webhook_events", eventId);
  if (!id) return { found: false };
  const stored = await WebhookEventModel.findById(id).lean();
  if (!stored) return { found: false };
  if (stored.processedAt) return { found: true, type: stored.type, alreadyProcessed: true };

  const connection = await ConnectionModel.exists({
    _id: stored.connectionId,
    orgId: stored.orgId,
  });

  const outcome = await withTransaction(async (session) => {
    // Claim: a concurrent or repeated run finds `processedAt` set and stops.
    const claimed = await WebhookEventModel.findOneAndUpdate(
      { _id: id, processedAt: null },
      { $set: { processedAt: new Date() }, $unset: { processingError: 1 } },
      { session, returnDocument: "after" },
    );
    if (!claimed) return { found: true, type: stored.type, alreadyProcessed: true };
    if (!connection) {
      await WebhookEventModel.updateOne(
        { _id: id },
        { $set: { ignoredReason: "connection_gone" } },
        { session },
      );
      return { found: true, type: stored.type, ignoredReason: "connection_gone" };
    }
    if (stored.type.startsWith("email.")) return processEmailEvent(claimed, session);
    if (stored.type.startsWith("domain.")) return processDomainEvent(claimed, session);
    // contact.* and suppression.* are handled by the audience phases (TODO(phase 6)).
    return { found: true, type: stored.type };
  });

  // Alert rules look at rollups and domain status, both of which just changed. Only ask for an
  // evaluation when the org has rules to evaluate.
  const counted =
    !outcome.alreadyProcessed &&
    outcome.found &&
    (!outcome.ignoredReason || outcome.ignoredReason === "deleted") &&
    (stored.type.startsWith("email.") || stored.type.startsWith("domain."));
  if (counted && (await AlertRuleModel.exists({ orgId: stored.orgId, enabled: true }))) {
    outcome.alertOrgId = stored.orgId.toHexString();
  }
  return outcome;
}

/**
 * Development fallback used by ingest when no Inngest server could be reached: process the event
 * in this process and follow up with `fetch-inbound`. Never used in production or tests.
 */
export async function processEventInline(eventId: string): Promise<void> {
  if (env.NODE_ENV === "production") return;
  const outcome = await processWebhookEvent(eventId);
  if (outcome.fetchInbound) await dispatchFetchInbound(outcome.fetchInbound);
  if (outcome.alertOrgId) {
    // No Inngest here, so no debounce either: evaluate right away, then send queued emails.
    const { evaluateOrgAlerts } = await import("./alert-evaluation");
    await evaluateOrgAlerts(outcome.alertOrgId);
  }
  const { sendPendingNotificationEmails } = await import("./notifications");
  await sendPendingNotificationEmails();
}
