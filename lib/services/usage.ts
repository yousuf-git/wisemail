import "server-only";

import { Types } from "mongoose";
import mongoose from "mongoose";

import type { UsageSummary, ConnectionHealth } from "@/components/app/usage-tile";
import type { PlanBannerData } from "@/components/billing/plan-banner";
import { getAiBalance } from "@/lib/ai/credits";
import { trackedTotal } from "@/lib/billing/metering";
import { getEntitlements } from "@/lib/billing/entitlements";
import { FREE_GRACE_DAYS, overageCostUsd } from "@/lib/billing/plans";
import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { AiUsageModel } from "@/lib/db/models/ai-usage";
import { AlertRuleModel } from "@/lib/db/models/alert-rules";
import { ConnectionModel, type ConnectionStatus } from "@/lib/db/models/connections";
import { calendarMonth } from "@/lib/db/models/org-settings";
import { ProjectModel } from "@/lib/db/models/projects";
import { UsagePeriodModel } from "@/lib/db/models/usage-periods";
import type { UsageDayDTO, UsageMeterDTO, UsageOverviewDTO } from "@/lib/dto/billing";

const DAY = 86_400_000;
const nf = new Intl.NumberFormat("en-US");

const HEALTH: Record<ConnectionStatus, ConnectionHealth> = {
  active: "healthy",
  provisioning: "attention",
  needs_attention: "attention",
  read_only: "down",
  disabled: "down",
};

/** The period containing `now`; a stale stored period counts as the current calendar month. */
function currentPeriod(billingPeriod: { start: Date; end: Date }, now: Date) {
  return billingPeriod.end.getTime() > now.getTime() ? billingPeriod : calendarMonth(now);
}

/**
 * Real data for the sidebar tile: plan, live connections (health dots) against the plan limit,
 * tracked emails split by stream against the allowance, and the AI credits still available.
 */
export async function getUsageSummary(ctx: OrgContext): Promise<UsageSummary> {
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  const now = new Date();
  const e = await getEntitlements(orgId, { now });
  const period = currentPeriod(e.billingPeriod, now);
  const [connections, usage, ai] = await Promise.all([
    ConnectionModel.find({ orgId, deletedAt: null }, { status: 1 }).sort({ _id: 1 }).lean(),
    UsagePeriodModel.findOne({ orgId, periodStart: period.start }, { emailsTracked: 1 }).lean(),
    e.features.ai ? getAiBalance(orgId, now).catch(() => null) : Promise.resolve(null),
  ]);
  const t = usage?.emailsTracked;
  const total = trackedTotal(t);
  const allowance = e.limits.emailsTrackedPerMonth;
  const overEmails = Math.max(0, total - allowance);
  const paid = e.overagePer10kUsd !== null;
  const usageHref = `/${ctx.org.slug}/settings/usage`;
  const banner: PlanBannerData | null =
    overEmails > 0 && ctx.can("usage:read")
      ? {
          kind: "over_allowance",
          message: paid
            ? `You are ${nf.format(overEmails)} tracked emails over this period's allowance. Nothing is dropped; overage is billed at the end of the period.`
            : `You are ${nf.format(overEmails)} tracked emails over the Free allowance. Nothing is dropped, but after a ${FREE_GRACE_DAYS}-day grace period the extra emails keep 7 days of history.`,
          action: { label: "View usage", href: usageHref },
        }
      : e.trial?.active && ctx.can("billing:manage")
        ? {
            kind: "trial",
            message: `Pro trial: ${e.trial.daysLeft} ${e.trial.daysLeft === 1 ? "day" : "days"} left. After that the workspace moves to Free.`,
            action: { label: "Choose a plan", href: `/${ctx.org.slug}/settings/billing` },
          }
        : null;
  return {
    banner,
    overageCostUsd: paid && overEmails > 0 ? overageCostUsd(e.plan, overEmails) : null,
    plan: e.trial?.active ? `${e.planLabel} trial` : e.planLabel,
    connections: connections.map((c) => ({ id: c._id.toHexString(), health: HEALTH[c.status] })),
    connectionLimit: e.limits.connections,
    used: {
      transactional: t?.transactional ?? 0,
      broadcast: t?.broadcast ?? 0,
      inbound: t?.inbound ?? 0,
    },
    allowance: e.limits.emailsTrackedPerMonth,
    aiCredits: ai ? ai.available : null,
  };
}

async function resourceMeters(orgId: Types.ObjectId, limits: Record<string, number | null>) {
  const db = mongoose.connection;
  const [connections, members, pending, projects, alertRules] = await Promise.all([
    ConnectionModel.countDocuments({ orgId, deletedAt: null }),
    db.collection("member").countDocuments({ organizationId: orgId }),
    db
      .collection("invitation")
      .countDocuments({ organizationId: orgId, status: "pending", expiresAt: { $gt: new Date() } }),
    ProjectModel.countDocuments({ orgId, deletedAt: null }),
    AlertRuleModel.countDocuments({ orgId }),
  ]);
  const meters: UsageMeterDTO[] = [
    { key: "connections", label: "Resend accounts", used: connections, limit: limits.connections! },
    {
      key: "members",
      label: "Members and invitations",
      used: members + pending,
      limit: limits.members!,
    },
    { key: "projects", label: "Projects", used: projects, limit: limits.projects! },
    { key: "alertRules", label: "Alert rules", used: alertRules, limit: limits.alertRules! },
  ];
  return meters;
}

async function aiBreakdown(orgId: Types.ObjectId, start: Date, end: Date) {
  const range = { orgId, createdAt: { $gte: start, $lt: end } };
  const [byFeature, byUser] = await Promise.all([
    AiUsageModel.aggregate<{ _id: string; credits: number }>([
      { $match: range },
      { $group: { _id: "$feature", credits: { $sum: "$credits" } } },
      { $sort: { credits: -1 } },
    ]),
    AiUsageModel.aggregate<{ _id: Types.ObjectId | null; credits: number }>([
      { $match: range },
      { $group: { _id: "$userId", credits: { $sum: "$credits" } } },
      { $sort: { credits: -1 } },
      { $limit: 20 },
    ]),
  ]);
  const userIds = byUser.map((u) => u._id).filter((id): id is Types.ObjectId => !!id);
  const users = userIds.length
    ? await mongoose.connection
        .collection("user")
        .find({ _id: { $in: userIds } }, { projection: { name: 1, email: 1 } })
        .toArray()
    : [];
  const names = new Map(
    users.map((u) => [String(u._id), (u.name as string) || (u.email as string)]),
  );
  return {
    byFeature: byFeature.map((f) => ({ feature: f._id, credits: f.credits })),
    byMember: byUser.map((u) => ({
      userId: u._id ? String(u._id) : null,
      name: u._id ? (names.get(String(u._id)) ?? "Former member") : "Background jobs",
      credits: u.credits,
    })),
  };
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Settings → Usage: meters, daily chart, projection, AI credits, resources and history. */
export async function getUsageOverview(ctx: OrgContext): Promise<UsageOverviewDTO> {
  authorize(ctx, "usage:read");
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  const now = new Date();
  const e = await getEntitlements(orgId, { now });
  const period = currentPeriod(e.billingPeriod, now);
  const [doc, history, resources, ai, aiBalance] = await Promise.all([
    UsagePeriodModel.findOne({ orgId, periodStart: period.start }).lean(),
    UsagePeriodModel.find({ orgId, periodStart: { $lt: period.start } })
      .sort({ periodStart: -1 })
      .limit(12)
      .lean(),
    resourceMeters(orgId, e.limits),
    aiBreakdown(orgId, period.start, period.end),
    e.features.ai ? getAiBalance(orgId, now).catch(() => null) : Promise.resolve(null),
  ]);

  const t = doc?.emailsTracked;
  const tracked = {
    transactional: t?.transactional ?? 0,
    broadcast: t?.broadcast ?? 0,
    inbound: t?.inbound ?? 0,
    total: trackedTotal(t),
  };
  const allowance = e.limits.emailsTrackedPerMonth;

  const daysTotal = Math.max(1, Math.round((period.end.getTime() - period.start.getTime()) / DAY));
  const elapsedMs = Math.min(now.getTime(), period.end.getTime()) - period.start.getTime();
  const daysElapsed = Math.min(daysTotal, Math.max(1, Math.ceil(elapsedMs / DAY)));
  const dailyDoc = (doc?.daily ?? {}) as Record<
    string,
    { transactional?: number; broadcast?: number; inbound?: number }
  >;
  const daily: UsageDayDTO[] = [];
  for (let i = 0; i < daysTotal; i++) {
    const date = dayKey(new Date(period.start.getTime() + i * DAY));
    const d = dailyDoc[date];
    daily.push({
      date,
      transactional: d?.transactional ?? 0,
      broadcast: d?.broadcast ?? 0,
      inbound: d?.inbound ?? 0,
    });
  }

  const elapsedFraction = Math.max(elapsedMs / DAY, 1);
  const monthEnd = Math.round((tracked.total / elapsedFraction) * daysTotal);
  const projectedOver = Math.max(0, monthEnd - allowance);
  const overEmails = Math.max(0, tracked.total - allowance);
  const paid = e.overagePer10kUsd !== null;
  const since = e.grace.overAllowanceSince;
  const graceEndsAt = !paid && since ? new Date(since.getTime() + FREE_GRACE_DAYS * DAY) : null;

  return {
    plan: { id: e.plan, label: e.planLabel },
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      daysElapsed,
      daysTotal,
    },
    tracked,
    allowance,
    daily,
    projection: {
      monthEnd,
      over: projectedOver,
      overageCostUsd: paid ? overageCostUsd(e.plan, projectedOver) : null,
    },
    overage: {
      emails: overEmails,
      costUsd: paid ? overageCostUsd(e.plan, overEmails) : null,
      graceEndsAt: graceEndsAt?.toISOString() ?? null,
      graceEnded: !!graceEndsAt && graceEndsAt.getTime() <= now.getTime(),
    },
    ai: {
      enabled: e.features.ai,
      allowance: aiBalance?.allowance ?? e.limits.aiCreditsPerMonth,
      used: aiBalance?.used ?? 0,
      packs: aiBalance?.packs ?? 0,
      ...ai,
    },
    resources,
    history: history.map((h) => {
      const ht = h.emailsTracked;
      return {
        periodStart: h.periodStart.toISOString(),
        periodEnd: h.periodEnd.toISOString(),
        plan: h.plan,
        allowance: h.allowance,
        transactional: ht?.transactional ?? 0,
        broadcast: ht?.broadcast ?? 0,
        inbound: ht?.inbound ?? 0,
        total: trackedTotal(ht),
        overage: h.overage?.emails ?? 0,
      };
    }),
  };
}
