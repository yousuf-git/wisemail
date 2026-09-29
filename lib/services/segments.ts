import "server-only";

import { Types } from "mongoose";

import type { OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { BroadcastModel } from "@/lib/db/models/broadcasts";
import { ConnectionModel } from "@/lib/db/models/connections";
import { ContactModel } from "@/lib/db/models/contacts";
import { SegmentModel, type SegmentDoc } from "@/lib/db/models/segments";
import { withTransaction } from "@/lib/db/transaction";
import type { SegmentDTO } from "@/lib/dto/audience";
import { publish } from "@/lib/realtime/publish";
import { createSegmentInput, renameSegmentInput } from "@/lib/validation/audience";
import { writeAuditLog } from "./audit";
import {
  authorize,
  isNotFoundInResend,
  loadConnection,
  orgOid,
  parseInput,
  remote,
  scopeFilter,
  toObjectId,
  type AudienceDeps,
} from "./audience-shared";
import { ServiceError } from "./errors";

export async function connectionNames(orgId: Types.ObjectId, ids: Types.ObjectId[]) {
  const docs = await ConnectionModel.find({ orgId, _id: { $in: ids } }, { name: 1 }).lean();
  return new Map(docs.map((c) => [c._id.toHexString(), c.name]));
}

export function toSegmentDTO(
  doc: SegmentDoc | (SegmentDoc & { _id: Types.ObjectId }),
  connectionName: string,
): SegmentDTO {
  return {
    id: doc._id.toHexString(),
    connectionId: doc.connectionId.toHexString(),
    connectionName,
    name: doc.name,
    contactCount: doc.contactCount ?? 0,
    createdAt: doc.resendCreatedAt?.toISOString() ?? null,
  };
}

/** Segments the member may see, by connection then name. */
export async function listSegments(
  ctx: OrgContext,
  input: { connectionId?: string } = {},
): Promise<SegmentDTO[]> {
  authorize(ctx, "audience:read");
  await connectDb();
  const filter = await scopeFilter(ctx, input.connectionId);
  const docs = await SegmentModel.find(filter).sort({ name: 1 }).lean();
  const names = await connectionNames(filter.orgId, [...new Set(docs.map((d) => d.connectionId))]);
  return docs.map((d) =>
    toSegmentDTO(d as unknown as SegmentDoc, names.get(d.connectionId.toHexString()) ?? ""),
  );
}

const actor = (ctx: OrgContext) => ({ type: "user" as const, id: new Types.ObjectId(ctx.user.id) });

export async function createSegment(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<SegmentDTO> {
  authorize(ctx, "audience:manage");
  const input = parseInput(createSegmentInput, raw);
  const { connection, adapter } = await loadConnection(ctx, input.connectionId, "write", deps);
  const orgId = orgOid(ctx);

  const created = await remote(() => adapter.createSegment({ name: input.name }));

  return withTransaction(async (session) => {
    const doc = await SegmentModel.findOneAndUpdate(
      { orgId, connectionId: connection._id, resendId: created.id },
      {
        $set: { name: input.name, resendCreatedAt: new Date() },
        $setOnInsert: { contactCount: 0 },
      },
      { upsert: true, returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "segment.created",
        target: { type: "segment", id: doc._id },
        changes: { after: { name: input.name, connection: connection.name } },
      },
      { session },
    );
    await publish(
      { orgId, topics: ["segments", `connection:${connection._id.toHexString()}`] },
      { session },
    );
    return toSegmentDTO(doc, connection.name);
  });
}

async function loadSegment(ctx: OrgContext, id: string) {
  const oid = toObjectId(id, "Segment");
  const filter = await scopeFilter(ctx);
  const doc = await SegmentModel.findOne({ ...filter, _id: oid });
  if (!doc) throw new ServiceError("not_found", "Segment not found.");
  return doc;
}

export async function renameSegment(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<SegmentDTO> {
  authorize(ctx, "audience:manage");
  const input = parseInput(renameSegmentInput, raw);
  const segment = await loadSegment(ctx, input.id);
  const { connection, adapter } = await loadConnection(ctx, segment.connectionId, "write", deps);
  await remote(() => adapter.updateSegment(segment.resendId, { name: input.name }));
  return withTransaction(async (session) => {
    const before = segment.name;
    const doc = await SegmentModel.findOneAndUpdate(
      { _id: segment._id, orgId: segment.orgId },
      { $set: { name: input.name } },
      { returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId: segment.orgId,
        actor: actor(ctx),
        action: "segment.renamed",
        target: { type: "segment", id: segment._id },
        changes: { before: { name: before }, after: { name: input.name } },
      },
      { session },
    );
    await publish({ orgId: segment.orgId, topics: ["segments"] }, { session });
    return toSegmentDTO(doc!, connection.name);
  });
}

/**
 * Deletes in Resend first (already gone there counts as deleted), then here: contacts lose the
 * membership and broadcasts aimed at it lose their segment, so they show as needing one (DBD §5).
 */
export async function deleteSegment(
  ctx: OrgContext,
  id: string,
  deps: AudienceDeps = {},
): Promise<void> {
  authorize(ctx, "audience:manage");
  const segment = await loadSegment(ctx, id);
  const { adapter } = await loadConnection(ctx, segment.connectionId, "write", deps);
  try {
    await remote(() => adapter.deleteSegment(segment.resendId));
  } catch (error) {
    if (!isNotFoundInResend(error)) throw error;
  }
  const { orgId } = segment;
  await withTransaction(async (session) => {
    await ContactModel.updateMany(
      { orgId, segmentIds: segment._id },
      { $pull: { segmentIds: segment._id } },
      { session },
    );
    await BroadcastModel.updateMany(
      { orgId, segmentId: segment._id },
      { $set: { segmentId: null } },
      { session },
    );
    await SegmentModel.deleteOne({ _id: segment._id, orgId }, { session });
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "segment.deleted",
        target: { type: "segment", id: segment._id },
        changes: { before: { name: segment.name } },
      },
      { session },
    );
    await publish({ orgId, topics: ["segments", "contacts", "broadcasts"] }, { session });
  });
}

/** Recounts members of the given segments from the contact mirror. */
export async function recountSegments(
  orgId: Types.ObjectId,
  ids: Types.ObjectId[],
  session?: import("mongoose").ClientSession,
) {
  for (const id of ids) {
    const n = await ContactModel.countDocuments({ orgId, segmentIds: id }, { session });
    await SegmentModel.updateOne({ _id: id, orgId }, { $set: { contactCount: n } }, { session });
  }
}
