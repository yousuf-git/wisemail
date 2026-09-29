import "server-only";

import mongoose, { Types, type ClientSession } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { PLAN_LABELS, getNextTier, getPlanLimits } from "@/lib/billing/plans";
import { connectDb } from "@/lib/db/connect";
import { MemberScopeModel } from "@/lib/db/models/member-scopes";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { ProjectModel, type ProjectDoc } from "@/lib/db/models/projects";
import { withTransaction } from "@/lib/db/transaction";
import type { ProjectDTO, ProjectQuota } from "@/lib/dto/project";
import { publish } from "@/lib/realtime/publish";
import {
  slugifyProjectName,
  type CreateProjectInput,
  type DeleteProjectInput,
  type UpdateProjectInput,
} from "@/lib/validation/project";
import { writeAuditLog } from "./audit";
import { ServiceError } from "./errors";

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

const orgOid = (ctx: OrgContext) => new Types.ObjectId(ctx.org.id);
const userOid = (ctx: OrgContext) => new Types.ObjectId(ctx.user.id);
const live = { deletedAt: null } as const;

/** Collections whose documents carry `projectId` (DBD §5: they lose the project on delete). */
const PROJECT_TAGGED_COLLECTIONS = ["domains", "emails", "threads"] as const;

const nameTaken = () =>
  new ServiceError("conflict", "You already have a project with that name.", {
    name: ["You already have a project with that name."],
  });

export function toProjectDTO(
  doc: {
    _id: Types.ObjectId;
    name: string;
    slug: string;
    color: ProjectDoc["color"];
    description?: string | null;
    createdAt: Date;
  },
  counts: { domains?: number; scopedMembers?: number } = {},
): ProjectDTO {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    slug: doc.slug,
    color: doc.color,
    description: doc.description ?? "",
    domainCount: counts.domains ?? 0,
    scopedMemberCount: counts.scopedMembers ?? 0,
    createdAt: doc.createdAt.toISOString(),
  };
}

async function findLive(ctx: OrgContext, projectId: string, session?: ClientSession) {
  const doc = await ProjectModel.findOne({ _id: projectId, orgId: orgOid(ctx), ...live }, null, {
    session,
  });
  if (!doc) throw new ServiceError("not_found", "We couldn't find that project.");
  return doc;
}

async function planFor(orgId: Types.ObjectId) {
  const settings = await OrgSettingsModel.findOne({ orgId }).lean();
  const plan = settings?.plan ?? "free";
  return { plan, limit: getPlanLimits(plan, settings?.limitOverrides).projects };
}

/** Projects of the org with domain and scoped-member counts. Newest last (stable, by name). */
export async function listProjects(ctx: OrgContext): Promise<ProjectDTO[]> {
  authorize(ctx, "project:read");
  await connectDb();
  const orgId = orgOid(ctx);
  const projects = await ProjectModel.find({ orgId, ...live })
    .sort({ name: 1 })
    .collation({ locale: "en", strength: 2 })
    .lean();
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p._id);
  const [domainCounts, scopeCounts] = await Promise.all([
    mongoose.connection
      .collection("domains")
      .aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { orgId, projectId: { $in: ids } } },
        { $group: { _id: "$projectId", n: { $sum: 1 } } },
      ])
      .toArray(),
    MemberScopeModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { orgId, projectIds: { $in: ids } } },
      { $unwind: "$projectIds" },
      { $match: { projectIds: { $in: ids } } },
      { $group: { _id: "$projectIds", n: { $sum: 1 } } },
    ]),
  ]);
  const domains = new Map(domainCounts.map((c) => [c._id.toHexString(), c.n]));
  const scoped = new Map(scopeCounts.map((c) => [c._id.toHexString(), c.n]));
  return projects.map((p) =>
    toProjectDTO(p, {
      domains: domains.get(p._id.toHexString()),
      scopedMembers: scoped.get(p._id.toHexString()),
    }),
  );
}

export async function getProjectQuota(ctx: OrgContext): Promise<ProjectQuota> {
  await connectDb();
  const orgId = orgOid(ctx);
  const { plan, limit } = await planFor(orgId);
  const next = getNextTier(plan);
  return {
    used: await ProjectModel.countDocuments({ orgId, ...live }),
    limit,
    planLabel: PLAN_LABELS[plan],
    nextTierLabel: next ? PLAN_LABELS[next] : null,
  };
}

function limitError(plan: keyof typeof PLAN_LABELS, limit: number) {
  const next = getNextTier(plan);
  return new ServiceError(
    "plan_limit_reached",
    `You've created ${limit} of ${limit} ${limit === 1 ? "project" : "projects"} on ${PLAN_LABELS[plan]}.` +
      (next ? ` Upgrade to ${PLAN_LABELS[next]} to add more.` : ""),
  );
}

export async function createProject(
  ctx: OrgContext,
  input: CreateProjectInput,
): Promise<ProjectDTO> {
  authorize(ctx, "project:create");
  await connectDb();
  const orgId = orgOid(ctx);
  const name = input.name.trim();
  const slug = slugifyProjectName(name);
  const { plan, limit } = await planFor(orgId);

  try {
    return await withTransaction(async (session) => {
      // Serialise concurrent creates in this org: both write the settings doc, so one
      // transaction conflicts, retries and re-counts (same trick as connections).
      await OrgSettingsModel.updateOne(
        { orgId },
        { $currentDate: { updatedAt: true } },
        { session, timestamps: false },
      );
      if (limit !== null) {
        if ((await ProjectModel.countDocuments({ orgId, ...live }, { session })) >= limit) {
          throw limitError(plan, limit);
        }
      }
      const clash = await ProjectModel.exists({
        orgId,
        ...live,
        $or: [{ name }, { slug }],
      }).session(session);
      if (clash) throw nameTaken();
      const [doc] = await ProjectModel.create(
        [
          {
            orgId,
            name,
            slug,
            color: input.color,
            description: input.description?.trim() ?? "",
            deletedAt: null,
          },
        ],
        { session },
      );
      await writeAuditLog(
        {
          orgId,
          actor: { type: "user", id: userOid(ctx) },
          action: "project.created",
          target: { type: "project", id: doc!._id },
          changes: { after: { name, color: input.color } },
        },
        { session },
      );
      await publish({ orgId, topics: ["projects"] }, { session });
      return toProjectDTO(doc!);
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw nameTaken();
    throw error;
  }
}

export async function updateProject(
  ctx: OrgContext,
  input: UpdateProjectInput,
): Promise<ProjectDTO> {
  authorize(ctx, "project:update");
  await connectDb();
  const orgId = orgOid(ctx);
  const name = input.name.trim();
  const slug = slugifyProjectName(name);
  const description = input.description?.trim() ?? "";

  try {
    return await withTransaction(async (session) => {
      const project = await findLive(ctx, input.projectId, session);
      const before = { name: project.name, color: project.color, description: project.description };
      if (before.name !== name || project.slug !== slug) {
        const clash = await ProjectModel.exists({
          orgId,
          ...live,
          _id: { $ne: project._id },
          $or: [{ name }, { slug }],
        }).session(session);
        if (clash) throw nameTaken();
      }
      project.name = name;
      project.slug = slug;
      project.color = input.color;
      project.description = description;
      if (!project.isModified()) return toProjectDTO(project);
      await project.save({ session });
      await writeAuditLog(
        {
          orgId,
          actor: { type: "user", id: userOid(ctx) },
          action: before.name !== name ? "project.renamed" : "project.updated",
          target: { type: "project", id: project._id },
          changes: { before, after: { name, color: input.color, description } },
        },
        { session },
      );
      await publish(
        { orgId, topics: ["projects", `project:${project._id.toHexString()}`] },
        { session },
      );
      return toProjectDTO(project);
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw nameTaken();
    if (error instanceof Error && error.name === "VersionError") {
      throw new ServiceError(
        "conflict",
        "Someone else changed this project a moment ago. Reload and try again.",
      );
    }
    throw error;
  }
}

/**
 * Soft delete (DBD §5). In one transaction: the project gets `deletedAt`; its domains, emails
 * and threads lose `projectId`; member scopes drop it, and a scope left empty is removed (the
 * member becomes unrestricted). Nothing else is touched.
 */
export async function softDeleteProject(
  ctx: OrgContext,
  input: DeleteProjectInput,
): Promise<{ id: string; unassigned: number; membersUnrestricted: number }> {
  authorize(ctx, "project:delete");
  await connectDb();
  const orgId = orgOid(ctx);

  return withTransaction(async (session) => {
    const project = await findLive(ctx, input.projectId, session);
    const projectId = project._id;
    project.deletedAt = new Date();
    await project.save({ session });

    let unassigned = 0;
    for (const name of PROJECT_TAGGED_COLLECTIONS) {
      const res = await mongoose.connection
        .collection(name)
        .updateMany({ orgId, projectId }, { $set: { projectId: null } }, { session });
      if (name === "domains") unassigned = res.modifiedCount;
    }

    await MemberScopeModel.updateMany(
      { orgId, projectIds: projectId },
      { $pull: { projectIds: projectId } },
      { session },
    );
    const emptied = await MemberScopeModel.deleteMany(
      { orgId, projectIds: { $size: 0 } },
      { session },
    );

    await writeAuditLog(
      {
        orgId,
        actor: { type: "user", id: userOid(ctx) },
        action: "project.deleted",
        target: { type: "project", id: projectId },
        changes: {
          before: { name: project.name },
          after: { domainsUnassigned: unassigned, membersUnrestricted: emptied.deletedCount },
        },
      },
      { session },
    );
    await publish(
      { orgId, topics: ["projects", "members", `project:${projectId.toHexString()}`] },
      { session },
    );
    return {
      id: projectId.toHexString(),
      unassigned,
      membersUnrestricted: emptied.deletedCount,
    };
  });
}
