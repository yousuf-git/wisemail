import "server-only";

import { Types } from "mongoose";

import { AiError } from "@/lib/ai/errors";
import { buildAnomalyPrompt, type AnomalyFacts } from "@/lib/ai/prompts/anomaly";
import { runAi } from "@/lib/ai/run";
import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { AlertIncidentModel } from "@/lib/db/models/alert-incidents";
import { EmailModel } from "@/lib/db/models/emails";
import { MetricRollupModel } from "@/lib/db/models/metric-rollups";
import type { IncidentDTO } from "@/lib/dto/alert";
import { getIncident } from "./alerts";
import { ServiceError } from "./errors";
import { projectFilter } from "./project-scope";

export type IncidentExplanationDTO = { text: string; generatedAt: string; cached: boolean };

const HOUR = 3_600_000;
const oid = (id: string) => new Types.ObjectId(id);
const ADDRESS = /[^\s<>"',;]+@[^\s<>"',;]+/g;

/** Provider messages sometimes quote the recipient: keep the reason, drop the address. */
export const redactReason = (message: string) =>
  message.replace(ADDRESS, "[address]").replace(/\s+/g, " ").trim().slice(0, 140);

const domainOfAddress = (address: string) => address.split("@")[1]?.toLowerCase() ?? "";

const SUMMABLE = ["sent", "delivered", "bounced_hard", "bounced_soft", "complained"] as const;

async function sumRollups(
  ctx: OrgContext,
  scope: { connectionId?: string; domainId?: string },
  from: Date,
  to: Date,
) {
  const rows = await MetricRollupModel.aggregate<Record<string, number>>([
    {
      $match: {
        orgId: oid(ctx.org.id),
        ...projectFilter(ctx),
        granularity: "hour",
        "dimension.kind": "all",
        "dimension.value": "",
        bucketStart: { $gte: from, $lt: to },
        ...(scope.connectionId ? { connectionId: oid(scope.connectionId) } : {}),
        ...(scope.domainId ? { domainId: oid(scope.domainId) } : {}),
      },
    },
    {
      $group: {
        _id: null,
        ...Object.fromEntries(SUMMABLE.map((k) => [k, { $sum: `$counts.${k}` }])),
      },
    },
  ]);
  const r = rows[0] ?? {};
  const n = (k: string) => r[k] ?? 0;
  return {
    sent: n("sent"),
    delivered: n("delivered"),
    bounced: n("bounced_hard") + n("bounced_soft"),
    hard: n("bounced_hard"),
    soft: n("bounced_soft"),
    complained: n("complained"),
  };
}

/**
 * What the model may see about an incident (PRD §5.10 "grounded in our event data"): rollup
 * totals for the window and the one before it, bounce kinds, the commonest provider reasons
 * (addresses redacted) and which recipient domains the bounces went to. No subjects, bodies or
 * recipient addresses.
 */
export async function gatherIncidentFacts(
  ctx: OrgContext,
  incident: IncidentDTO,
  now: Date = new Date(),
): Promise<AnomalyFacts> {
  const c = incident.context;
  const hours = Math.min(48, Math.max(1, Math.ceil((c.windowMinutes ?? 1440) / 60)));
  const end = new Date(
    Math.floor((incident.resolvedAt ? new Date(incident.resolvedAt) : now).getTime() / HOUR) *
      HOUR +
      HOUR,
  );
  const start = new Date(end.getTime() - hours * HOUR);
  const scope = { connectionId: c.connectionId, domainId: c.domainId };
  const [current, previous] = await Promise.all([
    sumRollups(ctx, scope, start, end),
    sumRollups(ctx, scope, new Date(start.getTime() - hours * HOUR), start),
  ]);

  const bounced = await EmailModel.find(
    {
      orgId: oid(ctx.org.id),
      ...projectFilter(ctx),
      direction: "outbound",
      status: "bounced",
      bouncedAt: { $gte: start, $lt: end },
      ...(c.connectionId ? { connectionId: oid(c.connectionId) } : {}),
      ...(c.domainId ? { domainId: oid(c.domainId) } : {}),
    },
    { bounce: 1, to: 1 },
  )
    .limit(500)
    .lean();
  const reasons = new Map<string, number>();
  const domains = new Map<string, number>();
  for (const email of bounced) {
    const reason = redactReason(email.bounce?.message ?? email.bounce?.subType ?? "");
    if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    for (const to of email.to.slice(0, 1)) {
      const d = domainOfAddress(to.address);
      if (d) domains.set(d, (domains.get(d) ?? 0) + 1);
    }
  }
  const top = <K>(map: Map<K, number>, n: number) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  return {
    alert: {
      title: incident.title,
      kind: incident.kind,
      observedValue: incident.observedValue,
      threshold: c.threshold ?? null,
    },
    window: {
      hours,
      sent: current.sent,
      delivered: current.delivered,
      bounced: current.bounced,
      complained: current.complained,
    },
    previous: previous.sent ? { sent: previous.sent, bounced: previous.bounced } : null,
    bounceTypes: { hard: current.hard, soft: current.soft },
    topBounceReasons: top(reasons, 3).map(([reason, count]) => ({ reason, count })),
    topRecipientDomains: top(domains, 3).map(([domain, count]) => ({
      domain,
      bounced: count,
      share: bounced.length ? Math.round((count / bounced.length) * 100) / 100 : 0,
    })),
    domain: c.domainName ?? null,
  };
}

/**
 * Short explanation of an incident. Cached on the incident: opening the page again is free;
 * `refresh` asks again (and costs credits again).
 */
export async function explainIncident(
  ctx: OrgContext,
  incidentId: string,
  options: { refresh?: boolean } = {},
): Promise<IncidentExplanationDTO> {
  authorize(ctx, "ai:use");
  const incident = await getIncident(ctx, incidentId); // authorizes alertRule:read, project scope
  if (!incident) throw new ServiceError("not_found", "Incident not found.");
  await connectDb();
  const orgId = oid(ctx.org.id);

  if (!options.refresh) {
    const cached = await AlertIncidentModel.findOne(
      { _id: incident.id, orgId },
      { aiExplanation: 1 },
    ).lean();
    if (cached?.aiExplanation?.text && cached.aiExplanation.generatedAt) {
      return {
        text: cached.aiExplanation.text,
        generatedAt: cached.aiExplanation.generatedAt.toISOString(),
        cached: true,
      };
    }
  }

  const facts = await gatherIncidentFacts(ctx, incident);
  if (facts.window.sent === 0 && facts.window.bounced === 0 && incident.kind.endsWith("_rate")) {
    // Nothing to ground an explanation in: say so without spending credits.
    throw new AiError(
      "ai_no_content",
      "There isn't enough delivery data around this alert to explain it yet.",
    );
  }
  const { data, model } = await runAi({
    orgId,
    userId: oid(ctx.user.id),
    bundle: buildAnomalyPrompt(facts),
    refs: { incidentId: oid(incident.id) },
  });
  const generatedAt = new Date();
  await AlertIncidentModel.updateOne(
    { _id: incident.id, orgId },
    { $set: { aiExplanation: { text: data.explanation, model, generatedAt } } },
  );
  return { text: data.explanation, generatedAt: generatedAt.toISOString(), cached: false };
}
