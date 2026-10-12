import "server-only";

import type { Types } from "mongoose";

import { AiError } from "@/lib/ai/errors";
import { FEATURE_FLAG, type AiFlag } from "@/lib/ai/types";
import { getEntitlements, type Entitlements } from "@/lib/billing/entitlements";
import { connectDb } from "@/lib/db/connect";
import type { AiFeature } from "@/lib/db/models/ai-usage";
import { OrgSettingsModel } from "@/lib/db/models/org-settings";

/**
 * The plan gate and the org opt-out (PRD §5.10, TRD §2.9): AI is paid-only, then an Owner or
 * Admin can switch it off for the organization or per feature. Checked before anything is read
 * for a prompt, so a gated org never has content leave the system.
 */

export type AiSwitches = { enabled: boolean; features: Record<AiFlag, boolean> };

export async function getAiSwitches(orgId: Types.ObjectId): Promise<AiSwitches> {
  await connectDb();
  const settings = await OrgSettingsModel.findOne({ orgId }, { ai: 1 }).lean();
  const ai = settings?.ai;
  const flag = (name: AiFlag) => ai?.features?.[name] !== false;
  return {
    enabled: ai?.enabled !== false,
    features: {
      triage: flag("triage"),
      drafts: flag("drafts"),
      compose: flag("compose"),
      anomalies: flag("anomalies"),
    },
  };
}

/** Throws the typed error for the first thing that blocks `feature`; returns the entitlements. */
export async function assertAiAccess(
  orgId: Types.ObjectId,
  feature: AiFeature,
  options: { now?: Date } = {},
): Promise<Entitlements> {
  const entitlements = await getEntitlements(orgId, options);
  if (!entitlements.features.ai) throw new AiError("ai_not_in_plan");
  const switches = await getAiSwitches(orgId);
  if (!switches.enabled) throw new AiError("ai_disabled");
  if (!switches.features[FEATURE_FLAG[feature]]) throw new AiError("ai_feature_disabled");
  return entitlements;
}

/** Non-throwing variant for background triggers (is it worth enqueueing a job?). */
export async function aiAllowed(orgId: Types.ObjectId, feature: AiFeature): Promise<boolean> {
  try {
    await assertAiAccess(orgId, feature);
    return true;
  } catch (error) {
    if (error instanceof AiError) return false;
    throw error;
  }
}
