import "server-only";

import { Types, type ClientSession } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel, type ConnectionStatus } from "@/lib/db/models/connections";
import { DomainModel, type DomainStatus } from "@/lib/db/models/domains";
import { EmailModel } from "@/lib/db/models/emails";
import { SenderModel, type SenderDoc, type SenderStatus } from "@/lib/db/models/senders";
import { withTransaction } from "@/lib/db/transaction";
import type { SenderDTO } from "@/lib/dto/mail";
import { domainOf } from "@/lib/mail/address";
import { PENDING_STATUSES } from "@/lib/mail/status";
import { publish } from "@/lib/realtime/publish";
import {
  createSenderInput,
  updateSenderInput,
  type CreateSenderInput,
  type UpdateSenderInput,
} from "@/lib/validation/mail";
import { ServiceError } from "./errors";
import { isDuplicateKey } from "./mail-shared";
import { canSeeProject } from "./project-scope";

/* ------------------------------------------------------------------------------------------ */
/* Status derivation (DBD §4.3)                                                                */
/* ------------------------------------------------------------------------------------------ */

type DomainFacts = { status: DomainStatus; receiving?: { enabled?: boolean } | null } | null;
type ConnectionFacts = {
  status: ConnectionStatus;
  statusReason?: string | null;
  deletedAt?: Date | null;
} | null;

export type DerivedStatus = { status: SenderStatus; reason: string | null };

/**
 * A sender can send only when its connection is active and its domain verified. `disabled` is a
 * member's choice and is never overridden by derivation; every other status follows the facts,
 * so a sender returns to `active` by itself once the cause clears.
 */
export function deriveSenderStatus(input: {
  current: SenderStatus;
  domain: DomainFacts;
  connection: ConnectionFacts;
}): DerivedStatus {
  const { current, domain, connection } = input;
  if (current === "disabled") return { status: "disabled", reason: null };

  // A sender only knows its connection through its domain, so a missing domain comes first.
  if (!domain) return { status: "domain_unverified", reason: "domain_deleted_in_resend" };
  if (!connection || connection.deletedAt) {
    return { status: "connection_inactive", reason: "connection_removed" };
  }
  if (connection.status !== "active") {
    return {
      status: "connection_inactive",
      reason:
        connection.statusReason === "key_revoked"
          ? "key_revoked"
          : connection.status === "read_only"
            ? "connection_read_only"
            : `connection_${connection.status}`,
    };
  }
  if (domain.status !== "verified") {
    return {
      status: "domain_unverified",
      reason:
        domain.status === "failed" || domain.status === "temporary_failure"
          ? "domain_failed"
          : `domain_${domain.status}`,
    };
  }
  return { status: "active", reason: null };
}

export const SENDER_STATUS_LABELS: Record<string, string> = {
  domain_deleted_in_resend: "The domain was removed from Resend.",
  domain_failed: "The domain failed verification in Resend.",
  resend_rejected_domain: "Resend refused to send from this domain.",
  key_revoked: "The connection's API key was revoked.",
  connection_read_only: "The connection is read-only.",
  connection_removed: "The connection was removed.",
};

export type SenderStatusScope = {
  connectionId?: Types.ObjectId;
  domainId?: Types.ObjectId;
  senderId?: Types.ObjectId;
};

export type SenderStatusChange = {
  senderId: Types.ObjectId;
  from: SenderStatus;
  to: SenderStatus;
  reason: string | null;
};

/**
 * Recomputes the status (and the `canReceiveReplies` cache) of every sender in scope. Called on
 * `domain.*` events, after domain syncs, on connection status changes and after a send Resend
 * rejected for the domain. When senders become unusable it reports the queued or scheduled
 * emails that use them (TODO(phase 5): notify their authors and Admins; they are listed by
 * `listNeedsAttention`).
 */
export async function recomputeSenderStatuses(
  orgId: Types.ObjectId,
  scope: SenderStatusScope = {},
  options: { session?: ClientSession } = {},
): Promise<{ changed: SenderStatusChange[]; flaggedEmails: number }> {
  const { session } = options;
  const filter: Record<string, unknown> = { orgId, deletedAt: null };
  if (scope.senderId) filter._id = scope.senderId;
  if (scope.domainId) filter.domainId = scope.domainId;
  if (scope.connectionId) {
    const domains = await DomainModel.find(
      { orgId, connectionId: scope.connectionId },
      { _id: 1 },
      { session },
    ).lean();
    filter.domainId = { $in: domains.map((d) => d._id) };
  }
  const senders = await SenderModel.find(filter, null, { session }).lean();
  if (senders.length === 0) return { changed: [], flaggedEmails: 0 };

  const domains = await DomainModel.find(
    { orgId, _id: { $in: senders.map((s) => s.domainId) } },
    { status: 1, receiving: 1, connectionId: 1, name: 1 },
    { session },
  ).lean();
  const domainById = new Map(domains.map((d) => [d._id.toHexString(), d]));
  const connections = await ConnectionModel.find(
    { orgId, _id: { $in: domains.map((d) => d.connectionId) } },
    { status: 1, statusReason: 1, deletedAt: 1 },
    { session },
  ).lean();
  const connectionById = new Map(connections.map((c) => [c._id.toHexString(), c]));
  const orgDomains = await DomainModel.find(
    { orgId },
    { name: 1, receiving: 1 },
    { session },
  ).lean();
  const receivingByName = new Map(
    orgDomains.map((d) => [d.name.toLowerCase(), !!d.receiving?.enabled]),
  );

  const now = new Date();
  const changed: SenderStatusChange[] = [];
  const ops = senders.flatMap((sender) => {
    const domain = domainById.get(sender.domainId.toHexString()) ?? null;
    const connection = domain
      ? (connectionById.get(domain.connectionId.toHexString()) ?? null)
      : null;
    const derived = deriveSenderStatus({ current: sender.status, domain, connection });
    const replyDomain = sender.replyTo[0] ? domainOf(sender.replyTo[0]) : "";
    const canReceiveReplies = replyDomain
      ? (receivingByName.get(replyDomain) ?? false)
      : !!domain?.receiving?.enabled;
    const statusChanged = derived.status !== sender.status;
    const reasonChanged = (derived.reason ?? null) !== (sender.statusReason ?? null);
    if (!statusChanged && !reasonChanged && canReceiveReplies === sender.canReceiveReplies)
      return [];
    if (statusChanged) {
      changed.push({
        senderId: sender._id,
        from: sender.status,
        to: derived.status,
        reason: derived.reason,
      });
    }
    const set: Record<string, unknown> = {
      status: derived.status,
      canReceiveReplies,
      ...(statusChanged ? { statusChangedAt: now } : {}),
    };
    if (derived.reason) set.statusReason = derived.reason;
    return [
      {
        updateOne: {
          filter: { _id: sender._id, orgId },
          update: { $set: set, ...(derived.reason ? {} : { $unset: { statusReason: 1 } }) },
        },
      },
    ];
  });
  if (ops.length > 0) await SenderModel.bulkWrite(ops as never, { session });

  const becameUnusable = changed.filter((c) => c.to !== "active");
  let flaggedEmails = 0;
  if (becameUnusable.length > 0) {
    flaggedEmails = await EmailModel.countDocuments(
      {
        orgId,
        senderId: { $in: becameUnusable.map((c) => c.senderId) },
        status: { $in: PENDING_STATUSES },
        trashedAt: null,
      },
      { session },
    );
  }
  if (changed.length > 0) {
    await publish(
      {
        orgId,
        topics: ["senders", ...(flaggedEmails ? ["emails"] : [])],
        patch: { changed: changed.length },
      },
      { session },
    );
  }
  return { changed, flaggedEmails };
}

/**
 * Resend refused a send because of the sending domain (TRD §2.5): marks the domain mirror and
 * its senders unusable until the next domain sync says otherwise.
 */
export async function markDomainRejected(orgId: Types.ObjectId, domainId: Types.ObjectId) {
  await connectDb();
  await DomainModel.updateOne({ _id: domainId, orgId }, { $set: { status: "failed" } });
  await SenderModel.updateMany(
    { orgId, domainId, deletedAt: null, status: "active" },
    {
      $set: {
        status: "domain_unverified",
        statusReason: "resend_rejected_domain",
        statusChangedAt: new Date(),
      },
    },
  );
  await publish({ orgId, topics: ["senders", "domains"], patch: { rejectedDomain: true } });
}

/* ------------------------------------------------------------------------------------------ */
/* CRUD                                                                                        */
/* ------------------------------------------------------------------------------------------ */

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);

type DomainRow = {
  _id: Types.ObjectId;
  name: string;
  projectId?: Types.ObjectId | null;
  status: DomainStatus;
  receiving?: { enabled?: boolean } | null;
};

export function toSenderDTO(
  sender: SenderDoc | ReturnType<SenderDoc["toObject"]>,
  domain: DomainRow,
): SenderDTO {
  const s = sender as SenderDoc;
  const canReceive = !!s.canReceiveReplies;
  return {
    id: s._id.toHexString(),
    domainId: s.domainId.toHexString(),
    domainName: domain.name,
    projectId: domain.projectId?.toHexString() ?? null,
    localPart: s.localPart,
    address: s.address,
    displayName: s.displayName ?? "",
    replyTo: s.replyTo ?? [],
    signatureHtml: s.signatureHtml ?? "",
    isDefault: !!s.isDefault,
    status: s.status,
    statusReason: s.statusReason ?? null,
    canReceiveReplies: canReceive,
    receivingNote: canReceive
      ? null
      : `Replies won't reach your inbox: receiving is off for ${
          s.replyTo?.[0] ? domainOf(s.replyTo[0]) : domain.name
        }.`,
    version: (s as unknown as { __v?: number }).__v ?? 0,
  };
}

async function domainsFor(orgId: Types.ObjectId, ids: Types.ObjectId[]) {
  const domains = await DomainModel.find(
    { orgId, _id: { $in: ids } },
    { name: 1, projectId: 1, status: 1, receiving: 1 },
  ).lean();
  return new Map(domains.map((d) => [d._id.toHexString(), d as DomainRow]));
}

/** Live senders the member may use, oldest first. Project-scoped members see their projects' domains only. */
export async function listSenders(ctx: OrgContext): Promise<SenderDTO[]> {
  authorize(ctx, "sender:read");
  await connectDb();
  const orgId = orgOid(ctx);
  const senders = await SenderModel.find({ orgId, deletedAt: null }).sort({ _id: 1 });
  const domains = await domainsFor(
    orgId,
    senders.map((s) => s.domainId),
  );
  return senders.flatMap((s) => {
    const domain = domains.get(s.domainId.toHexString());
    if (!domain || !canSeeProject(ctx, domain.projectId?.toHexString())) return [];
    return [toSenderDTO(s, domain)];
  });
}

async function loadSender(ctx: OrgContext, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ServiceError("not_found", "Sender not found.");
  const sender = await SenderModel.findOne({ _id: id, orgId: orgOid(ctx), deletedAt: null });
  const domain = sender
    ? (await domainsFor(orgOid(ctx), [sender.domainId])).get(sender.domainId.toHexString())
    : null;
  if (!sender || !domain || !canSeeProject(ctx, domain.projectId?.toHexString())) {
    throw new ServiceError("not_found", "Sender not found.");
  }
  return { sender, domain };
}

export async function createSender(ctx: OrgContext, raw: CreateSenderInput): Promise<SenderDTO> {
  authorize(ctx, "sender:create");
  const input = createSenderInput.parse(raw);
  await connectDb();
  const orgId = orgOid(ctx);
  const domain = await DomainModel.findOne({ _id: input.domainId, orgId }).lean();
  if (!domain || !canSeeProject(ctx, domain.projectId?.toHexString())) {
    throw new ServiceError("not_found", "We couldn't find that domain.");
  }
  if (domain.status !== "verified") {
    throw new ServiceError(
      "domain_unverified",
      `${domain.name} isn't verified in Resend yet, so it can't send.`,
    );
  }
  const connection = await ConnectionModel.findOne({
    _id: domain.connectionId,
    orgId,
    deletedAt: null,
  }).lean();
  const address = `${input.localPart}@${domain.name}`.toLowerCase();
  const derived = deriveSenderStatus({ current: "active", domain, connection });
  const replyDomain = input.replyTo[0] ? domainOf(input.replyTo[0]) : "";
  const replyDomainDoc = replyDomain
    ? await DomainModel.findOne({ orgId, name: replyDomain }, { receiving: 1 }).lean()
    : null;

  try {
    const dto = await withTransaction(async (session) => {
      const existingCount = await SenderModel.countDocuments(
        { orgId, domainId: domain._id, deletedAt: null },
        { session },
      );
      const isDefault = input.isDefault || existingCount === 0;
      if (isDefault) {
        await SenderModel.updateMany(
          { orgId, domainId: domain._id, isDefault: true },
          { $set: { isDefault: false } },
          { session },
        );
      }
      const [created] = await SenderModel.create(
        [
          {
            orgId,
            domainId: domain._id,
            localPart: input.localPart,
            address,
            displayName: input.displayName,
            replyTo: input.replyTo,
            signatureHtml: input.signatureHtml,
            isDefault,
            status: derived.status,
            statusReason: derived.reason ?? undefined,
            statusChangedAt: new Date(),
            canReceiveReplies: replyDomain
              ? !!replyDomainDoc?.receiving?.enabled
              : !!domain.receiving?.enabled,
          },
        ],
        { session },
      );
      await publish({ orgId, topics: ["senders"] }, { session });
      return toSenderDTO(created!, domain as DomainRow);
    });
    return dto;
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new ServiceError("conflict", `${address} already exists.`, {
        localPart: ["You already have a sender with that address."],
      });
    }
    throw error;
  }
}

/** Edits a sender; a stale `version` is a `conflict` (the UI offers to reload). */
export async function updateSender(ctx: OrgContext, raw: UpdateSenderInput): Promise<SenderDTO> {
  authorize(ctx, "sender:update");
  const input = updateSenderInput.parse(raw);
  await connectDb();
  const { sender, domain } = await loadSender(ctx, input.id);
  const currentVersion = (sender as unknown as { __v?: number }).__v ?? 0;
  if (currentVersion !== input.version) {
    throw new ServiceError(
      "conflict",
      "This sender was changed by someone else. Reload to see the latest.",
    );
  }
  if (input.displayName !== undefined) sender.displayName = input.displayName;
  if (input.replyTo !== undefined) sender.replyTo = input.replyTo;
  if (input.signatureHtml !== undefined) sender.signatureHtml = input.signatureHtml;
  try {
    await withTransaction(async (session) => {
      if (input.isDefault) {
        await SenderModel.updateMany(
          { orgId: sender.orgId, domainId: sender.domainId, _id: { $ne: sender._id } },
          { $set: { isDefault: false } },
          { session },
        );
        sender.isDefault = true;
      }
      await sender.save({ session });
      await publish({ orgId: sender.orgId, topics: ["senders"] }, { session });
    });
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") {
      throw new ServiceError(
        "conflict",
        "This sender was changed by someone else. Reload to see the latest.",
      );
    }
    throw error;
  }
  await recomputeSenderStatuses(sender.orgId, { senderId: sender._id });
  const fresh = await SenderModel.findById(sender._id);
  return toSenderDTO(fresh!, domain);
}

/** A member disables or re-enables a sender. Re-enabling derives the status from the facts. */
export async function setSenderDisabled(
  ctx: OrgContext,
  input: { id: string; disabled: boolean },
): Promise<SenderDTO> {
  authorize(ctx, "sender:update");
  await connectDb();
  const { sender, domain } = await loadSender(ctx, input.id);
  if (input.disabled) {
    await SenderModel.updateOne(
      { _id: sender._id, orgId: sender.orgId },
      { $set: { status: "disabled", statusChangedAt: new Date() }, $unset: { statusReason: 1 } },
    );
  } else if (sender.status === "disabled") {
    // Any non-disabled value works as the starting point: derivation replaces it.
    await SenderModel.updateOne(
      { _id: sender._id, orgId: sender.orgId },
      { $set: { status: "active" } },
    );
    await recomputeSenderStatuses(sender.orgId, { senderId: sender._id });
  }
  await publish({ orgId: sender.orgId, topics: ["senders"] });
  const fresh = await SenderModel.findById(sender._id);
  return toSenderDTO(fresh!, domain);
}

/** Soft delete: emails keep their reference; drafts must pick another sender (DBD §5). */
export async function deleteSender(ctx: OrgContext, id: string): Promise<void> {
  authorize(ctx, "sender:delete");
  await connectDb();
  const { sender } = await loadSender(ctx, id);
  await SenderModel.updateOne(
    { _id: sender._id, orgId: sender.orgId },
    { $set: { deletedAt: new Date(), isDefault: false } },
  );
  await publish({ orgId: sender.orgId, topics: ["senders"] });
}
