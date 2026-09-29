import "server-only";

import { Types } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ApiKeyModel } from "@/lib/db/models/api-keys";
import { ConnectionModel } from "@/lib/db/models/connections";
import {
  DOMAIN_STATUSES,
  DomainModel,
  type DomainDoc,
  type DomainStatus,
} from "@/lib/db/models/domains";
import { ProjectModel } from "@/lib/db/models/projects";
import { SenderModel } from "@/lib/db/models/senders";
import { withTransaction } from "@/lib/db/transaction";
import type { DomainDTO } from "@/lib/dto/domain";
import { publish } from "@/lib/realtime/publish";
import type { ResendDomainDetail } from "@/lib/resend/types";
import { isResendError } from "@/lib/resend/errors";
import { withRateLimitRetry } from "@/lib/resend/retry";
import {
  assignDomainProjectSchema,
  createDomainSchema,
  deleteDomainSchema,
  domainIdSchema,
  setDomainTrackingSchema,
  type CreateDomainFormInput,
} from "@/lib/validation/domain";
import { writeAuditLog } from "./audit";
import { recomputeChecklist } from "./checklist";
import { toDnsCheckDTO } from "./dns-check";
import { ServiceError } from "./errors";
import { orgSlugOf } from "./mail-notifications";
import { createNotifications } from "./notifications";
import { canSeeProject, projectFilter } from "./project-scope";
import {
  adapterFor,
  assertManageable,
  loadLiveConnection,
  orgOid,
  resendProblem,
  userOid,
} from "./resend-access";
import { recomputeSenderStatuses } from "./senders";
import type { ResendAdapter } from "@/lib/resend/adapter";

/**
 * Domains across connections (PRD §5.7). Reads come from the mirror; every change goes to Resend
 * first and then to the mirror, so the UI never shows a state Resend doesn't have. Each read is
 * scoped by org and by the member's project scope (`projectFilter`).
 */

type Deps = { adapter?: ResendAdapter };

const isDomainStatus = (s: string): s is DomainStatus =>
  (DOMAIN_STATUSES as readonly string[]).includes(s);

function toDTO(
  doc: DomainDoc | ReturnType<DomainDoc["toObject"]>,
  extra: {
    connectionName: string;
    project?: { name: string; color: string } | null;
    senderCount?: number;
  },
): DomainDTO {
  const d = doc as DomainDoc;
  return {
    id: d._id.toHexString(),
    connectionId: d.connectionId.toHexString(),
    connectionName: extra.connectionName,
    name: d.name,
    status: d.status,
    region: d.region ?? null,
    openTracking: !!d.openTracking,
    clickTracking: !!d.clickTracking,
    receivingEnabled: !!d.receiving?.enabled,
    receivingVerified: !!d.receiving?.mxVerified,
    projectId: d.projectId?.toHexString() ?? null,
    projectName: extra.project?.name ?? null,
    projectColor: extra.project?.color ?? null,
    records: (d.records ?? []).map((r) => ({
      record: r.record,
      type: r.type,
      name: r.name,
      value: r.value,
      priority: r.priority ?? null,
      status: r.status,
    })),
    dnsCheck: toDnsCheckDTO(d.dnsCheck),
    senderCount: extra.senderCount ?? 0,
    createdAt: (d.resendCreatedAt ?? (d as { createdAt?: Date }).createdAt)?.toISOString() ?? null,
  };
}

async function decorate(orgId: Types.ObjectId, docs: DomainDoc[]): Promise<DomainDTO[]> {
  if (docs.length === 0) return [];
  const [connections, projects, senderCounts] = await Promise.all([
    ConnectionModel.find(
      { orgId, _id: { $in: docs.map((d) => d.connectionId) }, deletedAt: null },
      { name: 1 },
    ).lean(),
    ProjectModel.find(
      { orgId, _id: { $in: docs.flatMap((d) => (d.projectId ? [d.projectId] : [])) } },
      { name: 1, color: 1 },
    ).lean(),
    SenderModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { orgId, deletedAt: null, domainId: { $in: docs.map((d) => d._id) } } },
      { $group: { _id: "$domainId", n: { $sum: 1 } } },
    ]),
  ]);
  const connectionName = new Map(connections.map((c) => [c._id.toHexString(), c.name]));
  const projectById = new Map(projects.map((p) => [p._id.toHexString(), p]));
  const counts = new Map(senderCounts.map((s) => [s._id.toHexString(), s.n]));
  return docs.flatMap((d) => {
    const name = connectionName.get(d.connectionId.toHexString());
    // Domains of a removed connection are kept as history but not listed.
    if (name === undefined) return [];
    const project = d.projectId ? projectById.get(d.projectId.toHexString()) : null;
    return [
      toDTO(d, {
        connectionName: name,
        project: project ? { name: project.name, color: project.color } : null,
        senderCount: counts.get(d._id.toHexString()),
      }),
    ];
  });
}

/** Domains the member may see, across connections, by name. */
export async function listDomains(ctx: OrgContext): Promise<DomainDTO[]> {
  authorize(ctx, "domain:read");
  await connectDb();
  const orgId = orgOid(ctx);
  const docs = await DomainModel.find({ orgId, ...projectFilter(ctx) })
    .sort({ name: 1 })
    .collation({ locale: "en", strength: 2 });
  return decorate(orgId, docs);
}

async function loadDomain(ctx: OrgContext, id: string): Promise<DomainDoc> {
  if (!Types.ObjectId.isValid(id)) throw new ServiceError("not_found", "Domain not found.");
  const doc = await DomainModel.findOne({ _id: id, orgId: orgOid(ctx) });
  if (!doc || !canSeeProject(ctx, doc.projectId?.toHexString() ?? null)) {
    throw new ServiceError("not_found", "Domain not found.");
  }
  return doc;
}

async function dtoOf(ctx: OrgContext, doc: DomainDoc): Promise<DomainDTO> {
  const [dto] = await decorate(orgOid(ctx), [doc]);
  if (!dto) throw new ServiceError("not_found", "Domain not found.");
  return dto;
}

export async function getDomain(ctx: OrgContext, id: string): Promise<DomainDTO> {
  authorize(ctx, "domain:read");
  await connectDb();
  return dtoOf(ctx, await loadDomain(ctx, id));
}

/** Loads a domain and its connection for a change in Resend. */
async function forChange(ctx: OrgContext, id: string) {
  const domain = await loadDomain(ctx, id);
  const connection = await loadLiveConnection(orgOid(ctx), domain.connectionId);
  assertManageable(connection);
  return { domain, connection };
}

/** Copies Resend's view of a domain (status, records, tracking) onto its mirror. */
function mirrorSet(detail: ResendDomainDetail) {
  const receiving = detail.records.filter((r) => r.record === "Receiving");
  return {
    name: detail.name,
    status: isDomainStatus(detail.status) ? detail.status : "pending",
    region: detail.region,
    openTracking: !!detail.openTracking,
    clickTracking: !!detail.clickTracking,
    receiving: {
      enabled: !!detail.capabilities?.receiving,
      mxVerified: receiving.length > 0 && receiving.every((r) => r.status === "verified"),
    },
    records: detail.records.map((r) => ({
      record: r.record,
      type: r.type,
      name: r.name,
      value: r.value,
      ...(r.priority === undefined ? {} : { priority: r.priority }),
      status: r.status,
    })),
    resendCreatedAt: new Date(detail.createdAt),
  };
}

async function audit(
  ctx: OrgContext,
  action: string,
  domain: { _id: Types.ObjectId; orgId: Types.ObjectId },
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  session?: import("mongoose").ClientSession,
) {
  await writeAuditLog(
    {
      orgId: domain.orgId,
      actor: { type: "user", id: userOid(ctx) },
      action,
      target: { type: "domain", id: domain._id },
      changes,
    },
    { session },
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Tracking                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** Turns open and/or click tracking on or off for one domain (permission `domain:update`). */
export async function setDomainTracking(
  ctx: OrgContext,
  raw: { domainId: string; openTracking?: boolean; clickTracking?: boolean },
  deps: Deps = {},
): Promise<DomainDTO> {
  authorize(ctx, "domain:update");
  const input = setDomainTrackingSchema.parse(raw);
  await connectDb();
  const { domain, connection } = await forChange(ctx, input.domainId);
  const adapter = deps.adapter ?? adapterFor(connection);

  const patch = {
    ...(input.openTracking === undefined ? {} : { openTracking: input.openTracking }),
    ...(input.clickTracking === undefined ? {} : { clickTracking: input.clickTracking }),
  };
  const before = {
    openTracking: !!domain.openTracking,
    clickTracking: !!domain.clickTracking,
  };
  try {
    await withRateLimitRetry(() => adapter.updateDomain({ id: domain.resendId, ...patch }));
  } catch (error) {
    if (isResendError(error) && error.code === "resend_not_found") {
      throw new ServiceError(
        "not_found",
        "Resend no longer has this domain. Sync the connection to refresh the list.",
      );
    }
    resendProblem(error);
  }

  await withTransaction(async (session) => {
    await DomainModel.updateOne(
      { _id: domain._id, orgId: domain.orgId },
      { $set: patch },
      { session },
    );
    await audit(ctx, "domain.tracking_updated", domain, { before, after: patch }, session);
    await publish(
      {
        orgId: domain.orgId,
        projectId: domain.projectId ?? null,
        topics: ["domains", `connection:${connection._id.toHexString()}`],
        patch,
      },
      { session },
    );
  });
  await recomputeChecklist(connection._id);
  return dtoOf(ctx, (await DomainModel.findById(domain._id))!);
}

/* ------------------------------------------------------------------------------------------ */
/* Project assignment                                                                          */
/* ------------------------------------------------------------------------------------------ */

/**
 * Assigns a domain to a project (or clears it). Existing emails keep their own project; new
 * events use the new mapping (UCD edge cases). Needs `project:update`.
 */
export async function assignDomainProject(
  ctx: OrgContext,
  raw: { domainId: string; projectId: string | null },
): Promise<DomainDTO> {
  authorize(ctx, "project:update");
  const input = assignDomainProjectSchema.parse(raw);
  await connectDb();
  const orgId = orgOid(ctx);
  const domain = await loadDomain(ctx, input.domainId);
  let projectId: Types.ObjectId | null = null;
  if (input.projectId) {
    const project = await ProjectModel.findOne(
      { _id: input.projectId, orgId, deletedAt: null },
      { _id: 1 },
    ).lean();
    if (!project || !canSeeProject(ctx, input.projectId)) {
      throw new ServiceError("not_found", "We couldn't find that project.");
    }
    projectId = project._id;
  }
  const before = domain.projectId ?? null;
  if (String(before) !== String(projectId)) {
    await withTransaction(async (session) => {
      await DomainModel.updateOne({ _id: domain._id, orgId }, { $set: { projectId } }, { session });
      await audit(
        ctx,
        "domain.project_changed",
        domain,
        {
          before: { projectId: before?.toHexString() ?? null },
          after: { projectId: projectId?.toHexString() ?? null },
        },
        session,
      );
      await publish(
        {
          orgId,
          topics: ["domains", "projects", "senders"],
          patch: { domain: domain._id.toHexString() },
        },
        { session },
      );
    });
  }
  return dtoOf(ctx, (await DomainModel.findById(domain._id))!);
}

/* ------------------------------------------------------------------------------------------ */
/* Verify                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** Refreshes one mirror from Resend and settles everything that depends on the domain. */
async function refreshFromResend(
  domain: DomainDoc,
  connectionId: Types.ObjectId,
  adapter: ResendAdapter,
) {
  const detail = await withRateLimitRetry(() => adapter.getDomain(domain.resendId));
  await DomainModel.updateOne(
    { _id: domain._id, orgId: domain.orgId },
    { $set: mirrorSet(detail) },
  );
  await recomputeSenderStatuses(domain.orgId, { domainId: domain._id });
  await recomputeChecklist(connectionId);
  await publish({
    orgId: domain.orgId,
    projectId: domain.projectId ?? null,
    topics: ["domains", "senders", `connection:${connectionId.toHexString()}`],
    patch: { domain: domain._id.toHexString(), status: detail.status },
  });
}

/** "Verify now": asks Resend to re-check the DNS, then pulls the outcome (permission `domain:verify`). */
export async function verifyDomain(
  ctx: OrgContext,
  raw: { domainId: string },
  deps: Deps = {},
): Promise<DomainDTO> {
  authorize(ctx, "domain:verify");
  const input = domainIdSchema.parse(raw);
  await connectDb();
  const { domain, connection } = await forChange(ctx, input.domainId);
  const adapter = deps.adapter ?? adapterFor(connection);
  const before = domain.status;
  try {
    await withRateLimitRetry(() => adapter.verifyDomain(domain.resendId));
    await refreshFromResend(domain, connection._id, adapter);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (isResendError(error) && error.code === "resend_not_found") {
      throw new ServiceError(
        "not_found",
        "Resend no longer has this domain. Sync the connection to refresh the list.",
      );
    }
    resendProblem(error);
  }
  const fresh = (await DomainModel.findById(domain._id))!;
  await withTransaction(async (session) => {
    await audit(
      ctx,
      "domain.verify_requested",
      domain,
      {
        before: { status: before },
        after: { status: fresh.status },
      },
      session,
    );
  });
  return dtoOf(ctx, fresh);
}

/* ------------------------------------------------------------------------------------------ */
/* Create                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** Adds a domain in Resend and mirrors it; the DTO carries the DNS records to add (permission `domain:create`). */
export async function createDomain(
  ctx: OrgContext,
  raw: CreateDomainFormInput,
  deps: Deps = {},
): Promise<DomainDTO> {
  authorize(ctx, "domain:create");
  const input = createDomainSchema.parse(raw);
  await connectDb();
  const orgId = orgOid(ctx);
  const connection = await loadLiveConnection(orgId, input.connectionId);
  assertManageable(connection);
  if (ctx.projectScope !== null && !input.projectId) {
    throw new ServiceError("validation", "Pick one of your projects for this domain.", {
      projectId: ["Pick one of your projects for this domain."],
    });
  }
  let projectId: Types.ObjectId | null = null;
  if (input.projectId) {
    const project = await ProjectModel.findOne(
      { _id: input.projectId, orgId, deletedAt: null },
      { _id: 1 },
    ).lean();
    if (!project || !canSeeProject(ctx, input.projectId)) {
      throw new ServiceError("not_found", "We couldn't find that project.");
    }
    projectId = project._id;
  }
  const existing = await DomainModel.exists({
    orgId,
    connectionId: connection._id,
    name: input.name,
  });
  if (existing) {
    throw new ServiceError("conflict", `${input.name} is already on this connection.`, {
      name: [`${input.name} is already on this connection.`],
    });
  }

  const adapter = deps.adapter ?? adapterFor(connection);
  let detail: ResendDomainDetail;
  try {
    detail = await withRateLimitRetry(() =>
      adapter.createDomain({ name: input.name, region: input.region }),
    );
  } catch (error) {
    resendProblem(error, { field: "name" });
  }

  const doc = await withTransaction(async (session) => {
    const [created] = await DomainModel.create(
      [
        {
          orgId,
          connectionId: connection._id,
          resendId: detail.id,
          projectId,
          syncedAt: new Date(),
          ...mirrorSet(detail),
        },
      ],
      { session },
    );
    await audit(
      ctx,
      "domain.created",
      created!,
      {
        after: {
          name: detail.name,
          region: detail.region,
          connectionId: connection._id.toHexString(),
        },
      },
      session,
    );
    await publish(
      {
        orgId,
        projectId,
        topics: ["domains", `connection:${connection._id.toHexString()}`],
        patch: { domain: created!._id.toHexString(), created: true },
      },
      { session },
    );
    return created!;
  });
  await recomputeChecklist(connection._id);
  return dtoOf(ctx, doc);
}

/* ------------------------------------------------------------------------------------------ */
/* Delete                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export type DeleteDomainResult = {
  id: string;
  name: string;
  sendersAffected: number;
  emailsFlagged: number;
};

/**
 * Deletes the domain in Resend (after the person typed its name), then removes the mirror and
 * recomputes its senders (they become `domain_unverified`, kept for history). Members who can
 * change domains are notified when senders or queued emails were affected. Permission `domain:delete`.
 */
export async function deleteDomain(
  ctx: OrgContext,
  raw: { domainId: string; confirmName: string },
  deps: Deps = {},
): Promise<DeleteDomainResult> {
  authorize(ctx, "domain:delete");
  const input = deleteDomainSchema.parse(raw);
  await connectDb();
  const { domain, connection } = await forChange(ctx, input.domainId);
  if (input.confirmName.trim().toLowerCase() !== domain.name.toLowerCase()) {
    throw new ServiceError("validation", "Type the domain name exactly to confirm.", {
      confirmName: ["Type the domain name exactly to confirm."],
    });
  }
  const adapter = deps.adapter ?? adapterFor(connection);
  try {
    await withRateLimitRetry(() => adapter.removeDomain(domain.resendId));
  } catch (error) {
    // Already gone in Resend: the mirror is stale, so removing it is exactly right.
    if (!(isResendError(error) && error.code === "resend_not_found")) resendProblem(error);
  }

  const orgId = domain.orgId;
  const slug = await orgSlugOf(orgId);
  const result = await withTransaction(async (session) => {
    await DomainModel.deleteOne({ _id: domain._id, orgId }, { session });
    // Keys restricted to this domain keep existing in Resend; only the reference goes.
    await ApiKeyModel.updateMany(
      { orgId, domainId: domain._id },
      { $set: { domainId: null } },
      { session },
    );
    const senders = await SenderModel.countDocuments(
      { orgId, domainId: domain._id, deletedAt: null },
      { session },
    );
    const { flaggedEmails } = await recomputeSenderStatuses(
      orgId,
      { domainId: domain._id },
      { session },
    );
    await audit(
      ctx,
      "domain.deleted",
      domain,
      {
        before: { name: domain.name, connectionId: connection._id.toHexString() },
        after: { sendersAffected: senders },
      },
      session,
    );
    if (senders > 0 || flaggedEmails > 0) {
      await createNotifications(
        {
          orgId,
          type: "domain_changed",
          title: `${domain.name} was deleted`,
          body:
            `${senders} ${senders === 1 ? "sender" : "senders"} on this domain can no longer send` +
            (flaggedEmails > 0
              ? `, and ${flaggedEmails} queued ${flaggedEmails === 1 ? "email needs" : "emails need"} another sender.`
              : "."),
          link: `/${slug}/domains`,
          refs: { connectionId: connection._id, domainId: domain._id },
          projectId: domain.projectId ?? null,
          audience: { permission: "domain:update" },
          dedupKey: `domain:${domain._id}:deleted`,
        },
        { session },
      );
    }
    await publish(
      {
        orgId,
        projectId: domain.projectId ?? null,
        topics: ["domains", "senders", `connection:${connection._id.toHexString()}`],
        patch: { domain: domain._id.toHexString(), deleted: true },
      },
      { session },
    );
    return { sendersAffected: senders, emailsFlagged: flaggedEmails };
  });
  await recomputeChecklist(connection._id);
  return { id: domain._id.toHexString(), name: domain.name, ...result };
}

/* ------------------------------------------------------------------------------------------ */
/* Pickers for the Domains and API keys pages                                                  */
/* ------------------------------------------------------------------------------------------ */

/** Projects the member may pick or see (all of them, or only their scope). */
export async function listProjectChoices(
  ctx: OrgContext,
): Promise<{ id: string; name: string; color: string }[]> {
  authorize(ctx, "domain:read");
  await connectDb();
  const projects = await ProjectModel.find({ orgId: orgOid(ctx), deletedAt: null })
    .sort({ name: 1 })
    .collation({ locale: "en", strength: 2 })
    .lean();
  return projects
    .filter((p) => canSeeProject(ctx, p._id.toHexString()))
    .map((p) => ({ id: p._id.toHexString(), name: p.name, color: p.color }));
}

/** Live connections Wisemail can change things in (active ones), for "add" pickers. */
export async function listManageableConnections(
  ctx: OrgContext,
): Promise<{ id: string; name: string }[]> {
  authorize(ctx, "connection:read");
  await connectDb();
  const connections = await ConnectionModel.find(
    { orgId: orgOid(ctx), deletedAt: null, status: "active" },
    { name: 1 },
  )
    .sort({ name: 1 })
    .lean();
  return connections.map((c) => ({ id: c._id.toHexString(), name: c.name }));
}
