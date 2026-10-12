import "server-only";

import { Types } from "mongoose";

import { authorize, type OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ApiKeyModel } from "@/lib/db/models/api-keys";
import { AutomationModel } from "@/lib/db/models/automations";
import { BroadcastModel } from "@/lib/db/models/broadcasts";
import { ConnectionModel } from "@/lib/db/models/connections";
import { ContactPropertyModel } from "@/lib/db/models/contact-properties";
import { ContactModel } from "@/lib/db/models/contacts";
import { DomainModel } from "@/lib/db/models/domains";
import { SegmentModel } from "@/lib/db/models/segments";
import { TemplateModel } from "@/lib/db/models/templates";
import { TopicModel } from "@/lib/db/models/topics";
import type { ConnectionDetailDTO, MirrorCountsDTO } from "@/lib/dto/checklist";
import { loadChecklistDomains, toChecklistDTO } from "./checklist";
import { ServiceError } from "./errors";
import { getLatestSyncStatuses } from "./sync";

/** Mirror document counts for one connection, always scoped by org and connection. */
export async function countMirrors(
  orgId: Types.ObjectId,
  connectionId: Types.ObjectId,
): Promise<MirrorCountsDTO> {
  const scope = { orgId, connectionId };
  const [
    domains,
    apiKeys,
    segments,
    topics,
    contactProperties,
    templates,
    contacts,
    broadcasts,
    automations,
  ] = await Promise.all([
    DomainModel.countDocuments(scope),
    ApiKeyModel.countDocuments(scope),
    SegmentModel.countDocuments(scope),
    TopicModel.countDocuments(scope),
    ContactPropertyModel.countDocuments(scope),
    TemplateModel.countDocuments(scope),
    ContactModel.countDocuments(scope),
    BroadcastModel.countDocuments(scope),
    AutomationModel.countDocuments(scope),
  ]);
  return {
    domains,
    apiKeys,
    segments,
    topics,
    contactProperties,
    templates,
    contacts,
    broadcasts,
    automations,
  };
}

/** Connection page data: checklist with the domains each item is about, counts, latest sync. */
export async function getConnectionDetail(
  ctx: OrgContext,
  connectionId: string,
): Promise<ConnectionDetailDTO> {
  authorize(ctx, "connection:read");
  await connectDb();
  const notFound = () => new ServiceError("not_found", "We couldn't find that connection.");
  if (!Types.ObjectId.isValid(connectionId)) throw notFound();
  const orgId = new Types.ObjectId(ctx.org.id);
  const connection = await ConnectionModel.findOne(
    { _id: connectionId, orgId, deletedAt: null },
    {
      name: 1,
      status: 1,
      statusReason: 1,
      apiKeyLast4: 1,
      "webhook.resendId": 1,
      lastEventAt: 1,
      lastSyncAt: 1,
      checklist: 1,
    },
  ).lean();
  if (!connection) throw notFound();

  const [domains, domainDocs, counts, syncs] = await Promise.all([
    loadChecklistDomains(orgId, connection._id),
    DomainModel.find({ orgId, connectionId: connection._id }).sort({ name: 1 }).lean(),
    countMirrors(orgId, connection._id),
    getLatestSyncStatuses(orgId, [connection._id]),
  ]);

  return {
    id: connection._id.toHexString(),
    name: connection.name,
    status: connection.status,
    statusReason: connection.statusReason ?? null,
    apiKeyLast4: connection.apiKeyLast4 ?? null,
    webhookRegistered: !!connection.webhook?.resendId,
    lastEventAt: connection.lastEventAt?.toISOString() ?? null,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    checklist: toChecklistDTO(connection.checklist, domains),
    counts,
    domains: domainDocs.map((d) => ({
      id: d._id.toHexString(),
      name: d.name,
      status: d.status,
      openTracking: !!d.openTracking,
      clickTracking: !!d.clickTracking,
      receiving: !!d.receiving?.enabled && !!d.receiving?.mxVerified,
      records: (d.records ?? []).map((r) => ({
        record: r.record,
        type: r.type,
        name: r.name,
        value: r.value,
        status: r.status,
      })),
    })),
    sync: syncs.get(connection._id.toHexString()) ?? null,
  };
}
