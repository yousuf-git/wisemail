import "server-only";

import { Types, type ClientSession } from "mongoose";

import type { OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { ContactModel, type ContactDoc } from "@/lib/db/models/contacts";
import { ContactPropertyModel } from "@/lib/db/models/contact-properties";
import {
  ContactImportModel,
  IMPORT_ERROR_CAP,
  type ContactImportDoc,
} from "@/lib/db/models/contact-imports";
import { EmailModel } from "@/lib/db/models/emails";
import { SegmentModel } from "@/lib/db/models/segments";
import { TopicModel } from "@/lib/db/models/topics";
import { withTransaction } from "@/lib/db/transaction";
import type {
  AudienceOptionsDTO,
  ContactDetailDTO,
  ContactImportStatusDTO,
  ContactRowDTO,
  ImportBatchResult,
  ImportRowInput,
} from "@/lib/dto/audience";
import type { Page } from "@/lib/dto/mail";
import { env } from "@/lib/env";
import { enqueueContactImport } from "@/lib/jobs/send";
import { publish } from "@/lib/realtime/publish";
import type { ResendAdapter } from "@/lib/resend/adapter";
import {
  appendImportRowsInput,
  createContactInput,
  createImportInput,
  IMPORT_BATCH_SIZE,
  importBatchInput,
  setContactSegmentsInput,
  setContactTopicsInput,
  updateContactInput,
} from "@/lib/validation/audience";
import { writeAuditLog } from "./audit";
import {
  authorize,
  isNotFoundInResend,
  listConnectionOptions,
  loadConnection,
  orgOid,
  parseInput,
  remote,
  scopeFilter,
  toObjectId,
  toServiceError,
  type AudienceDeps,
} from "./audience-shared";
import { ServiceError } from "./errors";
import { projectFilter } from "./project-scope";
import { connectionNames, recountSegments } from "./segments";
import { shouldRunInline } from "./sync";

const actor = (ctx: OrgContext) => ({ type: "user" as const, id: new Types.ObjectId(ctx.user.id) });

/* ------------------------------------------------------------------------------------------ */
/* DTOs                                                                                        */
/* ------------------------------------------------------------------------------------------ */

export function toContactRow(doc: ContactDoc, connectionName: string): ContactRowDTO {
  return {
    id: doc._id.toHexString(),
    connectionId: doc.connectionId.toHexString(),
    connectionName,
    email: doc.email,
    firstName: doc.firstName ?? "",
    lastName: doc.lastName ?? "",
    unsubscribed: !!doc.unsubscribed,
    segmentIds: (doc.segmentIds ?? []).map((id) => id.toHexString()),
    createdAt: (
      doc.resendCreatedAt ?? (doc as unknown as { createdAt: Date }).createdAt
    ).toISOString(),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Reads                                                                                       */
/* ------------------------------------------------------------------------------------------ */

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const encodeCursor = (email: string, id: Types.ObjectId) =>
  Buffer.from(JSON.stringify([email, id.toHexString()])).toString("base64url");

function decodeCursor(cursor: string): { email: string; id: Types.ObjectId } {
  try {
    const [email, id] = JSON.parse(Buffer.from(cursor, "base64url").toString()) as [string, string];
    if (typeof email !== "string" || !Types.ObjectId.isValid(id)) throw new Error("bad cursor");
    return { email, id: new Types.ObjectId(id) };
  } catch {
    throw new ServiceError("validation", "That page link is not valid anymore. Reload the list.");
  }
}

export type ListContactsInput = {
  cursor?: string;
  limit?: number;
  q?: string;
  segmentId?: string;
  topicId?: string;
  connectionId?: string;
  status?: "subscribed" | "unsubscribed";
};

/** Contacts, A to Z by address, a page at a time. */
export async function listContacts(
  ctx: OrgContext,
  input: ListContactsInput = {},
): Promise<Page<ContactRowDTO>> {
  authorize(ctx, "contact:read");
  await connectDb();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const filter: Record<string, unknown> = { ...(await scopeFilter(ctx, input.connectionId)) };
  const and: Record<string, unknown>[] = [];

  const q = input.q?.trim();
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    and.push({ $or: [{ email: re }, { firstName: re }, { lastName: re }] });
  }
  if (input.segmentId) {
    if (!Types.ObjectId.isValid(input.segmentId)) return { items: [], nextCursor: null };
    filter.segmentIds = new Types.ObjectId(input.segmentId);
  }
  if (input.topicId) {
    if (!Types.ObjectId.isValid(input.topicId)) return { items: [], nextCursor: null };
    filter["topicSubscriptions.topicId"] = new Types.ObjectId(input.topicId);
  }
  if (input.status) filter.unsubscribed = input.status === "unsubscribed";
  if (input.cursor) {
    const c = decodeCursor(input.cursor);
    and.push({ $or: [{ email: { $gt: c.email } }, { email: c.email, _id: { $gt: c.id } }] });
  }
  if (and.length) filter.$and = and;

  const docs = await ContactModel.find(filter)
    .sort({ email: 1, _id: 1 })
    .limit(limit + 1);
  const page = docs.slice(0, limit);
  const names = await connectionNames(orgOid(ctx), [...new Set(page.map((d) => d.connectionId))]);
  const last = page.at(-1);
  return {
    items: page.map((d) => toContactRow(d, names.get(d.connectionId.toHexString()) ?? "")),
    nextCursor: docs.length > limit && last ? encodeCursor(last.email, last._id) : null,
  };
}

/** Everything the contact filters and editors need to name ids (readable with `contact:read`). */
export async function listAudienceOptions(ctx: OrgContext): Promise<AudienceOptionsDTO> {
  authorize(ctx, "contact:read");
  await connectDb();
  const filter = await scopeFilter(ctx);
  const [connections, segments, topics, properties] = await Promise.all([
    listConnectionOptions(ctx),
    SegmentModel.find(filter, { name: 1, connectionId: 1 }).sort({ name: 1 }).lean(),
    TopicModel.find(filter, { name: 1, connectionId: 1 }).sort({ name: 1 }).lean(),
    ContactPropertyModel.find(filter, { key: 1, type: 1, connectionId: 1 }).sort({ key: 1 }).lean(),
  ]);
  return {
    connections,
    segments: segments.map((s) => ({
      id: s._id.toHexString(),
      name: s.name,
      connectionId: s.connectionId.toHexString(),
    })),
    topics: topics.map((t) => ({
      id: t._id.toHexString(),
      name: t.name,
      connectionId: t.connectionId.toHexString(),
    })),
    properties: properties.map((p) => ({
      id: p._id.toHexString(),
      key: p.key,
      type: p.type,
      connectionId: p.connectionId.toHexString(),
    })),
  };
}

async function loadContact(ctx: OrgContext, id: string) {
  const oid = toObjectId(id, "Contact");
  const filter = await scopeFilter(ctx);
  const doc = await ContactModel.findOne({ ...filter, _id: oid });
  if (!doc) throw new ServiceError("not_found", "Contact not found.");
  return doc;
}

export async function getContact(ctx: OrgContext, id: string): Promise<ContactDetailDTO> {
  authorize(ctx, "contact:read");
  await connectDb();
  const contact = await loadContact(ctx, id);
  const orgId = orgOid(ctx);
  const connectionFilter = { orgId, connectionId: contact.connectionId };
  const mailMatch = {
    orgId,
    recipientAddresses: contact.email,
    trashedAt: null,
    ...projectFilter(ctx),
  };
  const [connection, segments, topics, properties, emails, engagementRows] = await Promise.all([
    ConnectionModel.findOne({ _id: contact.connectionId, orgId }, { name: 1, status: 1 }).lean(),
    SegmentModel.find(connectionFilter).sort({ name: 1 }).lean(),
    TopicModel.find(connectionFilter).sort({ name: 1 }).lean(),
    ContactPropertyModel.find(connectionFilter).sort({ key: 1 }).lean(),
    EmailModel.find(mailMatch, { subject: 1, status: 1, direction: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    // Engagement comes straight from the emails our webhooks recorded for this address.
    EmailModel.aggregate<{
      sent: number;
      opened: number;
      clicked: number;
      bounced: number;
      lastSentAt: Date | null;
      lastOpenedAt: Date | null;
    }>([
      { $match: { ...mailMatch, direction: "outbound" } },
      {
        $group: {
          _id: null,
          sent: { $sum: 1 },
          opened: { $sum: { $cond: [{ $gt: ["$openCount", 0] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $gt: ["$clickCount", 0] }, 1, 0] } },
          bounced: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$bouncedAt", null] }, null] }, 1, 0] } },
          lastSentAt: { $max: { $ifNull: ["$sentAt", "$createdAt"] } },
          lastOpenedAt: { $max: "$lastOpenedAt" },
        },
      },
    ]),
  ]);
  const explicit = new Map(
    (contact.topicSubscriptions ?? []).map((s) => [s.topicId.toHexString(), s.subscription]),
  );
  const memberOf = new Set((contact.segmentIds ?? []).map((s) => s.toHexString()));
  const e = engagementRows[0];
  return {
    ...toContactRow(contact, connection?.name ?? ""),
    properties: (contact.properties ?? {}) as Record<string, string | number>,
    segments: segments
      .filter((s) => memberOf.has(s._id.toHexString()))
      .map((s) => ({ id: s._id.toHexString(), name: s.name })),
    topics: topics.map((t) => {
      const set = explicit.get(t._id.toHexString());
      return {
        topicId: t._id.toHexString(),
        name: t.name,
        subscription: set ?? t.defaultSubscription ?? "opt_in",
        isDefault: set === undefined,
      };
    }),
    engagement: {
      sent: e?.sent ?? 0,
      opened: e?.opened ?? 0,
      clicked: e?.clicked ?? 0,
      bounced: e?.bounced ?? 0,
      lastSentAt: e?.lastSentAt?.toISOString() ?? null,
      lastOpenedAt: e?.lastOpenedAt?.toISOString() ?? null,
    },
    recentEmails: emails.map((m) => ({
      id: m._id.toHexString(),
      subject: m.subject ?? "",
      status: m.status,
      direction: m.direction,
      at: (m as unknown as { createdAt: Date }).createdAt.toISOString(),
    })),
    writable: connection?.status === "active",
    options: {
      segments: segments.map((s) => ({ id: s._id.toHexString(), name: s.name })),
      topics: topics.map((t) => ({
        id: t._id.toHexString(),
        name: t.name,
        defaultSubscription: t.defaultSubscription ?? "opt_in",
      })),
      properties: properties.map((p) => ({
        id: p._id.toHexString(),
        connectionId: p.connectionId.toHexString(),
        connectionName: connection?.name ?? "",
        key: p.key,
        type: p.type,
        fallbackValue: (p.fallbackValue ?? null) as string | number | null,
      })),
    },
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Writes                                                                                      */
/* ------------------------------------------------------------------------------------------ */

type PropertyDefs = Map<string, "string" | "number">;

async function propertyDefs(
  orgId: Types.ObjectId,
  connectionId: Types.ObjectId,
): Promise<PropertyDefs> {
  const docs = await ContactPropertyModel.find({ orgId, connectionId }, { key: 1, type: 1 }).lean();
  return new Map(docs.map((p) => [p.key, p.type]));
}

/** Checks values against the connection's property schema. Returns a clean record or a message. */
function checkProperties(
  defs: PropertyDefs,
  values: Record<string, string | number | null>,
):
  | { ok: true; value: Record<string, string | number | null> }
  | { ok: false; errors: Record<string, string[]>; message: string } {
  const errors: Record<string, string[]> = {};
  const clean: Record<string, string | number | null> = {};
  for (const [key, raw] of Object.entries(values)) {
    const type = defs.get(key);
    if (!type) {
      errors[`properties.${key}`] = [
        `"${key}" isn't a property on this account. Create it under Properties first.`,
      ];
    } else if (raw === null) clean[key] = null;
    else if (type === "number") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || raw === "")
        errors[`properties.${key}`] = [`${key} must be a number.`];
      else clean[key] = n;
    } else clean[key] = String(raw);
  }
  const first = Object.values(errors)[0]?.[0];
  return first ? { ok: false, errors, message: first } : { ok: true, value: clean };
}

function propertiesOrThrow(defs: PropertyDefs, values: Record<string, string | number | null>) {
  const checked = checkProperties(defs, values);
  if (!checked.ok) throw new ServiceError("validation", checked.message, checked.errors);
  return checked.value;
}

async function refs<T extends { _id: Types.ObjectId; connectionId: Types.ObjectId }>(
  found: T[],
  ids: string[],
  connectionId: Types.ObjectId,
  what: string,
): Promise<T[]> {
  const wanted = new Set(ids);
  const out = found.filter(
    (d) => wanted.has(d._id.toHexString()) && d.connectionId.equals(connectionId),
  );
  if (out.length !== wanted.size)
    throw new ServiceError("validation", `One of the ${what} doesn't exist on this account.`);
  return out;
}

export async function createContact(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<ContactRowDTO> {
  authorize(ctx, "contact:create");
  const input = parseInput(createContactInput, raw);
  const { connection, adapter } = await loadConnection(ctx, input.connectionId, "write", deps);
  const orgId = orgOid(ctx);
  const cid = connection._id;

  if (await ContactModel.exists({ orgId, connectionId: cid, email: input.email })) {
    throw new ServiceError(
      "conflict",
      `${input.email} is already a contact on ${connection.name}.`,
      {
        email: ["This address is already a contact."],
      },
    );
  }
  const props = propertiesOrThrow(await propertyDefs(orgId, cid), input.properties);
  const segments = await refs(
    await SegmentModel.find({ orgId, connectionId: cid }).lean(),
    input.segmentIds,
    cid,
    "segments",
  );
  const topics = await refs(
    await TopicModel.find({ orgId, connectionId: cid }).lean(),
    input.topicSubscriptions.map((t) => t.topicId),
    cid,
    "topics",
  );
  const topicById = new Map(topics.map((t) => [t._id.toHexString(), t]));

  const created = await remote(() =>
    adapter.createContact({
      email: input.email,
      firstName: input.firstName || undefined,
      lastName: input.lastName || undefined,
      unsubscribed: input.unsubscribed,
      properties: props as Record<string, string | number>,
      segmentIds: segments.map((s) => s.resendId),
      topics: input.topicSubscriptions.map((t) => ({
        id: topicById.get(t.topicId)!.resendId,
        subscription: t.subscription,
      })),
    }),
  );

  return withTransaction(async (session) => {
    const doc = await upsertContactMirror(
      { orgId, connectionId: cid, resendId: created.id },
      {
        email: input.email,
        firstName: input.firstName || undefined,
        lastName: input.lastName || undefined,
        unsubscribed: input.unsubscribed,
        properties: props,
        segmentIds: segments.map((s) => s._id),
        topicSubscriptions: input.topicSubscriptions.map((t) => ({
          topicId: new Types.ObjectId(t.topicId),
          subscription: t.subscription,
        })),
      },
      session,
    );
    await recountSegments(
      orgId,
      segments.map((s) => s._id),
      session,
    );
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "contact.created",
        target: { type: "contact", id: doc._id },
        changes: { after: { email: input.email, connection: connection.name } },
      },
      { session },
    );
    await publish(
      { orgId, topics: ["contacts", "segments", `connection:${cid.toHexString()}`] },
      { session },
    );
    return toContactRow(doc, connection.name);
  });
}

/** Upsert by `(connectionId, resendId)`; a stale mirror with the same address (re-created in Resend) goes first. */
async function upsertContactMirror(
  key: { orgId: Types.ObjectId; connectionId: Types.ObjectId; resendId: string },
  set: Record<string, unknown> & { email: string },
  session?: ClientSession,
) {
  await ContactModel.deleteMany(
    {
      orgId: key.orgId,
      connectionId: key.connectionId,
      email: set.email,
      resendId: { $ne: key.resendId },
    },
    { session },
  );
  return ContactModel.findOneAndUpdate(
    key,
    { $set: { ...set, resendCreatedAt: new Date() } },
    { upsert: true, returnDocument: "after", session, setDefaultsOnInsert: true },
  );
}

/** Edits name, properties and (for roles that may) the unsubscribed flag. */
export async function updateContact(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<ContactRowDTO> {
  const input = parseInput(updateContactInput, raw);
  const onlyUnsubscribe =
    input.unsubscribed === true &&
    input.firstName === undefined &&
    input.lastName === undefined &&
    input.properties === undefined;
  authorize(ctx, onlyUnsubscribe ? "contact:unsubscribe" : "contact:update");
  if (input.unsubscribed === false) authorize(ctx, "contact:update");

  const contact = await loadContact(ctx, input.id);
  const { connection, adapter } = await loadConnection(ctx, contact.connectionId, "write", deps);
  const { orgId } = contact;
  const props =
    input.properties === undefined
      ? undefined
      : propertiesOrThrow(await propertyDefs(orgId, contact.connectionId), input.properties);

  await remote(() =>
    adapter.updateContact({
      id: contact.resendId,
      firstName: input.firstName === undefined ? undefined : input.firstName || null,
      lastName: input.lastName === undefined ? undefined : input.lastName || null,
      unsubscribed: input.unsubscribed,
      properties: props,
    }),
  );

  const before = {
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    unsubscribed: !!contact.unsubscribed,
  };
  return withTransaction(async (session) => {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    for (const field of ["firstName", "lastName"] as const) {
      const value = input[field];
      if (value === undefined) continue;
      if (value) $set[field] = value;
      else $unset[field] = 1;
    }
    if (input.unsubscribed !== undefined) $set.unsubscribed = input.unsubscribed;
    for (const [key, value] of Object.entries(props ?? {})) {
      if (value === null) $unset[`properties.${key}`] = 1;
      else $set[`properties.${key}`] = value;
    }
    const doc = await ContactModel.findOneAndUpdate(
      { _id: contact._id, orgId },
      {
        ...(Object.keys($set).length ? { $set } : {}),
        ...(Object.keys($unset).length ? { $unset } : {}),
      },
      { returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action:
          input.unsubscribed === undefined
            ? "contact.updated"
            : input.unsubscribed
              ? "contact.unsubscribed"
              : "contact.resubscribed",
        target: { type: "contact", id: contact._id },
        changes: {
          before,
          after: {
            firstName: doc!.firstName ?? "",
            lastName: doc!.lastName ?? "",
            unsubscribed: !!doc!.unsubscribed,
            ...(props ? { properties: Object.keys(props) } : {}),
          },
        },
      },
      { session },
    );
    await publish({ orgId, topics: ["contacts"] }, { session });
    return toContactRow(doc!, connection.name);
  });
}

/** Support's one write: unsubscribing a contact (resubscribing needs `contact:update`). */
export async function setContactUnsubscribed(
  ctx: OrgContext,
  input: { id: string; unsubscribed: boolean },
  deps: AudienceDeps = {},
): Promise<ContactRowDTO> {
  return updateContact(ctx, { id: input.id, unsubscribed: input.unsubscribed }, deps);
}

export async function setContactSegments(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<ContactRowDTO> {
  authorize(ctx, "contact:update");
  const input = parseInput(setContactSegmentsInput, raw);
  const contact = await loadContact(ctx, input.id);
  const { connection, adapter } = await loadConnection(ctx, contact.connectionId, "write", deps);
  const { orgId } = contact;
  const all = await SegmentModel.find({ orgId, connectionId: contact.connectionId }).lean();
  const desired = await refs(all, input.segmentIds, contact.connectionId, "segments");
  const current = new Set((contact.segmentIds ?? []).map((s) => s.toHexString()));
  const wanted = new Set(desired.map((s) => s._id.toHexString()));
  const toAdd = desired.filter((s) => !current.has(s._id.toHexString()));
  const toRemove = all.filter(
    (s) => current.has(s._id.toHexString()) && !wanted.has(s._id.toHexString()),
  );

  // One call per change. Whatever Resend accepted before a failure is kept in the mirror.
  const applied = new Set(current);
  let failure: unknown = null;
  try {
    for (const s of toAdd) {
      await remote(() => adapter.addContactToSegment(contact.resendId, s.resendId));
      applied.add(s._id.toHexString());
    }
    for (const s of toRemove) {
      try {
        await remote(() => adapter.removeContactFromSegment(contact.resendId, s.resendId));
      } catch (error) {
        if (!isNotFoundInResend(error)) throw error;
      }
      applied.delete(s._id.toHexString());
    }
  } catch (error) {
    failure = error;
  }

  const changed =
    [...applied].filter((id) => !current.has(id)).length +
    [...current].filter((id) => !applied.has(id)).length;
  let row: ContactRowDTO | null = null;
  if (changed > 0) {
    row = await withTransaction(async (session) => {
      const doc = await ContactModel.findOneAndUpdate(
        { _id: contact._id, orgId },
        { $set: { segmentIds: [...applied].map((id) => new Types.ObjectId(id)) } },
        { returnDocument: "after", session },
      );
      await recountSegments(
        orgId,
        [...new Set([...current, ...applied])].map((id) => new Types.ObjectId(id)),
        session,
      );
      await writeAuditLog(
        {
          orgId,
          actor: actor(ctx),
          action: "contact.segments_changed",
          target: { type: "contact", id: contact._id },
          changes: { before: { segments: [...current] }, after: { segments: [...applied] } },
        },
        { session },
      );
      await publish({ orgId, topics: ["contacts", "segments"] }, { session });
      return toContactRow(doc!, connection.name);
    });
  }
  if (failure) throw failure;
  return row ?? toContactRow(contact, connection.name);
}

export async function setContactTopics(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<ContactRowDTO> {
  authorize(ctx, "contact:update");
  const input = parseInput(setContactTopicsInput, raw);
  const contact = await loadContact(ctx, input.id);
  const { connection, adapter } = await loadConnection(ctx, contact.connectionId, "write", deps);
  const { orgId } = contact;
  const topics = await TopicModel.find({ orgId, connectionId: contact.connectionId }).lean();
  await refs(
    topics,
    input.subscriptions.map((s) => s.topicId),
    contact.connectionId,
    "topics",
  );
  const byId = new Map(topics.map((t) => [t._id.toHexString(), t]));
  const explicit = new Map(
    (contact.topicSubscriptions ?? []).map((s) => [s.topicId.toHexString(), s.subscription]),
  );

  const changes = input.subscriptions.filter((s) => {
    const current = explicit.get(s.topicId) ?? byId.get(s.topicId)!.defaultSubscription ?? "opt_in";
    return current !== s.subscription;
  });
  if (changes.length === 0) return toContactRow(contact, connection.name);

  await remote(() =>
    adapter.updateContactTopics(
      contact.resendId,
      changes.map((c) => ({ id: byId.get(c.topicId)!.resendId, subscription: c.subscription })),
    ),
  );
  const merged = new Map(explicit);
  for (const c of changes) merged.set(c.topicId, c.subscription);
  return withTransaction(async (session) => {
    const doc = await ContactModel.findOneAndUpdate(
      { _id: contact._id, orgId },
      {
        $set: {
          topicSubscriptions: [...merged].map(([topicId, subscription]) => ({
            topicId: new Types.ObjectId(topicId),
            subscription,
          })),
        },
      },
      { returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "contact.topics_changed",
        target: { type: "contact", id: contact._id },
        changes: {
          after: Object.fromEntries(
            changes.map((c) => [byId.get(c.topicId)!.name, c.subscription]),
          ),
        },
      },
      { session },
    );
    await publish({ orgId, topics: ["contacts"] }, { session });
    return toContactRow(doc!, connection.name);
  });
}

export async function deleteContact(
  ctx: OrgContext,
  id: string,
  deps: AudienceDeps = {},
): Promise<void> {
  authorize(ctx, "contact:delete");
  const contact = await loadContact(ctx, id);
  const { adapter } = await loadConnection(ctx, contact.connectionId, "write", deps);
  try {
    await remote(() => adapter.deleteContact(contact.resendId));
  } catch (error) {
    if (!isNotFoundInResend(error)) throw error;
  }
  const { orgId } = contact;
  await withTransaction(async (session) => {
    await ContactModel.deleteOne({ _id: contact._id, orgId }, { session });
    await recountSegments(orgId, contact.segmentIds ?? [], session);
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "contact.deleted",
        target: { type: "contact", id: contact._id },
        changes: { before: { email: contact.email } },
      },
      { session },
    );
    await publish({ orgId, topics: ["contacts", "segments"] }, { session });
  });
}

/* ------------------------------------------------------------------------------------------ */
/* CSV import                                                                                  */
/* ------------------------------------------------------------------------------------------ */

/** Keeps at least this long between Resend calls (8 requests a second of the team's 10). */
const CALL_INTERVAL_MS = env.NODE_ENV === "test" ? 0 : 125;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function pacer() {
  let next = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + CALL_INTERVAL_MS;
    if (at > now) await sleep(at - now);
  };
}

type ImportContext = {
  orgId: Types.ObjectId;
  connectionId: Types.ObjectId;
  adapter: ResendAdapter;
  defs: PropertyDefs;
  segments: { _id: Types.ObjectId; resendId: string }[];
  updateExisting: boolean;
};

const messageOf = (error: unknown) => {
  const converted = toServiceError(error);
  return converted instanceof Error ? converted.message : "Something went wrong.";
};

/**
 * Sends rows to Resend one by one and mirrors what it accepts. Every row is validated again
 * here (the browser's check is a convenience). A rate limit that outlasts the inline retry stops
 * the batch: `processed` says how many rows were handled so the caller can continue from there.
 */
async function processImportRows(
  ic: ImportContext,
  rows: { row: number; value: ImportRowInput }[],
): Promise<ImportBatchResult> {
  const result: ImportBatchResult = {
    processed: 0,
    rateLimited: false,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  const pace = pacer();
  const existing = new Map(
    (
      await ContactModel.find({
        orgId: ic.orgId,
        connectionId: ic.connectionId,
        email: { $in: rows.map((r) => r.value.email.toLowerCase()) },
      })
    ).map((c) => [c.email, c]),
  );
  const touched = new Set<string>();

  for (const { row, value } of rows) {
    const email = value.email.toLowerCase();
    const fail = (message: string) => result.errors.push({ row, email, message });
    const checked = checkProperties(ic.defs, value.properties ?? {});
    if (!checked.ok) {
      fail(checked.message);
      result.processed++;
      continue;
    }
    const props = checked.value as Record<string, string | number>;
    try {
      const current = existing.get(email);
      if (current) {
        if (!ic.updateExisting) {
          result.skipped++;
        } else {
          await pace();
          await remote(() =>
            ic.adapter.updateContact({
              id: current.resendId,
              ...(value.firstName ? { firstName: value.firstName } : {}),
              ...(value.lastName ? { lastName: value.lastName } : {}),
              ...(Object.keys(props).length ? { properties: props } : {}),
            }),
          );
          const have = new Set((current.segmentIds ?? []).map((s) => s.toHexString()));
          const added: Types.ObjectId[] = [];
          for (const s of ic.segments.filter((s) => !have.has(s._id.toHexString()))) {
            await pace();
            await remote(() => ic.adapter.addContactToSegment(current.resendId, s.resendId));
            added.push(s._id);
          }
          await ContactModel.updateOne(
            { _id: current._id, orgId: ic.orgId },
            {
              $set: {
                ...(value.firstName ? { firstName: value.firstName } : {}),
                ...(value.lastName ? { lastName: value.lastName } : {}),
                ...Object.fromEntries(
                  Object.entries(props).map(([k, v]) => [`properties.${k}`, v]),
                ),
              },
              ...(added.length ? { $addToSet: { segmentIds: { $each: added } } } : {}),
            },
          );
          added.forEach((id) => touched.add(id.toHexString()));
          result.updated++;
        }
      } else {
        await pace();
        const created = await remote(() =>
          ic.adapter.createContact({
            email,
            firstName: value.firstName,
            lastName: value.lastName,
            properties: props,
            segmentIds: ic.segments.map((s) => s.resendId),
          }),
        );
        await upsertContactMirror(
          { orgId: ic.orgId, connectionId: ic.connectionId, resendId: created.id },
          {
            email,
            firstName: value.firstName,
            lastName: value.lastName,
            unsubscribed: false,
            properties: props,
            segmentIds: ic.segments.map((s) => s._id),
          },
        );
        existing.set(email, { email } as never);
        ic.segments.forEach((s) => touched.add(s._id.toHexString()));
        result.created++;
      }
    } catch (error) {
      const converted = toServiceError(error);
      if (converted instanceof ServiceError && converted.code === "rate_limited") {
        result.rateLimited = true;
        return finishRows(ic, result, touched);
      }
      if (converted instanceof ServiceError && converted.code === "connection_inactive")
        throw converted;
      fail(messageOf(error));
    }
    result.processed++;
  }
  return finishRows(ic, result, touched);
}

async function finishRows(ic: ImportContext, result: ImportBatchResult, touched: Set<string>) {
  if (touched.size)
    await recountSegments(
      ic.orgId,
      [...touched].map((id) => new Types.ObjectId(id)),
    );
  return result;
}

async function importContext(
  ctx: OrgContext,
  connectionId: string | Types.ObjectId,
  segmentIds: string[],
  updateExisting: boolean,
  deps: AudienceDeps,
): Promise<{ ic: ImportContext; connectionName: string }> {
  const { connection, adapter } = await loadConnection(ctx, connectionId, "write", deps);
  const orgId = orgOid(ctx);
  const segments = await refs(
    await SegmentModel.find({ orgId, connectionId: connection._id }).lean(),
    segmentIds,
    connection._id,
    "segments",
  );
  return {
    connectionName: connection.name,
    ic: {
      orgId,
      connectionId: connection._id,
      adapter,
      defs: await propertyDefs(orgId, connection._id),
      segments: segments.map((s) => ({ _id: s._id, resendId: s.resendId })),
      updateExisting,
    },
  };
}

/** One batch straight from the browser (small files): validated, sent, mirrored. */
export async function importContactsBatch(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<ImportBatchResult> {
  authorize(ctx, "contact:import");
  const input = parseInput(importBatchInput, raw);
  const { ic } = await importContext(
    ctx,
    input.connectionId,
    input.segmentIds,
    input.updateExisting,
    deps,
  );
  const result = await processImportRows(ic, input.rows);
  await publish({ orgId: ic.orgId, topics: ["contacts", "segments"] });
  return result;
}

/** Writes the audit entry once an import (either path) is over. */
export async function auditImportFinished(
  ctx: OrgContext,
  input: {
    connectionId: string;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  },
) {
  authorize(ctx, "contact:import");
  await connectDb();
  await writeAuditLog({
    orgId: orgOid(ctx),
    actor: actor(ctx),
    action: "contact.imported",
    target: { type: "connection", id: toObjectId(input.connectionId, "Connection") },
    changes: {
      after: {
        created: input.created,
        updated: input.updated,
        skipped: input.skipped,
        failed: input.failed,
      },
    },
  });
}

/* ---- large imports: rows are uploaded once, then the `import-contacts` job works through them ---- */

const IMPORT_TTL_MS = 7 * 24 * 3600 * 1000;

export function toImportStatus(doc: ContactImportDoc): ContactImportStatusDTO {
  return {
    id: doc._id.toHexString(),
    status: doc.status,
    total: doc.total,
    processed: doc.cursor,
    created: doc.created,
    updated: doc.updated,
    skipped: doc.skipped,
    errors: (doc.rowErrors ?? []).map((e) => ({
      row: e.row ?? 0,
      email: e.email ?? "",
      message: e.message ?? "",
    })),
    errorCount: doc.errorCount,
  };
}

export async function createContactImport(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<{ importId: string }> {
  authorize(ctx, "contact:import");
  const input = parseInput(createImportInput, raw);
  const { ic } = await importContext(
    ctx,
    input.connectionId,
    input.segmentIds,
    input.updateExisting,
    deps,
  );
  const doc = await ContactImportModel.create({
    orgId: ic.orgId,
    connectionId: ic.connectionId,
    createdBy: new Types.ObjectId(ctx.user.id),
    segmentIds: ic.segments.map((s) => s._id),
    updateExisting: input.updateExisting,
    total: input.total,
    status: "queued",
    expireAt: new Date(Date.now() + IMPORT_TTL_MS),
  });
  return { importId: doc._id.toHexString() };
}

async function loadImport(ctx: OrgContext, id: string) {
  const oid = toObjectId(id, "Import");
  const doc = await ContactImportModel.findOne({
    _id: oid,
    orgId: orgOid(ctx),
    createdBy: new Types.ObjectId(ctx.user.id),
  });
  if (!doc) throw new ServiceError("not_found", "Import not found.");
  return doc;
}

export async function appendImportRows(
  ctx: OrgContext,
  raw: unknown,
): Promise<{ received: number }> {
  authorize(ctx, "contact:import");
  const input = parseInput(appendImportRowsInput, raw);
  await connectDb();
  const doc = await loadImport(ctx, input.importId);
  if (doc.status !== "queued" || doc.rows.length + input.rows.length > doc.total) {
    throw new ServiceError("conflict", "This import can't take more rows.");
  }
  await ContactImportModel.updateOne(
    { _id: doc._id, orgId: doc.orgId },
    { $push: { rows: { $each: input.rows } } },
  );
  return { received: doc.rows.length + input.rows.length };
}

/** Marks the upload complete and hands the import to the background job. */
export async function startContactImport(
  ctx: OrgContext,
  importId: string,
): Promise<ContactImportStatusDTO> {
  authorize(ctx, "contact:import");
  await connectDb();
  const doc = await loadImport(ctx, importId);
  if (doc.status !== "queued") return toImportStatus(doc);
  if (doc.rows.length === 0) throw new ServiceError("validation", "There are no rows to import.");
  doc.total = doc.rows.length;
  await doc.save();
  const job = {
    importId: doc._id.toHexString(),
    orgId: doc.orgId.toHexString(),
    connectionId: doc.connectionId.toHexString(),
  };
  const delivered = await enqueueContactImport(job);
  if (shouldRunInline({ delivered, inngestDev: env.INNGEST_DEV, nodeEnv: env.NODE_ENV })) {
    // Development without an Inngest dev server: work through it in this process.
    void runImportInline(job.importId).catch((error) =>
      console.error("[import] inline run failed", error),
    );
  }
  return toImportStatus(doc);
}

async function runImportInline(importId: string) {
  for (let i = 0; i < 2000; i++) {
    const step = await runImportStep(importId);
    if (step.done) return;
    if (step.retryAfterSeconds) await sleep(step.retryAfterSeconds * 1000);
  }
}

export async function getContactImport(
  ctx: OrgContext,
  importId: string,
): Promise<ContactImportStatusDTO> {
  authorize(ctx, "contact:import");
  await connectDb();
  return toImportStatus(await loadImport(ctx, importId));
}

export type ImportStep = { done: boolean; retryAfterSeconds?: number };

/**
 * Handles the next batch of an import (the job calls this in a loop, one durable step each).
 * Progress is stored after every batch, so a retry never repeats rows Resend already took.
 */
export async function runImportStep(
  importId: string,
  deps: AudienceDeps = {},
): Promise<ImportStep> {
  await connectDb();
  const oid = toObjectId(importId, "Import");
  const doc = await ContactImportModel.findById(oid);
  if (!doc || doc.status === "completed" || doc.status === "failed") return { done: true };

  const connection = await ConnectionModel.findOne({
    _id: doc.connectionId,
    orgId: doc.orgId,
    deletedAt: null,
  });
  const fail = async (message: string) => {
    await ContactImportModel.updateOne(
      { _id: doc._id },
      { $set: { status: "failed", failure: message } },
    );
    await publish({ orgId: doc.orgId, topics: ["contacts", `import:${doc._id.toHexString()}`] });
    return { done: true } as ImportStep;
  };
  if (!connection || connection.status !== "active") {
    return fail("The connection isn't active anymore, so the import stopped.");
  }
  const { decryptSecret } = await import("@/lib/crypto/envelope");
  const { getResendAdapter } = await import("@/lib/resend/client-factory");
  const { keyAad } = await import("./webhook-secret");
  const adapter =
    deps.adapter ??
    getResendAdapter(decryptSecret(connection.apiKey!, { aad: keyAad(connection._id) }));

  const batch = doc.rows.slice(doc.cursor, doc.cursor + IMPORT_BATCH_SIZE) as unknown as {
    row: number;
    value: ImportRowInput;
  }[];
  if (batch.length === 0) {
    await ContactImportModel.updateOne({ _id: doc._id }, { $set: { status: "completed" } });
    await publish({ orgId: doc.orgId, topics: ["contacts", `import:${doc._id.toHexString()}`] });
    return { done: true };
  }
  const segments = await SegmentModel.find(
    { orgId: doc.orgId, _id: { $in: doc.segmentIds } },
    { resendId: 1 },
  ).lean();
  let result: ImportBatchResult;
  try {
    result = await processImportRows(
      {
        orgId: doc.orgId,
        connectionId: doc.connectionId,
        adapter,
        defs: await propertyDefs(doc.orgId, doc.connectionId),
        segments,
        updateExisting: doc.updateExisting,
      },
      batch,
    );
  } catch (error) {
    if (error instanceof ServiceError) return fail(error.message);
    throw error;
  }
  const cursor = doc.cursor + result.processed;
  const finished = cursor >= doc.rows.length;
  const room = Math.max(0, IMPORT_ERROR_CAP - doc.rowErrors.length);
  await ContactImportModel.updateOne(
    { _id: doc._id },
    {
      $set: { cursor, status: finished ? "completed" : "running" },
      $inc: {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errorCount: result.errors.length,
      },
      ...(result.errors.length && room
        ? { $push: { rowErrors: { $each: result.errors.slice(0, room) } } }
        : {}),
    },
  );
  await publish({
    orgId: doc.orgId,
    topics: ["contacts", "segments", `import:${doc._id.toHexString()}`],
  });
  if (finished) {
    await writeAuditLog({
      orgId: doc.orgId,
      actor: { type: "user", id: doc.createdBy },
      action: "contact.imported",
      target: { type: "connection", id: doc.connectionId },
      changes: {
        after: {
          created: doc.created + result.created,
          updated: doc.updated + result.updated,
          skipped: doc.skipped + result.skipped,
          failed: doc.errorCount + result.errors.length,
        },
      },
    });
  }
  return { done: finished, retryAfterSeconds: result.rateLimited ? 5 : undefined };
}
