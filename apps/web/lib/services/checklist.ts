import "server-only";

import { Types } from "mongoose";

import {
  CHECKLIST_KEYS,
  describeChecklistItem,
  type ChecklistItemDTO,
  type ChecklistKey,
  type ChecklistStatus,
} from "@/lib/dto/checklist";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { DomainModel } from "@/lib/db/models/domains";
import { publish } from "@/lib/realtime/publish";

/**
 * Setup checklist (PRD §5.1), computed from a connection's mirrors and stored on
 * `connections.checklist` (key, status, checkedAt; DBD §4.2). Recomputed after every sync and
 * after each one-click fix. The rules are pure so they can be tested as a matrix.
 */

export type ChecklistDomain = {
  id: string;
  name: string;
  status: string;
  openTracking: boolean;
  clickTracking: boolean;
  receivingEnabled: boolean;
  records: { record: string; status: string }[];
  /** `dnsCheck.dmarc` from our own DNS check (Phase 6); absent until it has run. */
  dmarc?: string | null;
};

export type ChecklistInput = {
  webhook: {
    registered: boolean;
    /** Whether Resend still has the webhook: `unknown` when we could not ask (or have not). */
    remote: "ok" | "missing" | "unknown";
    lastEventAt: Date | null;
  };
  domains: ChecklistDomain[];
};

export type ChecklistResult = { key: ChecklistKey; status: ChecklistStatus }[];

const DMARC_PRESENT = new Set(["present", "verified", "ok", "pass"]);

const recordsVerified = (d: ChecklistDomain, record: string) => {
  const own = d.records.filter((r) => r.record === record);
  return own.length > 0 && own.every((r) => r.status === "verified");
};
export const isSendingDnsOk = (d: ChecklistDomain) =>
  recordsVerified(d, "SPF") && recordsVerified(d, "DKIM");
export const isReceivingOk = (d: ChecklistDomain) =>
  d.receivingEnabled && recordsVerified(d, "Receiving");
const hasDmarcData = (d: ChecklistDomain) => d.dmarc !== undefined && d.dmarc !== null;

/** all -> ok, none -> `none`, some -> warn. */
function tally(total: number, good: number, none: ChecklistStatus): ChecklistStatus {
  if (good === total) return "ok";
  return good === 0 ? none : "warn";
}

export function computeChecklist(input: ChecklistInput): ChecklistResult {
  const { webhook, domains } = input;
  const result: ChecklistResult = [];

  result.push({
    key: "webhook",
    status:
      !webhook.registered || webhook.remote === "missing"
        ? "fail"
        : webhook.lastEventAt
          ? "ok"
          : "warn",
  });

  const verified = domains.filter((d) => d.status === "verified").length;
  result.push({
    key: "domain_verified",
    status: domains.length === 0 ? "fail" : tally(domains.length, verified, "fail"),
  });

  // Everything below is about domains; with none there is nothing more to say.
  if (domains.length > 0) {
    result.push({
      key: "dns_records",
      status: tally(domains.length, domains.filter(isSendingDnsOk).length, "fail"),
    });
    result.push({
      key: "open_tracking",
      status: tally(domains.length, domains.filter((d) => d.openTracking).length, "warn"),
    });
    result.push({
      key: "click_tracking",
      status: tally(domains.length, domains.filter((d) => d.clickTracking).length, "warn"),
    });
    result.push({
      key: "receiving",
      status: tally(domains.length, domains.filter(isReceivingOk).length, "warn"),
    });
    const checked = domains.filter(hasDmarcData);
    if (checked.length > 0) {
      result.push({
        key: "dmarc",
        status: tally(
          checked.length,
          checked.filter((d) => DMARC_PRESENT.has(String(d.dmarc))).length,
          "fail",
        ),
      });
    }
  }

  const order = new Map(CHECKLIST_KEYS.map((k, i) => [k, i] as const));
  return result.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
}

/** Names of the domains an item is about, for the detail view. */
export function affectedDomains(key: ChecklistKey, domains: ChecklistDomain[]): string[] {
  const pick = (bad: (d: ChecklistDomain) => boolean) => domains.filter(bad).map((d) => d.name);
  switch (key) {
    case "domain_verified":
      return pick((d) => d.status !== "verified");
    case "dns_records":
      return pick((d) => !isSendingDnsOk(d));
    case "open_tracking":
      return pick((d) => !d.openTracking);
    case "click_tracking":
      return pick((d) => !d.clickTracking);
    case "receiving":
      return pick((d) => !isReceivingOk(d));
    case "dmarc":
      return pick((d) => hasDmarcData(d) && !DMARC_PRESENT.has(String(d.dmarc)));
    default:
      return [];
  }
}

type StoredItem = { key: string; status: ChecklistStatus; checkedAt: Date };

/** Stored checklist -> DTO items with copy and fixes; unknown keys (old data) are dropped. */
export function toChecklistDTO(
  stored: readonly StoredItem[] | null | undefined,
  domains?: ChecklistDomain[],
): ChecklistItemDTO[] {
  const known = new Set<string>(CHECKLIST_KEYS);
  return (stored ?? [])
    .filter((item) => known.has(item.key))
    .map((item) => ({
      key: item.key as ChecklistKey,
      status: item.status,
      checkedAt: item.checkedAt.toISOString(),
      ...describeChecklistItem(item.key as ChecklistKey, item.status),
      ...(domains ? { domains: affectedDomains(item.key as ChecklistKey, domains) } : {}),
    }));
}

export async function loadChecklistDomains(
  orgId: Types.ObjectId,
  connectionId: Types.ObjectId,
): Promise<ChecklistDomain[]> {
  const docs = await DomainModel.find({ orgId, connectionId }).sort({ name: 1 }).lean();
  return docs.map((d) => ({
    id: d._id.toHexString(),
    name: d.name,
    status: d.status,
    openTracking: !!d.openTracking,
    clickTracking: !!d.clickTracking,
    receivingEnabled: !!d.receiving?.enabled,
    records: (d.records ?? []).map((r) => ({ record: r.record, status: r.status })),
    dmarc: d.dnsCheck?.dmarc ?? null,
  }));
}

/**
 * Recomputes and stores the checklist for one connection from its mirrors. `webhookRemote` is
 * what the caller learned from Resend (sync checks that the webhook still exists); without it
 * the stored webhook item keeps its remote verdict (`fail` stays `fail`) and is otherwise judged
 * from what we hold locally.
 */
export async function recomputeChecklist(
  connectionId: Types.ObjectId | string,
  options: { webhookRemote?: "ok" | "missing" | "unknown"; now?: Date } = {},
): Promise<ChecklistResult | null> {
  await connectDb();
  const connection = await ConnectionModel.findOne(
    { _id: connectionId, deletedAt: null },
    { orgId: 1, webhook: 1, lastEventAt: 1, checklist: 1 },
  ).lean();
  if (!connection) return null;

  const domains = await loadChecklistDomains(connection.orgId, connection._id);
  const previous = connection.checklist?.find((i) => i.key === "webhook");
  const remote =
    options.webhookRemote ??
    // Not asked this time: a webhook we knew was missing stays missing until re-registered.
    (previous?.status === "fail" && connection.webhook?.resendId ? "missing" : "unknown");
  const items = computeChecklist({
    webhook: {
      registered: !!connection.webhook?.resendId,
      remote,
      lastEventAt: connection.lastEventAt ?? null,
    },
    domains,
  });

  const checkedAt = options.now ?? new Date();
  await ConnectionModel.updateOne(
    { _id: connection._id, orgId: connection.orgId },
    { $set: { checklist: items.map((i) => ({ ...i, checkedAt })) } },
  );
  await publish({
    orgId: connection.orgId,
    topics: ["connections", `connection:${connection._id.toHexString()}`],
    patch: { checklist: items },
  });
  return items;
}
