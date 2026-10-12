import "server-only";

import { Types } from "mongoose";

import type { OrgContext } from "@/lib/dal";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel } from "@/lib/db/models/connections";
import { DomainModel } from "@/lib/db/models/domains";
import { projectFilter } from "@/lib/services/project-scope";

export type MailFilterOptions = {
  hasConnection: boolean;
  connections: { id: string; name: string }[];
  domains: { id: string; name: string; connectionId: string }[];
};

/**
 * What the mail pages need beyond the lists: whether the org has any live connection (for the
 * "connect Resend" empty state) and the connection/domain choices for the Activity filters.
 * Read for every member who can see mail, so it does not require `connection:read`.
 */
export async function getMailFilterOptions(ctx: OrgContext): Promise<MailFilterOptions> {
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  const [connections, domains] = await Promise.all([
    ConnectionModel.find({ orgId, deletedAt: null }, { name: 1 }).sort({ createdAt: 1 }).lean(),
    DomainModel.find({ orgId, ...projectFilter(ctx) }, { name: 1, connectionId: 1 })
      .sort({ name: 1 })
      .lean(),
  ]);
  return {
    hasConnection: connections.length > 0,
    connections: connections.map((c) => ({ id: c._id.toHexString(), name: c.name })),
    domains: domains.map((d) => ({
      id: d._id.toHexString(),
      name: d.name,
      connectionId: d.connectionId.toHexString(),
    })),
  };
}
