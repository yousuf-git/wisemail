import "server-only";

import { Types } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { checkDomainDns, type DnsCheckResult } from "@/lib/dns/check";
import { createNodeResolver, type DnsResolver } from "@/lib/dns/resolver";
import { connectDb } from "@/lib/db/connect";
import { AlertRuleModel } from "@/lib/db/models/alert-rules";
import { ConnectionModel } from "@/lib/db/models/connections";
import { DomainModel } from "@/lib/db/models/domains";
import type { DnsCheckDTO, DnsVerdictValue } from "@/lib/dto/domain";
import { enqueueAlertEvaluation } from "@/lib/jobs/send";
import { publish } from "@/lib/realtime/publish";
import { recomputeChecklist } from "./checklist";
import { ServiceError } from "./errors";
import { canSeeProject } from "./project-scope";
import { orgOid } from "./resend-access";

/**
 * Our own DNS check (PRD §5.7, TRD dns-check): looks up SPF, DKIM, DMARC and MX for a domain,
 * compares them with the records Resend expects, stores the verdicts on `domains.dnsCheck`,
 * refreshes the connection checklist (DMARC item) and asks for an alert evaluation so a
 * `domain_status` rule can open (or resolve) a DNS drift incident.
 */

/** A second on-demand check within this window returns the stored result. */
export const DNS_CHECK_COOLDOWN_MS = 10_000;

let defaultResolver: DnsResolver | null = null;
const resolverOf = (deps: { resolver?: DnsResolver }) =>
  deps.resolver ?? (defaultResolver ??= createNodeResolver());

export function toDnsCheckDTO(
  check:
    | {
        checkedAt?: Date | null;
        spf?: string | null;
        dkim?: string | null;
        dmarc?: string | null;
        mx?: string | null;
        details?: {
          group?: string | null;
          type?: string | null;
          name?: string | null;
          expected?: string | null;
          found?: string[] | null;
          verdict?: string | null;
          message?: string | null;
        }[];
      }
    | null
    | undefined,
): DnsCheckDTO | null {
  if (!check?.checkedAt) return null;
  const verdict = (v: string | null | undefined): DnsVerdictValue =>
    v === "pass" || v === "fail" || v === "missing" || v === "skipped" ? v : "unknown";
  return {
    checkedAt: check.checkedAt.toISOString(),
    spf: verdict(check.spf),
    dkim: verdict(check.dkim),
    dmarc: verdict(check.dmarc),
    mx: verdict(check.mx),
    details: (check.details ?? []).map((d) => ({
      group: (d.group ?? "spf") as DnsCheckDTO["details"][number]["group"],
      type: d.type ?? "",
      name: d.name ?? "",
      expected: d.expected ?? "",
      found: [...(d.found ?? [])],
      verdict: verdict(d.verdict),
      message: d.message ?? "",
    })),
  };
}

export type DnsCheckOutcome = {
  domainId: string;
  connectionId: string;
  result: DnsCheckResult;
};

/**
 * Checks one domain and stores the result. Returns `null` when the domain (or its connection)
 * is gone. `orgId` scopes every query; it comes from the caller's verified context or from the
 * job's own listing, never from client input.
 */
export async function checkDomain(
  orgId: Types.ObjectId,
  domainId: Types.ObjectId | string,
  deps: { resolver?: DnsResolver; now?: Date; requestAlerts?: boolean } = {},
): Promise<DnsCheckOutcome | null> {
  await connectDb();
  const domain = await DomainModel.findOne({ _id: domainId, orgId }).lean();
  if (!domain) return null;
  const connection = await ConnectionModel.exists({
    _id: domain.connectionId,
    orgId,
    deletedAt: null,
  });
  if (!connection) return null;

  const result = await checkDomainDns(
    {
      name: domain.name,
      receivingEnabled: !!domain.receiving?.enabled,
      records: (domain.records ?? []).map((r) => ({
        record: r.record,
        type: r.type,
        name: r.name,
        value: r.value,
        priority: r.priority ?? null,
      })),
    },
    resolverOf(deps),
    deps.now,
  );

  await DomainModel.updateOne(
    { _id: domain._id, orgId },
    {
      $set: {
        dnsCheck: {
          checkedAt: result.checkedAt,
          spf: result.spf,
          dkim: result.dkim,
          dmarc: result.dmarc,
          mx: result.mx,
          details: result.details,
        },
      },
    },
  );
  await recomputeChecklist(domain.connectionId);
  await publish({
    orgId,
    projectId: domain.projectId ?? null,
    topics: ["domains", `connection:${domain.connectionId.toHexString()}`],
    patch: { dnsCheck: domain._id.toHexString() },
  });
  if (deps.requestAlerts !== false && (await AlertRuleModel.exists({ orgId, enabled: true }))) {
    await enqueueAlertEvaluation({ orgId: orgId.toHexString() });
  }
  return {
    domainId: domain._id.toHexString(),
    connectionId: domain.connectionId.toHexString(),
    result,
  };
}

/** "Check DNS now" from the UI (permission `domain:update`). Rate limited per domain. */
export async function checkDnsNow(
  ctx: OrgContext,
  input: { domainId: string },
  deps: { resolver?: DnsResolver; now?: Date } = {},
): Promise<DnsCheckDTO> {
  authorize(ctx, "domain:update");
  await connectDb();
  const orgId = orgOid(ctx);
  if (!Types.ObjectId.isValid(input.domainId)) {
    throw new ServiceError("not_found", "We couldn't find that domain.");
  }
  const domain = await DomainModel.findOne({ _id: input.domainId, orgId }).lean();
  if (!domain || !canSeeProject(ctx, domain.projectId?.toHexString() ?? null)) {
    throw new ServiceError("not_found", "We couldn't find that domain.");
  }
  const now = deps.now ?? new Date();
  const last = domain.dnsCheck?.checkedAt;
  if (last && now.getTime() - last.getTime() < DNS_CHECK_COOLDOWN_MS) {
    return toDnsCheckDTO(domain.dnsCheck)!;
  }
  const outcome = await checkDomain(orgId, domain._id, { ...deps, now });
  if (!outcome) throw new ServiceError("not_found", "We couldn't find that domain.");
  const fresh = await DomainModel.findById(domain._id, { dnsCheck: 1 }).lean();
  return toDnsCheckDTO(fresh?.dnsCheck)!;
}

export type DnsCheckTarget = { orgId: string; domainId: string };

/**
 * Every domain the scheduled check covers: mirrors of live, usable connections. Read-only and
 * disabled connections are skipped (nothing to alert on), needs-attention ones are still checked
 * because DNS is independent of the API key.
 */
export async function listDnsCheckTargets(
  filter: { orgId?: string; connectionId?: string; domainId?: string } = {},
): Promise<DnsCheckTarget[]> {
  await connectDb();
  const connections = await ConnectionModel.find(
    {
      deletedAt: null,
      status: { $in: ["active", "needs_attention", "provisioning"] },
      ...(filter.orgId ? { orgId: new Types.ObjectId(filter.orgId) } : {}),
      ...(filter.connectionId ? { _id: new Types.ObjectId(filter.connectionId) } : {}),
    },
    { _id: 1 },
  ).lean();
  if (connections.length === 0) return [];
  const domains = await DomainModel.find(
    {
      connectionId: { $in: connections.map((c) => c._id) },
      ...(filter.domainId ? { _id: new Types.ObjectId(filter.domainId) } : {}),
    },
    { orgId: 1 },
  )
    .sort({ _id: 1 })
    .lean();
  return domains.map((d) => ({ orgId: d.orgId.toHexString(), domainId: d._id.toHexString() }));
}
