import "server-only";

import { Types } from "mongoose";

import type { OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { TemplateModel, type TemplateDoc } from "@/lib/db/models/templates";
import { withTransaction } from "@/lib/db/transaction";
import type {
  TemplateDTO,
  TemplateOptionDTO,
  TemplateRowDTO,
  TemplateVariableDTO,
} from "@/lib/dto/audience";
import { extractVariables } from "@/lib/mail/template-vars";
import { publish } from "@/lib/realtime/publish";
import {
  createTemplateInput,
  duplicateTemplateInput,
  updateTemplateInput,
} from "@/lib/validation/audience";
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

const actor = (ctx: OrgContext) => ({ type: "user" as const, id: new Types.ObjectId(ctx.user.id) });
const versionOf = (doc: unknown) => (doc as { __v?: number }).__v ?? 0;
const staleError = () =>
  new ServiceError(
    "conflict",
    "This template was changed by someone else. Reload to see the latest.",
  );

type VarInput = { key: string; type: "string" | "number"; fallback: string | number | null };

function variablesOf(doc: TemplateDoc): TemplateVariableDTO[] {
  return (doc.variables ?? []).map((v) => ({
    key: v.key,
    type: v.type === "number" ? "number" : "string",
    fallback: (v.fallback ?? null) as string | number | null,
  }));
}

export function toTemplateRow(doc: TemplateDoc, connectionName: string): TemplateRowDTO {
  return {
    id: doc._id.toHexString(),
    connectionId: doc.connectionId.toHexString(),
    connectionName,
    name: doc.name,
    alias: doc.alias ?? "",
    status: doc.status,
    subject: doc.subject ?? "",
    variableCount: doc.variables?.length ?? 0,
    updatedAt: (
      doc.resendUpdatedAt ?? (doc as unknown as { updatedAt: Date }).updatedAt
    ).toISOString(),
  };
}

export function toTemplateDTO(
  doc: TemplateDoc,
  connectionName: string,
  writable: boolean,
): TemplateDTO {
  return {
    ...toTemplateRow(doc, connectionName),
    from: doc.from ?? "",
    text: doc.text ?? "",
    html: doc.html ?? "",
    variables: variablesOf(doc),
    version: versionOf(doc),
    writable,
  };
}

/** Variables the body uses but the form left out are declared as plain text with no fallback. */
export function withDetectedVariables(
  declared: VarInput[],
  ...sources: (string | undefined)[]
): VarInput[] {
  const known = new Set(declared.map((v) => v.key.toLowerCase()));
  const extra = extractVariables(...sources)
    .filter((key) => !known.has(key.toLowerCase()))
    .map((key): VarInput => ({ key, type: "string", fallback: null }));
  return [...declared, ...extra];
}

const toResendVariables = (variables: VarInput[]) =>
  variables.map((v) => ({
    key: v.key,
    type: v.type,
    fallbackValue:
      v.type === "number"
        ? v.fallback === null
          ? null
          : Number(v.fallback)
        : v.fallback === null
          ? null
          : String(v.fallback),
  }));

const toMirrorVariables = (variables: VarInput[]) =>
  variables.map((v) => ({ key: v.key, type: v.type, fallback: v.fallback ?? undefined }));

export async function listTemplates(
  ctx: OrgContext,
  input: { connectionId?: string; status?: "draft" | "published" } = {},
): Promise<TemplateRowDTO[]> {
  authorize(ctx, "template:read");
  await connectDb();
  const filter = await scopeFilter(ctx, input.connectionId);
  const docs = await TemplateModel.find({
    ...filter,
    ...(input.status ? { status: input.status } : {}),
  }).sort({ name: 1 });
  const names = await connectionNames(filter.orgId, [...new Set(docs.map((d) => d.connectionId))]);
  return docs.map((d) => toTemplateRow(d, names.get(d.connectionId.toHexString()) ?? ""));
}

/** Published templates with their bodies, for the composer's Template mode. */
export async function listTemplateOptions(ctx: OrgContext): Promise<TemplateOptionDTO[]> {
  authorize(ctx, "template:read");
  await connectDb();
  const filter = await scopeFilter(ctx);
  const docs = await TemplateModel.find({ ...filter, status: "published" }).sort({ name: 1 });
  return docs.map((d) => ({
    id: d._id.toHexString(),
    connectionId: d.connectionId.toHexString(),
    name: d.name,
    subject: d.subject ?? "",
    html: d.html ?? "",
    variables: variablesOf(d),
  }));
}

async function loadTemplate(ctx: OrgContext, id: string) {
  const oid = toObjectId(id, "Template");
  const filter = await scopeFilter(ctx);
  const doc = await TemplateModel.findOne({ ...filter, _id: oid });
  if (!doc) throw new ServiceError("not_found", "Template not found.");
  return doc;
}

export async function getTemplate(ctx: OrgContext, id: string): Promise<TemplateDTO> {
  authorize(ctx, "template:read");
  await connectDb();
  const doc = await loadTemplate(ctx, id);
  const connection = await ConnectionModel.findOne(
    { _id: doc.connectionId, orgId: doc.orgId },
    { name: 1, status: 1 },
  ).lean();
  return toTemplateDTO(doc, connection?.name ?? "", connection?.status === "active");
}

export async function createTemplate(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<TemplateDTO> {
  authorize(ctx, "template:create");
  const input = parseInput(createTemplateInput, raw);
  const { connection, adapter } = await loadConnection(ctx, input.connectionId, "write", deps);
  const orgId = orgOid(ctx);
  const variables = withDetectedVariables(input.variables, input.html, input.subject, input.text);

  const created = await remote(() =>
    adapter.createTemplate({
      name: input.name,
      html: input.html,
      ...(input.alias ? { alias: input.alias } : {}),
      ...(input.subject ? { subject: input.subject } : {}),
      ...(input.from ? { from: input.from } : {}),
      ...(input.text ? { text: input.text } : {}),
      variables: toResendVariables(variables),
    }),
  );

  return withTransaction(async (session) => {
    const doc = await TemplateModel.findOneAndUpdate(
      { orgId, connectionId: connection._id, resendId: created.id },
      {
        $set: {
          name: input.name,
          alias: input.alias || undefined,
          subject: input.subject || undefined,
          from: input.from || undefined,
          html: input.html,
          text: input.text || undefined,
          variables: toMirrorVariables(variables),
          status: "draft",
          resendCreatedAt: new Date(),
          resendUpdatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after", session },
    );
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "template.created",
        target: { type: "template", id: doc._id },
        changes: { after: { name: input.name, connection: connection.name } },
      },
      { session },
    );
    await publish(
      { orgId, topics: ["templates", `connection:${connection._id.toHexString()}`] },
      { session },
    );
    return toTemplateDTO(doc, connection.name, true);
  });
}

/**
 * Saves a template in Resend, then here. A template that is already published is published again
 * with the save, because Resend only sends the published version; a draft stays a draft until
 * `publish` is asked for.
 */
export async function updateTemplate(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<TemplateDTO> {
  authorize(ctx, "template:update");
  const input = parseInput(updateTemplateInput, raw);
  const template = await loadTemplate(ctx, input.id);
  if (versionOf(template) !== input.version) throw staleError();
  const { connection, adapter } = await loadConnection(ctx, template.connectionId, "write", deps);
  const variables = withDetectedVariables(input.variables, input.html, input.subject, input.text);
  const republish = input.publish || template.status === "published";

  await remote(async () => {
    await adapter.updateTemplate(template.resendId, {
      name: input.name,
      alias: input.alias,
      subject: input.subject,
      from: input.from,
      html: input.html,
      text: input.text,
      variables: toResendVariables(variables),
    });
    if (republish) await adapter.publishTemplate(template.resendId);
  });

  const before = { name: template.name, status: template.status };
  try {
    return await withTransaction(async (session) => {
      const fresh = await TemplateModel.findOne(
        { _id: template._id, orgId: template.orgId },
        null,
        { session },
      );
      if (!fresh || versionOf(fresh) !== input.version) throw staleError();
      fresh.set({
        name: input.name,
        alias: input.alias || undefined,
        subject: input.subject || undefined,
        from: input.from || undefined,
        html: input.html,
        text: input.text || undefined,
        variables: toMirrorVariables(variables),
        status: republish ? "published" : fresh.status,
        resendUpdatedAt: new Date(),
      });
      await fresh.save({ session });
      await writeAuditLog(
        {
          orgId: fresh.orgId,
          actor: actor(ctx),
          action:
            republish && before.status !== "published" ? "template.published" : "template.updated",
          target: { type: "template", id: fresh._id },
          changes: { before, after: { name: fresh.name, status: fresh.status } },
        },
        { session },
      );
      await publish({ orgId: fresh.orgId, topics: ["templates"] }, { session });
      return toTemplateDTO(fresh, connection.name, true);
    });
  } catch (error) {
    if ((error as { name?: string }).name === "VersionError") throw staleError();
    throw error;
  }
}

export async function deleteTemplate(
  ctx: OrgContext,
  id: string,
  deps: AudienceDeps = {},
): Promise<void> {
  authorize(ctx, "template:delete");
  const template = await loadTemplate(ctx, id);
  const { adapter } = await loadConnection(ctx, template.connectionId, "write", deps);
  try {
    await remote(() => adapter.deleteTemplate(template.resendId));
  } catch (error) {
    if (!isNotFoundInResend(error)) throw error;
  }
  const { orgId } = template;
  await withTransaction(async (session) => {
    await TemplateModel.deleteOne({ _id: template._id, orgId }, { session });
    await writeAuditLog(
      {
        orgId,
        actor: actor(ctx),
        action: "template.deleted",
        target: { type: "template", id: template._id },
        changes: { before: { name: template.name } },
      },
      { session },
    );
    await publish({ orgId, topics: ["templates"] }, { session });
  });
}

/** Copies a template into the same or another connection as a new draft. */
export async function duplicateTemplate(
  ctx: OrgContext,
  raw: unknown,
  deps: AudienceDeps = {},
): Promise<TemplateDTO> {
  authorize(ctx, "template:create");
  const input = parseInput(duplicateTemplateInput, raw);
  const source = await loadTemplate(ctx, input.id);
  const target = input.connectionId ?? source.connectionId.toHexString();
  const variables = (source.variables ?? []).map((v): VarInput => ({
    key: v.key,
    type: v.type === "number" ? "number" : "string",
    fallback: (v.fallback ?? null) as string | number | null,
  }));
  return createTemplate(
    ctx,
    {
      connectionId: target,
      name: `${source.name} (copy)`.slice(0, 100),
      subject: source.subject ?? "",
      from: source.from ?? "",
      html: source.html || "<p></p>",
      text: source.text ?? "",
      variables,
    },
    deps,
  );
}
