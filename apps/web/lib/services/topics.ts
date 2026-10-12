import "server-only";

import { Types } from "mongoose";

import type { OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { BroadcastModel } from "@/lib/db/models/broadcasts";
import { ContactModel } from "@/lib/db/models/contacts";
import { TopicModel, type TopicDoc } from "@/lib/db/models/topics";
import { withTransaction } from "@/lib/db/transaction";
import type { TopicDTO } from "@/lib/dto/audience";
import { publish } from "@/lib/realtime/publish";
import { createTopicInput, updateTopicInput } from "@/lib/validation/audience";
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
import { connectionNames } from "./segments";

export function toTopicDTO(doc: TopicDoc, connectionName: string): TopicDTO {
  return {
    id: doc._id.toHexString(),
    connectionId: doc.connectionId.toHexString(),
    connectionName,
    name: doc.name,
    description: doc.description ?? "",
    defaultSubscription: doc.defaultSubscription ?? "opt_in",
  };
}

const actor = (ctx: OrgContext) => ({ type: "user" as const, id: new Types.ObjectId(ctx.user.id) });

export async function listTopics(
  ctx: OrgContext,
  input: { connectionId?: string } = {},
): Promise<TopicDTO[]> {
  authorize(ctx, "audience:read");
  await connectDb();
  const filter = await scopeFilter(ctx, input.connectionId);
  const docs = await TopicModel.find(filter).sort({ name: 1 }).lean();
  const names = await connectionNames(filter.orgId, [...new Set(docs.map((d) => d.connectionId))]);
  return docs.map((d) =>
    toTopicDTO(d as unknown as TopicDoc, names.get(d.connectionId.toHexString()) ?? ""),
  );
}

export async function createTopic(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<TopicDTO> {
  authorize(ctx, "audience:manage");
  const input = parseInput(createTopicInput, raw);
  const { connection, adapter } = await loadConnection(ctx, input.connectionId, "write", deps);
  const orgId = orgOid(ctx);

  const created = await remote(() =>
    adapter.createTopic({
      name: input.name,
      description: input.description || undefined,
      defaultSubscription: input.defaultSubscription,
    }),
  );

  return withTransaction(async (session) => {
    const doc = await TopicModel.findOneAndUpdate(
      { orgId, connectionId: connection._id, resendId: created.id },
      {
        $set: {
          name: input.name,
          description: input.description || undefined,
          defaultSubscription: input.defaultSubscription,
          resendCreatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "topic.created",
        target: { type: "topic", id: doc._id },
        changes: { after: { name: input.name, defaultSubscription: input.defaultSubscription } },
      },
      { session },
    );
    await publish(
      { orgId, topics: ["topics", `connection:${connection._id.toHexString()}`] },
      { session },
    );
    return toTopicDTO(doc, connection.name);
  });
}

async function loadTopic(ctx: OrgContext, id: string) {
  const oid = toObjectId(id, "Topic");
  const filter = await scopeFilter(ctx);
  const doc = await TopicModel.findOne({ ...filter, _id: oid });
  if (!doc) throw new ServiceError("not_found", "Topic not found.");
  return doc;
}

/** Name and description only: Resend does not let a topic's default subscription change. */
export async function updateTopic(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<TopicDTO> {
  authorize(ctx, "audience:manage");
  const input = parseInput(updateTopicInput, raw);
  const topic = await loadTopic(ctx, input.id);
  const { connection, adapter } = await loadConnection(ctx, topic.connectionId, "write", deps);
  await remote(() =>
    adapter.updateTopic({ id: topic.resendId, name: input.name, description: input.description }),
  );
  return withTransaction(async (session) => {
    const before = { name: topic.name, description: topic.description ?? "" };
    const doc = await TopicModel.findOneAndUpdate(
      { _id: topic._id, orgId: topic.orgId },
      {
        $set: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined
            ? {}
            : { description: input.description || undefined }),
        },
      },
      { returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId: topic.orgId,
        actor: actor(ctx),
        action: "topic.updated",
        target: { type: "topic", id: topic._id },
        changes: { before, after: { name: doc!.name, description: doc!.description ?? "" } },
      },
      { session },
    );
    await publish({ orgId: topic.orgId, topics: ["topics"] }, { session });
    return toTopicDTO(doc!, connection.name);
  });
}

export async function deleteTopic(
  ctx: OrgContext,
  id: string,
  deps: AudienceDeps = {},
): Promise<void> {
  authorize(ctx, "audience:manage");
  const topic = await loadTopic(ctx, id);
  const { adapter } = await loadConnection(ctx, topic.connectionId, "write", deps);
  try {
    await remote(() => adapter.deleteTopic(topic.resendId));
  } catch (error) {
    if (!isNotFoundInResend(error)) throw error;
  }
  const { orgId } = topic;
  await withTransaction(async (session) => {
    await ContactModel.updateMany(
      { orgId, "topicSubscriptions.topicId": topic._id },
      { $pull: { topicSubscriptions: { topicId: topic._id } } },
      { session },
    );
    await BroadcastModel.updateMany(
      { orgId, topicId: topic._id },
      { $set: { topicId: null } },
      { session },
    );
    await TopicModel.deleteOne({ _id: topic._id, orgId }, { session });
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "topic.deleted",
        target: { type: "topic", id: topic._id },
        changes: { before: { name: topic.name } },
      },
      { session },
    );
    await publish({ orgId, topics: ["topics", "contacts", "broadcasts"] }, { session });
  });
}
