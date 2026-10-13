import "server-only";

import type { PaidPlan, BillingInterval } from "@wisemail/shared/stripe-prices";
import { PAID_PLANS } from "@wisemail/shared/stripe-prices";

import type { AdminActor } from "@/lib/admin/guard";
import { connectDb } from "@/lib/db/connect";
import { PlanModel } from "@/lib/db/models/plan";
import {
  PLATFORM_SETTINGS_KEY,
  PlatformSettingsModel,
} from "@/lib/db/models/platform-settings";
import { PriceChangeModel } from "@/lib/db/models/price-change";
import { env } from "@/lib/env";
import { writeAdminAudit } from "@/lib/services/admin/audit";
import {
  getPlatformCatalog,
  invalidateCatalogCache,
} from "@/lib/services/catalog";
import { applyPlanPriceChange } from "@/lib/services/price-changes";
import { ServiceError } from "@/lib/services/errors";

export async function getAdminCatalog() {
  const catalog = await getPlatformCatalog();
  await connectDb();
  const recentChanges = await PriceChangeModel.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  return {
    catalog,
    recentChanges: recentChanges.map((c) => ({
      id: c._id.toHexString(),
      plan: c.plan,
      interval: c.interval as BillingInterval,
      oldAmountUsd: c.oldAmountUsd,
      newAmountUsd: c.newAmountUsd,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      migratedCount: c.migratedCount,
      failedCount: c.failedCount,
    })),
  };
}

/** Update a paid plan's catalog price (Stripe + migration when billing is on). */
export async function adminUpdatePlanPrice(
  admin: AdminActor,
  input: {
    plan: PaidPlan;
    interval: BillingInterval;
    priceUsd: number;
    reason?: string;
  },
) {
  if (!(PAID_PLANS as readonly string[]).includes(input.plan)) {
    throw new ServiceError("validation", "Only paid plans have Stripe prices.");
  }
  if (env.BILLING_ENABLED) {
    return applyPlanPriceChange({ ...input, admin });
  }

  await connectDb();
  const planDoc = await PlanModel.findById(input.plan);
  if (!planDoc) throw new ServiceError("not_found", "Plan not found.");
  const before =
    input.interval === "year" ? planDoc.priceAnnualPerMonth : planDoc.priceMonthly;
  if (before === input.priceUsd) {
    throw new ServiceError("validation", "The new price matches the current catalog price.");
  }
  const $set =
    input.interval === "year"
      ? { priceAnnualPerMonth: input.priceUsd }
      : { priceMonthly: input.priceUsd };
  await PlanModel.updateOne({ _id: input.plan }, { $set });
  invalidateCatalogCache();
  await writeAdminAudit({
    admin,
    action: "admin.price_changed",
    target: { type: "plan", id: input.plan },
    reason: input.reason,
    changes: {
      before: { interval: input.interval, priceUsd: before },
      after: { interval: input.interval, priceUsd: input.priceUsd, stripe: false },
    },
  });
  return {
    priceChangeId: null as string | null,
    oldAmountUsd: before,
    newAmountUsd: input.priceUsd,
  };
}

export type PlatformSettingsPatch = {
  trialDays?: number;
  trialAiCredits?: number;
  freeGraceDays?: number;
  freeOverAllowanceRetentionDays?: number;
  retentionNoticeDays?: number;
  paymentGraceDays?: number;
  billingEnabled?: boolean;
  googleSignIn?: boolean;
  githubSignIn?: boolean;
  aiEnabled?: boolean;
  aiModel?: string | null;
  aiModelFast?: string | null;
  aiBaseUrl?: string | null;
  systemFromEmail?: string | null;
  creditPackCredits?: number;
  creditPackPriceUsd?: number;
  creditPackMaxPacks?: number;
  reason?: string;
};

/** Patch the singleton platform_settings document (admin). */
export async function adminUpdatePlatformSettings(
  admin: AdminActor,
  patch: PlatformSettingsPatch,
) {
  await connectDb();
  const before = await PlatformSettingsModel.findOne({ key: PLATFORM_SETTINGS_KEY }).lean();
  if (!before) throw new ServiceError("not_found", "Platform settings are not seeded yet.");

  const set: Record<string, unknown> = {};
  if (patch.trialDays !== undefined) set.trialDays = patch.trialDays;
  if (patch.trialAiCredits !== undefined) set.trialAiCredits = patch.trialAiCredits;
  if (patch.freeGraceDays !== undefined) set.freeGraceDays = patch.freeGraceDays;
  if (patch.freeOverAllowanceRetentionDays !== undefined) {
    set.freeOverAllowanceRetentionDays = patch.freeOverAllowanceRetentionDays;
  }
  if (patch.retentionNoticeDays !== undefined) set.retentionNoticeDays = patch.retentionNoticeDays;
  if (patch.paymentGraceDays !== undefined) set.paymentGraceDays = patch.paymentGraceDays;
  if (patch.billingEnabled !== undefined) set.billingEnabled = patch.billingEnabled;
  if (patch.googleSignIn !== undefined) set.googleSignIn = patch.googleSignIn;
  if (patch.githubSignIn !== undefined) set.githubSignIn = patch.githubSignIn;
  if (patch.aiEnabled !== undefined) set.aiEnabled = patch.aiEnabled;
  if (patch.aiModel !== undefined) set.aiModel = patch.aiModel;
  if (patch.aiModelFast !== undefined) set.aiModelFast = patch.aiModelFast;
  if (patch.aiBaseUrl !== undefined) set.aiBaseUrl = patch.aiBaseUrl;
  if (patch.systemFromEmail !== undefined) set.systemFromEmail = patch.systemFromEmail;
  if (patch.creditPackCredits !== undefined) set["creditPack.credits"] = patch.creditPackCredits;
  if (patch.creditPackPriceUsd !== undefined) set["creditPack.priceUsd"] = patch.creditPackPriceUsd;
  if (patch.creditPackMaxPacks !== undefined) set["creditPack.maxPacks"] = patch.creditPackMaxPacks;

  if (Object.keys(set).length === 0) {
    throw new ServiceError("validation", "Nothing to update.");
  }
  set.revision = (before.revision ?? 1) + 1;

  await PlatformSettingsModel.updateOne({ key: PLATFORM_SETTINGS_KEY }, { $set: set });
  invalidateCatalogCache();
  await writeAdminAudit({
    admin,
    action: "admin.platform_settings_updated",
    target: { type: "platform_settings", id: PLATFORM_SETTINGS_KEY },
    reason: patch.reason,
    changes: { after: set },
  });
  return getPlatformCatalog();
}