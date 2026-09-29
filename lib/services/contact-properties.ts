import "server-only";

import { Types } from "mongoose";

import type { OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ContactModel } from "@/lib/db/models/contacts";
import { ContactPropertyModel, type ContactPropertyDoc } from "@/lib/db/models/contact-properties";
import { withTransaction } from "@/lib/db/transaction";
import type { PropertyDTO } from "@/lib/dto/audience";
import { publish } from "@/lib/realtime/publish";
import { createPropertyInput, updatePropertyInput } from "@/lib/validation/audience";
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

export function toPropertyDTO(doc: ContactPropertyDoc, connectionName: string): PropertyDTO {
  return {
    id: doc._id.toHexString(),
    connectionId: doc.connectionId.toHexString(),
    connectionName,
    key: doc.key,
    type: doc.type,
    fallbackValue: (doc.fallbackValue ?? null) as string | number | null,
  };
}

const actor = (ctx: OrgContext) => ({ type: "user" as const, id: new Types.ObjectId(ctx.user.id) });

export async function listContactProperties(
  ctx: OrgContext,
  input: { connectionId?: string } = {},
): Promise<PropertyDTO[]> {
  authorize(ctx, "audience:read");
  await connectDb();
  const filter = await scopeFilter(ctx, input.connectionId);
  const docs = await ContactPropertyModel.find(filter).sort({ key: 1 }).lean();
  const names = await connectionNames(filter.orgId, [...new Set(docs.map((d) => d.connectionId))]);
  return docs.map((d) =>
    toPropertyDTO(
      d as unknown as ContactPropertyDoc,
      names.get(d.connectionId.toHexString()) ?? "",
    ),
  );
}

export async function createContactProperty(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<PropertyDTO> {
  authorize(ctx, "audience:manage");
  const input = parseInput(createPropertyInput, raw);
  const { connection, adapter } = await loadConnection(ctx, input.connectionId, "write", deps);
  const orgId = orgOid(ctx);

  const created = await remote(() =>
    adapter.createContactProperty({
      key: input.key,
      type: input.type,
      fallbackValue: input.fallbackValue,
    }),
  );

  return withTransaction(async (session) => {
    const doc = await ContactPropertyModel.findOneAndUpdate(
      { orgId, connectionId: connection._id, resendId: created.id },
      {
        $set: {
          key: input.key,
          type: input.type,
          fallbackValue: input.fallbackValue,
          resendCreatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "contact_property.created",
        target: { type: "contact_property", id: doc._id },
        changes: { after: { key: input.key, type: input.type } },
      },
      { session },
    );
    await publish(
      { orgId, topics: ["contact_properties", `connection:${connection._id.toHexString()}`] },
      { session },
    );
    return toPropertyDTO(doc, connection.name);
  });
}

async function loadProperty(ctx: OrgContext, id: string) {
  const oid = toObjectId(id, "Property");
  const filter = await scopeFilter(ctx);
  const doc = await ContactPropertyModel.findOne({ ...filter, _id: oid });
  if (!doc) throw new ServiceError("not_found", "Property not found.");
  return doc;
}

/** Only the fallback value can change; the key and type are fixed once created (Resend). */
export async function updateContactProperty(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<PropertyDTO> {
  authorize(ctx, "audience:manage");
  const input = parseInput(updatePropertyInput, raw);
  const property = await loadProperty(ctx, input.id);
  if (
    property.type === "number" &&
    input.fallbackValue !== null &&
    typeof input.fallbackValue !== "number"
  ) {
    throw new ServiceError("validation", "Some fields need another look.", {
      fallbackValue: ["Use a number"],
    });
  }
  const { connection, adapter } = await loadConnection(ctx, property.connectionId, "write", deps);
  await remote(() =>
    adapter.updateContactProperty({ id: property.resendId, fallbackValue: input.fallbackValue }),
  );
  return withTransaction(async (session) => {
    const doc = await ContactPropertyModel.findOneAndUpdate(
      { _id: property._id, orgId: property.orgId },
      { $set: { fallbackValue: input.fallbackValue } },
      { returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId: property.orgId,
        actor: actor(ctx),
        action: "contact_property.updated",
        target: { type: "contact_property", id: property._id },
        changes: {
          before: { fallbackValue: property.fallbackValue ?? null },
          after: { fallbackValue: input.fallbackValue },
        },
      },
      { session },
    );
    await publish({ orgId: property.orgId, topics: ["contact_properties"] }, { session });
    return toPropertyDTO(doc!, connection.name);
  });
}

export async function deleteContactProperty(
  ctx: OrgContext,
  id: string,
  deps: AudienceDeps = {},
): Promise<void> {
  authorize(ctx, "audience:manage");
  const property = await loadProperty(ctx, id);
  const { adapter } = await loadConnection(ctx, property.connectionId, "write", deps);
  try {
    await remote(() => adapter.deleteContactProperty(property.resendId));
  } catch (error) {
    if (!isNotFoundInResend(error)) throw error;
  }
  const { orgId } = property;
  await withTransaction(async (session) => {
    // Resend drops the property's values with it.
    await ContactModel.updateMany(
      { orgId, connectionId: property.connectionId },
      { $unset: { [`properties.${property.key}`]: 1 } },
      { session },
    );
    await ContactPropertyModel.deleteOne({ _id: property._id, orgId }, { session });
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "contact_property.deleted",
        target: { type: "contact_property", id: property._id },
        changes: { before: { key: property.key } },
      },
      { session },
    );
    await publish({ orgId, topics: ["contact_properties", "contacts"] }, { session });
  });
}
