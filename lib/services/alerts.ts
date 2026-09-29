import "server-only";

import { Types } from "mongoose";

import type { AlertKind } from "@/lib/alerts/kinds";
import { PLAN_LABELS, getNextTier, getPlanLimits } from "@/lib/billing/plans";
import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { AlertIncidentModel, type AlertIncidentDoc } from "@/lib/db/models/alert-incidents";
import { AlertRuleModel, type AlertRuleDoc } from "@/lib/db/models/alert-rules";
import { ConnectionModel } from "@/lib/db/models/connections";
import { DomainModel } from "@/lib/db/models/domains";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { ProjectModel } from "@/lib/db/models/projects";
import { assertRefs } from "@/lib/db/refs";
import type { AlertQuota, AlertRuleDTO, AlertScopeOptions, IncidentDTO } from "@/lib/dto/alert";
import { publish } from "@/lib/realtime/publish";
import { topics } from "@/lib/realtime/topics";
import {
  alertRuleInputSchema,
  type AlertRuleInput,
  type UpdateAlertRuleInput,
} from "@/lib/validation/alert";
import { writeAuditLog } from "./audit";
import { ServiceError } from "./errors";
import { canSeeProject } from "./project-scope";

/**
 * Alert rules and incidents: the member-facing CRUD (PRD §5.6, UCD UC-18). The evaluation engine
 * that opens and resolves incidents lives in `alert-evaluation.ts`.
 */

const oid = (id: string) => new Types.ObjectId(id);
const orgOid = (ctx: OrgContext) => oid(ctx.org.id);
const ids = (list: Types.ObjectId[] | undefined) => (list ?? []).map((i) => i.toHexString());

export function toRuleDTO(
  doc: AlertRuleDoc | (AlertRuleDoc & { __v?: number }),
  active = 0,
): AlertRuleDTO {
  return {
    id: doc._id.toHexString(),
    version: (doc as { __v?: number }).__v ?? 0,
    name: doc.name,
    kind: doc.kind as AlertKind,
    scope: {
      connectionIds: ids(doc.scope?.connectionIds),
      projectIds: ids(doc.scope?.projectIds),
      domainIds: ids(doc.scope?.domainIds),
    },
    condition: {
      operator: doc.condition.operator ?? "gt",
      threshold: doc.condition.threshold ?? 0,
      windowMinutes: doc.condition.windowMinutes ?? 0,
      minVolume: doc.condition.minVolume ?? 0,
    },
    channels: {
      inApp: doc.channels?.inApp ?? true,
      emailMembers: doc.channels?.emailMembers ?? true,
      email: doc.channels?.email ?? [],
    },
    enabled: doc.enabled,
    activeIncidents: active,
    createdAt: (doc as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function toIncidentDTO(
  doc: AlertIncidentDoc | (Record<string, unknown> & { _id: Types.ObjectId }),
): IncidentDTO {
  const d = doc as unknown as AlertIncidentDoc;
  return {
    id: d._id.toHexString(),
    ruleId: d.ruleId.toHexString(),
    ruleName: d.ruleName,
    kind: d.kind as AlertKind,
    status: d.status,
    title: d.title,
    summary: d.summary ?? "",
    observedValue: d.observedValue ?? 0,
    openedAt: d.openedAt.toISOString(),
    resolvedAt: d.resolvedAt?.toISOString() ?? null,
    acknowledgedAt: d.acknowledgedAt?.toISOString() ?? null,
    context: (d.context ?? {}) as IncidentDTO["context"],
  };
}

/** A project-scoped member only sees (and edits) rules limited to their own projects. */
function ruleVisible(ctx: OrgContext, rule: { scope?: { projectIds?: Types.ObjectId[] } }) {
  if (ctx.projectScope === null) return true;
  const projects = ids(rule.scope?.projectIds);
  return projects.length > 0 && projects.every((p) => canSeeProject(ctx, p));
}

async function planLimits(orgId: Types.ObjectId) {
  const settings = await OrgSettingsModel.findOne({ orgId }).lean();
  const plan = settings?.plan ?? "free";
  return { plan, limit: getPlanLimits(plan, settings?.limitOverrides).alertRules };
}

export async function getAlertQuota(ctx: OrgContext): Promise<AlertQuota> {
  await connectDb();
  const orgId = orgOid(ctx);
  const { plan, limit } = await planLimits(orgId);
  const next = getNextTier(plan);
  return {
    used: await AlertRuleModel.countDocuments({ orgId }),
    limit,
    planLabel: PLAN_LABELS[plan],
    nextTierLabel: next ? PLAN_LABELS[next] : null,
  };
}

export async function listAlertRules(ctx: OrgContext): Promise<AlertRuleDTO[]> {
  authorize(ctx, "alertRule:read");
  await connectDb();
  const orgId = orgOid(ctx);
  const [rules, active] = await Promise.all([
    AlertRuleModel.find({ orgId }).sort({ createdAt: -1 }),
    AlertIncidentModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { orgId, active: true } },
      { $group: { _id: "$ruleId", n: { $sum: 1 } } },
    ]),
  ]);
  const counts = new Map(active.map((a) => [a._id.toHexString(), a.n]));
  return rules
    .filter((r) => ruleVisible(ctx, r))
    .map((r) => toRuleDTO(r, counts.get(r._id.toHexString()) ?? 0));
}

export async function getAlertRule(ctx: OrgContext, id: string): Promise<AlertRuleDTO | null> {
  authorize(ctx, "alertRule:read");
  await connectDb();
  if (!/^[0-9a-f]{24}$/i.test(id)) return null;
  const orgId = orgOid(ctx);
  const rule = await AlertRuleModel.findOne({ _id: oid(id), orgId });
  if (!rule || !ruleVisible(ctx, rule)) return null;
  const active = await AlertIncidentModel.countDocuments({ orgId, ruleId: rule._id, active: true });
  return toRuleDTO(rule, active);
}

async function checkScope(ctx: OrgContext, rule: ReturnType<typeof alertRuleInputSchema.parse>) {
  const orgId = orgOid(ctx);
  await assertRefs(orgId, [
    { model: ConnectionModel, ids: rule.scope.connectionIds.map(oid) },
    { model: DomainModel, ids: rule.scope.domainIds.map(oid) },
    { model: ProjectModel, ids: rule.scope.projectIds.map(oid) },
  ]);
  if (ctx.projectScope !== null) {
    if (
      rule.scope.projectIds.length === 0 ||
      !rule.scope.projectIds.every((p) => canSeeProject(ctx, p.toLowerCase()))
    ) {
      throw new ServiceError(
        "forbidden",
        "You can only create rules for the projects you have access to.",
        { "scope.projectIds": ["Pick at least one of your projects."] },
      );
    }
  }
}

/** Creates a rule, enforcing the plan's rule limit (PRICING §3). */
export async function createAlertRule(ctx: OrgContext, raw: AlertRuleInput): Promise<AlertRuleDTO> {
  authorize(ctx, "alertRule:create");
  await connectDb();
  const input = alertRuleInputSchema.parse(raw);
  const orgId = orgOid(ctx);
  await checkScope(ctx, input);

  const { plan, limit } = await planLimits(orgId);
  const used = await AlertRuleModel.countDocuments({ orgId });
  if (limit !== null && used >= limit) {
    const next = getNextTier(plan);
    throw new ServiceError(
      "plan_limit_reached",
      `You have ${used} of ${limit} alert rules on ${PLAN_LABELS[plan]}.` +
        (next ? ` Upgrade to ${PLAN_LABELS[next]} for more.` : ""),
    );
  }

  const rule = await AlertRuleModel.create({
    orgId,
    name: input.name,
    kind: input.kind,
    scope: {
      connectionIds: input.scope.connectionIds.map(oid),
      projectIds: input.scope.projectIds.map(oid),
      domainIds: input.scope.domainIds.map(oid),
    },
    condition: input.condition,
    channels: input.channels,
    enabled: input.enabled,
    createdBy: oid(ctx.user.id),
  });
  await writeAuditLog({
    orgId,
    actor: { type: "user", id: oid(ctx.user.id) },
    action: "alert_rule.created",
    target: { type: "alert_rule", id: rule._id },
    changes: { after: { name: input.name, kind: input.kind, condition: input.condition } },
  });
  await publish({ orgId, topics: [topics.incidents(orgId)] });
  return toRuleDTO(rule);
}

/** Replaces a rule's settings; a stale `version` (someone else saved first) is a conflict. */
export async function updateAlertRule(
  ctx: OrgContext,
  raw: UpdateAlertRuleInput,
): Promise<AlertRuleDTO> {
  authorize(ctx, "alertRule:update");
  await connectDb();
  const input = alertRuleInputSchema.parse(raw.rule);
  const orgId = orgOid(ctx);
  const rule = await AlertRuleModel.findOne({ _id: oid(raw.id), orgId });
  if (!rule || !ruleVisible(ctx, rule))
    throw new ServiceError("not_found", "We couldn't find that rule.");
  if (raw.version !== undefined && (rule as { __v?: number }).__v !== raw.version) {
    throw new ServiceError(
      "conflict",
      "Someone else changed this rule while you were editing. Reload to see their changes.",
    );
  }
  await checkScope(ctx, input);
  const before = { name: rule.name, condition: rule.condition, enabled: rule.enabled };
  rule.set({
    name: input.name,
    kind: input.kind,
    scope: {
      connectionIds: input.scope.connectionIds.map(oid),
      projectIds: input.scope.projectIds.map(oid),
      domainIds: input.scope.domainIds.map(oid),
    },
    condition: input.condition,
    channels: input.channels,
    enabled: input.enabled,
  });
  try {
    await rule.save();
  } catch (error) {
    if ((error as Error).name === "VersionError") {
      throw new ServiceError(
        "conflict",
        "Someone else changed this rule while you were editing. Reload to see their changes.",
      );
    }
    throw error;
  }
  await writeAuditLog({
    orgId,
    actor: { type: "user", id: oid(ctx.user.id) },
    action: "alert_rule.updated",
    target: { type: "alert_rule", id: rule._id },
    changes: {
      before,
      after: { name: input.name, condition: input.condition, enabled: input.enabled },
    },
  });
  await publish({ orgId, topics: [topics.incidents(orgId)] });
  return toRuleDTO(
    rule,
    await AlertIncidentModel.countDocuments({ orgId, ruleId: rule._id, active: true }),
  );
}

export async function setAlertRuleEnabled(
  ctx: OrgContext,
  input: { id: string; enabled: boolean },
): Promise<AlertRuleDTO> {
  authorize(ctx, "alertRule:update");
  await connectDb();
  const orgId = orgOid(ctx);
  const rule = await AlertRuleModel.findOne({ _id: oid(input.id), orgId });
  if (!rule || !ruleVisible(ctx, rule))
    throw new ServiceError("not_found", "We couldn't find that rule.");
  rule.enabled = input.enabled;
  await rule.save();
  await writeAuditLog({
    orgId,
    actor: { type: "user", id: oid(ctx.user.id) },
    action: input.enabled ? "alert_rule.enabled" : "alert_rule.disabled",
    target: { type: "alert_rule", id: rule._id },
  });
  await publish({ orgId, topics: [topics.incidents(orgId)] });
  return toRuleDTO(rule);
}

/** Deletes a rule and, with it, its incidents (DBD §5: cascade). */
export async function deleteAlertRule(ctx: OrgContext, id: string): Promise<{ id: string }> {
  authorize(ctx, "alertRule:delete");
  await connectDb();
  const orgId = orgOid(ctx);
  const rule = await AlertRuleModel.findOne({ _id: oid(id), orgId });
  if (!rule || !ruleVisible(ctx, rule))
    throw new ServiceError("not_found", "We couldn't find that rule.");
  await AlertIncidentModel.deleteMany({ orgId, ruleId: rule._id });
  await AlertRuleModel.deleteOne({ _id: rule._id, orgId });
  await writeAuditLog({
    orgId,
    actor: { type: "user", id: oid(ctx.user.id) },
    action: "alert_rule.deleted",
    target: { type: "alert_rule", id: rule._id },
    changes: { before: { name: rule.name, kind: rule.kind } },
  });
  await publish({ orgId, topics: [topics.incidents(orgId)] });
  return { id };
}

/* ------------------------------------------------------------------------------------------ */
/* Incidents                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function incidentFilter(ctx: OrgContext) {
  const orgId = orgOid(ctx);
  return ctx.projectScope === null
    ? { orgId }
    : { orgId, projectId: { $in: ctx.projectScope.map(oid) } };
}

export async function listIncidents(
  ctx: OrgContext,
  query: { status?: "active" | "resolved" | "all"; limit?: number; ruleId?: string } = {},
): Promise<IncidentDTO[]> {
  authorize(ctx, "alertRule:read");
  await connectDb();
  const status = query.status ?? "all";
  const rows = await AlertIncidentModel.find({
    ...incidentFilter(ctx),
    ...(status === "active" ? { active: true } : status === "resolved" ? { active: false } : {}),
    ...(query.ruleId && /^[0-9a-f]{24}$/i.test(query.ruleId) ? { ruleId: oid(query.ruleId) } : {}),
  })
    .sort({ active: -1, openedAt: -1 })
    .limit(Math.min(query.limit ?? 50, 200))
    .lean();
  return rows.map((r) => toIncidentDTO(r as never));
}

export async function getIncident(ctx: OrgContext, id: string): Promise<IncidentDTO | null> {
  authorize(ctx, "alertRule:read");
  await connectDb();
  if (!/^[0-9a-f]{24}$/i.test(id)) return null;
  const row = await AlertIncidentModel.findOne({ ...incidentFilter(ctx), _id: oid(id) }).lean();
  return row ? toIncidentDTO(row as never) : null;
}

/** "I've seen it": keeps the incident open (it resolves on its own) but marks who looked. */
export async function acknowledgeIncident(ctx: OrgContext, id: string): Promise<IncidentDTO> {
  authorize(ctx, "alertRule:update");
  await connectDb();
  const orgId = orgOid(ctx);
  const row = await AlertIncidentModel.findOneAndUpdate(
    { ...incidentFilter(ctx), _id: oid(id), status: "open" },
    {
      $set: {
        status: "acknowledged",
        acknowledgedAt: new Date(),
        acknowledgedBy: oid(ctx.user.id),
      },
    },
    { returnDocument: "after" },
  ).lean();
  if (!row) {
    const existing = await AlertIncidentModel.findOne({
      ...incidentFilter(ctx),
      _id: oid(id),
    }).lean();
    if (!existing) throw new ServiceError("not_found", "We couldn't find that incident.");
    return toIncidentDTO(existing as never);
  }
  await publish({ orgId, topics: [topics.incidents(orgId)] });
  return toIncidentDTO(row as never);
}

/** Connections, domains and projects a member may scope a rule to. */
export async function getAlertScopeOptions(ctx: OrgContext): Promise<AlertScopeOptions> {
  await connectDb();
  const orgId = orgOid(ctx);
  const [connections, domains, projects] = await Promise.all([
    ConnectionModel.find({ orgId, deletedAt: null }, { name: 1 }).sort({ name: 1 }).lean(),
    DomainModel.find({ orgId }, { name: 1, projectId: 1 }).sort({ name: 1 }).lean(),
    ProjectModel.find({ orgId, deletedAt: null }, { name: 1 }).sort({ name: 1 }).lean(),
  ]);
  return {
    connections:
      ctx.projectScope === null
        ? connections.map((c) => ({ id: c._id.toHexString(), name: c.name }))
        : [],
    domains: domains
      .filter((d) => canSeeProject(ctx, d.projectId?.toHexString() ?? null))
      .map((d) => ({ id: d._id.toHexString(), name: d.name })),
    projects: projects
      .filter((p) => canSeeProject(ctx, p._id.toHexString()))
      .map((p) => ({ id: p._id.toHexString(), name: p.name })),
  };
}
