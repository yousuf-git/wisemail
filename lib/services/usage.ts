import "server-only";

import { Types } from "mongoose";

import type { UsageSummary, ConnectionHealth } from "@/components/app/usage-tile";
import type { OrgContext } from "@/lib/dal";
import { PLAN_LABELS, getPlanLimits } from "@/lib/billing/plans";
import { connectDb } from "@/lib/db/connect";
import { ConnectionModel, type ConnectionStatus } from "@/lib/db/models/connections";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";

const HEALTH: Record<ConnectionStatus, ConnectionHealth> = {
  active: "healthy",
  provisioning: "attention",
  needs_attention: "attention",
  read_only: "down",
  disabled: "down",
};

/**
 * Real data for the sidebar tile: plan, live connections (health dots) against the plan limit,
 * and the tracked-email allowance. Tracked emails stay 0 until email ingestion lands (Phase 4);
 * no AI credits are shown until credits exist (Phase 7).
 */
export async function getUsageSummary(ctx: OrgContext): Promise<UsageSummary> {
  await connectDb();
  const orgId = new Types.ObjectId(ctx.org.id);
  const [settings, connections] = await Promise.all([
    OrgSettingsModel.findOne({ orgId }).lean(),
    ConnectionModel.find({ orgId, deletedAt: null }, { status: 1 }).sort({ _id: 1 }).lean(),
  ]);
  const plan = settings?.plan ?? "free";
  const limits = getPlanLimits(plan, settings?.limitOverrides);
  return {
    plan: PLAN_LABELS[plan],
    connections: connections.map((c) => ({ id: c._id.toHexString(), health: HEALTH[c.status] })),
    connectionLimit: limits.connections,
    used: { transactional: 0, broadcast: 0, inbound: 0 },
    allowance: limits.emailsTrackedPerMonth,
  };
}
