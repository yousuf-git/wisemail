import "server-only";

import mongoose, { Types } from "mongoose";

import type { AdminActor } from "@/lib/admin/guard";
import { OVERRIDABLE_LIMITS, type OverridableLimitKey } from "@/lib/admin/limits";
import { computeEntitlements } from "@/lib/billing/entitlements";
import { trackedTotal } from "@/lib/billing/metering";
import { PLAN_CATALOG, PLAN_LABELS, TRIAL_DAYS, type Plan } from "@/lib/billing/plans";
import { connectDb } from "@/lib/db/connect";
import { AuditLogModel } from "@/lib/db/models/audit-log";
import { ConnectionModel } from "@/lib/db/models/connections";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";
import { UsagePeriodModel } from "@/lib/db/models/usage-periods";
import { withTransaction } from "@/lib/db/transaction";
import type { AdminOrgDetailDTO, AdminOrgRowDTO, AdminPageDTO } from "@/lib/dto/admin";
import { env } from "@/lib/env";
import { ServiceError } from "@/lib/services/errors";
import {
  applyPlanChange,
  restoreConnections,
  syncUsageAllowance,
} from "@/lib/services/plan-changes";
import { writeAdminAudit } from "./audit";
import { DEFAULT_PAGE, decodeCursor, escapeRegex, iso, requireOid, toOid } from "./shared";

type OrgDoc = { _id: Types.ObjectId; name: string; slug: string; createdAt?: Date };
const orgs = () => mongoose.connection.collection<OrgDoc>("organization");
const DAY = 86_400_000;

async function rowsFor(docs: OrgDoc[]): Promise<AdminOrgRowDTO[]> {
  const ids = docs.map((d) => d._id);
  const [settings, members, connections, usage] = await Promise.all([
    OrgSettingsModel.find({ orgId: { $in: ids } }).lean(),
    mongoose.connection
      .collection("member")
      .aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { organizationId: { $in: ids } } },
        { $group: { _id: "$organizationId", n: { $sum: 1 } } },
      ])
      .toArray(),
    ConnectionModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { orgId: { $in: ids }, deletedAt: null } },
      { $group: { _id: "$orgId", n: { $sum: 1 } } },
    ]),
    UsagePeriodModel.aggregate<{ _id: Types.ObjectId; emailsTracked: Record<string, number> }>([
      { $match: { orgId: { $in: ids } } },
      { $sort: { periodStart: -1 } },
      { $group: { _id: "$orgId", emailsTracked: { $first: "$emailsTracked" } } },
    ]),
  ]);
  const byOrg = <T extends { _id: Types.ObjectId }>(rows: T[]) =>
    new Map(rows.map((r) => [r._id.toHexString(), r]));
  const settingsBy = new Map(settings.map((s) => [s.orgId.toHexString(), s]));
  const membersBy = byOrg(members);
  const connBy = byOrg(connections);
  const usageBy = byOrg(usage);
  return docs.map((o) => {
    const id = o._id.toHexString();
    const s = settingsBy.get(id);
    const e = computeEntitlements(s ?? null);
    return {
      id,
      name: o.name,
      slug: o.slug,
      plan: e.plan,
      planLabel: e.planLabel,
      planState: e.planState,
      suspended: !!s?.suspended,
      createdAt: (o.createdAt ?? o._id.getTimestamp()).toISOString(),
      members: membersBy.get(id)?.n ?? 0,
      connections: connBy.get(id)?.n ?? 0,
      trackedThisPeriod: trackedTotal(usageBy.get(id)?.emailsTracked),
    };
  });
}

export async function listOrgs(
  options: { q?: string; cursor?: string | null; limit?: number } = {},
): Promise<AdminPageDTO<AdminOrgRowDTO>> {
  await connectDb();
  const limit = Math.min(options.limit ?? DEFAULT_PAGE, 100);
  const filter: Record<string, unknown> = {};
  const q = options.q?.trim();
  if (q) {
    const rx = { $regex: escapeRegex(q.slice(0, 80)), $options: "i" };
    filter.$or = [{ name: rx }, { slug: rx }];
  }
  const cursor = decodeCursor(options.cursor);
  if (cursor) filter._id = { $lt: cursor };
  const docs = await orgs()
    .find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = docs.slice(0, limit);
  return {
    items: await rowsFor(page),
    nextCursor: docs.length > limit ? page[page.length - 1]!._id.toHexString() : null,
  };
}

export async function getOrgDetail(orgIdRaw: string): Promise<AdminOrgDetailDTO | null> {
  await connectDb();
  const orgId = toOid(orgIdRaw);
  if (!orgId) return null;
  const org = await orgs().findOne({ _id: orgId });
  if (!org) return null;
  const now = new Date();
  const [settings, members, connections, audit] = await Promise.all([
    OrgSettingsModel.findOne({ orgId }).lean(),
    mongoose.connection
      .collection("member")
      .find({ organizationId: orgId })
      .sort({ _id: 1 })
      .toArray(),
    ConnectionModel.find({ orgId, deletedAt: null }).sort({ _id: 1 }).lean(),
    AuditLogModel.find({ orgId, action: /^admin\./ })
      .sort({ createdAt: -1, _id: -1 })
      .limit(10)
      .lean(),
  ]);
  const e = computeEntitlements(settings, now);
  const period = e.billingPeriod;
  const [usage, users] = await Promise.all([
    UsagePeriodModel.findOne({ orgId, periodStart: { $lte: now } })
      .sort({ periodStart: -1 })
      .lean(),
    mongoose.connection
      .collection("user")
      .find({
        _id: {
          $in: [...members.map((m) => m.userId), ...audit.map((a) => a.actorId).filter(Boolean)],
        },
      })
      .project({ name: 1, email: 1 })
      .toArray(),
  ]);
  const userBy = new Map(users.map((u) => [String(u._id), u]));
  const catalog = PLAN_CATALOG[e.plan].limits;
  const overrides = (settings?.limitOverrides ?? {}) as Partial<Record<string, number | null>>;
  const tracked = usage?.emailsTracked;
  const suspendedBy = settings?.suspended?.by ? userBy.get(String(settings.suspended.by)) : null;
  return {
    id: orgId.toHexString(),
    name: org.name,
    slug: org.slug,
    createdAt: (org.createdAt ?? orgId.getTimestamp()).toISOString(),
    plan: e.plan,
    storedPlan: e.storedPlan,
    planLabel: e.planLabel,
    planState: e.planState,
    trial: e.trial
      ? {
          startedAt: e.trial.startedAt.toISOString(),
          endsAt: e.trial.endsAt.toISOString(),
          active: e.trial.active,
          daysLeft: e.trial.daysLeft,
        }
      : null,
    billingEnabled: env.BILLING_ENABLED,
    suspended: settings?.suspended
      ? {
          at: settings.suspended.at.toISOString(),
          by: suspendedBy ? String(suspendedBy.name || suspendedBy.email) : null,
          reason: settings.suspended.reason,
        }
      : null,
    limits: OVERRIDABLE_LIMITS.map(({ key, label }) => ({
      key,
      label,
      effective: e.limits[key],
      catalog: catalog[key],
      override: overrides[key] ?? null,
    })),
    members: members.map((m) => {
      const u = userBy.get(String(m.userId));
      return {
        userId: String(m.userId),
        name: String(u?.name ?? ""),
        email: String(u?.email ?? ""),
        role: String(m.role),
      };
    }),
    connections: connections.map((c) => ({
      id: c._id.toHexString(),
      name: c.name,
      status: c.status,
      statusReason: c.statusReason ?? null,
      lastEventAt: iso(c.lastEventAt),
      lastSyncAt: iso(c.lastSyncAt),
      apiKeyLast4: c.apiKeyLast4 ?? null,
    })),
    usage: {
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      allowance: e.limits.emailsTrackedPerMonth,
      tracked: {
        transactional: tracked?.transactional ?? 0,
        broadcast: tracked?.broadcast ?? 0,
        inbound: tracked?.inbound ?? 0,
        total: trackedTotal(tracked),
      },
    },
    recentAudit: audit.map((a) => {
      const actor = a.actorId ? userBy.get(String(a.actorId)) : null;
      return {
        id: a._id.toHexString(),
        at: a.createdAt.toISOString(),
        action: a.action,
        actor: String(actor?.name || actor?.email || "Platform admin"),
        reason: a.reason ?? null,
      };
    }),
  };
}

async function loadOrg(orgIdRaw: string) {
  await connectDb();
  const orgId = requireOid(orgIdRaw, "workspace");
  const org = await orgs().findOne({ _id: orgId });
  if (!org) throw new ServiceError("not_found", "We couldn't find that workspace.");
  return { orgId, org };
}

/* ------------------------------------------------------------------------------------------ */
/* Actions                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Beta plan switch through the existing plan-change service (applies at once, both directions). */
export async function adminChangePlan(
  admin: AdminActor,
  input: { orgId: string; plan: Plan; reason: string },
) {
  const { orgId, org } = await loadOrg(input.orgId);
  if (env.BILLING_ENABLED) {
    throw new ServiceError(
      "billing_unavailable",
      "Billing is on: plans change through Stripe, not from the admin panel.",
    );
  }
  const before = await OrgSettingsModel.findOne({ orgId }, { plan: 1, planState: 1 }).lean();
  const result = await applyPlanChange(orgId, input.plan, {
    actorId: new Types.ObjectId(admin.id),
    reason: "admin",
  });
  if (!result.applied) {
    throw new ServiceError("validation", `${org.name} is already on ${PLAN_LABELS[input.plan]}.`);
  }
  await writeAdminAudit({
    admin,
    orgId,
    action: "admin.plan_changed",
    target: { type: "organization", id: orgId },
    reason: input.reason,
    changes: {
      before: { plan: before?.plan, planState: before?.planState },
      after: { plan: input.plan, readOnlyConnections: result.frozen },
    },
  });
  return result;
}

/**
 * Sets or clears per-org limit overrides. A number sets the override, `null` clears it (back to
 * the plan's value); keys left out are untouched. An override cannot express "unlimited": use a
 * large number.
 */
export async function setLimitOverrides(
  admin: AdminActor,
  input: {
    orgId: string;
    overrides: Partial<Record<OverridableLimitKey, number | null>>;
    reason: string;
  },
) {
  const { orgId } = await loadOrg(input.orgId);
  const $set: Record<string, number> = {};
  const $unset: Record<string, ""> = {};
  for (const [key, value] of Object.entries(input.overrides)) {
    if (value === undefined) continue;
    if (value === null) $unset[`limitOverrides.${key}`] = "";
    else $set[`limitOverrides.${key}`] = value;
  }
  if (Object.keys($set).length + Object.keys($unset).length === 0) {
    throw new ServiceError("validation", "Change at least one limit.");
  }
  await withTransaction(async (session) => {
    const before = await OrgSettingsModel.findOne({ orgId }, null, { session }).lean();
    if (!before) throw new ServiceError("not_found", "This workspace has no settings yet.");
    await OrgSettingsModel.updateOne(
      { orgId },
      {
        ...(Object.keys($set).length ? { $set } : {}),
        ...(Object.keys($unset).length ? { $unset } : {}),
      },
      { session },
    );
    const after = await OrgSettingsModel.findOne({ orgId }, null, { session }).lean();
    const e = computeEntitlements(after);
    await syncUsageAllowance(orgId, e.plan, session);
    await restoreConnections(orgId, e.limits.connections, session);
    await writeAdminAudit(
      {
        admin,
        orgId,
        action: "admin.limits_overridden",
        target: { type: "organization", id: orgId },
        reason: input.reason,
        changes: {
          before: { limitOverrides: before.limitOverrides ?? {} },
          after: { limitOverrides: after?.limitOverrides ?? {} },
        },
      },
      { session },
    );
  });
}

/**
 * Starts a Pro trial (Free orgs, even if they had one before) or extends the running one by
 * `days`. Paid plans have nothing to trial.
 */
export async function adminGrantTrial(
  admin: AdminActor,
  input: { orgId: string; days: number; reason: string },
) {
  const { orgId } = await loadOrg(input.orgId);
  const now = new Date();
  await withTransaction(async (session) => {
    const s = await OrgSettingsModel.findOne({ orgId }, null, { session }).lean();
    if (!s) throw new ServiceError("not_found", "This workspace has no settings yet.");
    const e = computeEntitlements(s, now);
    let action: "started" | "extended";
    let endsAt: Date;
    if (e.trial?.active) {
      action = "extended";
      endsAt = new Date(e.trial.endsAt.getTime() + input.days * DAY);
      await OrgSettingsModel.updateOne(
        { orgId },
        { $set: { "trial.endsAt": endsAt } },
        { session },
      );
    } else if (e.plan === "free") {
      action = "started";
      endsAt = new Date(now.getTime() + input.days * DAY);
      await OrgSettingsModel.updateOne(
        { orgId },
        {
          $set: {
            plan: "pro",
            planState: "trialing",
            trial: { startedAt: now, endsAt },
            pendingChange: null,
            "grace.overAllowanceSince": null,
          },
        },
        { session },
      );
      await syncUsageAllowance(orgId, "pro", session);
      await restoreConnections(orgId, PLAN_CATALOG.pro.limits.connections, session);
    } else {
      throw new ServiceError(
        "conflict",
        "This workspace is on a paid plan; there is nothing to trial.",
      );
    }
    await writeAdminAudit(
      {
        admin,
        orgId,
        action: action === "started" ? "admin.trial_started" : "admin.trial_extended",
        target: { type: "organization", id: orgId },
        reason: input.reason,
        changes: {
          before: { trialEndsAt: s.trial?.endsAt ?? null },
          after: { trialEndsAt: endsAt, days: input.days, defaultTrialDays: TRIAL_DAYS },
        },
      },
      { session },
    );
  });
}

export async function suspendOrg(admin: AdminActor, input: { orgId: string; reason: string }) {
  const { orgId } = await loadOrg(input.orgId);
  await withTransaction(async (session) => {
    const res = await OrgSettingsModel.updateOne(
      { orgId, suspended: null },
      {
        $set: {
          suspended: { at: new Date(), by: new Types.ObjectId(admin.id), reason: input.reason },
        },
      },
      { session },
    );
    if (res.matchedCount === 0) {
      throw new ServiceError(
        "conflict",
        "This workspace is already suspended (or has no settings).",
      );
    }
    await writeAdminAudit(
      {
        admin,
        orgId,
        action: "admin.org_suspended",
        target: { type: "organization", id: orgId },
        reason: input.reason,
        changes: { before: { suspended: false }, after: { suspended: true } },
      },
      { session },
    );
  });
}

export async function unsuspendOrg(admin: AdminActor, input: { orgId: string; reason?: string }) {
  const { orgId } = await loadOrg(input.orgId);
  await withTransaction(async (session) => {
    const res = await OrgSettingsModel.updateOne(
      { orgId, suspended: { $ne: null } },
      { $set: { suspended: null } },
      { session },
    );
    if (res.matchedCount === 0)
      throw new ServiceError("conflict", "This workspace is not suspended.");
    await writeAdminAudit(
      {
        admin,
        orgId,
        action: "admin.org_unsuspended",
        target: { type: "organization", id: orgId },
        reason: input.reason,
        changes: { before: { suspended: true }, after: { suspended: false } },
      },
      { session },
    );
  });
}
