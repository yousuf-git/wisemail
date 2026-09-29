import "server-only";

import mongoose, { Types } from "mongoose";

import { FAILING_DOMAIN_STATUSES, windowLabel, type AlertKind } from "@/lib/alerts/kinds";
import { connectDb } from "@/lib/db/connect";
import { AlertIncidentModel } from "@/lib/db/models/alert-incidents";
import { AlertRuleModel, type AlertRuleDoc } from "@/lib/db/models/alert-rules";
import { ConnectionModel } from "@/lib/db/models/connections";
import { DomainModel } from "@/lib/db/models/domains";
import { EmailModel } from "@/lib/db/models/emails";
import { MetricRollupModel } from "@/lib/db/models/metric-rollups";
import { publish } from "@/lib/realtime/publish";
import { topics } from "@/lib/realtime/topics";
import { bucketStart } from "./rollups";
import { absoluteUrl, createNotifications, sendPendingNotificationEmails } from "./notifications";
import { sendAlertEmail } from "./system-email";

/**
 * Alert evaluation (TRD §2.8). `evaluateOrgAlerts` looks at every enabled rule of one org and
 * makes the incident table match reality:
 *
 * - each rule yields a set of *firing subjects* (a connection + domain for rate rules, a
 *   connection for silence and status, a domain for domain status), each with a dedupe key
 *   `<ruleId>:<subject>`;
 * - a firing subject without an active incident opens one (and fans out notifications); one
 *   that already has an active incident only has its observed value refreshed, so repeated runs
 *   never notify twice;
 * - an active incident whose subject no longer fires is resolved (and the same people hear it).
 *
 * It is idempotent and safe to run concurrently: the partial unique index on active dedupe keys
 * makes a racing second insert lose. Rate rules read `metric_rollups` hourly buckets, so a
 * window is measured in whole hours: it covers the current hour plus every full hour back to
 * `floor_hour(now - window)`.
 */

export type Finding = {
  /** Stable identity of what fired, unique within the rule. */
  subject: string;
  title: string;
  summary: string;
  observed: number;
  projectId: Types.ObjectId | null;
  context: Record<string, unknown>;
};

export type EvaluationSummary = {
  rules: number;
  opened: number;
  resolved: number;
  refreshed: number;
};

const oid = (v: string | Types.ObjectId) => (typeof v === "string" ? new Types.ObjectId(v) : v);
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

type RuleLike = Pick<AlertRuleDoc, "kind" | "scope" | "condition" | "name"> & {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
};

/* ------------------------------------------------------------------------------------------ */
/* Rollup-based rules                                                                          */
/* ------------------------------------------------------------------------------------------ */

type Group = {
  connectionId: Types.ObjectId;
  domainId: Types.ObjectId | null;
  projectId: Types.ObjectId | null;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  delayed: number;
};

/** Sums the hourly `all` buckets in the window per connection + domain, within the rule's scope. */
export async function rollupGroups(rule: RuleLike, now: Date): Promise<Group[]> {
  const from = bucketStart(new Date(now.getTime() - rule.condition.windowMinutes * 60_000), "hour");
  const scope = rule.scope ?? {};
  const rows = await MetricRollupModel.aggregate<{
    _id: { connectionId: Types.ObjectId; domainId: Types.ObjectId | null };
    projectId: Types.ObjectId | null;
    sent: number;
    delivered: number;
    bounced: number;
    complained: number;
    delayed: number;
  }>([
    {
      $match: {
        orgId: rule.orgId,
        granularity: "hour",
        "dimension.kind": "all",
        bucketStart: { $gte: from, $lte: now },
        ...(scope.connectionIds?.length ? { connectionId: { $in: scope.connectionIds } } : {}),
        ...(scope.domainIds?.length ? { domainId: { $in: scope.domainIds } } : {}),
        ...(scope.projectIds?.length ? { projectId: { $in: scope.projectIds } } : {}),
      },
    },
    {
      $group: {
        _id: { connectionId: "$connectionId", domainId: "$domainId" },
        projectId: { $last: "$projectId" },
        sent: { $sum: "$counts.sent" },
        delivered: { $sum: "$counts.delivered" },
        bounced: {
          $sum: {
            // Counters are only created when first incremented, so a missing one is null.
            $add: [
              { $ifNull: ["$counts.bounced_hard", 0] },
              { $ifNull: ["$counts.bounced_soft", 0] },
            ],
          },
        },
        complained: { $sum: "$counts.complained" },
        delayed: { $sum: "$counts.delivery_delayed" },
      },
    },
  ]);
  return rows.map((r) => ({
    connectionId: r._id.connectionId,
    domainId: r._id.domainId ?? null,
    projectId: r.projectId ?? null,
    sent: r.sent,
    delivered: r.delivered,
    bounced: r.bounced,
    complained: r.complained,
    delayed: r.delayed,
  }));
}

/**
 * Emails that went out in the window: Resend events can arrive for mail we never saw sent (sent
 * before the connection existed), so the denominator never falls below what we know landed.
 */
export const volumeOf = (g: Pick<Group, "sent" | "delivered" | "bounced">) =>
  Math.max(g.sent, g.delivered + g.bounced);

async function names(orgId: Types.ObjectId, groups: Group[]) {
  const [connections, domains] = await Promise.all([
    ConnectionModel.find(
      { orgId, _id: { $in: [...new Set(groups.map((g) => String(g.connectionId)))].map(oid) } },
      { name: 1 },
    ).lean(),
    DomainModel.find(
      {
        orgId,
        _id: { $in: groups.flatMap((g) => (g.domainId ? [g.domainId] : [])) },
      },
      { name: 1 },
    ).lean(),
  ]);
  return {
    connection: new Map(connections.map((c) => [String(c._id), c.name])),
    domain: new Map(domains.map((d) => [String(d._id), d.name])),
  };
}

const SAMPLE_STATUS = {
  bounce_rate: { status: "bounced", at: "bouncedAt" },
  complaint_rate: { status: "complained", at: "complainedAt" },
  complaint_any: { status: "complained", at: "complainedAt" },
  delivery_delay_rate: { status: "delivery_delayed", at: "createdAt" },
} as const;

async function sampleEmails(rule: RuleLike, g: Group, from: Date): Promise<string[]> {
  const cfg = SAMPLE_STATUS[rule.kind as keyof typeof SAMPLE_STATUS];
  if (!cfg) return [];
  const rows = await EmailModel.find(
    {
      orgId: rule.orgId,
      connectionId: g.connectionId,
      domainId: g.domainId,
      status: cfg.status,
      [cfg.at]: { $gte: from },
    },
    { _id: 1 },
  )
    .sort({ [cfg.at]: -1 })
    .limit(5)
    .lean();
  return rows.map((r) => r._id.toHexString());
}

async function evaluateRollupRule(rule: RuleLike, now: Date): Promise<Finding[]> {
  const kind = rule.kind as AlertKind;
  const { threshold, windowMinutes, minVolume } = rule.condition;
  const groups = await rollupGroups(rule, now);
  if (groups.length === 0) return [];
  const label = await names(rule.orgId, groups);
  const from = new Date(now.getTime() - windowMinutes * 60_000);
  const win = windowLabel(windowMinutes);
  const inLast = win === "hour" ? "the last hour" : `the last ${win}`;
  const findings: Finding[] = [];

  for (const g of groups) {
    const volume = volumeOf(g);
    if (volume < Math.max(minVolume ?? 0, kind === "complaint_any" ? 0 : 1)) continue;
    let observed: number;
    let numerator: number;
    if (kind === "bounce_rate") numerator = g.bounced;
    else if (kind === "complaint_rate" || kind === "complaint_any") numerator = g.complained;
    else numerator = g.delayed;
    if (kind === "complaint_any") observed = numerator;
    else observed = (numerator / volume) * 100;

    const firing = rule.condition.operator === "lt" ? observed < threshold : observed > threshold;
    if (!firing) continue;

    const domainName = g.domainId ? label.domain.get(String(g.domainId)) : undefined;
    const connectionName = label.connection.get(String(g.connectionId)) ?? "a connection";
    const where = domainName ?? connectionName;
    let title: string;
    let summary: string;
    if (kind === "complaint_any") {
      title = `${numerator} ${numerator === 1 ? "complaint" : "complaints"} on ${where}`;
      summary = `${numerator} ${numerator === 1 ? "recipient" : "recipients"} marked email from ${where} as spam in ${inLast}.`;
    } else {
      const noun =
        kind === "bounce_rate"
          ? "Bounce rate"
          : kind === "complaint_rate"
            ? "Complaint rate"
            : "Delayed deliveries";
      const verb =
        kind === "bounce_rate"
          ? "bounced"
          : kind === "complaint_rate"
            ? "drew complaints"
            : "were delayed";
      title = `${noun} is ${pct(observed)} on ${where}`;
      summary = `${numerator} of ${volume} emails ${verb} in ${inLast} (${pct(observed)}). Your rule alerts above ${pct(threshold)}.`;
    }
    findings.push({
      subject: `${g.connectionId}:${g.domainId ?? "-"}`,
      title,
      summary,
      observed: Math.round(observed * 100) / 100,
      projectId: g.projectId,
      context: {
        connectionId: String(g.connectionId),
        connectionName,
        ...(g.domainId ? { domainId: String(g.domainId), domainName } : {}),
        threshold,
        windowMinutes,
        volume,
        sampleEmailIds: await sampleEmails(rule, g, from),
      },
    });
  }
  return findings;
}

/* ------------------------------------------------------------------------------------------ */
/* Connection and domain rules                                                                 */
/* ------------------------------------------------------------------------------------------ */

const REASONS: Record<string, string> = {
  key_revoked: "its Resend API key was revoked",
  webhook_slot_unavailable: "Resend has no free webhook slot for it",
};

async function evaluateSilence(rule: RuleLike, now: Date): Promise<Finding[]> {
  const scope = rule.scope?.connectionIds ?? [];
  const connections = await ConnectionModel.find({
    orgId: rule.orgId,
    deletedAt: null,
    // A connection that already needs attention is a different problem (and rule).
    status: "active",
    "webhook.resendId": { $exists: true },
    ...(scope.length ? { _id: { $in: scope } } : {}),
  }).lean();
  const window = rule.condition.windowMinutes * 60_000;
  const findings: Finding[] = [];
  for (const c of connections) {
    const reference = c.lastEventAt ?? (c as { createdAt?: Date }).createdAt;
    if (!reference) continue;
    const silentMs = now.getTime() - reference.getTime();
    if (silentMs <= window) continue;
    const hours = Math.floor(silentMs / 3_600_000);
    findings.push({
      subject: `conn:${c._id}`,
      title: `${c.name} has been silent for ${hours >= 48 ? `${Math.floor(hours / 24)} days` : `${hours} hours`}`,
      summary: c.lastEventAt
        ? `No webhook events from ${c.name} since ${c.lastEventAt.toISOString()}. The webhook may have been removed in Resend, or nothing was sent.`
        : `${c.name} has not reported a single event since it was connected. Check that its webhook still exists in Resend.`,
      observed: hours,
      projectId: null,
      context: {
        connectionId: String(c._id),
        connectionName: c.name,
        threshold: rule.condition.windowMinutes / 60,
        windowMinutes: rule.condition.windowMinutes,
      },
    });
  }
  return findings;
}

async function evaluateConnectionStatus(rule: RuleLike): Promise<Finding[]> {
  const scope = rule.scope?.connectionIds ?? [];
  const connections = await ConnectionModel.find({
    orgId: rule.orgId,
    deletedAt: null,
    status: "needs_attention",
    ...(scope.length ? { _id: { $in: scope } } : {}),
  }).lean();
  return connections.map((c) => ({
    subject: `conn:${c._id}`,
    title: `${c.name} needs attention`,
    summary: `${c.name} stopped syncing${c.statusReason && REASONS[c.statusReason] ? ` because ${REASONS[c.statusReason]}` : ""}. Open the connection to fix it.`,
    observed: 1,
    projectId: null,
    context: { connectionId: String(c._id), connectionName: c.name },
  }));
}

async function evaluateDomainStatus(rule: RuleLike): Promise<Finding[]> {
  const s = rule.scope ?? {};
  const domains = await DomainModel.find({
    orgId: rule.orgId,
    status: { $in: [...FAILING_DOMAIN_STATUSES] },
    ...(s.domainIds?.length ? { _id: { $in: s.domainIds } } : {}),
    ...(s.connectionIds?.length ? { connectionId: { $in: s.connectionIds } } : {}),
    ...(s.projectIds?.length ? { projectId: { $in: s.projectIds } } : {}),
  }).lean();
  return domains.map((d) => ({
    subject: `domain:${d._id}`,
    title: `${d.name} failed verification`,
    summary: `Resend reports ${d.name} as ${d.status.replace(/_/g, " ")}. Check its DNS records so email keeps flowing.`,
    observed: 1,
    projectId: d.projectId ?? null,
    context: {
      connectionId: String(d.connectionId),
      domainId: String(d._id),
      domainName: d.name,
    },
  }));
}

export async function evaluateRule(rule: RuleLike, now: Date): Promise<Finding[]> {
  switch (rule.kind as AlertKind) {
    case "bounce_rate":
    case "complaint_rate":
    case "complaint_any":
    case "delivery_delay_rate":
      return evaluateRollupRule(rule, now);
    case "connection_silent":
      return evaluateSilence(rule, now);
    case "connection_status":
      return evaluateConnectionStatus(rule);
    case "domain_status":
      return evaluateDomainStatus(rule);
    default:
      return [];
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Incidents                                                                                   */
/* ------------------------------------------------------------------------------------------ */

async function orgSlug(orgId: Types.ObjectId): Promise<string> {
  const org = await mongoose.connection
    .collection("organization")
    .findOne({ _id: orgId }, { projection: { slug: 1, name: 1 } });
  return String(org?.slug ?? "");
}

async function openIncident(
  rule: RuleLike & { channels?: AlertRuleDoc["channels"] },
  finding: Finding,
  now: Date,
  slug: string,
): Promise<"opened" | "refreshed"> {
  const dedupKey = `${rule._id}:${finding.subject}`;
  const set = {
    observedValue: finding.observed,
    lastEvaluatedAt: now,
    summary: finding.summary,
    title: finding.title,
    context: finding.context,
  };
  const res = await AlertIncidentModel.findOneAndUpdate(
    { orgId: rule.orgId, dedupKey, active: true },
    {
      $set: set,
      $setOnInsert: {
        ruleId: rule._id,
        ruleName: rule.name,
        kind: rule.kind,
        status: "open",
        openedAt: now,
        projectId: finding.projectId,
      },
    },
    { upsert: true, includeResultMetadata: true, returnDocument: "after" },
  ).catch((error: { code?: number }) => {
    // A concurrent evaluation inserted first (unique index): the incident exists, so refresh.
    if (error?.code === 11000) return null;
    throw error;
  });
  if (!res || res.lastErrorObject?.updatedExisting) return "refreshed";
  const incident = res.value!;

  const link = `/${slug}/alerts/incidents/${incident._id}`;
  const channels = rule.channels ?? { inApp: true, emailMembers: true, email: [] };
  await createNotifications({
    orgId: rule.orgId,
    type: "incident_opened",
    title: finding.title,
    body: finding.summary,
    link,
    refs: {
      incidentId: incident._id,
      connectionId: finding.context.connectionId ? oid(String(finding.context.connectionId)) : null,
      domainId: finding.context.domainId ? oid(String(finding.context.domainId)) : null,
    },
    projectId: finding.projectId,
    audience: { permission: "alertRule:read" },
    channels: { inApp: channels.inApp, email: channels.emailMembers },
    dedupKey: `incident:${incident._id}:opened`,
    now,
  });
  await publish({ orgId: rule.orgId, topics: [topics.incidents(rule.orgId)] });

  // Extra addresses on the rule always hear about it once, when it opens.
  const orgName = String(
    (await mongoose.connection.collection("organization").findOne({ _id: rule.orgId }))?.name ?? "",
  );
  for (const to of channels.email ?? []) {
    try {
      await sendAlertEmail(to, {
        orgName,
        title: finding.title,
        summary: finding.summary,
        url: absoluteUrl(link),
        state: "open",
        external: true,
      });
    } catch (error) {
      console.error("[alerts] could not email the rule's extra address", error);
    }
  }
  return "opened";
}

async function resolveIncident(
  incident: {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    ruleId: Types.ObjectId;
    title: string;
    projectId?: Types.ObjectId | null;
  },
  rule: { channels?: AlertRuleDoc["channels"] } | null,
  now: Date,
  slug: string,
): Promise<boolean> {
  const res = await AlertIncidentModel.updateOne(
    { _id: incident._id, active: true },
    { $set: { active: false, status: "resolved", resolvedAt: now } },
  );
  if (res.modifiedCount === 0) return false;
  const channels = rule?.channels ?? { inApp: true, emailMembers: true };
  await createNotifications({
    orgId: incident.orgId,
    type: "incident_resolved",
    title: `Resolved: ${incident.title}`,
    body: "The condition cleared on its own.",
    link: `/${slug}/alerts/incidents/${incident._id}`,
    refs: { incidentId: incident._id },
    projectId: incident.projectId ?? null,
    audience: { permission: "alertRule:read" },
    channels: { inApp: channels.inApp, email: channels.emailMembers },
    dedupKey: `incident:${incident._id}:resolved`,
    now,
  });
  await publish({ orgId: incident.orgId, topics: [topics.incidents(incident.orgId)] });
  return true;
}

/** Evaluates every enabled rule of `orgId` and reconciles incidents. */
export async function evaluateOrgAlerts(
  orgIdInput: string | Types.ObjectId,
  options: { now?: Date } = {},
): Promise<EvaluationSummary> {
  await connectDb();
  const orgId = oid(orgIdInput);
  const now = options.now ?? new Date();
  const summary: EvaluationSummary = { rules: 0, opened: 0, resolved: 0, refreshed: 0 };

  const rules = await AlertRuleModel.find({ orgId, enabled: true }).lean();
  // Rules that were disabled or deleted must not leave incidents open forever.
  const allRules = new Map(
    (await AlertRuleModel.find({ orgId }, { channels: 1, enabled: 1 }).lean()).map((r) => [
      String(r._id),
      r,
    ]),
  );
  const slug = await orgSlug(orgId);

  for (const rule of rules) {
    summary.rules += 1;
    const findings = await evaluateRule(rule as unknown as RuleLike, now);
    const firing = new Set<string>();
    for (const finding of findings) {
      firing.add(`${rule._id}:${finding.subject}`);
      const outcome = await openIncident(rule as never, finding, now, slug);
      summary[outcome] += 1;
    }
    const active = await AlertIncidentModel.find({ orgId, ruleId: rule._id, active: true }).lean();
    for (const incident of active) {
      if (firing.has(incident.dedupKey)) continue;
      if (await resolveIncident(incident, rule, now, slug)) summary.resolved += 1;
    }
  }

  // Incidents of disabled or deleted rules close quietly (no "resolved" notification).
  const orphans = await AlertIncidentModel.find({ orgId, active: true }).lean();
  for (const incident of orphans) {
    const rule = allRules.get(String(incident.ruleId));
    if (rule?.enabled) continue;
    await AlertIncidentModel.updateOne(
      { _id: incident._id, active: true },
      { $set: { active: false, status: "resolved", resolvedAt: now } },
    );
    summary.resolved += 1;
  }

  if (summary.opened + summary.resolved > 0) {
    await sendPendingNotificationEmails({ orgId, now });
  }
  return summary;
}

/** Org ids with at least one enabled rule (the periodic check's work list). */
export async function orgsWithEnabledRules(): Promise<string[]> {
  await connectDb();
  const ids = await AlertRuleModel.distinct("orgId", { enabled: true });
  return ids.map(String);
}
