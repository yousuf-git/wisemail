import { Types } from "mongoose";

import { connectDb } from "@/lib/db/connect";
import { DomainModel } from "@/lib/db/models/domains";
import { canSeeProject } from "@/lib/services/project-scope";
import { listSenders } from "@/lib/services/senders";
import { orgRoute } from "../_lib/org-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/v1/senders?orgSlug=` → senders + verified domains + capability flags. */
export function GET(request: Request) {
  return orgRoute(request, async ({ ctx }) => {
    const can = {
      read: ctx.can("sender:read"),
      create: ctx.can("sender:create"),
      update: ctx.can("sender:update"),
      delete: ctx.can("sender:delete"),
    };
    if (!can.read) {
      return { senders: [], domains: [], can };
    }

    await connectDb();
    const [senders, domainDocs] = await Promise.all([
      listSenders(ctx),
      DomainModel.find(
        { orgId: new Types.ObjectId(ctx.org.id), status: "verified" },
        { name: 1, projectId: 1, receiving: 1 },
      )
        .sort({ name: 1 })
        .lean(),
    ]);
    const domains = domainDocs
      .filter((d) => canSeeProject(ctx, d.projectId?.toHexString() ?? null))
      .map((d) => ({
        id: d._id.toHexString(),
        name: d.name,
        receiving: !!d.receiving?.enabled,
      }));

    return { senders, domains, can };
  });
}
