import { Types } from "mongoose";

import { connectDb } from "@/lib/db/connect";
import { DomainModel } from "@/lib/db/models/domains";
import { listApiKeys } from "@/lib/services/api-keys";
import { listManageableConnections } from "@/lib/services/domains";
import { projectFilter } from "@/lib/services/project-scope";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/api-keys?orgSlug=` → keys + create pickers + capability flags. */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    const can = {
      read: ctx.can("apiKey:read"),
      create: ctx.can("apiKey:create"),
      createSending: ctx.can("apiKey:createSending"),
      delete: ctx.can("apiKey:delete"),
    };
    if (!can.read) {
      return {
        keys: [],
        connections: [],
        can,
      };
    }

    const mayCreate = can.create || can.createSending;
    await connectDb();
    const [keys, connections, domains] = await Promise.all([
      listApiKeys(ctx),
      mayCreate && ctx.can("connection:read")
        ? listManageableConnections(ctx)
        : Promise.resolve([] as { id: string; name: string }[]),
      mayCreate && ctx.can("domain:read")
        ? DomainModel.find(
            { orgId: new Types.ObjectId(ctx.org.id), ...projectFilter(ctx) },
            { name: 1, connectionId: 1 },
          )
            .sort({ name: 1 })
            .lean()
        : Promise.resolve([]),
    ]);

    return {
      keys,
      connections: connections.map((c) => ({
        ...c,
        domains: domains
          .filter((d) => d.connectionId.toHexString() === c.id)
          .map((d) => ({ id: d._id.toHexString(), name: d.name })),
      })),
      can,
    };
  });
}
